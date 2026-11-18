import { Timestamp, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { hasPenName, pairOf } from '@/lib/api/v1/conversations';
import { CARD_VISIBILITY_FIELDS, cardVisible, trashedAtOf } from '@/lib/api/v1/present';
import { tapRef } from '@/lib/api/v1/taps';
import { mapCard } from '@/lib/db/firestore/mapper';
import type { DeviceLocale } from './devices';
import { ANDROID_CHANNEL, deviceTargets, forgetDevices, groupByLocale, multicastAll, type MulticastGroup, type PushResult, type PushSender } from './send';
import { appsDraw } from './bellCapability';
import { wantsTapPushes } from './settings';
import { TAP_NOTE_WINDOW_MS, tapCollapseKey } from './tapCollapse';

export { TAP_NOTE_WINDOW_MS, noteRidesTap, tapCollapseKey } from './tapCollapse';
export { everyAppDraws } from './bellCapability';

/**
 * What a resonance tap (共振, lib/api/v1/taps) tells the card's author: once
 * per reader and card, ever (`rangAt` on the tap), after the PUT's response
 * and in a transaction of its own that reads the card and both directions of
 * the blocks again — across a block, on an anonymous card as on a named one,
 * nothing reaches the author (and the reader's answer never waited on that).
 *
 * **The bell row** `notifications/rtap_{cardId}_{yyyymmdd}` (one per card per
 * UTC day) = `{ userId, type: 'resonance_tap', payload: { cardId, fromUserIds
 * (newest first, ≤ 20), anonymous?: true }, readAt, createdAt, pushedAt }`:
 * made by the day's first ring, each later ring that day adding its reader in
 * front (and marking the row unread and new again). Written already pushed —
 * the push below is its own. A tap taken back takes its reader out of the
 * row, and a row left with no one is deleted; the account purge does the same
 * for a purged reader (`array-contains`, then `arrayRemove`). Opens the card,
 * named or anonymous alike — never a thread.
 *
 * App builds made before the row draw a bell type they don't know as its raw
 * string, so the row is written only when every app install the author has
 * registered declares `bell-tap` (`PUT /me/devices` capabilities); someone with
 * no app install (the web alone) gets it.
 *
 * **The push**: always (the installed builds open a push's `route`), unless the
 * author turned 有人共振 off (`notificationSettings.resonanceTaps`). Worded by
 * the server — 「{handle} 與你的卡片共振了」, or 「{handle} 和另外 {count} 人…」
 * with that day's row — in each device's language, the reader's pen name as it
 * is now. One per new ring at most, under the card's collapse id / Android tag
 * `rtap_{cardId}`, so the lock screen keeps one line per card; a note the same
 * reader leaves on the card within TAP_NOTE_WINDOW_MS rides that same id
 * (lib/push/chat, ./send), and a ring within that time after a note of theirs
 * there pushes nothing, so the lock screen keeps the note's words.
 */
export const TAP_BELL = 'resonance_tap';
/** The capability an app build registers once it draws the `resonance_tap` row. */
export const BELL_TAP_CAPABILITY = 'bell-tap';
/** At most this many readers a row keeps (newest first). */
export const TAP_ROW_MAX = 20;

const MESSAGES = { en, 'zh-TW': zhTW } as const satisfies Record<DeviceLocale, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** The UTC day of `ms`, as yyyymmdd. */
export const tapDay = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
/** The card's bell row for the UTC day of `ms`. */
export const tapBellId = (cardId: string, ms: number) => `rtap_${cardId}_${tapDay(ms)}`;

/** The row's readers with `uid` in front (once), at most TAP_ROW_MAX. */
export function withTapper(fromUserIds: unknown, uid: string): string[] {
  const before = Array.isArray(fromUserIds) ? fromUserIds.filter((id): id is string => typeof id === 'string' && id !== uid) : [];
  return [uid, ...before].slice(0, TAP_ROW_MAX);
}

/** The row's readers without `uid`. */
export function withoutTapper(fromUserIds: unknown, uid: string): string[] {
  return Array.isArray(fromUserIds) ? fromUserIds.filter((id): id is string => typeof id === 'string' && id !== uid) : [];
}

/** The push's line in one language: the reader, and how many others rang the card that day. */
export function tapText(locale: DeviceLocale, handle: string, others: number): string {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'app.notifications' });
  return others > 0 ? t('tapMany', { handle, count: others }) : t('tap', { handle });
}

