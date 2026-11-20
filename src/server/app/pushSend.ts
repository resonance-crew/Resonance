import { NOTE_PREVIEW_CHARS } from '@/lib/api/v1/conversations';
import type { ServerCtx } from '@/server/ctx';
import { groupByLocale } from '@/server/domain/push/devices';
import { ANDROID_CHANNEL, OPENS_THREAD, TEXT_KEY, cutText, onAnonymousCard, pushRoute, pushText } from '@/server/domain/push/text';
import type { PushMessage } from '@/server/ports/push';
import type { PushDevice } from '@/server/ports/repos/pushState';
import { wantsMessagePushes } from './pushSettings';
import { noteRidesTap } from './pushTapCollapse';

export interface PushResult {
  sent: number;
  /** Device records removed because the push service no longer knows their token. */
  pruned: number;
}

/** One message to some installs (one per language, say), sent beside the others by sendGroups. */
export interface PushGroup {
  targets: PushDevice[];
  message: PushMessage;
}

/**
 * Several messages sent side by side rather than one after another: what
 * the service took and the installs it gave up on, over all of them. A group
 * that fails doesn't stop the others; once all are in, its failure is thrown
 * (the first), as its own send would be.
 */
export async function sendGroups(ctx: ServerCtx, groups: PushGroup[]): Promise<{ sent: number; dead: string[] }> {
  const results = await Promise.allSettled(
    groups.map(async (g) => {
      const out = await ctx.push.send(
        g.targets.map((t) => t.token),
        g.message,
      );
      const gone = new Set(out.dead);
      return { sent: out.sent, dead: g.targets.filter((t) => gone.has(t.token)).map((t) => t.id) };
    }),
  );
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
  let sent = 0;
  const dead: string[] = [];
  for (const r of results as PromiseFulfilledResult<{ sent: number; dead: string[] }>[]) {
    sent += r.value.sent;
    dead.push(...r.value.dead);
  }
  return { sent, dead };
}

/** Send the groups, then forget the installs whose token the service has given up on. */
export async function sendAndForget(ctx: ServerCtx, groups: PushGroup[]): Promise<PushResult> {
  const { sent, dead } = await sendGroups(ctx, groups);
  await ctx.data.pushState.deleteDevices(dead);
  return { sent, pruned: dead.length };
}

type Payload = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Push `notifications/{id}` to its recipient's devices, once. The bell row is
 * the record; this only rings the phone — so it never throws into a writer
 * (callers run it after their response) and a failure just means no buzz.
 *
 * Claimed with `pushedAt` in a transaction before anything is sent, so two
 * callers (a retry racing the writer's own ring) never push twice. A block
 * standing between the two people at send time silences it, as the writers
 * already refuse the notification itself across one.
 */
export async function pushNotificationIn(ctx: ServerCtx, id: string): Promise<PushResult | null> {
  const claimed = await ctx.uow.run(
    async (tx) => {
      const row = await tx.bell.getRow(id);
      if (!row || row.pushed || row.read) return null;
      tx.bell.markPushed(id);
      return row;
    },
    { label: 'push claim' },
  );
  if (!claimed) return null;

  const to = str(claimed.userId);
  const type = str(claimed.type);
  let payload: Payload = claimed.payload;
  const from = str(payload.fromUserId);
  if (!to || !TEXT_KEY[type]) return null;
  const state = ctx.data.pushState;
  // A note's bell (one on an anonymous card: a named card's rings as a message) follows Settings → 通知 → 私訊與小紙條.
  if (type === 'note' && !(await wantsMessagePushes(ctx, to))) return null;
  // Read beside the blocks and the sender: only read early, never sent to before the blocks are asked.
  const devicesRead = state.listDevices(to);
  devicesRead.catch(() => {});
  if (from) {
    const noteId = type === 'note' ? str(payload.noteId) : '';
    const [out, inn, sender, note] = await Promise.all([
      state.isBlocked(to, from),
      state.isBlocked(from, to),
      state.getProfile(from),
      noteId ? state.getNote(noteId) : null,
    ]);
    if (out || inn) return null;
    // What a push says is read from the records, never from the row: the
    // sender's pen name as it is now, and a note's words only when the note
    // really went from them to the recipient. A row a client wrote can't put
    // other words, or another name, on someone's lock screen.
    const real = !!note && note.fromUserId === from && note.toUserId === to;
    payload = {
      ...payload,
      fromHandle: sender.handle,
      preview: real ? cutText(note.text, NOTE_PREVIEW_CHARS) : '',
    };
  }

  const devices = await devicesRead;
  if (!devices.length) return { sent: 0, pruned: 0 };

  // One message per language, each device reading the push in the app's own UI language.
  const route = pushRoute(type, payload);
  // The sender's uid beside the route, for a push that opens their thread: the
  // apps open a conversation by uid (a pen name can change before the tap).
  const opensThread = from && OPENS_THREAD.has(type) && !onAnonymousCard(type, payload);
  const data: Record<string, string> = { notificationId: id, type, route, ...(opensThread ? { fromUserId: from } : {}) };
  // A note (on an anonymous card: a named card's rings as a message) its writer left just after their tap on the
  // card rang replaces that tap's line on the lock screen (pushTapCollapse).
  const rides = type === 'note' && from ? await noteRidesTap(ctx, from, str(payload.cardId), ctx.clock.now()) : null;
  const groups: PushGroup[] = [];
  for (const [locale, targets] of groupByLocale(devices)) {
    const text = pushText(locale, type, payload);
    if (!text) continue;
    groups.push({
      targets,
      message: {
        title: text.title,
        ...(text.body !== undefined ? { body: text.body } : {}),
        data,
        channel: ANDROID_CHANNEL,
        tag: rides ?? id,
        ...(rides ? { collapseId: rides } : {}),
        threadId: type,
      },
    });
  }
  return sendAndForget(ctx, groups);
}
