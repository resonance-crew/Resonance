import { after } from 'next/server';
import type { AfterResponse } from '@/server/ports/after';
import type { Logger } from '@/server/ports/log';
import { consoleLogger } from '../system/log';

/** Next's `after()`: run once the response is sent; a failure is logged as `[label]` and goes no further. */
export function nextAfter(log: Logger = consoleLogger): AfterResponse {
  const run = (fn: () => unknown, label: string) => async () => {
    try {
      await fn();
    } catch (e) {
      log.error(`[${label}]`, e);
    }
  };
  return {
    later(fn, label) {
      after(run(fn, label));
    },
    async soon(fn, label) {
      try {
        after(run(fn, label)); // inside a request: once the answer is sent
      } catch {
        await run(fn, label)(); // no request to answer (a script, a test): now
      }
    },
  };
}
