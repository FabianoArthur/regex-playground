import { describe, expect, it } from 'vitest';
import type { Node } from './ast';
import { parse, RegexSyntaxError } from './parser';

describe('parse — structure', () => {
  it('parses a plain sequence of literals with spans', () => {
    const { root } = parse('ab');
    expect(root).toMatchObject({
      type: 'sequence',
      start: 0,
      end: 2,
      items: [
        { type: 'literal', value: 'a', start: 0, end: 1 },
        { type: 'literal', value: 'b', start: 1, end: 2 },
      ],
    });
  });

  it('parses the empty pattern as an empty sequence', () => {
    expect(parse('').root).toMatchObject({ type: 'sequence', items: [] });
  });

  it('parses alternation, keeping empty alternatives', () => {
    const { root } = parse('cat|dog|');
    expect(root.type).toBe('alternation');
    if (root.type !== 'alternation') return;
    expect(root.alternatives).toHaveLength(3);
    expect(root.alternatives[1]).toMatchObject({ start: 4, end: 7 });
    expect(root.alternatives[2]?.items).toEqual([]);
  });

  it('parses anchors, dot and class escapes', () => {
    const { root } = parse('^.\\d\\W\\s\\b\\B$');
    expect(root.type === 'sequence' && root.items).toMatchObject([
      { type: 'anchor', kind: 'start' },
      { type: 'any' },
      { type: 'classEscape', kind: 'digit', negated: false },
      { type: 'classEscape', kind: 'word', negated: true },
      { type: 'classEscape', kind: 'space', negated: false },
      { type: 'anchor', kind: 'wordBoundary' },
      { type: 'anchor', kind: 'notWordBoundary' },
      { type: 'anchor', kind: 'end' },
    ]);
  });

  it('unescapes character escapes', () => {
    const { root } = parse('\\n\\t\\x41\\u0042\\u{1F600}\\.\\0\\cJ', 'u');
    expect(root.type === 'sequence' && root.items.map((n) => (n as { value: string }).value)).toEqual([
      '\n',
      '\t',
      'A',
      'B',
      '😀',
      '.',
      '\0',
      '\n',
    ]);
  });

  it('parses quantifiers with bounds and laziness', () => {
    const { root } = parse('a*b+?c?d{3}e{2,}f{1,4}?');
    expect(root.type === 'sequence' && root.items).toMatchObject([
      { type: 'quantifier', min: 0, max: Infinity, lazy: false, symbol: '*', start: 0, end: 2 },
      { type: 'quantifier', min: 1, max: Infinity, lazy: true, symbol: '+?' },
      { type: 'quantifier', min: 0, max: 1, lazy: false },
      { type: 'quantifier', min: 3, max: 3 },
      { type: 'quantifier', min: 2, max: Infinity },
      { type: 'quantifier', min: 1, max: 4, lazy: true, symbol: '{1,4}?' },
    ]);
  });

  it('treats a brace that is not a valid quantifier as a literal (non-unicode mode)', () => {
    const { root } = parse('a{x}');
    expect(root.type === 'sequence' && root.items.map((n) => n.type)).toEqual([
      'literal',
      'literal',
      'literal',
      'literal',
    ]);
  });

  it('parses character classes with ranges, escapes and negation', () => {
    const { root } = parse('[^a-z0-9_\\-\\d]');
    expect(root.type === 'sequence' && root.items[0]).toMatchObject({
      type: 'charClass',
      negated: true,
      start: 0,
      end: 14,
      members: [
        { type: 'range', from: { value: 'a' }, to: { value: 'z' } },
        { type: 'range', from: { value: '0' }, to: { value: '9' } },
        { type: 'literal', value: '_' },
        { type: 'literal', value: '-' },
        { type: 'classEscape', kind: 'digit' },
      ],
    });
  });

  it('keeps a leading or trailing dash in a class as a literal', () => {
    const { root } = parse('[-a-]');
    expect(root.type === 'sequence' && root.items[0]).toMatchObject({
      members: [
        { type: 'literal', value: '-' },
        { type: 'literal', value: 'a' },
        { type: 'literal', value: '-' },
      ],
    });
  });

  it('reads \\b inside a class as backspace', () => {
    const { root } = parse('[\\b]');
    expect(root.type === 'sequence' && root.items[0]).toMatchObject({
      members: [{ type: 'literal', value: '\b' }],
    });
  });

  it('numbers capturing groups in order of their opening paren', () => {
    const parsed = parse('(a(?<word>b))(?:c)(d)');
    expect(parsed.groupCount).toBe(3);
    const items = parsed.root.type === 'sequence' ? parsed.root.items : [];
    expect(items[0]).toMatchObject({ type: 'group', kind: 'capturing', index: 1 });
    expect(items[1]).toMatchObject({ type: 'group', kind: 'nonCapturing' });
    expect(items[2]).toMatchObject({ type: 'group', kind: 'capturing', index: 3 });
    const inner = items[0]?.type === 'group' && items[0].body.type === 'sequence' ? items[0].body.items[1] : null;
    expect(inner).toMatchObject({ kind: 'capturing', index: 2, name: 'word' });
  });

  it('parses lookarounds', () => {
    const { root } = parse('(?=a)(?!b)(?<=c)(?<!d)');
    expect(root.type === 'sequence' && root.items.map((n) => n.type === 'group' && n.kind)).toEqual([
      'lookahead',
      'negativeLookahead',
      'lookbehind',
      'negativeLookbehind',
    ]);
  });

  it('parses numeric and named backreferences', () => {
    const { root } = parse('(?<q>[\'"])\\w+\\k<q>(x)\\2');
    const items = root.type === 'sequence' ? root.items : [];
    expect(items[2]).toMatchObject({ type: 'backreference', ref: 'q' });
    expect(items[4]).toMatchObject({ type: 'backreference', ref: 2 });
  });

  it('parses unicode property escapes in unicode mode', () => {
    const { root } = parse('\\p{L}\\P{Script=Greek}', 'u');
    expect(root.type === 'sequence' && root.items).toMatchObject([
      { type: 'unicodeProperty', property: 'L', negated: false },
      { type: 'unicodeProperty', property: 'Script=Greek', negated: true },
    ]);
  });
});

