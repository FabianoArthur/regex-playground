/// <reference lib="webworker" />
import { findMatches } from '../regex/match';
import type { MatchRequest, MatchResponse } from './protocol';

// Matching runs here so a catastrophic pattern such as (a+)+$ can be killed from the page.
self.onmessage = (event: MessageEvent<MatchRequest>) => {
  const { id, pattern, flags, text } = event.data;
  let response: MatchResponse;
  try {
    const started = performance.now();
    const result = findMatches(pattern, flags, text);
    response = { id, ok: true, result, ms: performance.now() - started };
  } catch (error) {
    response = { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
