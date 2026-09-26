import { captureNames } from './parser';

export interface GroupMatch {
  /** 1-based capture number. */
  index: number;
  name?: string;
  /** `undefined` when the group did not take part in the match. */
  text: string | undefined;
  /** -1 when the group did not take part in the match. */
  start: number;
  end: number;
}

export interface Match {
  /** Position of this match in the result list. */
  index: number;
  start: number;
  end: number;
  text: string;
  groups: GroupMatch[];
}

export interface MatchResult {
  matches: Match[];
  /** True when the limit was hit and more matches may exist. */
  truncated: boolean;
}

export const DEFAULT_MATCH_LIMIT = 1000;

/**
 * Runs the pattern with the JavaScript engine exactly as `exec` would with the user's flags: one
 * match without `g`, all matches with it. Throws the engine's `SyntaxError` for invalid patterns.
 */
export function findMatches(pattern: string, flags: string, text: string, limit = DEFAULT_MATCH_LIMIT): MatchResult {
  const global = flags.includes('g');
  // `d` gives us the position of every group; `g` lets us drive lastIndex ourselves.
  const re = new RegExp(pattern, unique(flags + 'dg'));
  const sticky = flags.includes('y');
  const unicode = flags.includes('u') || flags.includes('v');
  const names = captureNames(pattern);
  const matches: Match[] = [];

  while (matches.length < limit) {
    const m = re.exec(text);
    if (!m) break;
    const start = m.index;
    const end = start + m[0].length;
    matches.push({ index: matches.length, start, end, text: m[0], groups: groupsOf(m, names) });
    if (!global) return { matches, truncated: false };
    if (end === start) re.lastIndex = advance(text, end, unicode);
    if (sticky && re.lastIndex > text.length) break;
  }
  return { matches, truncated: matches.length >= limit && re.exec(text) !== null };
}

function groupsOf(m: RegExpExecArray, names: Array<string | undefined>): GroupMatch[] {
  const groups: GroupMatch[] = [];
  for (let i = 1; i < m.length; i++) {
    const range = m.indices?.[i];
    const group: GroupMatch = {
      index: i,
      text: m[i],
      start: range ? range[0] : -1,
      end: range ? range[1] : -1,
    };
    const name = names[i - 1];
    if (name !== undefined) group.name = name;
    groups.push(group);
  }
  return groups;
}

/** Index after an empty match: skip a whole surrogate pair in unicode mode. */
function advance(text: string, index: number, unicode: boolean): number {
  if (!unicode || index >= text.length) return index + 1;
  const code = text.codePointAt(index) as number;
  return index + (code > 0xffff ? 2 : 1);
}

function unique(flags: string): string {
  return [...new Set(flags)].join('');
}
