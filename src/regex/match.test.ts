import { describe, expect, it } from 'vitest';
import { findMatches } from './match';

describe('findMatches', () => {
  it('returns only the first match without the g flag, like exec', () => {
    const { matches } = findMatches('\\d+', '', 'a1 b22 c333');
    expect(matches).toEqual([{ index: 0, start: 1, end: 2, text: '1', groups: [] }]);
  });

  it('returns every match with the g flag', () => {
    const { matches } = findMatches('\\d+', 'g', 'a1 b22 c333');
    expect(matches.map((m) => [m.start, m.text])).toEqual([
      [1, '1'],
      [4, '22'],
      [8, '333'],
    ]);
  });

  it('reports groups with names and positions, and unmatched groups', () => {
    const { matches } = findMatches('(?<y>\\d{4})-(\\d\\d)(x)?', 'g', 'on 2026-09 ok');
    expect(matches[0]?.groups).toEqual([
      { index: 1, name: 'y', text: '2026', start: 3, end: 7 },
      { index: 2, text: '09', start: 8, end: 10 },
      { index: 3, text: undefined, start: -1, end: -1 },
    ]);
  });

  it('does not loop forever on empty matches', () => {
    const { matches } = findMatches('x*', 'g', 'ab');
    expect(matches.map((m) => [m.start, m.end])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });

  it('advances by code point in unicode mode', () => {
    const { matches } = findMatches('', 'gu', '😀');
    expect(matches.map((m) => m.start)).toEqual([0, 2]);
  });

  it('caps the number of matches', () => {
    const result = findMatches('.', 'g', 'abcdef', 4);
    expect(result.matches).toHaveLength(4);
    expect(result.truncated).toBe(true);
  });

  it('honours the sticky flag', () => {
    expect(findMatches('a', 'gy', 'aab').matches).toHaveLength(2);
  });

  it('throws the engine error for an invalid pattern', () => {
    expect(() => findMatches('(', 'g', 'x')).toThrow(SyntaxError);
  });
});
