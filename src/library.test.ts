import { describe, expect, it } from 'vitest';
import { LIBRARY } from './library';
import { parse } from './regex/parser';

describe('pattern library', () => {
  it('finds the prices, and only the prices, in the lookbehind example', () => {
    const price = LIBRARY.find((p) => p.id === 'price');
    expect(price?.sample.match(new RegExp(price.pattern, price.flags))).toEqual(['120.00', '99,90']);
  });

  it('has unique ids', () => {
    expect(new Set(LIBRARY.map((p) => p.id)).size).toBe(LIBRARY.length);
  });

  describe.each(LIBRARY)('$name', (entry) => {
    const whole = new RegExp(`^(?:${entry.pattern})$`, entry.flags.replace(/[gy]/g, ''));

    it('is valid for the engine and for our parser', () => {
      expect(() => new RegExp(entry.pattern, entry.flags)).not.toThrow();
      expect(() => parse(entry.pattern, entry.flags)).not.toThrow();
    });

    if (entry.shouldMatch.length) it.each(entry.shouldMatch)('matches %j', (s) => expect(whole.test(s)).toBe(true));
    if (entry.shouldNotMatch.length) it.each(entry.shouldNotMatch)('rejects %j', (s) => expect(whole.test(s)).toBe(false));

    it('finds something in its sample text', () => {
      expect(new RegExp(entry.pattern, entry.flags).test(entry.sample)).toBe(true);
    });
  });
});
