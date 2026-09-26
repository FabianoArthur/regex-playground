import type { MatchResult } from '../regex/match';
import type { MatchRequest, MatchResponse } from './protocol';

export type RunOutcome =
  | { status: 'ok'; result: MatchResult; ms: number }
  | { status: 'error'; error: string }
  | { status: 'timeout' }
  | { status: 'stale' };

export const MATCH_TIMEOUT_MS = 1000;

/**
 * Runs matches in a Web Worker. Only the latest request matters: older ones resolve as `stale`.
 * A request that takes longer than the timeout gets the worker terminated and replaced.
 */
export class MatchRunner {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending: { id: number; resolve: (outcome: RunOutcome) => void; timer: number } | null = null;

  run(pattern: string, flags: string, text: string): Promise<RunOutcome> {
    if (this.pending) {
      // The worker may be stuck on the old request (a catastrophic pattern the user is fixing).
      // Replace it, or the new request would queue behind it and time out too.
      this.settle({ status: 'stale' });
      this.kill();
    }
    const worker = this.ensureWorker();
    const id = ++this.nextId;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.settle({ status: 'timeout' });
        this.kill();
      }, MATCH_TIMEOUT_MS);
      this.pending = { id, resolve, timer };
      worker.postMessage({ id, pattern, flags, text } satisfies MatchRequest);
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./match.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<MatchResponse>) => {
      const data = event.data;
      if (this.pending?.id !== data.id) return;
      this.settle(data.ok ? { status: 'ok', result: data.result, ms: data.ms } : { status: 'error', error: data.error });
    };
    this.worker = worker;
    return worker;
  }

  private settle(outcome: RunOutcome): void {
    if (!this.pending) return;
    window.clearTimeout(this.pending.timer);
    this.pending.resolve(outcome);
    this.pending = null;
  }

  private kill(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
