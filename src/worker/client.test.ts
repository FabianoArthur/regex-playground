import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchRequest } from './protocol';

/** Fake worker: answers only when told to, like a real one stuck on a slow pattern. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  received: MatchRequest[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(request: MatchRequest) {
    this.received.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  answer(request: MatchRequest) {
    this.onmessage?.({ data: { id: request.id, ok: true, result: { matches: [], truncated: false }, ms: 1 } } as MessageEvent);
  }
}

describe('MatchRunner', () => {
  beforeEach(() => {
    FakeWorker.all = [];
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('window', globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('marks the older request stale and sends the new one to a fresh worker', async () => {
    const { MatchRunner } = await import('./client');
    const runner = new MatchRunner();
    const slow = runner.run('(a+)+$', 'g', 'aaaa!');
    const fixed = runner.run('a+$', 'g', 'aaaa!');
    await expect(slow).resolves.toEqual({ status: 'stale' });

    // The first worker may still be grinding on the slow pattern: it must not hold up the new request.
    expect(FakeWorker.all).toHaveLength(2);
    expect(FakeWorker.all[0]?.terminated).toBe(true);
    const fresh = FakeWorker.all[1] as FakeWorker;
    fresh.answer(fresh.received[0] as MatchRequest);
    await expect(fixed).resolves.toMatchObject({ status: 'ok' });
  });

  it('times out, kills the worker and recovers on the next run', async () => {
    const { MatchRunner, MATCH_TIMEOUT_MS } = await import('./client');
    const runner = new MatchRunner();
    const stuck = runner.run('(a+)+$', 'g', 'aaaa!');
    vi.advanceTimersByTime(MATCH_TIMEOUT_MS);
    await expect(stuck).resolves.toEqual({ status: 'timeout' });
    expect(FakeWorker.all[0]?.terminated).toBe(true);

    const next = runner.run('a', 'g', 'a');
    const worker = FakeWorker.all[1] as FakeWorker;
    worker.answer(worker.received[0] as MatchRequest);
    await expect(next).resolves.toMatchObject({ status: 'ok' });
  });

  it('reuses the worker when the previous request already finished', async () => {
    const { MatchRunner } = await import('./client');
    const runner = new MatchRunner();
    const first = runner.run('a', 'g', 'a');
    const worker = FakeWorker.all[0] as FakeWorker;
    worker.answer(worker.received[0] as MatchRequest);
    await first;
    runner.run('b', 'g', 'b');
    expect(FakeWorker.all).toHaveLength(1);
  });
});
