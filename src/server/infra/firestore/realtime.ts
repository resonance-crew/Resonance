import { FieldValue } from 'firebase-admin/firestore';
import type { Logger } from '@/server/ports/log';
import { SIGNALS_VERSION, type RealtimePublisher } from '@/server/ports/realtime';
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
  return {
    async touch(uid, topics) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !topics.length) return;
      const counts = new Map<string, number>();
      const threads = new Map<string, number>();
      for (const t of topics) {
        if (typeof t === 'string') counts.set(t, (counts.get(t) ?? 0) + 1);
        else if (/^[A-Za-z0-9_-]{1,257}$/.test(t.thread)) threads.set(t.thread, (threads.get(t.thread) ?? 0) + 1);
      }
      const data: Record<string, unknown> = { v: SIGNALS_VERSION, at: FieldValue.serverTimestamp() };
      for (const [topic, n] of counts) data[topic] = FieldValue.increment(n);
      if (threads.size) data.threads = Object.fromEntries([...threads].map(([pair, n]) => [pair, FieldValue.increment(n)]));
      try {
        await db.collection(SIGNALS).doc(uid).set(data, { merge: true });
      } catch (e) {
        log.warn('[realtime] signals', uid, e);
      }
    },
  };
}
