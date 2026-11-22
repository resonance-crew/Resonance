import { join } from 'node:path';
import { threadId } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { compareWorkers, inWorkers, mapLimit } from './pool';

const WORKER = join(__dirname, 'fixtures/poolWorker.ts');
type Job = { n: number; fail?: boolean; die?: boolean };
type Out = { n: number; thread: number };
const local = async (job: Job): Promise<Out> => ({ n: job.n * 2, thread: threadId });

describe('inWorkers', () => {
  it('does the jobs on worker threads, answering in the jobs’ order', async () => {
    const jobs = Array.from({ length: 12 }, (_, n) => ({ n }));
    const out = await inWorkers<Job, Out>(jobs, { size: 3, file: WORKER, local });
    expect(out.map((o) => o.n)).toEqual(jobs.map((j) => j.n * 2));
    const threads = new Set(out.map((o) => o.thread));
    expect(threads.has(threadId)).toBe(false);
    expect(threads.size).toBeGreaterThan(1);
  });

  it('does a job a worker failed on this thread, and one a dead worker held, so no result is ever lost', async () => {
    const said: string[] = [];
    const jobs: Job[] = [{ n: 1 }, { n: 2, fail: true }, { n: 3 }, { n: 4, die: true }, { n: 5 }, { n: 6 }, { n: 7 }];
    const out = await inWorkers<Job, Out>(jobs, { size: 2, file: WORKER, local, log: (l) => said.push(l) });
    expect(out.map((o) => o.n)).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(out[1].thread).toBe(threadId);
    expect(out[3].thread).toBe(threadId);
    expect(said.some((l) => /a comparison worker failed/.test(l))).toBe(true);
  });

  it('does everything on this thread when no worker can start, for a pool of 0 or 1, and for a handful of jobs', async () => {
    const jobs = Array.from({ length: 6 }, (_, n) => ({ n }));
    const gone = await inWorkers<Job, Out>(jobs, { size: 3, file: join(__dirname, 'fixtures/noSuchWorker.ts'), local, log: () => {} });
    expect(gone.map((o) => [o.n, o.thread])).toEqual(jobs.map((j) => [j.n * 2, threadId]));
    for (const size of [0, 1]) expect((await inWorkers<Job, Out>(jobs, { size, file: WORKER, local })).every((o) => o.thread === threadId)).toBe(true);
    expect((await inWorkers<Job, Out>(jobs.slice(0, 3), { size: 3, file: WORKER, local })).every((o) => o.thread === threadId)).toBe(true);
  });

  it('sizes the pool from VISUAL_COMPARE_WORKERS, else from the cores', () => {
    const was = process.env.VISUAL_COMPARE_WORKERS;
    try {
      process.env.VISUAL_COMPARE_WORKERS = '0';
      expect(compareWorkers()).toBe(0);
      process.env.VISUAL_COMPARE_WORKERS = '3';
      expect(compareWorkers()).toBe(3);
      delete process.env.VISUAL_COMPARE_WORKERS;
      expect(compareWorkers()).toBeGreaterThanOrEqual(1);
      expect(compareWorkers()).toBeLessThanOrEqual(4);
    } finally {
      if (was == null) delete process.env.VISUAL_COMPARE_WORKERS;
      else process.env.VISUAL_COMPARE_WORKERS = was;
    }
  });
});

describe('mapLimit', () => {
  it('never runs more than its limit at once, and answers in order', async () => {
    let running = 0;
    let most = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 6], 2, async (ms, i) => {
      most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, ms * 3));
      running--;
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4, 5]);
    expect(most).toBe(2);
  });

  it('lets the others finish when one throws: then throws the first error, or answers every outcome with settle', async () => {
    const done: number[] = [];
    const work = async (n: number) => {
      await new Promise((r) => setTimeout(r, 5));
      if (n === 2) throw new Error('tablet failed');
      done.push(n);
      return n;
    };
    await expect(mapLimit([1, 2, 3], 3, work)).rejects.toThrow('tablet failed');
    expect(done.sort()).toEqual([1, 3]);
    const settled = await mapLimit([1, 2, 3], 2, work, { settle: true });
    expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });
});
