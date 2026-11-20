// Vendor-free: the ports, and the infra factories that build a context. The
// database comes through '@/lib/db/firestore/admin' on purpose — the emulator
// suites `vi.mock` that path to hand the code their emulator Firestore, so a
// route that moves from getAdminDb() to serverCtx() keeps running on it.
import { getAdminDb } from '@/lib/db/firestore/admin';
import { ctxFor } from './infra/firestore/ctx';
import type { AfterResponse } from './ports/after';
import type { Clock } from './ports/clock';
import type { IdGenerator } from './ports/ids';
import type { IdentityAdmin } from './ports/identity';
import type { LeaseStore } from './ports/lease';
import type { LlmProvider } from './ports/llm';
import type { Logger } from './ports/log';
import type { MediaUrlResolver } from './ports/media';
import type { ObjectStore, PrivateObjectStore } from './ports/objects';
import type { PageCache } from './ports/pageCache';
import type { PushGateway } from './ports/push';
import type { RateLimiter } from './ports/rateLimit';
import type { RealtimePublisher } from './ports/realtime';
import type { DataRepos, UnitOfWork } from './ports/uow';
import type { VectorStore } from './ports/vectors';

/**
 * Everything an application service may reach. A service takes it as its
 * first argument — `(ctx: ServerCtx, …input) → output` — and imports no
 * vendor SDK; routes get it from serverCtx(), the emulator suites' legacy
 * facades from ctxFor(db), unit tests from memoryCtx().
 */
export interface ServerCtx {
  /** Transactions. */
  uow: UnitOfWork;
  /** Reads, and writes that need no transaction (batches, bulk deletes). */
  data: DataRepos;
  identity: IdentityAdmin;
  media: MediaUrlResolver;
  /** The public bucket. */
  objects: ObjectStore;
  /** The chat pictures' private bucket; null where none is set up. */
  chatObjects: PrivateObjectStore | null;
  push: PushGateway;
  limits: RateLimiter;
  leases: LeaseStore;
  vectors: VectorStore;
  llm: LlmProvider;
  /** Phase 2's signal channel; a no-op until then. */
  realtime: RealtimePublisher;
  pages: PageCache;
  later: AfterResponse;
  clock: Clock;
  ids: IdGenerator;
  log: Logger;
}

let cached: { db: object; ctx: ServerCtx } | null = null;

/**
 * The production context, from the environment: Firestore through the admin
 * SDK and the adapters of src/server/infra. One per instance — built again
 * only if getAdminDb() answers another database (a test that swaps it).
 * `overrides` replace single ports for this call: a route pinned to hnd1
 * passes `{ llm: openAiLlm() }` (the model is never in the default context:
 * infra/firestore/ctx.ts LLM_HINT).
 */
export function serverCtx(overrides?: Partial<ServerCtx>): ServerCtx {
  const db = getAdminDb();
  if (cached?.db !== db) cached = { db, ctx: ctxFor(db) };
  return overrides ? { ...cached.ctx, ...overrides } : cached.ctx;
}
