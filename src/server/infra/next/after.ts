import { after } from 'next/server';
import type { AfterResponse } from '@/server/ports/after';
import type { Logger } from '@/server/ports/log';
import { consoleLogger } from '../system/log';

/** Next's `after()`: run once the response is sent; a failure is logged as `[label]` and goes no further. */
export function nextAfter(log: Logger = consoleLogger): AfterResponse {
  return {
    later(fn, label) {
      after(async () => {
        try {
          await fn();
        } catch (e) {
          log.error(`[${label}]`, e);
        }
      });
    },
  };
}
