export interface Segment {
  text: string;
  start: number;
  end: number;
  /** Index of the match this segment belongs to, or null for text between matches. */
  match: number | null;
}

/**
 * Splits `text` into plain and matched segments, in order. Empty matches become zero-width
 * segments so the UI can still show a caret where they happened. Matches must be sorted and
 * non-overlapping, which is what the engine produces.
 */
export function segment(text: string, matches: ReadonlyArray<{ start: number; end: number }>): Segment[] {
  const out: Segment[] = [];
  let pos = 0;
  matches.forEach((m, i) => {
    if (m.start > pos) out.push({ text: text.slice(pos, m.start), start: pos, end: m.start, match: null });
    out.push({ text: text.slice(m.start, m.end), start: m.start, end: m.end, match: i });
    pos = Math.max(pos, m.end);
  });
  if (pos < text.length) out.push({ text: text.slice(pos), start: pos, end: text.length, match: null });
  return out;
}
