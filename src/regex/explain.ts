import type { ClassMember, Group, Literal, ParsedRegex, Quantifier, Sequence, Span, Term, UnicodeProperty } from './ast';

export interface Explanation {
  /** One line, plain English. */
  label: string;
  /** Optional second line with more context. */
  detail?: string;
  /** What part of the pattern this explains. */
  span: Span;
  /** Coarse category, used for colour coding in the UI. */
  kind: 'text' | 'class' | 'anchor' | 'group' | 'quantifier' | 'alternation' | 'reference';
  children: Explanation[];
}

export interface FlagExplanation {
  flag: string;
  name: string;
  description: string;
}

const FLAGS: FlagExplanation[] = [
  { flag: 'd', name: 'indices', description: 'Also report where each capture group starts and ends.' },
  { flag: 'g', name: 'global', description: 'Find every match, not just the first one.' },
  { flag: 'i', name: 'ignore case', description: 'Letters match regardless of upper or lower case.' },
  { flag: 'm', name: 'multiline', description: '^ and $ match at the start and end of every line.' },
  { flag: 's', name: 'dot all', description: '. also matches line breaks.' },
  { flag: 'u', name: 'unicode', description: 'Treat the pattern as Unicode code points; enables \\p{…}.' },
  { flag: 'v', name: 'unicode sets', description: 'Unicode mode with set operations inside classes.' },
  { flag: 'y', name: 'sticky', description: 'Only match exactly where the previous match ended.' },
];

export function explainFlags(flags: string): FlagExplanation[] {
  return FLAGS.filter((f) => flags.includes(f.flag));
}

/** Turns a parsed pattern into a tree of plain-English explanations, one node per construct. */
export function explain(parsed: ParsedRegex, flags = ''): Explanation[] {
  return new Explainer(flags).body(parsed.root);
}

const CHAR_NAMES: Record<string, [shown: string, name: string]> = {
  '\n': ['\\n', 'a line break (\\n)'],
  '\r': ['\\r', 'a carriage return (\\r)'],
  '\t': ['\\t', 'a tab (\\t)'],
  '\f': ['\\f', 'a form feed (\\f)'],
  '\v': ['\\v', 'a vertical tab (\\v)'],
  '\0': ['\\0', 'the NUL character (\\0)'],
  '\b': ['\\b', 'a backspace (\\b inside a class)'],
  ' ': [' ', 'a space'],
};

const CLASS_ESCAPES = {
  digit: 'a digit (0-9)',
  word: 'a word character (letter, digit or _)',
  space: 'a whitespace character (space, tab, line break…)',
} as const;

const PROPERTY_NAMES: Record<string, string> = {
  L: 'a letter',
  Letter: 'a letter',
  Lu: 'an uppercase letter',
  Uppercase_Letter: 'an uppercase letter',
  Ll: 'a lowercase letter',
  Lowercase_Letter: 'a lowercase letter',
  N: 'a number',
  Nd: 'a decimal digit',
  P: 'a punctuation mark',
  S: 'a symbol',
  Emoji: 'an emoji',
  White_Space: 'a whitespace character',
};

/** A character as it should appear inside quotes: invisible ones are shown as their escape. */
function shown(ch: string): string {
  const named = CHAR_NAMES[ch];
  if (named) return named[0];
  const code = ch.codePointAt(0) as number;
  if (code < 0x20 || code === 0x7f) return `\\x${code.toString(16).padStart(2, '0')}`;
  return ch;
}

function quantity(q: Quantifier): string {
  const { min, max } = q;
  let text: string;
  if (min === 0 && max === Infinity) text = 'zero or more times';
  else if (min === 1 && max === Infinity) text = 'one or more times';
  else if (min === 0 && max === 1) text = 'optionally (zero or one time)';
  else if (max === Infinity) text = `${min} or more times`;
  else if (min === max) text = min === 1 ? 'exactly once' : `exactly ${min} times`;
  else text = `between ${min} and ${max} times`;
  return q.lazy ? `${text}, as few as possible (lazy)` : text;
}

class Explainer {
  constructor(private readonly flags: string) {}

  body(node: ParsedRegex['root']): Explanation[] {
    if (node.type === 'sequence') return this.sequence(node);
    return [
      {
        label: `either of ${node.alternatives.length} alternatives`,
        detail: 'The first alternative that matches wins.',
        span: { start: node.start, end: node.end },
        kind: 'alternation',
        children: node.alternatives.map((alt, i) => {
          const children = this.sequence(alt);
          const span = { start: alt.start, end: alt.end };
          if (!children.length) {
            return { label: `alternative ${i + 1}: nothing (matches the empty string)`, span, kind: 'alternation', children };
          }
          // A one-part alternative reads better as a single line than as a wrapper around one child.
          if (children.length === 1) {
            const only = children[0] as Explanation;
            return { ...only, label: `alternative ${i + 1}: ${only.label}` };
          }
          return { label: `alternative ${i + 1}`, span, kind: 'alternation', children };
        }),
      },
    ];
  }

