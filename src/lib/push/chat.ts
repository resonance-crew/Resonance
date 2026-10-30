import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { MulticastMessage } from 'firebase-admin/messaging';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { NOTE_MESSAGE_KIND, cut, pairOf } from '@/lib/api/v1/conversations';
import { STICKER_RUN_MS, continuesStickerRun, messageAlbumOf, messageStickerOf } from '@/lib/api/v1/messageParts';
import { stickerName, type StickerRef } from '@/lib/stickers/catalog';
import { storageKeyOf } from '@/lib/storage/publicUrl';
import type { DeviceLocale } from './devices';
import {
  MESSAGES_CHANNEL,
  deviceTargets,
  forgetDevices,
  groupByLocale,
  multicastAll,
  pushRoute,
  type MulticastGroup,
  type DeviceTarget,
  type PushResult,
  type PushSender,
} from './send';

/**
 * A chat message's push. Unlike a bell row's (`pushNotification`, once per
 * row), every message rings: the message is the record, the push only tells
 * the phone. Written for what a conversation needs — a build that draws its
 * own stack of lines, and a lock screen that groups them — and with the same
 * rules as every push here: words from the records and not the request, and
 * silence across a block.
 */

/** The capability an Android build registers when it draws a conversation's messages itself. */
export const CHAT_PUSH_CAPABILITY = 'chat-push';
/** How much of a message the push carries (code points). */
export const PUSH_BODY_CHARS = 140;

const MESSAGES = { en, 'zh-TW': zhTW } as const satisfies Record<DeviceLocale, unknown>;

export interface MessagePush {
  conversationId: string;
  messageId: string;
  /** The sender and the recipient (user ids). */
  from: string;
  to: string;
}

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

const notifications = (locale: DeviceLocale) => createTranslator({ locale, messages: MESSAGES[locale], namespace: 'app.notifications' });

/** "Shared a card" / "Sent a photo" in the device's language: what a message with no words says. */
function attachmentLine(locale: DeviceLocale, picture: boolean): string {
  return notifications(locale)(picture ? 'messageImage' : 'messageCard');
}

/**
 * "Sent a sticker: Thanks" with the sticker's name in the device's language — never the stored words, which are
 * its fallback in the recipient's profile language. A sticker this server doesn't know keeps those words.
 */
function stickerLine(locale: DeviceLocale, sticker: StickerRef, fallback: string): string {
  const name = stickerName(sticker, locale);
  return name ? notifications(locale)('messageSticker', { name }) : fallback || notifications(locale)('messageImage');
}

/** "Sent 3 photos" in the device's language: an album's first picture, when it has no words. */
function albumLine(locale: DeviceLocale, count: number): string {
  return notifications(locale)('messageAlbum', { count });
}

/** How many of the conversation's messages just before a sticker are looked through for its sender's previous one. */
const STICKER_RUN_LOOKBACK = 10;

/**
 * Whether the sticker `messageId` (sent at `sentAt` by `from`) continues a run of the sender's stickers: their
 * previous message in the conversation was a sticker sent less than STICKER_RUN_MS before. One query of the few
 * messages in that window (the sentAt index every conversation has; no composite index), only ever asked for a
 * sticker. A window busier than STICKER_RUN_LOOKBACK messages, or a read that fails, rings as usual.
 */
async function continuesRun(db: Firestore, conversationId: string, messageId: string, from: string, sentAt: unknown): Promise<boolean> {
  if (!(sentAt instanceof Timestamp)) return false;
  try {
    const window = await db
      .collection(`conversations/${conversationId}/messages`)
      .where('sentAt', '<', sentAt)
      .where('sentAt', '>', Timestamp.fromMillis(sentAt.toMillis() - STICKER_RUN_MS))
      .orderBy('sentAt', 'desc')
      .limit(STICKER_RUN_LOOKBACK)
      .get();
    const previous = window.docs.find((d) => d.id !== messageId && d.get('senderId') === from);
    const at = previous?.get('sentAt');
    return continuesStickerRun(previous && at instanceof Timestamp ? { sticker: previous.get('sticker'), sentAtMs: at.toMillis() } : null, sentAt.toMillis());
  } catch (e) {
    console.error('[push] sticker run', messageId, e);
    return false;
  }
}

