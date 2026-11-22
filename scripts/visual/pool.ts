/**
 * Doing several things at once, within a limit: `mapLimit` for async work on this thread (the web's
 * devices, web.ts), `inWorkers` for CPU work on worker threads (the comparison, compare.ts).
 */
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { ROOT } from './util';

/**
 * `fn` over `items`, at most `limit` at a time, answers in the items' order. One that throws doesn't stop
 * the others: they all finish, then the first error is thrown (`settle: true` answers every outcome instead).
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  options: { settle: true },
): Promise<PromiseSettledResult<R>[]>;
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  options: { settle?: boolean } = {},
): Promise<R[] | PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i], i) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  if (options.settle) return out;
  const failed = out.find((o) => o.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failed) throw failed.reason;
  return out.map((o) => (o as PromiseFulfilledResult<R>).value);
}

/**
 * How many worker threads the comparison uses (`VISUAL_COMPARE_WORKERS`; default: the cores less two, at most 4). Each
 * holds about 150 MB at its peak on a 2880 × 1800 pair, and a run's Mac may already be short of memory with its devices up
 * (2026-11-22: 10 GB of swap in use; 54 app captures took 22.5 s on one thread, 6.7 s on 4, 5.6 s on 6).
 */
export function compareWorkers(): number {
  const set = process.env.VISUAL_COMPARE_WORKERS;
  if (set != null && set !== '') return Math.max(0, Math.floor(Number(set)) || 0);
  return Math.max(1, Math.min(4, availableParallelism() - 2));
}

/** tsx's loader, by path: a worker resolves `--import` from the process's folder, which may not be the checkout. */
function tsxImport(): string {
  const loader = join(ROOT, 'node_modules/tsx/dist/loader.mjs');
  return existsSync(loader) ? pathToFileURL(loader).href : 'tsx';
}

/**
 * Each job through `file` (a worker module answering `{ id, result | error }` for each `{ id, job }`) on up to `size`
 * worker threads, answers in the jobs' order. A job a worker failed — it threw, the worker died or never started — is
 * done by `local` on this thread instead, so a broken pool costs time, never a result. `size` 0 or 1, or a handful of
 * jobs, runs them all locally (starting a worker takes about a third of a second).
 */
export async function inWorkers<J, R>(
  jobs: readonly J[],
  { size, file, local, minJobs = 4, log = () => {} }: { size: number; file: string; local: (job: J) => Promise<R>; minJobs?: number; log?: (line: string) => void },
): Promise<R[]> {
  const out: (R | undefined)[] = new Array(jobs.length);
  const redo = new Set<number>();
  const count = Math.min(size, jobs.length);
  if (count >= 2 && jobs.length >= minJobs) {
    let next = 0;
    const execArgv = file.endsWith('.ts') ? ['--import', tsxImport()] : [];
    await Promise.all(
      Array.from({ length: count }, () =>
        new Promise<void>((done) => {
          let worker: Worker;
          let current = -1;
          let finished = false;
          const stop = (failed?: unknown) => {
            if (finished) return;
            finished = true;
            if (failed) {
              if (current >= 0) redo.add(current);
              log(`  a comparison worker failed (${String((failed as Error)?.message ?? failed).split('\n')[0]}): its captures are judged on the main thread`);
            }
            void worker?.terminate();
            done();
          };
          const send = () => {
            if (next >= jobs.length) return stop();
            current = next++;
            worker.postMessage({ id: current, job: jobs[current] });
          };
          try {
            worker = new Worker(file, { execArgv });
          } catch (error) {
            return stop(error);
          }
          worker.on('message', ({ id, result, error }: { id: number; result?: R; error?: string }) => {
            if (error != null) redo.add(id);
            else out[id] = result;
            send();
          });
          worker.once('online', send);
          worker.on('error', stop);
          worker.on('exit', (code) => stop(code === 0 ? undefined : new Error(`exit ${code}`)));
        }),
      ),
    );
    // A worker that died before it took its share leaves jobs no one was sent.
    for (let i = next; i < jobs.length; i++) redo.add(i);
  } else {
    for (let i = 0; i < jobs.length; i++) redo.add(i);
  }
  for (const i of [...redo].sort((a, b) => a - b)) out[i] = await local(jobs[i]);
  return out as R[];
}
