import { NOTE_MESSAGE_KIND, cut, pairOf } from '@/lib/api/v1/conversations';
import { STICKER_RUN_MS, continuesStickerRun, messageAlbumOf, messageStickerOf } from '@/lib/api/v1/messageParts';
import { stickerName, type StickerRef } from '@/lib/stickers/catalog';
import { storageKeyOf } from '@/lib/storage/publicUrl';
import type { ServerCtx } from '@/server/ctx';
import { groupByLocale, type DeviceLocale } from '@/server/domain/push/devices';
import { MESSAGES_CHANNEL, notificationsText, pushRoute } from '@/server/domain/push/text';
import type { PushMessage } from '@/server/ports/push';
import type { PushDevice, PushProfile } from '@/server/ports/repos/pushState';
import { instantMillis, type Instant } from '@/server/ports/time';
import { sendAndForget, type PushGroup, type PushResult } from './pushSend';
import { wantsMessagePushes } from './pushSettings';
import { noteRidesTap } from './pushTapCollapse';

/**
 * A chat message's push, and an unsend's (lib/push/chat tells the story of
 * both: who gets a data-only message, who a notification, when it is quiet).
 */

/** The capability an Android build registers when it draws a conversation's messages itself. */
export const CHAT_PUSH_CAPABILITY = 'chat-push';
/** How much of a message the push carries (code points). */
export const PUSH_BODY_CHARS = 140;

export interface MessagePush {
  conversationId: string;
  messageId: string;
  /** The sender and the recipient (user ids). */
  from: string;
  to: string;
}

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** "Shared a card" / "Sent a photo" in the device's language: what a message with no words says. */
function attachmentLine(locale: DeviceLocale, picture: boolean): string {
  return notificationsText(locale)(picture ? 'messageImage' : 'messageCard');
}

/**
 * "Sent a sticker: Thanks" with the sticker's name in the device's language — never the stored words, which are
 * its fallback in the recipient's profile language. A sticker this server doesn't know keeps those words.
 */
function stickerLine(locale: DeviceLocale, sticker: StickerRef, fallback: string): string {
  const name = stickerName(sticker, locale);
  return name ? notificationsText(locale)('messageSticker', { name }) : fallback || notificationsText(locale)('messageImage');
}

/** "Sent 3 photos" in the device's language: an album's first picture, when it has no words. */
function albumLine(locale: DeviceLocale, count: number): string {
  return notificationsText(locale)('messageAlbum', { count });
}

/** How many of the conversation's messages just before a sticker are looked through for its sender's previous one. */
const STICKER_RUN_LOOKBACK = 10;

/**
 * Whether the sticker `messageId` (sent at `sentAt` by `from`) continues a run of the sender's stickers: their
 * previous message in the conversation was a sticker sent less than STICKER_RUN_MS before. A window busier than
 * STICKER_RUN_LOOKBACK messages, or a read that fails, rings as usual.
 */
async function continuesRun(ctx: ServerCtx, conversationId: string, messageId: string, from: string, sentAt: Instant | null): Promise<boolean> {
  if (sentAt === null) return false;
  try {
    const at = instantMillis(sentAt);
    const window = await ctx.data.pushState.listMessagesBetween(conversationId, { afterMs: at - STICKER_RUN_MS, before: sentAt, limit: STICKER_RUN_LOOKBACK });
    const previous = window.find((d) => d.id !== messageId && d.senderId === from);
    return continuesStickerRun(previous && previous.sentAtMs !== null ? { sticker: previous.sticker, sentAtMs: previous.sentAtMs } : null, at);
  } catch (e) {
    ctx.log.error('[push] sticker run', messageId, e);
    return false;
  }
}

/**
 * The sender's avatar as the app draws it, for whatever draws the
 * notification under their face — an Android build that draws its own, and
 * iOS's notification service extension, which redraws the system's push
 * (`mutable`): their photo when it is a picture on our own storage, else
 * their initials on their colour. Only what the profile has.
 */
