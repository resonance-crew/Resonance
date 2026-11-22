import { pairOf } from '@/lib/api/v1/conversations';
import { cardVisible, trashedAtOf } from '@/lib/api/v1/present';
import type { ServerCtx } from '@/server/ctx';
import { groupByLocale } from '@/server/domain/push/devices';
import { BELL_TAP_CAPABILITY, TAP_BELL, TAP_NOTE_WINDOW_MS, tapBellId, tapCollapseKey, withTapper, withoutTapper } from '@/server/domain/push/tap';
import { ANDROID_CHANNEL, tapText } from '@/server/domain/push/text';
import type { BellRow, BellTxRepo } from '@/server/ports/repos/bell';
import { bellChanged } from '@/server/domain/realtimeInbox';
import { signal } from './inbox';
import { appsDrawIn } from './pushDevices';
import { sendAndForget, type PushGroup, type PushResult } from './pushSend';
import { wantsTapPushes } from './pushSettings';

/** What a resonance tap's ring tells (lib/push/tapBell tells the whole story). */
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
 * Ring the author of `cardId` for `uid`'s tap, once ever. In one
 * transaction: the tap (still on, never rang), the card (published, out of
 * the trash, still readable by the reader), both directions of the blocks —
 * any of them standing, nothing at all — then `rangAt` and the day's bell
 * row. Answers what to push, or null when nothing rang.
 */
export async function ringTapIn(ctx: ServerCtx, uid: string, cardId: string, now = ctx.clock.now()): Promise<TapRing | null> {
  const to = await ctx.data.pushState.getCardAuthor(cardId);
  if (!to || to === uid || to.includes('/')) return null;
  // Read beside the transaction: which builds the author's installs are only decides whether a row is written.
  const writesRow = await appsDrawIn(ctx, to, BELL_TAP_CAPABILITY);
  const bellId = tapBellId(cardId, now);
  const ring = await ctx.uow.run(
    async (tx) => {
      const [tap, current, me, out, inn, linked, row] = await Promise.all([
        tx.pushState.getTap(cardId, uid),
        tx.pushState.getRingCard(cardId),
        tx.pushState.getProfile(uid),
        tx.pushState.isBlocked(uid, to),
        tx.pushState.isBlocked(to, uid),
        tx.pushState.connectionExists(pairOf(uid, to)),
        tx.bell.getRow(bellId),
      ]);
      if (!tap || !tap.on || tap.rang) return null;
      if (!current || current.authorId !== to || !current.publishedAt || trashedAtOf(current) != null || current.trashedAt != null) return null;
      if (!cardVisible(current, uid, () => linked)) return null;
      // A block either way: the author's side leaves the reader out — no ring, no row — on any card.
      if (out || inn || !me.handle.trim()) return null;
      tx.pushState.markTapRang(cardId, uid, now);
      let others = 0;
      if (writesRow) {
        if (row && row.userId === to && row.type === TAP_BELL) {
          const fromUserIds = withTapper(row.payload.fromUserIds, uid);
          others = fromUserIds.length - 1;
          tx.bell.bumpTapRow(bellId, fromUserIds, now);
        } else if (!row) {
          tx.bell.putRow(bellId, {
            userId: to,
            type: TAP_BELL,
            payload: { cardId, fromUserIds: [uid], ...(current.anonymous === true ? { anonymous: true } : {}) },
            // Its push is pushTap's: nothing else rings it.
            atMs: now,
          });
        }
      }
      return { to, handle: me.handle, notificationId: writesRow ? bellId : null, others };
    },
    { label: 'ring tap' },
  );
  // After the commit: the author's bell, when its row was written or moved (a row of another type stays as it was).
  if (ring?.notificationId) await signal(ctx, bellChanged(ring.to));
  return ring;
}

/** Take `uid` out of a `resonance_tap` row in this transaction, deleting a row left with no one. */
export function removeReader(bell: BellTxRepo, row: BellRow, uid: string): void {
  const before = row.payload.fromUserIds;
  if (!Array.isArray(before) || !before.includes(uid)) return;
  const left = withoutTapper(before, uid);
  if (left.length) bell.setRowReaders(row.id, left);
  else bell.deleteRow(row.id);
}

