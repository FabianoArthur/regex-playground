import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, MAX_SHARED_TEXT } from './share';

describe('share', () => {
  it('round-trips pattern, flags and text through the URL hash', () => {
    const state = { pattern: '(?<y>\\d{4})#&=?', flags: 'gi', text: 'año 2026\nline two & more' };
    const { hash } = encodeState(state);
    expect(hash.startsWith('#')).toBe(true);
    expect(decodeState(hash)).toEqual(state);
  });

  it('returns null for a hash that is not a shared state', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('#')).toBeNull();
    expect(decodeState('#section-2')).toBeNull();
  });

  it('drops unknown and repeated flags', () => {
    expect(decodeState('#p=a&f=ggzi!')?.flags).toBe('gi');
  });

  it('never returns the u and v flags together, which the engine rejects', () => {
    expect(decodeState('#p=a&f=uv')?.flags).toBe('u');
  });

  it('survives malformed percent-encoding', () => {
    expect(decodeState('#p=%E0%A4%A&t=x')).toBeNull();
  });

  it('truncates a very long text and says so', () => {
    const { hash, truncated } = encodeState({ pattern: 'a', flags: '', text: 'x'.repeat(MAX_SHARED_TEXT + 10) });
    expect(truncated).toBe(true);
    expect(decodeState(hash)?.text).toHaveLength(MAX_SHARED_TEXT);
  });
});
