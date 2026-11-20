import type { ServerCtx } from '@/server/ctx';
import type { LeaseStore } from '@/server/ports/lease';
import type { LlmProvider } from '@/server/ports/llm';
import type { MediaUrlResolver } from '@/server/ports/media';
import type { ObjectStore, PrivateObjectStore } from '@/server/ports/objects';
import type { PushGateway } from '@/server/ports/push';
import type { VectorStore } from '@/server/ports/vectors';
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
import { memoryIdentity, type MemoryIdentity } from './identity';
import { memoryRateLimiter } from './rateLimit';
import { buildMemoryDataRepos } from './repos';
import { MemoryState } from './state';
import { memoryUow } from './uow';

/**
 * A context with no I/O at all, for unit tests of application services: the
 * repositories over one MemoryState (`state`, to seed and inspect), a clock
 * that moves only when told, predictable ids, and recording stand-ins for the
 * page cache, after-response work, realtime and logs. Ports with no memory
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
  const base: MemoryCtx = {
    state,
    uow: memoryUow(state),
    data: buildMemoryDataRepos(state),
    identity: memoryIdentity(),
    media: notWired<MediaUrlResolver>('media'),
    objects: notWired<ObjectStore>('objects'),
    chatObjects: notWired<PrivateObjectStore>('chatObjects'),
    push: notWired<PushGateway>('push'),
    limits: memoryRateLimiter(state),
    leases: notWired<LeaseStore>('leases'),
    vectors: notWired<VectorStore>('vectors'),
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
