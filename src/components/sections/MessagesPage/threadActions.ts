'use client';

import { createContext, useContext, type KeyboardEvent, type MouseEvent } from 'react';
import type { OrganicMenuItem } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { canReply, canUnsend, type ChatMessage } from '@/lib/chat/message';
import type { ReactionId } from '@/lib/design/reactions';
import type { Carried } from '@/lib/chat/carried';
import type { RunPosition } from '@/lib/chat/rows';
import type { MessageLink } from './MessageBubble';

/** A message pressed and held: what the long-press menu lifts out of the thread, and where it was. */
export interface PressedMessage {
  message: ChatMessage;
  position: RunPosition;
  carried: Carried;
  /** The message (its quote and bubble) on the screen as it was pressed. */
  rect: DOMRect;
  /** The link its menu offers: the one under the finger, else the message's own (its preview's, or its first). */
  link: MessageLink | null;
  /** What opened it from the keyboard or a pointer (the hover ☺ or ⋯, a reaction chip): the focus goes back there. */
  opener?: HTMLElement | null;
  /** Opened from the keyboard (Enter or Space on the ☺ / ⋯ / chip): the focus shows on its first reaction. */
  byKeyboard?: boolean;
}

/**
 * What every message of an open thread can ask of it — the same functions
 * for as long as the conversation is open, so the rows (memoized) needn't
 * draw again when anything else in the thread changes.
 */
export interface ThreadActions {
  viewerId: string;
  otherHandle: string;
  /** The thread has a composer (not a letter waiting for its answer, nor "not connected"): Reply is offered. */
  canWrite: boolean;
  /** The two are connected (a letter not yet answered takes no reactions) and no block stands: reactions are offered. */
  canReact: boolean;
  /**
   * Follows a link by the thread's rules: a card of ours opens here; an
   * address easy to mistake for another (an IP, a punycode name) asks first;
   * anything else opens in a new tab. With the click's (or Enter's) event,
   * the browser's own following is stopped only when the thread takes over.
   */
  openLink(link: MessageLink, e?: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>): void;
  reply(message: ChatMessage): void;
  /** Goes to a quote's original, reading older pages for it first when it isn't held. */
  jumpTo(messageId: string): void;
  retry(key: string): void;
  discard(key: string): void;
  copy(text: string): void;
  /** A message was pressed and held (a touch screen), or its ☺ / ⋯ / chip chosen: it is lifted out with its menu. */
  press(pressed: PressedMessage): void;
  /** Answers a message with a reaction, or (null) takes the viewer's back: shown at once, put back with a word if it fails. */
  react(message: ChatMessage, reaction: ReactionId | null): void;
  /** Asks to unsend one of the viewer's own messages (a confirm first). */
  unsend(message: ChatMessage): void;
  /** Reports one of their messages: the report dialog, for that message. */
  report(message: ChatMessage): void;
}

export const ThreadActionsContext = createContext<ThreadActions | null>(null);

export function useThreadActions(): ThreadActions {
  const actions = useContext(ThreadActionsContext);
  if (!actions) throw new Error('A message is drawn outside of its thread.');
  return actions;
}

/** The words a message's menu rows wear (the page's own strings). */
export interface MenuLabels {
  reply: string;
  copy: string;
  openLink: string;
  copyLink: string;
  unsend: string;
  report: string;
  retry: string;
  discard: string;
}

/** Who is asking, for the rows only some messages offer. */
export interface MenuViewer {
  /** The thread has a composer: Reply is offered. */
  withReply: boolean;
  viewerId: string;
  /** Now, for whether a message is still young enough to unsend. */
  now?: number;
}

/**
 * What a held message's menu offers (round 16 §3), in this order: Reply (a
 * delivered message, while the thread has a composer), Copy (one with words),
 * the link's Open and Copy (the one under the finger, or the message's own),
 * Unsend (the viewer's own plain message, delivered, within 24 hours — plain
 * colour, it asks first), Report this message (theirs, delivered), and for
 * one that didn't go, Retry and Delete. An unsent message has no menu.
 */
export function messageMenuItems(message: ChatMessage, link: MessageLink | null, labels: MenuLabels, viewer: MenuViewer): OrganicMenuItem[] {
  if (message.unsentAt) return [];
  const items: OrganicMenuItem[] = [];
  if (viewer.withReply && canReply(message)) items.push({ key: 'reply', icon: 'reply', label: labels.reply });
  if (message.text) items.push({ key: 'copy', icon: 'copy', label: labels.copy });
  if (link) {
    items.push({ key: 'open', icon: 'link', label: labels.openLink });
    items.push({ key: 'copyLink', icon: 'copy', label: labels.copyLink });
  }
  if (canUnsend(message, viewer.viewerId, viewer.now)) items.push({ key: 'unsend', icon: 'restore', label: labels.unsend });
  if (message.senderId !== viewer.viewerId && message.delivery === 'delivered') items.push({ key: 'report', icon: 'flag', label: labels.report });
  if (message.delivery === 'failed') {
    items.push({ key: 'retry', icon: 'send', label: labels.retry });
    items.push({ key: 'discard', icon: 'trash', label: labels.discard, danger: true });
  }
  return items;
}

/** Does what a message's menu row `key` says. */
export function chooseMenuItem(key: string, message: ChatMessage, link: MessageLink | null, actions: ThreadActions): void {
  if (key === 'reply') actions.reply(message);
  else if (key === 'copy') actions.copy(message.text);
  else if (key === 'open' && link) actions.openLink(link);
  else if (key === 'copyLink' && link) actions.copy(link.url);
  else if (key === 'unsend') actions.unsend(message);
  else if (key === 'report') actions.report(message);
  else if (key === 'retry') actions.retry(message.key);
  else if (key === 'discard') actions.discard(message.key);
}