/**
 * A tap taken back: its reader leaves the bell row their ring wrote (the UTC
 * day of `rangAt`), and a row left with no one goes. Nothing else.
 */
export async function untapBellIn(ctx: ServerCtx, uid: string, cardId: string): Promise<void> {
  const changed = await ctx.uow.run(
    async (tx) => {
      const tap = await tx.pushState.getTap(cardId, uid);
      // Tapped again since: they stay where their ring put them.
      if (!tap || tap.on || tap.rangAtMs === null) return null;
      const row = await tx.bell.getRow(tapBellId(cardId, tap.rangAtMs));
      if (!row || row.type !== TAP_BELL) return null;
      const named = Array.isArray(row.payload.fromUserIds) && row.payload.fromUserIds.includes(uid);
      removeReader(tx.bell, row, uid);
      return named ? row.userId : null;
    },
    { label: 'untap bell' },
  );
  // After the commit: the author's bell, which lost a reader (or the row).
  if (changed) await signal(ctx, bellChanged(changed));
}

/** Whether `from` left a note on `cardId` since `since` (ms): their note's line then stays on the lock screen. */
async function notedSince(ctx: ServerCtx, from: string, cardId: string, since: number): Promise<boolean> {
  try {
    return (await ctx.data.pushState.listNoteTimes(cardId, from)).some((at) => at !== null && at >= since);
  } catch (e) {
    ctx.log.error('[push] tap: notes', cardId, e);
    return false;
  }
}

/**
 * Push a tap's ring to the author's devices (after ringTap). Silent when they
 * turned 有人共振 off, or when the reader left a note on the card in the last
 * TAP_NOTE_WINDOW_MS. The route is the card by id — never a thread, never `fromUserId`.
 */
export async function pushTapIn(ctx: ServerCtx, ring: TapRing & { from: string; cardId: string }, now = ctx.clock.now()): Promise<PushResult | null> {
  const { to, from, cardId, handle, notificationId, others } = ring;
  if (!(await wantsTapPushes(ctx, to))) return null;
  if (await notedSince(ctx, from, cardId, now - TAP_NOTE_WINDOW_MS)) return null;
  const devices = await ctx.data.pushState.listDevices(to);
  if (!devices.length) return { sent: 0, pruned: 0 };
  const key = tapCollapseKey(cardId);
  const data: Record<string, string> = {
    type: TAP_BELL,
    cardId,
    route: `/card/${encodeURIComponent(cardId)}`,
    // Only with a row behind it: an empty id made older Android builds mark notifications/ itself read.
    ...(notificationId ? { notificationId } : {}),
  };
  const groups: PushGroup[] = [];
  for (const [locale, targets] of groupByLocale(devices)) {
    groups.push({
      targets,
      message: {
        title: tapText(locale, handle || 'Resonance', others),
        data,
        channel: ANDROID_CHANNEL,
        ...(key ? { tag: key, collapseId: key } : {}),
        threadId: TAP_BELL,
      },
    });
  }
  return sendAndForget(ctx, groups);
}

/** Take a purged reader out of every row naming them (one transaction each, deleting a row left empty). */
export async function purgeTapRowsIn(ctx: ServerCtx, uid: string): Promise<number> {
  const ids = await ctx.data.bell.listRowIdsNaming(uid);
  const rung = new Set<string>();
  for (const id of ids) {
    const to = await ctx.uow.run(
      async (tx) => {
        const row = await tx.bell.getRow(id);
        if (!row) return null;
        removeReader(tx.bell, row, uid);
        return row.userId;
      },
      { label: 'purge tap rows' },
    );
    if (to && to !== uid) rung.add(to);
  }
  // After the commits: each author's bell, which lost a reader (or the row).
  for (const to of rung) await signal(ctx, bellChanged(to));
  return ids.length;
}