  private sequence(seq: Sequence): Explanation[] {
    const out: Explanation[] = [];
    let run: Literal[] = [];
    const flush = () => {
      if (run.length) out.push(this.literalRun(run));
      run = [];
    };
    for (const item of seq.items) {
      if (item.type === 'literal') run.push(item);
      else {
        flush();
        out.push(this.term(item));
      }
    }
    flush();
    return out;
  }

  private literalRun(run: Literal[]): Explanation {
    const first = run[0] as Literal;
    const last = run[run.length - 1] as Literal;
    const span = { start: first.start, end: last.end };
    if (run.length === 1) return this.literal(first);
    const text = run.map((l) => shown(l.value)).join('');
    const explanation: Explanation = { label: `the text "${text}"`, span, kind: 'text', children: [] };
    if (this.flags.includes('i')) explanation.detail = 'Case-insensitive (i flag).';
    return explanation;
  }

  private literal(node: Literal): Explanation {
    const explanation: Explanation = {
      label: `the character "${shown(node.value)}"`,
      span: { start: node.start, end: node.end },
      kind: 'text',
      children: [],
    };
    const named = CHAR_NAMES[node.value];
    if (named) explanation.detail = named[1];
    else if (node.escape && node.escape.length > 2) explanation.detail = `written as the escape ${node.escape}`;
    else if (node.escape) explanation.detail = `escaped, so it is matched literally`;
    return explanation;
  }

  private term(node: Term | ClassMember): Explanation {
    const span = { start: node.start, end: node.end };
    const leaf = (label: string, kind: Explanation['kind'], detail?: string): Explanation =>
      detail ? { label, detail, span, kind, children: [] } : { label, span, kind, children: [] };

    switch (node.type) {
      case 'literal':
        return this.literal(node);
      case 'any':
        return this.flags.includes('s')
          ? leaf('any character', 'class', 'Including line breaks (s flag).')
          : leaf('any character except a line break', 'class');
      case 'anchor': {
        const multi = this.flags.includes('m');
        switch (node.kind) {
          case 'start':
            return leaf(multi ? 'start of a line' : 'start of the text', 'anchor', 'Matches a position, not a character.');
          case 'end':
            return leaf(multi ? 'end of a line' : 'end of the text', 'anchor', 'Matches a position, not a character.');
          case 'wordBoundary':
            return leaf('a word boundary', 'anchor', 'Between a word character and a non-word character.');
          case 'notWordBoundary':
            return leaf('not a word boundary', 'anchor', 'A position that is not at the edge of a word.');
        }
        break;
      }
      case 'classEscape': {
        const base = CLASS_ESCAPES[node.kind];
        return leaf(node.negated ? `any character except ${base}` : base, 'class');
      }
      case 'unicodeProperty':
        return leaf(this.property(node), 'class');
      case 'range':
        return leaf(`a character from "${shown(node.from.value)}" to "${shown(node.to.value)}"`, 'class');
      case 'charClass': {
        if (!node.members.length) {
          return node.negated
            ? leaf('any character, including line breaks', 'class')
            : leaf('nothing — an empty set never matches', 'class');
        }
        return {
          label: node.negated ? 'one character NOT in the set' : 'one character from the set',
          span,
          kind: 'class',
          children: node.members.map((m) => this.term(m)),
        };
      }
      case 'group':
        return this.group(node);
      case 'backreference':
        return leaf(
          typeof node.ref === 'number'
            ? `the same text captured by group #${node.ref}`
            : `the same text captured by group "${node.ref}"`,
          'reference',
          'Repeats exactly what the group matched, not the group pattern.',
        );
      case 'quantifier':
        return {
          label: quantity(node),
          span,
          kind: 'quantifier',
          children: [this.term(node.body)],
        };
    }
  }

  private property(node: UnicodeProperty): string {
    const name = PROPERTY_NAMES[node.property];
    if (node.negated) return `a character NOT matching Unicode property ${node.property}`;
    if (name) return `${name} (Unicode property ${node.property})`;
    return `a character with Unicode property ${node.property}`;
  }

  private group(node: Group): Explanation {
    const span = { start: node.start, end: node.end };
    const children = this.body(node.body);
    const make = (label: string, kind: Explanation['kind'], detail?: string): Explanation =>
      detail ? { label, detail, span, kind, children } : { label, span, kind, children };
    switch (node.kind) {
      case 'capturing':
        return make(
          node.name ? `capturing group #${node.index} "${node.name}"` : `capturing group #${node.index}`,
          'group',
          'Remembers the matched text so you can read it or refer back to it.',
        );
      case 'nonCapturing':
        return make('group (not captured)', 'group', 'Groups the pieces without remembering the match.');
      case 'lookahead':
        return make('followed by (lookahead, not consumed)', 'anchor', 'Checks what comes next without including it.');
      case 'negativeLookahead':
        return make('not followed by (negative lookahead)', 'anchor', 'Fails if what comes next matches.');
      case 'lookbehind':
        return make('preceded by (lookbehind, not consumed)', 'anchor', 'Checks what came before without including it.');
      case 'negativeLookbehind':
        return make('not preceded by (negative lookbehind)', 'anchor', 'Fails if what came before matches.');
    }
  }
}