/** Whether `muted` (connections/{pair}.muted: `{ by }[]`) holds the recipient. */
function mutedBy(muted: unknown, uid: string): boolean {
  return Array.isArray(muted) && muted.some((m) => m && typeof m === 'object' && (m as { by?: unknown }).by === uid);
}

/**
 * The sender's avatar as the app draws it, for a build that draws its own
 * notification (the shade would otherwise show the system's letter): their
 * photo when it is a picture on our own storage (anything else is left out —
 * the phone fetches it), else their initials on their colour. Only what the
 * profile has; none of it is needed.
 */
function faceOf(author: { get(field: string): unknown }): Record<string, string> {
  const photo = str(author.get('avatarUrl'));
  const initials = str(author.get('initials')).trim();
  const color = str(author.get('accentColor')).trim();
  return {
    ...(storageKeyOf(photo) ? { fromAvatarUrl: photo } : {}),
    ...(initials && [...initials].length <= 4 ? { fromInitials: initials } : {}),
    ...(/^oklch\([\d.%\s/]{1,60}\)$/.test(color) ? { fromColor: color } : {}),
  };
}

function epochMillis(value: unknown): number {
  const at = value as { toMillis?: () => number } | undefined;
  return typeof at?.toMillis === 'function' ? at.toMillis() : Date.now();
}

/**
 * Push `conversations/{pair}/messages/{id}` to its recipient's devices. Never
 * throws into a writer (it runs after the response) and returns null when
 * nothing may ring: no such message from that sender, a block either way, or
 * the recipient muted the connection.
 *
 * - A device registered with `chat-push` (Android) gets a data-only,
 *   high-priority message with everything its notification needs
 *   (`conversationId, messageId, fromUserId, fromHandle, title, body, route,
 *   sentAt`), already in its language, and the sender's avatar as far as
 *   their profile has one (`fromAvatarUrl`, `fromInitials`, `fromColor`).
 * - Every other device gets a notification message — the sender's pen name
 *   and the words — that the system shows on its own: Android replaces a
 *   conversation's earlier one (`tag`), iOS groups them (`threadId`).
 * - The title is the sender's pen name as it is now; the body is the
 *   message's text (140 code points), or "Shared a card" when it has none.
 * - A note carried into the thread (sendNote) rings here too, like any
 *   message, its data marked `kind: 'note'` (only a kind the server knows;
 *   apps ignore one they don't).
 * - A sticker (round 22) says "Sent a sticker: {name}", the name in each
 *   device's language (its stored words are a fallback in the recipient's
 *   profile language, never the body); the data-only kind also gets `kind:
 *   'sticker'`, `stickerPack` and `stickerId`. A sticker that continues a run
 *   — the sender's previous message in the conversation was a sticker sent
 *   less than STICKER_RUN_MS before — rings quietly: no sound (iOS
 *   `interruption-level: passive`, Android notification priority low, no
 *   default sound) for a notification the system shows, and nothing at all
 *   for a build that draws its own (its notification keeps the run's first
 *   line; data can't be made silent for builds already installed).
 * - An album's pictures ring once, for the first (`index` 0): its words, or
 *   "Sent {count} photos". The others ring nothing (null). Should the first
 *   never arrive, the album rings nothing.
 */