function faceOf(author: PushProfile): Record<string, string> {
  const photo = author.avatarUrl;
  const initials = author.initials.trim();
  const color = author.accentColor.trim();
  return {
    ...(storageKeyOf(photo) ? { fromAvatarUrl: photo } : {}),
    ...(initials && [...initials].length <= 4 ? { fromInitials: initials } : {}),
    ...(/^oklch\([\d.%\s/]{1,60}\)$/.test(color) ? { fromColor: color } : {}),
  };
}

const sentMillis = (ctx: ServerCtx, at: Instant | null) => (at === null ? ctx.clock.now() : instantMillis(at));

/** Only Android builds draw their own notification; a build on another platform that names the capability still gets a push the system shows. */
const draws = (t: PushDevice) => t.platform === 'android' && t.capabilities.includes(CHAT_PUSH_CAPABILITY);

/** APNs takes a collapse id of at most 64 bytes; a message's id (ASCII, a clientId ≤ 64) fits, anything longer goes without. */
const collapsing = (messageId: string): { collapseId?: string } => (messageId.length <= 64 ? { collapseId: messageId } : {});

/** Push `conversations/{pair}/messages/{id}` to its recipient's devices (lib/push/chat `pushMessage`). */
export async function pushMessageIn(ctx: ServerCtx, push: MessagePush): Promise<PushResult | null> {
  const { conversationId, messageId, from, to } = push;
  if (![conversationId, messageId, from, to].every((v) => DOC_ID.test(v)) || from === to || conversationId !== pairOf(from, to)) return null;
  const state = ctx.data.pushState;

  const [message, blockedByRecipient, blockedBySender, connection, author, devices, wanted] = await Promise.all([
    state.getChatMessage(conversationId, messageId),
    state.isBlocked(to, from),
    state.isBlocked(from, to),
    state.getConnection(conversationId),
    state.getProfile(from),
    state.listDevices(to),
    wantsMessagePushes(ctx, to),
  ]);
  if (!message || message.senderId !== from) return null;
  // Settings → 通知 → 私訊與小紙條 turned off: the thread and its unread count say it, the phone doesn't.
  if (!wanted) return null;
  // Unsent before its push went out: nothing to say (pushUnsend tells the phone instead).
  if (message.unsent) return null;
  // An album rings once, for its first picture.
  const album = messageAlbumOf(message.album);
  if (album && album.index !== 0) return null;
  if (blockedByRecipient || blockedBySender) return null;
  if (connection.mutedBy.includes(to)) return null;
  if (!devices.length) return { sent: 0, pruned: 0 };

  const sticker = messageStickerOf(message.sticker);
  // A run of stickers buzzes once: the ones after the first ring without a sound.
  const quiet = sticker ? await continuesRun(ctx, conversationId, messageId, from, message.sentAt) : false;

  const handle = author.handle;
  const title = handle || 'Resonance';
  const words = cut(message.text.trim(), PUSH_BODY_CHARS);
  const route = pushRoute('message', { fromHandle: handle });
  const sentAt = String(sentMillis(ctx, message.sentAt));
  const kind: Record<string, string> =
    message.kind === NOTE_MESSAGE_KIND ? { kind: NOTE_MESSAGE_KIND } : sticker ? { kind: 'sticker', stickerPack: sticker.pack, stickerId: sticker.id } : {};
  const picture = message.hasImage;
  const face = faceOf(author);
  // A note left just after its writer's tap on that card rang: it takes the tap's line on the lock screen
  // (pushTapCollapse) — the same Android tag and APNs collapse id, in place of the conversation's.
  const rides = message.kind === NOTE_MESSAGE_KIND && message.cardRef ? await noteRidesTap(ctx, from, message.cardRef, sentMillis(ctx, message.sentAt)) : null;

  // Every language's and kind's message side by side (sendGroups).
  const groups: PushGroup[] = [];
  const queue = (targets: PushDevice[], message: PushMessage) => void groups.push({ targets, message });

  for (const [locale, targets] of groupByLocale(devices)) {
    const body = sticker ? stickerLine(locale, sticker, words) : words || (album ? albumLine(locale, album.count) : attachmentLine(locale, picture));
    // A quiet sticker reaches no build that draws its own notification: it would sound like any message there.
    const own = quiet ? [] : targets.filter(draws);
    const system = targets.filter((t) => !draws(t));

    if (own.length) {
      queue(own, {
        // `toUserId`: the app draws it only while that account is the one signed in.
        data: { type: 'message', conversationId, messageId, fromUserId: from, toUserId: to, fromHandle: handle, title, body, route, sentAt, ...kind, ...face },
        priority: 'high',
      });
    }
    if (system.length) {
      // No `notificationId`: no bell row stands behind a message (an empty one crashed older Android builds).
      // (A sticker's kind travels only to the builds that draw their own: `kind` here has meant a note.)
      // The sender's face rides along and iOS may redraw the push under it (`mutable`); a build that can't ignores both.
      const data = { type: 'message', route, fromUserId: from, conversationId, messageId, ...(sticker ? {} : kind), ...face };
      queue(
        system,
        quiet
          ? // A sticker continuing a run: shown, replacing the conversation's notification, without a sound.
            { title, body, data, priority: 'normal', channel: MESSAGES_CHANNEL, tag: conversationId, display: 'low', silent: true, ...collapsing(messageId), threadId: conversationId, interruptionLevel: 'passive', mutable: true }
          : // The message's own collapse id: never merging two messages, but what an unsend replaces (pushUnsend).
            // A note riding a tap takes the tap's (a note is never unsent).
            { title, body, data, priority: 'high', channel: MESSAGES_CHANNEL, tag: rides ?? conversationId, ...(rides ? { collapseId: rides } : collapsing(messageId)), threadId: conversationId, mutable: true },
      );
    }
  }
  return sendAndForget(ctx, groups);
}

