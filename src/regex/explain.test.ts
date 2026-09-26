import { describe, expect, it } from 'vitest';
import { explain, explainFlags, type Explanation } from './explain';
import { parse } from './parser';

const run = (pattern: string, flags = '') => explain(parse(pattern, flags), flags);

/** Compact view of an explanation tree: `label` or `[label, children…]`. */
type Shape = string | [string, ...Shape[]];
function shape(nodes: Explanation[]): Shape[] {
  return nodes.map((n) => (n.children.length ? [n.label, ...shape(n.children)] : n.label));
}

describe('explain', () => {
  it('merges consecutive literals into one piece of text', () => {
    expect(shape(run('cat'))).toEqual(['the text "cat"']);
    expect(run('cat')[0]?.span).toEqual({ start: 0, end: 3 });
  });

  it('keeps a quantified literal apart from its neighbours', () => {
    expect(shape(run('colou?r'))).toEqual([
      'the text "colo"',
      ['optionally (zero or one time)', 'the character "u"'],
      'the character "r"',
    ]);
  });

  it('describes anchors, the dot and class escapes', () => {
    expect(shape(run('^.\\d\\D\\w\\s\\b$'))).toEqual([
      'start of the text',
      'any character except a line break',
      'a digit (0-9)',
      'any character except a digit (0-9)',
      'a word character (letter, digit or _)',
      'a whitespace character (space, tab, line break…)',
      'a word boundary',
      'end of the text',
    ]);
  });

  it('adapts anchors and the dot to the m and s flags', () => {
    expect(shape(run('^.$', 'ms'))).toEqual(['start of a line', 'any character', 'end of a line']);
  });

  it('names escaped and invisible characters', () => {
    expect(shape(run('\\n\\t \\.'))).toEqual(['the text "\\n\\t ."']);
    expect(run('\\n')[0]?.detail).toBe('a line break (\\n)');
  });

  it('describes quantifiers, greedy and lazy', () => {
    expect(run('a*')[0]?.label).toBe('zero or more times');
    expect(run('a+')[0]?.label).toBe('one or more times');
    expect(run('a{3}')[0]?.label).toBe('exactly 3 times');
    expect(run('a{2,}')[0]?.label).toBe('2 or more times');
    expect(run('a{1,4}')[0]?.label).toBe('between 1 and 4 times');
    expect(run('a{1}')[0]?.label).toBe('exactly once');
    expect(run('a+?')[0]?.label).toBe('one or more times, as few as possible (lazy)');
  });

  it('describes character classes and their members', () => {
    expect(shape(run('[a-z0-9_]'))).toEqual([
      ['one character from the set', 'a character from "a" to "z"', 'a character from "0" to "9"', 'the character "_"'],
    ]);
    expect(run('[^aeiou]')[0]?.label).toBe('one character NOT in the set');
    expect(run('[]')[0]?.label).toBe('nothing — an empty set never matches');
    expect(run('[^]')[0]?.label).toBe('any character, including line breaks');
  });

  it('describes groups, lookarounds and backreferences', () => {
    expect(shape(run('(?<year>\\d{4})(?:x)'))).toEqual([
      ['capturing group #1 "year"', ['exactly 4 times', 'a digit (0-9)']],
      ['group (not captured)', 'the character "x"'],
    ]);
    expect(run('(a)\\1')[1]?.label).toBe('the same text captured by group #1');
    expect(run('(?<q>a)\\k<q>')[1]?.label).toBe('the same text captured by group "q"');
    expect(shape(run('(?=a)(?!b)(?<=c)(?<!d)')).map((s) => (s as string[])[0])).toEqual([
      'followed by (lookahead, not consumed)',
      'not followed by (negative lookahead)',
      'preceded by (lookbehind, not consumed)',
      'not preceded by (negative lookbehind)',
    ]);
  });

  it('describes alternation, including an empty alternative', () => {
    expect(shape(run('cat|dog|'))).toEqual([
      [
        'either of 3 alternatives',
        'alternative 1: the text "cat"',
        'alternative 2: the text "dog"',
        'alternative 3: nothing (matches the empty string)',
      ],
    ]);
  });

  it('keeps an alternative with several parts as a sub-tree', () => {
    expect(shape(run('a|b+'))).toEqual([
      ['either of 2 alternatives', 'alternative 1: the character "a"', ['alternative 2: one or more times', 'the character "b"']],
    ]);
    expect(shape(run('ab\\d|c'))[0]).toEqual([
      'either of 2 alternatives',
      ['alternative 1', 'the text "ab"', 'a digit (0-9)'],
      'alternative 2: the character "c"',
    ]);
  });

  it('describes unicode properties', () => {
    expect(run('\\p{L}', 'u')[0]?.label).toBe('a letter (Unicode property L)');
    expect(run('\\P{Script=Greek}', 'u')[0]?.label).toBe('a character NOT matching Unicode property Script=Greek');
  });

  it('gives every node a span inside the pattern', () => {
    const pattern = '^(?<user>[\\w.]+)@(\\w+)\\.com$';
    const walk = (nodes: Explanation[]): void => {
      for (const n of nodes) {
        expect(n.span.start).toBeGreaterThanOrEqual(0);
        expect(n.span.end).toBeLessThanOrEqual(pattern.length);
        walk(n.children);
      }
    };
    walk(run(pattern));
  });
});

describe('explainFlags', () => {
  it('explains each flag, in a stable order', () => {
    expect(explainFlags('ig').map((f) => [f.flag, f.name])).toEqual([
      ['g', 'global'],
      ['i', 'ignore case'],
    ]);
  });

  it('ignores unknown characters', () => {
    expect(explainFlags('gz')).toHaveLength(1);
  });
});
