import { firstLink } from '@/lib/links/url';
import type { ServerCtx } from '@/server/ctx';
import type { SentMessage } from './conversations';
import { unfurlMessageIn } from './links';
import { pushMessageIn, pushUnsendIn, type MessagePush } from './pushChat';
import { pushConnectionCardIn } from './pushConnectionCards';
import { pushNotificationIn } from './pushSend';

/**
 * What the /api/v1 routes push after their response, on a ServerCtx: the
 * work goes to `ctx.later` (Next's `after()` in production), the pushes
 * through `ctx.push` (FCM). Each never delays or fails the write that made
 * it — every failure is logged and goes no further. The legacy `(db, …)`
 * versions (lib/push/ring `ringAfter`, lib/api/v1/afterMessage,
 * lib/push/connectionCards `announceNewCard`) do the same on a given
 * Firestore.
 */

/**
 * A bell row to ring: its id, or the work that writes it — run after the
 * response too, answering the row's id, or null when it rang no one.
 */
export type Bell = string | null | undefined | (() => Promise<string | null>);

/**
 * After the response, push each new bell row, one after another (lib/push/ring
 * `ringAfter`): work that writes a row runs first, its push after it; one that
 * fails is logged and rings no one, and the next still rings.
 */
export function ringAfterIn(ctx: ServerCtx, ...bells: Bell[]): void {
  const todo = bells.filter((b): b is NonNullable<Bell> => !!b);
  if (!todo.length) return;
  ctx.later.later(async () => {
    for (const bell of todo) {
      const id = typeof bell === 'string' ? bell : await bell().catch((e) => (console.error('[push]', e), null));
      if (!id) continue;
      await pushNotificationIn(ctx, id).catch((e) => console.error('[push]', id, e));
    }
  }, 'push');
}

/** Ring a message's recipient; logs and gives up on any failure (it runs after the response). */
function ring(ctx: ServerCtx, push: MessagePush): Promise<unknown> {
  return pushMessageIn(ctx, push).catch((e) => console.error('[push]', push.messageId, e));
}

/**
 * After the response to a send (lib/api/v1/afterMessage `afterMessageSent`):
 * ring the recipient's phone and unfurl the message's link, side by side,
 * neither one failing stopping the other. Nothing for a message only sent
 * again; an album's later pictures (`silent`) ring nothing, and a message
 * without a link is not unfurled.
 */
export function afterMessageSentIn(ctx: ServerCtx, sent: SentMessage, text: string): void {
  const { push } = sent;
  if (sent.duplicate || !push) return;
  const unfurl = firstLink(text) !== null;
  if (sent.silent && !unfurl) return;
  ctx.later.later(async () => {
    await Promise.all([
      sent.silent ? null : ring(ctx, push),
      unfurl ? unfurlMessageIn(ctx, push.conversationId, push.messageId).catch((e) => console.error('[unfurl]', push.messageId, e)) : null,
    ]);
  }, 'afterMessage');
}

/** After the response to a note that went into the thread: its chat push, the one buzz (never unfurled). */
export function afterNoteSentIn(ctx: ServerCtx, push: MessagePush | null): void {
  if (!push) return;
  ctx.later.later(async () => {
    await ring(ctx, push);
  }, 'afterNote');
}

/** After the response to an unsend: tell the recipient's phone (pushUnsend). Nothing for one unsent already. */
export function afterMessageUnsentIn(ctx: ServerCtx, push: MessagePush | null): void {
  if (!push) return;
  ctx.later.later(async () => {
    await pushUnsendIn(ctx, push).catch((e) => console.error('[push] unsend', push.messageId, e));
  }, 'afterUnsend');
}

/**
 * A card published for the first time (lib/push/connectionCards
 * `announceNewCard`): once its slug has settled (`slug`, the publish's own
 * promise of it), its author's connections who asked hear of it. Never
 * throws; logs what it did when it reached anyone.
 */
export async function announceNewCardIn(ctx: ServerCtx, cardId: string, slug: unknown): Promise<void> {
  try {
    await Promise.resolve(slug).catch(() => null);
    const run = await pushConnectionCardIn(ctx, cardId);
    if (run.recipients) console.log(`[push] new card ${cardId}`, JSON.stringify(run));
  } catch (e) {
    console.error('[push] new card', cardId, e);
  }
}
