import { FieldValue, type DocumentData, type DocumentReference, type Firestore, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';

/**
 * Pen-name reservations: `handles/{pen name, lower-cased}` → `{ uid, handle }`.
 *
 * A pen name is the address of a profile (/u/{handle}) and of a
 * conversation (/messages/{handle}), so it must belong to one person. A
 * query can't promise that — two accounts could each find a name free and
 * both take it — but a document id can: the profile write (POST / PATCH
 * /api/v1/me) creates the reservation in the same transaction, and a name
 * whose reservation is someone else's is taken. A rename releases the old
 * one; the account purge releases the last — each into a hold
 * (`handleHolds/{name}`, server-only) for HANDLE_HOLD_DAYS, so links that
 * named the account by it (/u/{old}, shared, pasted into stories) never
 * reach someone else who took it at once: a rename's hold keeps the name for
 * its former holder, the purge's names no one.
 *
 * Names taken before reservations existed have none until
 * `scripts/backfill.ts handles` writes them, so a missing reservation still
 * falls back to the profiles' `handleLower` (and a name held that way is
 * taken too).
 */
export const HANDLES = 'handles';

/** A pen name's reservation id: the name trimmed and lower-cased, as `handleLower`. */
export function handleKey(handle: string): string {
  return handle.trim().toLowerCase();
}

/**
 * Whether a lower-cased pen name can be a document id: Firestore refuses
 * `.`, `..` and ids like `__x__`, and a `/` would be a path (the pen-name
 * schema already refuses that). Such a name can't be reserved, so it can't
 * be taken either.
 */
export function reservable(key: string): boolean {
  return key.length > 0 && key !== '.' && key !== '..' && !/^__.*__$/.test(key) && !key.includes('/') && Buffer.byteLength(key) <= 1500;
}

export function handleRef(db: Firestore, handle: string): DocumentReference {
  return db.collection(HANDLES).doc(handleKey(handle));
}

/** Released pen names held from anyone else: `handleHolds/{name}` → `{ heldFor: uid | null, releasedAt }`. */
export const HANDLE_HOLDS = 'handleHolds';
/** How long a released pen name is held: its former holder may take it back, nobody else. */
export const HANDLE_HOLD_DAYS = 90;

export function holdRef(db: Firestore, handle: string): DocumentReference {
  return db.collection(HANDLE_HOLDS).doc(handleKey(handle));
}

/** Hold a released pen name, inside `tx` when given: for its former holder after a rename, for no one after the purge. */
export function holdHandle(db: Firestore, handle: string, heldFor: string | null, tx?: Transaction) {
  const data = { heldFor, releasedAt: FieldValue.serverTimestamp() };
  return tx ? tx.set(holdRef(db, handle), data) : holdRef(db, handle).set(data);
}

/** Whether a hold still keeps its name from `uid`. */
function heldFrom(data: DocumentData | undefined, uid: string): boolean {
  const at = data?.releasedAt as { toMillis?: () => number } | undefined;
  if (typeof at?.toMillis !== 'function') return false;
  return at.toMillis() + HANDLE_HOLD_DAYS * 86_400_000 > Date.now() && data?.heldFor !== uid;
}

/** The uid a reservation names, or null when there is none (or it names no one). */
function reservedUid(data: DocumentData | undefined): string | null {
  const uid = data?.uid;
  return typeof uid === 'string' && uid ? uid : null;
}

/**
 * Whether `handle` is someone else's: its reservation names another account,
 * a hold keeps it from this one (released lately by someone else), or — for
 * a name not reserved yet — another profile goes by it. Read inside `tx` when
 * given (before any of its writes).
 */
export async function handleTakenByOther(db: Firestore, uid: string, handle: string, tx?: Transaction): Promise<boolean> {
  const key = handleKey(handle);
  const profiles = db.collection('users').where('handleLower', '==', key).limit(2);
  const read = (ref: DocumentReference) => (tx ? tx.get(ref) : ref.get());
  const [reservation, hold, holders] = await Promise.all([
    reservable(key) ? read(handleRef(db, handle)) : null,
    reservable(key) ? read(holdRef(db, handle)) : null,
    tx ? tx.get(profiles) : profiles.get(),
  ]);
  const owner = reservedUid(reservation?.data());
  if (owner) return owner !== uid;
  if (heldFrom(hold?.data(), uid)) return true;
  return holders.docs.some((d) => d.id !== uid);
}

/**
 * Who goes by `handle`: its reservation's account, or (a name not reserved
 * yet) the profile whose `handleLower` matches — the earliest-joined when
 * old data has more than one. Null when nobody does.
 */
export async function uidForHandle(db: Firestore, handle: string): Promise<string | null> {
  const key = handleKey(handle);
  if (!key) return null;
  if (reservable(key)) {
    const owner = reservedUid((await handleRef(db, handle).get()).data());
    if (owner) return owner;
  }
  const snap = await db.collection('users').where('handleLower', '==', key).limit(5).get();
  if (snap.empty) return null;
  const joined = (d: QueryDocumentSnapshot) => {
    const at = d.get('joinedAt') as { toMillis?: () => number } | undefined;
    return typeof at?.toMillis === 'function' ? at.toMillis() : Number.MAX_SAFE_INTEGER;
  };
  return [...snap.docs].sort((a, b) => joined(a) - joined(b) || a.id.localeCompare(b.id))[0].id;
}

/** Write `uid`'s reservation of `handle` inside `tx` (after its reads). */
export function reserveHandle(db: Firestore, tx: Transaction, uid: string, handle: string): void {
  tx.set(handleRef(db, handle), { uid, handle: handle.trim(), reservedAt: FieldValue.serverTimestamp() });
  // Taken (back), it is held no longer.
  tx.delete(holdRef(db, handle));
}
