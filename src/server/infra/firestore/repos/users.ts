import { FieldValue, type DocumentData, type DocumentReference, type Firestore, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { User } from '@/lib/db/types';
import type { PersonRow, UsersData, UsersTxRepo } from '@/server/ports/repos/users';
import type { AdminDb } from '../db';
import { mapUser, sanitize } from '../mapper';

/* ───────────── pen-name reservations (was src/lib/db/firestore/handles.ts, which re-exports these) ───────────── */

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

/* ───────────── the repositories ───────────── */

/** `users` inside a Firestore transaction — the write side: profile.ts's transactions, moved as they were. */
export function usersTx(db: AdminDb, tx: Transaction): UsersTxRepo {
  const userRef = (uid: string) => db.doc(`users/${uid}`);
  return {
    async getProfile(uid) {
      const snap = await tx.get(userRef(uid));
      return snap.exists ? sanitize<PersonRow>(snap.data()!) : null;
    },
    handleTakenByOther: (uid, handle) => handleTakenByOther(db, uid, handle, tx),
    async ownsReleasableReservation(uid, current, next) {
      const oldKey = handleKey(current);
      if (!(oldKey && reservable(oldKey) && oldKey !== handleKey(next))) return false;
      const reservation = await tx.get(handleRef(db, current));
      return reservation.exists && reservation.get('uid') === uid;
    },

    createProfile(uid, p) {
      tx.set(userRef(uid), {
        handle: p.handle,
        handleLower: handleKey(p.handle),
        bio: p.bio,
        region: p.region,
        primaryLocale: p.primaryLocale,
        autoTranslateTo: p.autoTranslateTo,
        verified: p.verified,
        avatarSeed: p.avatarSeed,
        initials: p.initials,
        accentColor: p.accentColor,
        joinedAt: FieldValue.serverTimestamp(),
        handleChangedAt: FieldValue.serverTimestamp(),
      });
    },
    nameProfile(uid, n) {
      tx.update(userRef(uid), {
        handle: n.handle,
        handleLower: handleKey(n.handle),
        handleChangedAt: FieldValue.serverTimestamp(),
        region: n.region,
        primaryLocale: n.primaryLocale,
        ...(n.initials !== undefined ? { initials: n.initials } : {}),
      });
    },
    patchProfile(uid, p) {
      const patch: Record<string, unknown> = {};
      if (p.handle != null) {
        patch.handle = p.handle;
        patch.handleLower = handleKey(p.handle);
        patch.handleChangedAt = FieldValue.serverTimestamp();
      }
      if (p.bio != null) patch.bio = p.bio;
      if (p.region != null) patch.region = p.region;
      if (p.primaryLocale != null) patch.primaryLocale = p.primaryLocale;
      if (p.avatarUrl != null) patch.avatarUrl = p.avatarUrl;
      if (p.avatarKey !== undefined) patch.avatarKey = p.avatarKey ?? FieldValue.delete();
      if (p.autoTranslateTo != null) patch.autoTranslateTo = p.autoTranslateTo;
      // Each hint on its own path, as the clients' `hintsSeen.{key}` writes: the other counts stay.
      for (const [key, count] of Object.entries(p.hintsSeen ?? {})) patch[`hintsSeen.${key}`] = count;
      if (Object.keys(patch).length) tx.update(userRef(uid), patch);
    },
    reserveHandle: (uid, handle) => reserveHandle(db, tx, uid, handle),
    releaseHandle(uid, handle) {
      // Only ever this account's own reservation (ownsReleasableReservation), into a hold for it (holdHandle).
      tx.delete(handleRef(db, handle));
      holdHandle(db, handle, uid, tx);
    },
  };
}

/** The person who goes by a pen name, through its reservation (`handles/{lower}`), as src/lib/db/firestore/user.ts did. */
export async function findUserByHandle(db: AdminDb, handle: string): Promise<User | null> {
  const uid = await uidForHandle(db, handle.trim().toLowerCase());
  if (!uid) return null;
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? mapUser(snap.id, snap.data() ?? {}) : null;
}

/** A document id that can safely be put in a path (hand-edited data could hold anything). */
const docIdOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/');

/** A stored profile as a PersonRow: its fields, Timestamps as Date. */
const personRow = (data: DocumentData): PersonRow => sanitize<PersonRow>(data);

/** The two people's connection document (`connections/{a_b}`, the smaller uid first). */
const pairId = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);

// Account and conversation helpers belong to their own lanes (account, graph / conversations); read lazily, so
// building a context loads neither and no import cycle runs through them.
const deletionModule = () => import('@/lib/account/deletion');
const preLetterModule = () => import('@/lib/api/v1/preLetter');
const conversationsModule = () => import('@/lib/api/v1/conversations');

/** `users` outside a transaction. */
export function usersData(db: AdminDb): UsersData {
  return {
    findByHandle: (handle) => findUserByHandle(db, handle),
    idForHandle: (handle) => uidForHandle(db, handle),
    async getRow(uid) {
      if (!docIdOk(uid) || isReservedId(uid)) return null;
      const snap = await db.doc(`users/${uid}`).get();
      return snap.exists ? personRow(snap.data()!) : null;
    },
    async getUser(uid, fields) {
      if (!docIdOk(uid) || isReservedId(uid)) return null;
      const ref = db.doc(`users/${uid}`);
      const snap = fields ? (await db.getAll(ref, { fieldMask: [...fields] }))[0] : await ref.get();
      return snap?.exists ? mapUser(snap.id, snap.data() ?? {}) : null;
    },
    async rowsOf(ids, fields) {
      const wanted = [...new Set(ids)].filter(docIdOk);
      if (!wanted.length) return new Map();
      const snaps = await db.getAll(...wanted.map((id) => db.doc(`users/${id}`)), { fieldMask: [...fields] });
      return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, personRow(s.data()!)]));
    },
    async blockedBy(uid) {
      const snap = await db.collection(`users/${uid}/blocks`).get();
      return new Set(snap.docs.map((d) => d.id));
    },
    async hasBlocked(uid, other) {
      return (await db.doc(`users/${uid}/blocks/${other}`).get()).exists;
    },
    async connected(a, b) {
      if (a === b) return false;
      return (await db.doc(`connections/${pairId(a, b)}`).get()).exists;
    },
    async connectedAmong(uid, others) {
      const authors = [...new Set(others)].filter(docIdOk);
      const linked = new Set<string>();
      if (!authors.length) return linked;
      const byPair = new Map(authors.map((a) => [pairId(uid, a), a]));
      const snaps = await db.getAll(...[...byPair.keys()].map((pair) => db.doc(`connections/${pair}`)));
      for (const s of snaps) if (s.exists) linked.add(byPair.get(s.id)!);
      return linked;
    },
    async deletionOf(uid) {
      const deletion = await (await deletionModule()).getAccountDeletion(db, uid);
      return deletion ? { requestedAt: deletion.requestedAt, purgeAfter: deletion.purgeAfter } : null;
    },
    async letterReadsAsConnection(viewerId, writerId) {
      const [{ pairOf }, { letterReadsAsConnection }] = await Promise.all([conversationsModule(), preLetterModule()]);
      const conversation = await db.doc(`conversations/${pairOf(viewerId, writerId)}`).get();
      return letterReadsAsConnection(db, viewerId, writerId, conversation);
    },

    // --- write side (cardsWrite lane: profile.ts)

    async handleAvailable(uid, handle) {
      if (!reservable(handleKey(handle))) return false;
      return !(await handleTakenByOther(db, uid, handle));
    },
  };
}