describe('parse — errors', () => {
  const bad: Array<[string, RegExp]> = [
    ['(abc', /unterminated group/i],
    ['abc)', /unmatched '\)'/i],
    ['[abc', /unterminated character class/i],
    ['*a', /nothing to repeat/i],
    ['a**', /nothing to repeat/i],
    ['[z-a]', /range out of order/i],
    ['a{5,2}', /numbers out of order/i],
    ['\\', /\\ at end of pattern/i],
    ['(?<1a>x)', /invalid group name/i],
    ['(?<n>a)(?<n>b)', /duplicate group name/i],
    ['\\k<missing>(?<n>a)', /unknown group name/i],
    ['(?x)', /invalid group/i],
  ];

  it.each(bad)('rejects %s', (pattern, message) => {
    expect(() => parse(pattern)).toThrow(RegexSyntaxError);
    expect(() => parse(pattern)).toThrow(message);
  });

  it('reports the position of the error', () => {
    try {
      parse('ab(cd');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RegexSyntaxError);
      expect((error as RegexSyntaxError).position).toBe(2);
    }
  });

  it('refuses v-mode set notation instead of explaining it wrongly', () => {
    for (const pattern of [String.raw`[\w&&\d]`, '[a&&b]', '[a--b]', '[[a]]', String.raw`[\q{abc}]`]) {
      expect(() => new RegExp(pattern, 'v')).not.toThrow();
      expect(() => parse(pattern, 'v')).toThrow(/set notation/i);
    }
    expect(() => parse('[a-z]', 'v')).not.toThrow();
  });

  it('reads the legacy class escapes \\c_ and \\c1 as control characters', () => {
    const { root } = parse(String.raw`[\c_\c1]`);
    expect(root.type === 'sequence' && root.items[0]).toMatchObject({
      members: [
        { type: 'literal', value: String.fromCharCode(0x5f % 32) },
        { type: 'literal', value: String.fromCharCode(0x31 % 32) },
      ],
    });
  });

  it('is stricter in unicode mode, like the engine', () => {
    expect(() => parse('\\-', 'u')).toThrow(RegexSyntaxError);
    expect(() => parse('a{x}', 'u')).toThrow(RegexSyntaxError);
    expect(() => parse('\\-')).not.toThrow();
  });
});