export async function pushMessage(db: Firestore, push: MessagePush, sender: PushSender): Promise<PushResult | null> {
  const { conversationId, messageId, from, to } = push;
  if (![conversationId, messageId, from, to].every((v) => DOC_ID.test(v)) || from === to || conversationId !== pairOf(from, to)) return null;

  const [message, blockedByRecipient, blockedBySender, connection, author, devices] = await Promise.all([
    db.doc(`conversations/${conversationId}/messages/${messageId}`).get(),
    db.doc(`users/${to}/blocks/${from}`).get(),
    db.doc(`users/${from}/blocks/${to}`).get(),
    db.doc(`connections/${conversationId}`).get(),
    db.doc(`users/${from}`).get(),
    db.collection('devices').where('userId', '==', to).get(),
  ]);
  if (!message.exists || message.get('senderId') !== from) return null;
  // Unsent before its push went out: nothing to say (pushUnsend tells the phone instead).
  if (message.get('unsentAt') != null) return null;
  // An album rings once, for its first picture.
  const album = messageAlbumOf(message.get('album'));
  if (album && album.index !== 0) return null;
  if (blockedByRecipient.exists || blockedBySender.exists) return null;
  if (mutedBy(connection.get('muted'), to)) return null;
  if (devices.empty) return { sent: 0, pruned: 0 };

  const sticker = messageStickerOf(message.get('sticker'));
  // A run of stickers buzzes once: the ones after the first ring without a sound.
  const quiet = sticker ? await continuesRun(db, conversationId, messageId, from, message.get('sentAt')) : false;

  const handle = str(author.get('handle'));
  const title = handle || 'Resonance';
  const words = cut(str(message.get('text')).trim(), PUSH_BODY_CHARS);
  const route = pushRoute('message', { fromHandle: handle });
  const sentAt = String(epochMillis(message.get('sentAt')));
  const kind: Record<string, string> =
    message.get('kind') === NOTE_MESSAGE_KIND
      ? { kind: NOTE_MESSAGE_KIND }
      : sticker
        ? { kind: 'sticker', stickerPack: sticker.pack, stickerId: sticker.id }
        : {};
  const picture = message.get('image') != null;
  const face = faceOf(author);

  // Every language's and kind's multicast side by side (multicastAll).
  const groups: MulticastGroup[] = [];
  const queue = (targets: DeviceTarget[], build: (tokens: string[]) => MulticastMessage) => void groups.push({ targets, build });

  for (const [locale, targets] of groupByLocale(deviceTargets(devices.docs))) {
    const body = sticker
      ? stickerLine(locale, sticker, words)
      : words || (album ? albumLine(locale, album.count) : attachmentLine(locale, picture));
    // Only Android builds draw their own notification; a build on another platform that names the capability still gets a push the system shows.
    const draws = (t: DeviceTarget) => t.platform === 'android' && t.capabilities.includes(CHAT_PUSH_CAPABILITY);
    // A quiet sticker reaches no build that draws its own notification: it would sound like any message there.
    const own = quiet ? [] : targets.filter(draws);
    const system = targets.filter((t) => !draws(t));

    if (own.length) {
      queue(own, (tokens) => ({
        tokens,
        // `toUserId`: the app draws it only while that account is the one signed in (a sign-out whose unregister never
        // reached us leaves the install registered to them for a while).
        data: { type: 'message', conversationId, messageId, fromUserId: from, toUserId: to, fromHandle: handle, title, body, route, sentAt, ...kind, ...face },
        android: { priority: 'high' },
      }));
    }
    if (system.length) {
      queue(system, (tokens) => ({
        tokens,
        notification: { title, body },
        // No `notificationId`: no bell row stands behind a message, and an empty one made older Android builds
        // mark `notifications/` itself read on the tap (an invalid path, a crash). They open the route without it.
        // (A sticker's kind travels only to the builds that draw their own: `kind` here has meant a note.)
        data: { type: 'message', route, fromUserId: from, conversationId, messageId, ...(sticker ? {} : kind) },
        ...(quiet
          ? {
              // A sticker continuing a run: shown, replacing the conversation's notification, without a sound.
              android: { priority: 'normal' as const, notification: { channelId: MESSAGES_CHANNEL, tag: conversationId, priority: 'low' as const, defaultSound: false } },
              apns: { ...collapsing(messageId), payload: { aps: { threadId: conversationId, 'interruption-level': 'passive' } } },
            }
          : {
              android: { priority: 'high' as const, notification: { channelId: MESSAGES_CHANNEL, tag: conversationId } },
              // The message's own collapse id: never merging two messages, but what an unsend replaces (pushUnsend).
              apns: { ...collapsing(messageId), payload: { aps: { sound: 'default', threadId: conversationId } } },
            }),
      }));
    }
  }
  const { sent, dead } = await multicastAll(sender, groups);
  await forgetDevices(db, dead);
  return { sent, pruned: dead.length };
}

/** APNs takes a collapse id of at most 64 bytes; a message's id (ASCII, a clientId ≤ 64) fits, anything longer goes without. */
function collapsing(messageId: string): { headers?: Record<string, string> } {
  return messageId.length <= 64 ? { headers: { 'apns-collapse-id': messageId } } : {};
}

