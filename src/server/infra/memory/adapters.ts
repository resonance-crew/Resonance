import type { AfterResponse } from '@/server/ports/after';
import type { Clock } from '@/server/ports/clock';
import type { IdGenerator } from '@/server/ports/ids';
import type { Logger } from '@/server/ports/log';
import type { PageCache } from '@/server/ports/pageCache';
import type { RealtimePublisher, RealtimeTopic } from '@/server/ports/realtime';

/** 2026-11-20T00:00:00Z: where a memory clock starts unless told. */
export const MEMORY_EPOCH = Date.UTC(2026, 10, 20);

/** A clock that only moves when told. */
export interface MemoryClock extends Clock {
  set(ms: number): void;
  advance(ms: number): void;
}

export function memoryClock(start = MEMORY_EPOCH): MemoryClock {
  let now = start;
  return {
    now: () => now,
    date: () => new Date(now),
    set: (ms) => void (now = ms),
    advance: (ms) => void (now += ms),
  };
}

/** Predictable ids: `m0000000000000000001`, …; UUIDs `00000000-0000-4000-8000-000000000001`, …. */
export function memoryIds(): IdGenerator {
  let ids = 0;
  let uuids = 0;
  return {
    id: () => `m${String(++ids).padStart(19, '0')}`,
    uuid: () => `00000000-0000-4000-8000-${String(++uuids).padStart(12, '0')}`,
  };
}

/** Remembers what was dropped (logical paths, as given). */
export interface MemoryPageCache extends PageCache {
  readonly dropped: string[];
}

export function memoryPages(): MemoryPageCache {
  const dropped: string[] = [];
  return {
    dropped,
    revalidate(paths) {
      const list = [...paths];
      dropped.push(...list);
      return list;
    },
  };
}

/** Keeps the work until `flush()`, which runs it in order — a failure logged, as after() would. */
export interface MemoryAfter extends AfterResponse {
  readonly pending: { label: string }[];
  flush(): Promise<void>;
}

export function memoryAfter(log: Logger): MemoryAfter {
  const queue: { fn: () => unknown; label: string }[] = [];
  return {
    get pending() {
      return queue.map(({ label }) => ({ label }));
    },
    later(fn, label) {
      queue.push({ fn, label });
    },
    async flush() {
      while (queue.length) {
        const { fn, label } = queue.shift()!;
        try {
          await fn();
        } catch (e) {
          log.error(`[${label}]`, e);
        }
      }
    },
  };
}

/** Remembers every touch. */
export interface MemoryRealtime extends RealtimePublisher {
  readonly touches: { uid: string; topics: RealtimeTopic[] }[];
}

export function memoryRealtime(): MemoryRealtime {
  const touches: { uid: string; topics: RealtimeTopic[] }[] = [];
  return {
    touches,
    touch: async (uid, topics) => void touches.push({ uid, topics: [...topics] }),
  };
}

/** Keeps the lines instead of printing them. */
export interface MemoryLogger extends Logger {
  readonly lines: { level: 'info' | 'warn' | 'error'; message: string; rest: unknown[] }[];
}

export function memoryLogger(): MemoryLogger {
  const lines: MemoryLogger['lines'] = [];
  return {
    lines,
    info: (message, ...rest) => void lines.push({ level: 'info', message, rest }),
    warn: (message, ...rest) => void lines.push({ level: 'warn', message, rest }),
    error: (message, ...rest) => void lines.push({ level: 'error', message, rest }),
  };
}
