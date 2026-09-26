import type { MatchResult } from '../regex/match';

export interface MatchRequest {
  id: number;
  pattern: string;
  flags: string;
  text: string;
}

export type MatchResponse =
  | { id: number; ok: true; result: MatchResult; ms: number }
  | { id: number; ok: false; error: string };