export interface TapRing {
  /** The card's author, rung. */
  to: string;
  /** The reader's pen name as it is now. */
  handle: string;
  /** The day's bell row, when one was written or added to (null: an older app build of theirs would draw it badly). */
  notificationId: string | null;
  /** The others in that row (for 「和另外 {count} 人」). */
  others: number;
}

/**
 * Ring the author of `cardId` for `uid`'s tap, once ever (the work after a
 * PUT that turned a tap on). In one transaction: the tap (still on, never
 * rang), the card (published, out of the trash, still readable by the
 * reader), both directions of the blocks — any of them standing, nothing at
 * all — then `rangAt` and the day's bell row. Answers what to push, or null
 * when nothing rang.
 */
export async function ringTap(db: Firestore, uid: string, cardId: string, now = Date.now()): Promise<TapRing | null> {
  const cardRef = db.doc(`cards/${cardId}`);
  const [first] = await db.getAll(cardRef, { fieldMask: ['authorId'] });
  const to = first.exists ? str(first.get('authorId')) : '';
  if (!to || to === uid || to.includes('/')) return null;
  // Read beside the transaction: which builds the author's installs are only decides whether a row is written.
  const writesRow = await appsDraw(db, to, BELL_TAP_CAPABILITY);
  const ref = tapRef(db, cardId, uid);
  const bell = db.doc(`notifications/${tapBellId(cardId, now)}`);
  return db.runTransaction(async (tx) => {
    const [tap, [card], me, out, inn, linked, row] = await Promise.all([
      tx.get(ref),
      tx.getAll(cardRef, { fieldMask: [...CARD_VISIBILITY_FIELDS] }),
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`users/${uid}/blocks/${to}`)),
      tx.get(db.doc(`users/${to}/blocks/${uid}`)),
      tx.get(db.doc(`connections/${pairOf(uid, to)}`)),
      tx.get(bell),
    ]);
    if (!tap.exists || tap.get('on') !== true || tap.get('rangAt') != null) return null;
    const current = card.exists ? mapCard(card.id, card.data()!) : null;
    if (!current || current.authorId !== to || !current.publishedAt || trashedAtOf(current) != null || current.trashedAt != null) return null;
    if (!cardVisible(current, uid, () => linked.exists)) return null;
    // A block either way: the author's side leaves the reader out — no ring, no row — on any card.
    if (out.exists || inn.exists || !hasPenName(me)) return null;
    const at = Timestamp.fromMillis(now);
    tx.update(ref, { rangAt: at });
    let others = 0;
    if (writesRow) {
      if (row.exists && row.get('userId') === to && row.get('type') === TAP_BELL) {
        const fromUserIds = withTapper(row.get('payload.fromUserIds'), uid);
        others = fromUserIds.length - 1;
        tx.update(bell, { 'payload.fromUserIds': fromUserIds, readAt: null, createdAt: at });
      } else if (!row.exists) {
        tx.set(bell, {
          userId: to,
          type: TAP_BELL,
          payload: { cardId, fromUserIds: [uid], ...(current.anonymous === true ? { anonymous: true } : {}) },
          readAt: null,
          createdAt: at,
          // Its push is pushTap's: nothing else rings it.
          pushedAt: at,
        });
      }
    }
    return { to, handle: str(me.get('handle')), notificationId: writesRow ? bell.id : null, others };
  });
}

/**
 * A tap taken back (the work after a DELETE that turned one off): its reader
 * leaves the bell row their ring wrote (the UTC day of `rangAt`), and a row
 * left with no one goes. Nothing else — taking back tells no one.
 */
