import { after } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminMessaging } from '@/lib/db/firestore/admin';
import { unfurlMessage } from '@/lib/links/preview';
import { firstLink } from '@/lib/links/url';
import { pushMessage, type MessagePush } from '@/lib/push/chat';
import type { SentMessage } from './conversations';

/** Ring a message's recipient; logs and gives up on any failure (it runs after the response). */
function ring(db: Firestore, push: MessagePush): Promise<unknown> {
  return getAdminMessaging()
    .then((messaging) => pushMessage(db, push, messaging))
    .catch((e) => console.error('[push]', push.messageId, e));
}

/**
 * After the response to a send: ring the recipient's phone and unfurl the
 * message's link. Two separate jobs, run side by side — a page that takes its
 * five seconds to answer never holds up the buzz, and neither one failing
 * stops the other (each logs and gives up). A message that was only sent
 * again (`duplicate`) has had both already. `text` is what was sent: without
 * a link in it (most messages) there is nothing to unfurl, and the message
 * isn't read again to find that out.
 */
export function afterMessageSent(db: Firestore, sent: SentMessage, text: string) {
  const { push } = sent;
  if (sent.duplicate || !push) return;
  const unfurl = firstLink(text) !== null;
  after(async () => {
    await Promise.all([
      ring(db, push),
      unfurl ? unfurlMessage(db, push.conversationId, push.messageId).catch((e) => console.error('[unfurl]', push.messageId, e)) : null,
    ]);
  });
}

/**
 * After the response to a note that went into the thread (sendNote's `push`):
 * its chat push, the one buzz. A note is words for the card's author, so its
 * links are not unfurled. Nothing for a note on an anonymous card — its bell
 * row rings instead (`ringAfter`).
 */
export function afterNoteSent(db: Firestore, push: MessagePush | null) {
  if (!push) return;
  after(async () => {
    await ring(db, push);
  });
}
