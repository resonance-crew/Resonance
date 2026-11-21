import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describeInboxContract } from '@/server/contract/inbox.contract';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { instantFromParts, instantParts, type Instant } from '@/server/ports/time';

// Phase 2 inbox (2a-inbox): the inbox reads and read marks of the Firestore
// repositories against the same contract as memory
// (src/server/infra/memory/repos/inbox.test.ts): the clients' own listener
// queries (participants array-contains / userId ==, newest first) with id
// ties, microsecond cursors, update() that never makes a deleted
// conversation again, readAt the server's time — with uids of each test's own.

const PROJECT = 'demo-resonance-ports-inbox';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'ports-inbox-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const ts = (t: Instant) => {
  const { seconds, nanos } = instantParts(t);
  return new Timestamp(seconds, nanos);
};
const timesOf = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && /^\d{4}-.*\.\d{6}Z$/.test(v) ? ts(v) : v]));

let run = 0;
describeInboxContract('Firestore (emulator)', () => {
  const prefix = `i${Date.now()}x${++run}`;
  const ctx = ctxFor(db);
  return {
    data: ctx.data,
    uid: (n) => `${prefix}${n}`,
    async seedConversation(pair, { updatedAt, lastMessage, ...c }) {
      await db.doc(`conversations/${pair}`).set({
        createdAt: ts(updatedAt),
        unread: {},
        ...c,
        updatedAt: ts(updatedAt),
        lastMessage: lastMessage ? timesOf(lastMessage) : null,
      });
    },
    async seedMessage(pair, id, { sentAt, unsentAt, ...m }) {
      await db.doc(`conversations/${pair}/messages/${id}`).set({ ...m, sentAt: ts(sentAt), ...(unsentAt ? { unsentAt: ts(unsentAt) } : {}) });
    },
    async seedBell(id, { createdAt, readAt, ...r }) {
      await db.doc(`notifications/${id}`).set({ ...r, createdAt: ts(createdAt), readAt: readAt ? ts(readAt) : null });
    },
    async readAt(id) {
      const v = (await db.doc(`notifications/${id}`).get()).get('readAt');
      return v instanceof Timestamp ? instantFromParts(v.seconds, v.nanoseconds) : null;
    },
  };
});