export async function untapBell(db: Firestore, uid: string, cardId: string): Promise<void> {
  const ref = tapRef(db, cardId, uid);
  await db.runTransaction(async (tx) => {
    const tap = await tx.get(ref);
    const rangAt = tap.get('rangAt');
    // Tapped again since: they stay where their ring put them.
    if (!tap.exists || tap.get('on') === true || !(rangAt instanceof Timestamp)) return;
    const bell = db.doc(`notifications/${tapBellId(cardId, rangAt.toMillis())}`);
    const row = await tx.get(bell);
    if (!row.exists || row.get('type') !== TAP_BELL) return;
    removeFromRow(tx, row, uid);
  });
}

/** Take `uid` out of a `resonance_tap` row in `tx`, deleting a row left with no one. */
export function removeFromRow(tx: Transaction, row: DocumentSnapshot, uid: string): void {
  const before = row.get('payload.fromUserIds');
  if (!Array.isArray(before) || !before.includes(uid)) return;
  const left = withoutTapper(before, uid);
  if (left.length) tx.update(row.ref, { 'payload.fromUserIds': left });
  else tx.delete(row.ref);
}

/** Whether `from` left a note on `cardId` since `since` (ms): their note's line then stays on the lock screen. */
async function notedSince(db: Firestore, from: string, cardId: string, since: number): Promise<boolean> {
  try {
    const notes = await db.collection('notes').where('cardId', '==', cardId).where('fromUserId', '==', from).select('createdAt').get();
    return notes.docs.some((d) => {
      const at = d.get('createdAt');
      return at instanceof Timestamp && at.toMillis() >= since;
    });
  } catch (e) {
    console.error('[push] tap: notes', cardId, e);
    return false;
  }
}


/**
 * Push a tap's ring to the author's devices (after ringTap). Silent when they
 * turned 有人共振 off, or when the reader left a note on the card in the last
 * TAP_NOTE_WINDOW_MS (its words stay on the lock screen). The route is the
 * card by id — named or anonymous, never a thread, never `fromUserId`.
 */
export async function pushTap(
  db: Firestore,
  sender: PushSender,
  ring: TapRing & { from: string; cardId: string },
  now = Date.now(),
): Promise<PushResult | null> {
  const { to, from, cardId, handle, notificationId, others } = ring;
  if (!(await wantsTapPushes(db, to))) return null;
  if (await notedSince(db, from, cardId, now - TAP_NOTE_WINDOW_MS)) return null;
  const devices = await db.collection('devices').where('userId', '==', to).get();
  if (devices.empty) return { sent: 0, pruned: 0 };
  const key = tapCollapseKey(cardId);
  const data: Record<string, string> = {
    type: TAP_BELL,
    cardId,
    route: `/card/${encodeURIComponent(cardId)}`,
    // Only with a row behind it: an empty id made older Android builds mark notifications/ itself read.
    ...(notificationId ? { notificationId } : {}),
  };
  const groups: MulticastGroup[] = [];
  for (const [locale, targets] of groupByLocale(deviceTargets(devices.docs))) {
    const title = tapText(locale, handle || 'Resonance', others);
    groups.push({
      targets,
      build: (tokens) => ({
        tokens,
        notification: { title },
        data,
        android: { notification: { channelId: ANDROID_CHANNEL, ...(key ? { tag: key } : {}) } },
        apns: { ...(key ? { headers: { 'apns-collapse-id': key } } : {}), payload: { aps: { sound: 'default', threadId: TAP_BELL } } },
      }),
    });
  }
  const { sent, dead } = await multicastAll(sender, groups);
  await forgetDevices(db, dead);
  return { sent, pruned: dead.length };
}

/** The bell rows a purged reader is still named in (`payload.fromUserIds`), for the account purge. */
export function tapRowsNaming(db: Firestore, uid: string) {
  return db.collection('notifications').where('payload.fromUserIds', 'array-contains', uid);
}

/** Take a purged reader out of every row naming them (one transaction each, deleting a row left empty). */
export async function purgeTapRows(db: Firestore, uid: string): Promise<number> {
  const rows = await tapRowsNaming(db, uid).select().get();
  for (const d of rows.docs) {
    await db.runTransaction(async (tx) => {
      const row = await tx.get(d.ref);
      if (row.exists) removeFromRow(tx, row, uid);
    });
  }
  return rows.size;
}

