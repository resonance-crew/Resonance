import type { ServerCtx } from '@/server/ctx';
import type { LlmProvider } from '@/server/ports/llm';
import { envMediaUrls } from '../env/media';
import { fcmPushGateway } from '../fcm/push';
import { firebaseIdentityAdmin } from '../firebase-auth/identity';
import { nextAfter } from '../next/after';
import { nextPageCache } from '../next/pageCache';
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
 */
export function ctxFor(db: AdminDb, overrides: Partial<ServerCtx> = {}): ServerCtx {
  const log = overrides.log ?? consoleLogger;
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
    ...overrides,
  };
}
