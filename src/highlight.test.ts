import { describe, expect, it } from 'vitest';
import { segment } from './highlight';

const m = (start: number, end: number) => ({ start, end });

describe('segment', () => {
  it('returns the whole text as one plain segment when nothing matched', () => {
    expect(segment('hello', [])).toEqual([{ text: 'hello', start: 0, end: 5, match: null }]);
  });

  it('splits text around matches and numbers them', () => {
    expect(segment('a1b22', [m(1, 2), m(3, 5)])).toEqual([
      { text: 'a', start: 0, end: 1, match: null },
      { text: '1', start: 1, end: 2, match: 0 },
      { text: 'b', start: 2, end: 3, match: null },
      { text: '22', start: 3, end: 5, match: 1 },
    ]);
  });

  it('keeps empty matches as zero-width markers', () => {
    expect(segment('ab', [m(1, 1)])).toEqual([
      { text: 'a', start: 0, end: 1, match: null },
      { text: '', start: 1, end: 1, match: 0 },
      { text: 'b', start: 1, end: 2, match: null },
    ]);
  });

  it('handles the empty text', () => {
    expect(segment('', [])).toEqual([]);
    expect(segment('', [m(0, 0)])).toEqual([{ text: '', start: 0, end: 0, match: 0 }]);
  });
});
