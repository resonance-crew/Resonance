import { pushMessageIn, pushUnsendIn, type MessagePush } from '@/server/app/pushChat';
import { fromPushSender, type PushSender } from '@/server/infra/fcm/push';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';
import type { PushResult } from './send';

export { CHAT_PUSH_CAPABILITY, PUSH_BODY_CHARS, type MessagePush } from '@/server/app/pushChat';

/**
 * A chat message's push. Unlike a bell row's (`pushNotification`, once per
 * row), every message rings: the message is the record, the push only tells
 * the phone. Written for what a conversation needs — a build that draws its
 * own stack of lines, and a lock screen that groups them — and with the same
 * rules as every push here: words from the records and not the request, and
 * silence across a block. The services are src/server/app/pushChat.
 */

/**
 * Push `conversations/{pair}/messages/{id}` to its recipient's devices. Never
 * throws into a writer (it runs after the response) and returns null when
 * nothing may ring: no such message from that sender, a block either way,
 * the recipient muted the connection, or turned message pushes off
 * (`notificationSettings/{uid}.messages`, lib/push/settings).
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
export function pushMessage(db: AdminDb, push: MessagePush, sender: PushSender): Promise<PushResult | null> {
  return pushMessageIn(ctxFor(db, { push: fromPushSender(sender) }), push);
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
export function pushUnsend(db: AdminDb, push: MessagePush, sender: PushSender): Promise<PushResult | null> {
  return pushUnsendIn(ctxFor(db, { push: fromPushSender(sender) }), push);
}
