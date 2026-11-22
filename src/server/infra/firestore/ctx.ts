import type { ServerCtx } from '@/server/ctx';
import type { LlmProvider } from '@/server/ports/llm';
import type { Logger } from '@/server/ports/log';
import { envMediaUrls } from '../env/media';
import { fcmPushGateway } from '../fcm/push';
import { firebaseIdentityAdmin } from '../firebase-auth/identity';
import { nextAfter } from '../next/after';
import { nextPageCache } from '../next/pageCache';
import { chatImageStoreConfigured } from '../s3/fromEnv';
import { chatObjectStore, publicObjectStore } from '../s3/objects';
import { withOwnSessions } from '../session/deps';
import { systemClock } from '../system/clock';
import { systemIds } from '../system/ids';
import { consoleLogger } from '../system/log';
import { notWired } from '../wiring';
import type { AdminDb } from './db';
import { firestoreLeaseStore } from './lease';
import { firestoreRateLimiter } from './rateLimit';
import { firestoreRealtime } from './realtime';
import { firestoreSessionStore } from './sessions';
import { buildDataRepos } from './repos';
import { firestoreUow } from './uow';
import { firestoreVectors } from './vectors';

/**
 * Never wired by default: OpenAI refuses requests from Hong Kong, where the
 * functions run, so only a route pinned to hnd1 may reach it (rule 9,
 * src/lib/ai/regions.test.ts, which follows each route's imports). Such a
 * route imports the adapter itself — `serverCtx({ llm: openAiLlm() })` style,
 * `ctxFor(db, { llm: openAiLlm() })` — and the test sees it.
 */
const LLM_HINT = "no model by default: a route pinned to hnd1 passes openAiLlm() from '@/server/infra/openai/llm' in the ctx overrides (rule 9)";

/**
 * A context bound to this Firestore: what serverCtx() answers for the
 * production database, and what a legacy facade builds for the database it
 * was handed (`publishCard(db, …)` → `publishCardIn(ctxFor(db), …)`), so the
 * emulator suites run every service on their emulator. `overrides` replace
 * single ports — `ctxFor(db, { push })` threads an injected sender through.
 *
 * Building it loads no SDK: each adapter loads its own on first use. A port
 * whose lane hasn't built its adapter yet throws NotWiredError when called,
 * and so does `llm` unless the route passes it (LLM_HINT).
 *
 * One context per database (a WeakMap, so a test's database goes with it):
 * a facade called on every request (the card page's `readCardForPageIn(ctxFor(db))`)
 * no longer builds some thirty adapters each time. Overrides are laid over
 * that one in a fresh object, never into it — except a `log`, which the
 * realtime and after-response adapters are built with, so that context is
 * built whole. The one built is frozen: a caller can't change it for the next.
 * Whether a chat store is set up is read from the environment when the
 * context is built (chatObjectStore), so each answer is kept apart.
 */
export function ctxFor(db: AdminDb, overrides: Partial<ServerCtx> = {}): ServerCtx {
  if (overrides.log) return { ...build(db, overrides.log), ...overrides };
  const base = shared(db);
  return Object.keys(overrides).length ? { ...base, ...overrides } : base;
}

const contexts = new WeakMap<AdminDb, { withChat?: ServerCtx; withoutChat?: ServerCtx }>();

function shared(db: AdminDb): ServerCtx {
  let kept = contexts.get(db);
  if (!kept) contexts.set(db, (kept = {}));
  const slot = chatImageStoreConfigured() ? 'withChat' : 'withoutChat';
  return (kept[slot] ??= Object.freeze(build(db, consoleLogger)));
}

function build(db: AdminDb, log: Logger): ServerCtx {
  return {
    uow: firestoreUow(db),
    data: buildDataRepos(db),
    // Signing an account out everywhere revokes Resonance's own refresh families too (ADR 0004).
    identity: withOwnSessions(firebaseIdentityAdmin(), firestoreSessionStore(db)),
    media: envMediaUrls(),
    objects: publicObjectStore(),
    chatObjects: chatObjectStore(),
    push: fcmPushGateway(),
    limits: firestoreRateLimiter(db),
    leases: firestoreLeaseStore(db),
    vectors: firestoreVectors(db),
    llm: notWired<LlmProvider>('llm', LLM_HINT),
    realtime: firestoreRealtime(db, log),
    pages: nextPageCache,
    later: nextAfter(log),
    clock: systemClock,
    ids: systemIds,
    log,
  };
}
