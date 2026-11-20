import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describeConversationsContract } from '@/server/contract/conversations.contract';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { instantParts } from '@/server/ports/time';

// The conversations aggregate's Firestore repositories against the same
// contract as memory (src/server/infra/memory/repos/conversations.test.ts):
// real transactions, `ref.create()`, `FieldValue.increment('unread.' + uid)`
// and message pages ordered by (sentAt, id) at the microsecond, with uids of
// each test's own.

const PROJECT = 'demo-resonance-ports-conversations';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-conversations-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

let run = 0;
describeConversationsContract('Firestore (emulator)', () => {
  const prefix = `p${Date.now()}x${++run}`;
  const ctx = ctxFor(db);
  return {
    uow: ctx.uow,
    data: ctx.data,
    uid: (n) => `${prefix}${n}`,
    async seedMessage(pair, id, { sentAt, ...m }) {
      const { seconds, nanos } = instantParts(sentAt);
      await db.doc(`conversations/${pair}/messages/${id}`).set({ ...m, sentAt: new Timestamp(seconds, nanos) });
    },
    unread: async (pair) => ((await db.doc(`conversations/${pair}`).get()).get('unread') ?? {}) as Record<string, number>,
  };
});
