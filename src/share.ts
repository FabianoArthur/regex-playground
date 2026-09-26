export interface PlaygroundState {
  pattern: string;
  flags: string;
  text: string;
}

/** Keeps shared links well under the length browsers and chat apps handle comfortably. */
export const MAX_SHARED_TEXT = 4000;
const VALID_FLAGS = 'dgimsuvy';

export function encodeState(state: PlaygroundState): { hash: string; truncated: boolean } {
  const truncated = state.text.length > MAX_SHARED_TEXT;
  const params = new URLSearchParams({
    p: state.pattern,
    f: cleanFlags(state.flags),
    t: truncated ? state.text.slice(0, MAX_SHARED_TEXT) : state.text,
  });
  return { hash: `#${params.toString()}`, truncated };
}

/** Reads a state from `location.hash`; null when the hash is not one of ours or is corrupt. */
export function decodeState(hash: string): PlaygroundState | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.includes('p=')) return null;
  try {
    // URLSearchParams silently replaces bad escapes with U+FFFD; decode strictly first.
    decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return null;
  }
  const params = new URLSearchParams(raw);
  const pattern = params.get('p');
  if (pattern === null) return null;
  return {
    pattern,
    flags: cleanFlags(params.get('f') ?? ''),
    text: (params.get('t') ?? '').slice(0, MAX_SHARED_TEXT),
  };
}

function cleanFlags(flags: string): string {
  const kept = [...VALID_FLAGS].filter((f) => flags.includes(f));
  return (kept.includes('u') ? kept.filter((f) => f !== 'v') : kept).join('');
}
