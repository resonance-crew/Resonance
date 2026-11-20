import type { ServerCtx } from '@/server/ctx';
import type { LlmProvider } from '@/server/ports/llm';
import { memoryMediaUrls } from '../env/media';
import { notWired } from '../wiring';
import {
  memoryAfter,
  memoryClock,
  memoryIds,
  memoryLogger,
  memoryPages,
  memoryRealtime,
  type MemoryAfter,
  type MemoryClock,
  type MemoryLogger,
  type MemoryPageCache,
  type MemoryRealtime,
} from './adapters';
import { memoryObjectStore, memoryPrivateObjectStore } from './objects';
import { memoryIdentity, type MemoryIdentity } from './identity';
import { memoryRateLimiter } from './rateLimit';
import { memoryLeaseStore } from './lease';
import { memoryPush } from './push';
import { buildMemoryDataRepos } from './repos';
import { MemoryState } from './state';
import { memoryUow } from './uow';
import { memoryVectors } from './vectors';

/**
 * A context with no I/O at all, for unit tests of application services: the
 * repositories over one MemoryState (`state`, to seed and inspect), a clock
 * that moves only when told, predictable ids, and recording stand-ins for the
 * page cache, after-response work, realtime and logs, buckets in memory with
 * URLs on https://media.test (memoryMediaUrls). Ports with no memory
 * adapter yet throw NotWiredError when called — pass one in `overrides`.
 */
export interface MemoryCtx extends ServerCtx {
  state: MemoryState;
  identity: MemoryIdentity;
  clock: MemoryClock;
  pages: MemoryPageCache;
  later: MemoryAfter;
  realtime: MemoryRealtime;
  log: MemoryLogger;
}

export function memoryCtx(overrides: Partial<ServerCtx> & { state?: MemoryState } = {}): MemoryCtx {
  const state = overrides.state ?? new MemoryState();
  const log = memoryLogger();
  const media = overrides.media ?? memoryMediaUrls();
  const base: MemoryCtx = {
    state,
    uow: memoryUow(state),
    data: buildMemoryDataRepos(state),
    identity: memoryIdentity(),
    media,
    objects: memoryObjectStore(media),
    chatObjects: memoryPrivateObjectStore(),
    push: memoryPush(),
    limits: memoryRateLimiter(state),
    leases: memoryLeaseStore(state),
    vectors: memoryVectors(),
    llm: notWired<LlmProvider>('llm'),
    realtime: memoryRealtime(),
    pages: memoryPages(),
    later: memoryAfter(log),
    clock: memoryClock(),
    ids: memoryIds(),
    log,
  };
  return { ...base, ...overrides } as MemoryCtx;
}
