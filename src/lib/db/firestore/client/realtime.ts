'use client';

import {
  collection,
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Firestore,
  type WhereFilterOp,
} from 'firebase/firestore';
import {
  EMULATOR_FIRESTORE_PORT,
  USE_FIREBASE_EMULATOR,
  ensureAppCheck,
  getFirebaseClientApp,
  getFirebaseClientAuth,
} from '@/lib/auth/firebase/client';

/*
 * The full Firestore SDK, for the one thing Lite can't do: listen. Since
 * Phase 2 of the middleware decouple the web listens to ONE document,
 * `signals/{uid}` (lib/data/signals: counters only, which say what to pull
 * again from /api/v1) — `listenDoc`. `listenNewest` is left for the legacy
 * thread listener (client/messagesLegacy), which nothing in the app calls.
 * It is only ever imported dynamically (./listen), so it loads after a page —
 * once a signed-in page starts listening for its badges — never with it. Everything else reads
 * and writes through Lite (./init, ./sdk) — a separate instance of the same
 * app.
 *
 * Its snapshots carry the full SDK's own Timestamp class, not Lite's: map
 * them with a check that accepts either (see messages.ts).
 */

let cached: Firestore | null = null;

function realtimeDb(): Firestore {
  if (cached) return cached;
  getFirebaseClientAuth(); // the listener signs in with the same user (see ./init)
  ensureAppCheck();
  cached = initializeFirestore(getFirebaseClientApp(), { ignoreUndefinedProperties: true });
  if (USE_FIREBASE_EMULATOR) connectFirestoreEmulator(cached, '127.0.0.1', EMULATOR_FIRESTORE_PORT);
  return cached;
}

export interface ListenedDoc {
  id: string;
  data: DocumentData;
}

/** About one answer of a listener. */
export interface ListenedMeta {
  /**
   * The answer came from the SDK's own memory, not from the server (offline,
   * or before the server has answered): it may be only part of the truth.
   */
  fromCache: boolean;
}

/**
 * Listen to one document: `onData` hears its fields (null while it doesn't
 * exist), `onError` a refusal or a listener the SDK gave up on. Returns the
 * unsubscribe function.
 */
export function listenDoc(
  path: [string, ...string[]],
  onData: (data: DocumentData | null) => void,
  onError: (err: Error) => void,
): () => void {
  const [first, ...rest] = path;
  return onSnapshot(
    doc(realtimeDb(), first, ...rest),
    (snap) => onData(snap.exists() ? snap.data() : null),
    (err) => onError(err),
  );
}

/** A `where` clause, as the rules require of a list (the viewer's own documents). */
export interface ListenFilter {
  field: string;
  op: WhereFilterOp;
  value: unknown;
}

/**
 * Listen to the newest `max` documents of a collection by `field`, newest
 * first (those matching `filters`). Returns the unsubscribe function.
 */
export function listenNewest(
  path: [string, ...string[]],
  field: string,
  max: number,
  onDocs: (docs: ListenedDoc[], meta: ListenedMeta) => void,
  onError: (err: Error) => void,
  filters: ListenFilter[] = [],
): () => void {
  const [first, ...rest] = path;
  const q = query(
    collection(realtimeDb(), first, ...rest),
    ...filters.map((f) => where(f.field, f.op, f.value)),
    orderBy(field, 'desc'),
    limit(max),
  );
  return onSnapshot(
    q,
    (snap) => onDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() })), { fromCache: snap.metadata.fromCache }),
    (err) => onError(err),
  );
}