/** Tell the recipient's phone that `push.messageId` was unsent (lib/push/chat `pushUnsend`). */
export async function pushUnsendIn(ctx: ServerCtx, push: MessagePush): Promise<PushResult | null> {
  const { conversationId, messageId, from, to } = push;
  if (![conversationId, messageId, from, to].every((v) => DOC_ID.test(v)) || from === to || conversationId !== pairOf(from, to)) return null;
  const state = ctx.data.pushState;

  const [message, last, blockedByRecipient, blockedBySender, connection, author, devices, wanted] = await Promise.all([
    state.getChatMessage(conversationId, messageId),
    state.getConversationLast(conversationId),
    state.isBlocked(to, from),
    state.isBlocked(from, to),
    state.getConnection(conversationId),
    state.getProfile(from),
    state.listDevices(to),
    wantsMessagePushes(ctx, to),
  ]);
  if (!message || message.senderId !== from || !message.unsent) return null;
  // Message pushes turned off: no notification of it is showing to take back.
  if (!wanted) return null;
  if (blockedByRecipient || blockedBySender) return null;
  if (connection.mutedBy.includes(to)) return null;
  if (!devices.length) return { sent: 0, pruned: 0 };

  // Still the newest: the conversation's preview is this message, unsent (the same sender, the same time).
  const newest = !!last && last.unsent && last.senderId === from && message.sentAt !== null && last.sentAt !== null && message.sentAt === last.sentAt;

  const handle = author.handle;
  const title = handle || 'Resonance';
  const route = pushRoute('message', { fromHandle: handle });

  const groups: PushGroup[] = [];
  for (const [locale, targets] of groupByLocale(devices)) {
    const own = targets.filter(draws);
    const system = targets.filter((t) => !draws(t));
    if (own.length) {
      groups.push({ targets: own, message: { data: { type: 'unsend', conversationId, messageId, fromUserId: from, toUserId: to }, priority: 'high' } });
    }
    if (system.length && newest) {
      groups.push({
        targets: system,
        message: {
          title,
          body: notificationsText(locale)('messageUnsent', { handle: title }),
          // `type: 'message'`: a tap opens the thread, and an app showing that thread keeps it off screen, as for any message.
          // Under the sender's face too, as the message it replaces was.
          data: { type: 'message', route, fromUserId: from, toUserId: to, conversationId, messageId, ...faceOf(author) },
          priority: 'normal',
          channel: MESSAGES_CHANNEL,
          tag: conversationId,
          display: 'min',
          silent: true,
          ...collapsing(messageId),
          applePriority: 5,
          threadId: conversationId,
          interruptionLevel: 'passive',
          mutable: true,
        },
      });
    }
  }
  return sendAndForget(ctx, groups);
}
