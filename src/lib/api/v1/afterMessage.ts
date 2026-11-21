import { nextAfter } from '@/server/infra/next/after';
import type { AdminDb } from '@/server/infra/firestore/db';
import type { AfterResponse } from '@/server/ports/after';
import { getAdminMessaging } from '@/lib/db/firestore/admin';
import { unfurlMessage } from '@/lib/links/preview';
import { firstLink } from '@/lib/links/url';
import { pushMessage, pushUnsend, type MessagePush } from '@/lib/push/chat';
import type { SentMessage } from './conversations';

type Firestore = AdminDb;

/**
 * Where the work after the response goes: ctx.later (src/server/ports/after),
 * Next's `after()` unless a caller hands its own.
 */
const later = (work: () => Promise<void>, label: string, queue: AfterResponse) => queue.later(work, label);

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
 * isn't read again to find that out (a sticker's is empty: its stored words
 * are its fallback, never unfurled). An album's later pictures (`silent`)
 * ring nothing — the first rang for them all.
 */
export function afterMessageSent(db: Firestore, sent: SentMessage, text: string, queue: AfterResponse = nextAfter()) {
  const { push } = sent;
  if (sent.duplicate || !push) return;
  const unfurl = firstLink(text) !== null;
  if (sent.silent && !unfurl) return;
  later(
    async () => {
      await Promise.all([
        sent.silent ? null : ring(db, push),
        unfurl ? unfurlMessage(db, push.conversationId, push.messageId).catch((e) => console.error('[unfurl]', push.messageId, e)) : null,
      ]);
    },
    'afterMessage',
    queue,
  );
}

/**
 * After the response to a note that went into the thread (sendNote's `push`):
 * its chat push, the one buzz. A note is words for the card's author, so its
 * links are not unfurled. Nothing for a note on an anonymous card — its bell
 * row rings instead (`ringAfter`).
 */
export function afterNoteSent(db: Firestore, push: MessagePush | null, queue: AfterResponse = nextAfter()) {
  if (!push) return;
  later(
    async () => {
      await ring(db, push);
    },
    'afterNote',
    queue,
  );
}

/**
 * After the response to an unsend (unsendMessage's `push`): tell the
 * recipient's phone, so its notification stops showing what the message said
 * (pushUnsend). Nothing for a message that was unsent already.
 */
export function afterMessageUnsent(db: Firestore, push: MessagePush | null, queue: AfterResponse = nextAfter()) {
  if (!push) return;
  later(
    async () => {
      await getAdminMessaging()
        .then((messaging) => pushUnsend(db, push, messaging))
        .catch((e) => console.error('[push] unsend', push.messageId, e));
    },
    'afterUnsend',
    queue,
  );
}
