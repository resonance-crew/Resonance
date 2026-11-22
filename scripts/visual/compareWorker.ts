/**
 * A worker thread of the comparison's pool (compare.ts): judges the captures it is sent, one at a
 * time (judge.ts), and answers each — or the error, which the pool turns into judging that capture on
 * the main thread.
 */
import { parentPort } from 'node:worker_threads';
import { judgeCapture, type Job } from './judge';

parentPort!.on('message', async ({ id, job }: { id: number; job: Job }) => {
  try {
    parentPort!.postMessage({ id, result: await judgeCapture(job) });
  } catch (error) {
    parentPort!.postMessage({ id, error: String((error as Error)?.stack ?? error) });
  }
});
