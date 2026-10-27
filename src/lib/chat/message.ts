import type { Message, MessageReplyQuote } from '@/lib/db/types';
import { REACTION_IDS, type ReactionId } from '@/lib/design/reactions';

/**
 * Where a message of the viewer's own stands: `delivered` is a document the
 * conversation holds; the rest are still on their way (see ./outbox).
 *
 * - `sending`: waiting in the outbox, or being sent.
 * - `sent`: the server took it; the conversation's listener hasn't shown it
 *   yet (drawn as delivered, but it can't be replied to yet).
 * - `failed`: the server refused it, or the network did — it stays in the
 *   thread with a retry until the viewer retries or deletes it.
 */
export type Delivery = 'delivered' | 'sending' | 'sent' | 'failed';

/**
 * One message of a conversation as the thread draws it: a document of
 * `conversations/{pair}/messages`, or one of the viewer's own still on its way
 * (the twin of the apps' ChatMessage).
 *
 * `key` is what a list keeps the row by: the id, except that a message sent
 * from here keeps the key it had while it was sending (its client id), so the
 * row is replaced in place when the document arrives instead of jumping. For
 * a message still on its way, `id` is the client id, which the server makes
 * the document's id.
 */
export interface ChatMessage extends Message {
  key: string;
  delivery: Delivery;
}

/** How much of the answered message a reply carries (the server makes the same cut). */
export const QUOTE_MAX = 140;

/** At most {@link QUOTE_MAX} code points, never splitting a surrogate pair. */
export function cutQuote(text: string): string {
  const points = Array.from(text);
  return points.length <= QUOTE_MAX ? text : points.slice(0, QUOTE_MAX).join('');
}

/** The quote a reply to `message` carries, as the server will snapshot it. */
export function quoteOf(message: Message): MessageReplyQuote {
  if (message.unsentAt) return { id: message.id, senderId: message.senderId, text: '', unsent: true };
  return {
    id: message.id,
    senderId: message.senderId,
    text: cutQuote(message.text),
    ...(message.cardRef ? { cardRef: message.cardRef } : {}),
    ...(message.image ? { image: true } : {}),
  };
}

/** A reply names a document of the conversation, so only a delivered message can be answered (and not one unsent). */
export function canReply(message: ChatMessage): boolean {
  return message.delivery === 'delivered' && !message.unsentAt;
}

/** Its sender unsent it: drawn as a line saying so, with no menu. */
export function isUnsent(message: Message): boolean {
  return !!message.unsentAt;
}

/** How long after sending a message its sender may unsend it (the server's UNSEND_WINDOW_MS). */
export const UNSEND_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the viewer may unsend `message`: their own, delivered, a plain
 * message (a note — a letter left on a card — never is), within
 * {@link UNSEND_WINDOW_MS} of its sending.
 */
export function canUnsend(message: ChatMessage, viewerId: string, now = Date.now()): boolean {
  return (
    message.senderId === viewerId &&
    message.delivery === 'delivered' &&
    !message.unsentAt &&
    message.kind !== 'note' &&
    now - message.sentAt.getTime() <= UNSEND_WINDOW_MS
  );
}

/** A message that can take a reaction: one the conversation holds, not unsent. */
export function canReact(message: ChatMessage): boolean {
  return message.delivery === 'delivered' && !message.unsentAt;
}

/** One reaction on a message, as its chip draws it: the sticker, and who gave it. */
export interface ReactionCount {
  id: ReactionId;
  /** How many gave it (1, or 2 when both did). */
  count: number;
  /** The viewer is among them. */
  mine: boolean;
}

/**
 * A message's reactions as its chips show them: each distinct reaction once,
 * in the tray's order (❤️ 🥹 😂 🤗 👍), with how many gave it and whether the
 * viewer did. None, an empty list.
 */
export function reactionCounts(reactions: Message['reactions'], viewerId: string): ReactionCount[] {
  if (!reactions) return [];
  const entries = Object.entries(reactions);
  return REACTION_IDS.flatMap((id) => {
    const by = entries.filter(([, r]) => r === id).map(([uid]) => uid);
    return by.length ? [{ id, count: by.length, mine: by.includes(viewerId) }] : [];
  });
}

/** What the viewer has done to a message here and the server hasn't shown yet: a reaction picked (or taken back), an unsend. */
export interface LocalChange {
  /** The viewer's reaction as it will be: a sticker, or null for taken back. */
  reaction?: ReactionId | null;
  unsent?: boolean;
}

/**
 * `message` as the viewer's own changes leave it until the server's copy
 * says so too (an older page is never heard again): their reaction in place
 * of the stored one, or the message unsent — nothing of it but who sent it
 * and when.
 */
export function withLocalChange(message: ChatMessage, viewerId: string, change: LocalChange | undefined): ChatMessage {
  if (!change) return message;
  if (change.unsent) {
    return { key: message.key, delivery: message.delivery, id: message.id, senderId: message.senderId, sentAt: message.sentAt, text: '', unsentAt: message.unsentAt ?? new Date() };
  }
  if (change.reaction === undefined || message.unsentAt) return message;
  const reactions = { ...message.reactions };
  if (change.reaction) reactions[viewerId] = change.reaction;
  else delete reactions[viewerId];
  return { ...message, reactions: Object.keys(reactions).length ? reactions : undefined };
}

/** Whether the server's copy of `message` already says what `change` does (the local change can go). */
export function changeShown(message: Message, viewerId: string, change: LocalChange): boolean {
  if (change.unsent) return !!message.unsentAt;
  if (change.reaction === undefined) return true;
  // Unsent meanwhile: nothing of the reaction is left to show.
  if (message.unsentAt) return true;
  return (message.reactions?.[viewerId] ?? null) === change.reaction;
}

/** Still on its way, or failed: the server knows nothing of it (yet). */
export function isPending(message: ChatMessage): boolean {
  return message.delivery !== 'delivered';
}
