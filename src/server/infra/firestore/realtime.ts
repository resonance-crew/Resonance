import { FieldValue } from 'firebase-admin/firestore';
import type { Logger } from '@/server/ports/log';
import { SIGNALS_VERSION, signalsOf, type RealtimePublisher, type RealtimeTopic, type SignalsDoc } from '@/server/ports/realtime';
import type { AdminDb } from './db';

/** The collection of signal documents (firestore.rules `match /signals/{uid}`: its owner reads, no client writes). */
export const SIGNALS = 'signals';

/**
 * The signal channel on Firestore: one `set(…, { merge: true })` on
 * `signals/{uid}` per touch, each topic's counter (and `threads.<pair>`)
 * raised with FieldValue.increment and `at` the server's time — no read, no
 * transaction, so two touches at once both count. Called after the write it
 * signals committed (app/realtime.ts signal); a failure is logged, never thrown.
 */
export function firestoreRealtime(db: AdminDb, log: Logger): RealtimePublisher {
  const ref = (uid: string) => db.collection(SIGNALS).doc(uid);
  return {
    async touch(uid, topics) {
      const data = touchData(uid, topics);
      if (!data) return;
      try {
        await ref(uid).set(data, { merge: true });
      } catch (e) {
        log.warn('[realtime] signals', uid, e);
      }
    },
    async read(uid) {
      if (!UID.test(uid)) return null;
      return signalsOf((await ref(uid).get()).data());
    },
    async touchAndRead(uid, topics) {
      const data = touchData(uid, topics);
      if (!data) return null;
      try {
        // One transaction: the read locks the document, so the counters answered are exactly the ones
        // this touch left (another touch of the same document waits for it, or runs it again).
        return await db.runTransaction(async (tx) => {
          const before = signalsOf((await tx.get(ref(uid))).data()) ?? { v: SIGNALS_VERSION, inbox: 0, bell: 0, graph: 0, map: 0, drafts: 0, threads: {} };
          tx.set(ref(uid), data, { merge: true });
          return raised(before, topics);
        });
      } catch (e) {
        log.warn('[realtime] signals', uid, e);
        return null;
      }
    },
  };
}

const UID = /^[A-Za-z0-9_-]{1,128}$/;
const PAIR = /^[A-Za-z0-9_-]{1,257}$/;

/** The merge a touch writes, or null when there is nothing to write. */
function touchData(uid: string, topics: readonly RealtimeTopic[]): Record<string, unknown> | null {
  if (!UID.test(uid) || !topics.length) return null;
  const counts = new Map<string, number>();
  const threads = new Map<string, number>();
  for (const t of topics) {
    if (typeof t === 'string') counts.set(t, (counts.get(t) ?? 0) + 1);
    else if (PAIR.test(t.thread)) threads.set(t.thread, (threads.get(t.thread) ?? 0) + 1);
  }
  const data: Record<string, unknown> = { v: SIGNALS_VERSION, at: FieldValue.serverTimestamp() };
  for (const [topic, n] of counts) data[topic] = FieldValue.increment(n);
  if (threads.size) data.threads = Object.fromEntries([...threads].map(([pair, n]) => [pair, FieldValue.increment(n)]));
  return data;
}

/** `doc` with each of `topics` raised by one (what a touch leaves). */
export function raised(doc: SignalsDoc, topics: readonly RealtimeTopic[]): SignalsDoc {
  const out: SignalsDoc = { ...doc, v: SIGNALS_VERSION, threads: { ...doc.threads } };
  for (const t of topics) {
    if (typeof t === 'string') out[t] += 1;
    else if (PAIR.test(t.thread)) out.threads[t.thread] = (out.threads[t.thread] ?? 0) + 1;
  }
  return out;
}