/** Every character of the pattern must be covered by exactly the root span, and child spans nest. */
function checkSpans(node: Node, pattern: string, parent = { start: 0, end: pattern.length }) {
  expect(node.start).toBeGreaterThanOrEqual(parent.start);
  expect(node.end).toBeLessThanOrEqual(parent.end);
  expect(node.start).toBeLessThanOrEqual(node.end);
  for (const child of childrenOf(node)) checkSpans(child, pattern, node);
}

function childrenOf(node: Node): Node[] {
  switch (node.type) {
    case 'alternation':
      return node.alternatives;
    case 'sequence':
      return node.items;
    case 'group':
      return [node.body];
    case 'quantifier':
      return [node.body];
    case 'charClass':
      return node.members;
    case 'range':
      return [node.from, node.to];
    default:
      return [];
  }
}

describe('parse — agrees with the JavaScript engine', () => {
  const corpus = [
    '^\\d{4}-\\d{2}-\\d{2}$',
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
    '^(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}$',
    '#(?:[0-9a-fA-F]{3}){1,2}\\b',
    '(?<year>\\d{4})-(?<month>\\d{2})',
    '(["\'])(?:(?!\\1).)*\\1',
    '\\bfoo\\b|\\Bbar',
    '^\\s*$',
    'a|b|c',
    '(a+)+$',
    'colou?r',
    '<([a-z]+)[^>]*>.*?</\\1>',
    '(?<=\\$)\\d+(?:\\.\\d\\d)?',
    '[\\]\\\\^-]',
    '[.*+?^${}()|[\\]\\\\]',
    'x{0}',
    '\\/\\*[\\s\\S]*?\\*\\/',
    '^v?(\\d+)\\.(\\d+)\\.(\\d+)(?:-([\\w.-]+))?$',
    '[^\\s@]+@[^\\s@]+',
    '\\u00e9|\\x41|\\101',
    ']',
    '}',
    'a{,5}',
    '(?:)',
    '[]',
    '[^]',
  ];

  it.each(corpus)('parses %s without error and with nested spans', (pattern) => {
    expect(() => new RegExp(pattern)).not.toThrow();
    const parsed = parse(pattern);
    expect(parsed.root.start).toBe(0);
    expect(parsed.root.end).toBe(pattern.length);
    checkSpans(parsed.root, pattern);
  });
});

describe('parse — differential check against the engine', () => {
  // Random short patterns over the characters that matter to the grammar. Whatever the engine
  // accepts we must accept, and whatever it rejects we must reject, in both modes.
  const alphabet = [...'ab\\()[]{}12,*+?|^$.-<>=!:kduxc08pPBn'];

  it('accepts and rejects exactly what `new RegExp` does (20 000 patterns × 2 modes)', () => {
    let seed = 42;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    const mismatches: string[] = [];
    for (let n = 0; n < 20_000; n++) {
      let pattern = '';
      for (let i = 0, len = 1 + (next() % 8); i < len; i++) pattern += alphabet[next() % alphabet.length];
      for (const flags of ['', 'u']) {
        const native = accepts(() => new RegExp(pattern, flags));
        const ours = accepts(() => parse(pattern, flags));
        if (native !== ours) mismatches.push(`/${pattern}/${flags} engine=${native} parser=${ours}`);
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });
});

function accepts(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}