/**
 * Tell the recipient's phone that `push.messageId` was unsent (after the
 * response to POST …/unsend), so its notification stops showing what it said.
 * Never throws into a writer; null when nothing may be said — no such message
 * from that sender, not unsent, a block either way, the recipient muted the
 * connection.
 *
 * - A device registered with `chat-push` (Android, which draws the
 *   conversation's notification itself) gets a data-only message `type:
 *   'unsend'` with `conversationId`, `messageId` and `toUserId`: it redraws
 *   the notification without that line, or takes it away when none is left.
 * - Every other device, only while the unsent message is still the
 *   conversation's newest (its preview says so): a quiet replacement of the
 *   conversation's notification — the same Android `tag` and iOS `threadId`
 *   as the chat push, and on iOS the message's own collapse id — saying
 *   "{handle} unsent a message" in the device's language. No sound; on iOS
 *   `passive`, so it never lights the screen. Older than the newest, the
 *   notification on screen is a later message's and is left as it is.
 */
export async function pushUnsend(db: Firestore, push: MessagePush, sender: PushSender): Promise<PushResult | null> {
  const { conversationId, messageId, from, to } = push;
  if (![conversationId, messageId, from, to].every((v) => DOC_ID.test(v)) || from === to || conversationId !== pairOf(from, to)) return null;

  const [message, convo, blockedByRecipient, blockedBySender, connection, author, devices] = await Promise.all([
    db.doc(`conversations/${conversationId}/messages/${messageId}`).get(),
    db.doc(`conversations/${conversationId}`).get(),
    db.doc(`users/${to}/blocks/${from}`).get(),
    db.doc(`users/${from}/blocks/${to}`).get(),
    db.doc(`connections/${conversationId}`).get(),
    db.doc(`users/${from}`).get(),
    db.collection('devices').where('userId', '==', to).get(),
  ]);
  if (!message.exists || message.get('senderId') !== from || message.get('unsentAt') == null) return null;
  if (blockedByRecipient.exists || blockedBySender.exists) return null;
  if (mutedBy(connection.get('muted'), to)) return null;
  if (devices.empty) return { sent: 0, pruned: 0 };

  // Still the newest: the conversation's preview is this message, unsent (the same sender, the same time).
  const last = convo.get('lastMessage') as { senderId?: unknown; sentAt?: unknown; unsent?: unknown } | null | undefined;
  const sentAt = message.get('sentAt') as { isEqual?: (other: unknown) => boolean } | undefined;
  const newest =
    !!last && last.unsent === true && last.senderId === from && typeof sentAt?.isEqual === 'function' && last.sentAt != null && sentAt.isEqual(last.sentAt);

  const handle = str(author.get('handle'));
  const title = handle || 'Resonance';
  const route = pushRoute('message', { fromHandle: handle });

  const groups: MulticastGroup[] = [];
  const queue = (targets: DeviceTarget[], build: (tokens: string[]) => MulticastMessage) => void groups.push({ targets, build });
  for (const [locale, targets] of groupByLocale(deviceTargets(devices.docs))) {
    const draws = (t: DeviceTarget) => t.platform === 'android' && t.capabilities.includes(CHAT_PUSH_CAPABILITY);
    const own = targets.filter(draws);
    const system = targets.filter((t) => !draws(t));
    if (own.length) {
      queue(own, (tokens) => ({
        tokens,
        data: { type: 'unsend', conversationId, messageId, fromUserId: from, toUserId: to },
        android: { priority: 'high' },
      }));
    }
    if (system.length && newest) {
      const body = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'app.notifications' })('messageUnsent', { handle: title });
      queue(system, (tokens) => ({
        tokens,
        notification: { title, body },
        // `type: 'message'`: a tap opens the thread, and an app showing that thread keeps it off screen, as for any message.
        data: { type: 'message', route, fromUserId: from, toUserId: to, conversationId, messageId },
        android: { priority: 'normal', notification: { channelId: MESSAGES_CHANNEL, tag: conversationId, priority: 'min', defaultSound: false } },
        apns: {
          headers: { ...collapsing(messageId).headers, 'apns-priority': '5' },
          payload: { aps: { threadId: conversationId, 'interruption-level': 'passive' } },
        },
      }));
    }
  }
  const { sent, dead } = await multicastAll(sender, groups);
  await forgetDevices(db, dead);
  return { sent, pruned: dead.length };
}
