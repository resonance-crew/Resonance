/** pool.test.ts's worker: answers each job with its thread, throws for `fail`, dies for `die`. */
import { parentPort, threadId } from 'node:worker_threads';

parentPort!.on('message', ({ id, job }: { id: number; job: { n: number; fail?: boolean; die?: boolean } }) => {
  if (job.die) process.exit(3);
  if (job.fail) return parentPort!.postMessage({ id, error: 'this job fails' });
  parentPort!.postMessage({ id, result: { n: job.n * 2, thread: threadId } });
});
