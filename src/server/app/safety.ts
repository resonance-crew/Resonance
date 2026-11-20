import { ApiFailure } from '@/lib/api/v1/http';
import type { CreateReportInput, ReportCardInput } from '@/lib/api/v1/schemas';
import type { Card } from '@/lib/db/types';
import type { ServerCtx } from '@/server/ctx';
import { MESSAGE_CONTEXT } from '@/server/domain/conversations';
import type { NewReport, ProfileEvidence, StoredMessage } from '@/server/ports/repos/conversations';
import { instantMillis, type Instant } from '@/server/ports/time';
import { unsentCopiesIn } from './messages';

// Reports (檢舉) as application services. Why: the module comment of
// src/lib/api/v1/safety.ts (the legacy facades).

const iso = (t: Instant | null): string | null => (t ? new Date(instantMillis(t)).toISOString() : null);

/** Write the report and its evidence together; the report's id. */
async function file(ctx: ServerCtx, report: NewReport, evidence: Record<string, unknown>): Promise<string> {
  const id = ctx.ids.id();
  await ctx.data.conversations.fileReport(id, report, evidence, ctx.clock.date());
  return id;
}

/** A profile as moderation needs to see it (what it showed when reported). */
const profileEvidence = (u: ProfileEvidence | null): ProfileEvidence => ({
  handle: u?.handle ?? null,
  bio: u?.bio ?? null,
  avatarUrl: u?.avatarUrl ?? null,
  region: u?.region ?? null,
});

function cardEvidence(card: Card, authorHandle: string | null): Record<string, unknown> {
  return {
    card: {
      id: card.id,
      slug: card.slug ?? null,
      thoughtCore: String(card.thoughtCore ?? ''),
      story: String(card.story ?? ''),
      tags: Array.isArray(card.tags) ? card.tags : [],
      media: card.media?.url ? { type: card.media.type ?? 'image', url: card.media.url, label: card.media.label ?? null } : null,
      visibility: card.visibility,
      anonymous: card.anonymous === true,
      referenceCardId: card.referenceCardId ?? null,
      publishedAt: card.publishedAt && !Number.isNaN(card.publishedAt.getTime()) ? card.publishedAt.toISOString() : null,
      authorHandle,
    },
  };
}

/** See src/lib/api/v1/safety.ts `reportCard`. */
export async function reportCardIn(ctx: ServerCtx, reporterId: string, key: string, input: ReportCardInput): Promise<string> {
  const repo = ctx.data.conversations;
  const card = await repo.visibleCard(reporterId, key);
  if (card.authorId === reporterId) throw new ApiFailure('invalid_request', 'You cannot report your own card.');
  const author = card.authorId && !card.authorId.includes('/') ? await repo.profileEvidence(card.authorId) : null;
  return file(
    ctx,
    { reporterId, targetType: 'card', targetId: card.id, targetUserId: card.authorId, reason: input.reason, detail: input.detail ?? '' },
    cardEvidence(card, author?.handle ?? null),
  );
}

const toEvidence = (m: StoredMessage) => ({
  id: m.id,
  senderId: m.senderId,
  text: m.text ?? '',
  sentAt: iso(m.sentAt),
  ...(m.cardRef !== undefined ? { cardRef: m.cardRef } : {}),
  ...(m.noteRef ? { noteRef: m.noteRef } : {}),
  // A note carried into the thread (`kind: 'note'`, its card in cardRef): what the reported words were left on.
  ...(m.kind !== undefined ? { kind: m.kind } : {}),
  // A picture sent with it: its id, which `npm run moderation` opens (chatImages/{id} names its files).
  ...(m.image ? { image: m.image } : {}),
  // One of several pictures sent together; a sticker (its `text` is the fallback words).
  ...(m.album ? { album: m.album } : {}),
  ...(m.sticker ? { sticker: m.sticker } : {}),
  // Unsent: its words are in `unsent` below, while kept (./messages).
  ...(m.unsent ? { unsent: true } : {}),
});

/** See src/lib/api/v1/safety.ts `createReport`. */
export async function createReportIn(ctx: ServerCtx, reporterId: string, input: CreateReportInput): Promise<string> {
  const repo = ctx.data.conversations;
  const detail = input.detail ?? '';
  if (input.targetType === 'user') {
    if (input.targetId === reporterId) throw new ApiFailure('invalid_request', 'You cannot report yourself.');
    const person = await repo.profileEvidence(input.targetId);
    if (!person) throw new ApiFailure('not_found', 'No such person.');
    return file(
      ctx,
      { reporterId, targetType: 'user', targetId: input.targetId, targetUserId: input.targetId, reason: input.reason, detail },
      { profile: profileEvidence(person) },
    );
  }

  const conversationId = input.conversationId;
  if (!conversationId) throw new ApiFailure('invalid_request', 'A message report names its conversation.');
  // `targetId` is one message — or the conversation itself (the web's thread
  // menu reports the conversation as a whole, from the other person).
  const whole = input.targetId === conversationId;
  const [convo, message] = await Promise.all([repo.getConversation(conversationId), whole ? undefined : repo.getMessage(conversationId, input.targetId)]);
  const participants = convo?.participants;
  // Someone else's conversation is as absent as a missing one.
  if (!convo || !participants || !participants.includes(reporterId) || message === null) {
    throw new ApiFailure('not_found', 'No such message.');
  }
  const sender = message ? String(message.senderId ?? '') : String(participants.find((p) => p !== reporterId) ?? '');
  if (!sender || sender === reporterId) throw new ApiFailure('invalid_request', 'You cannot report your own message.');
  const before = message
    ? message.sentAt
      ? await repo.messagesBefore(conversationId, message.sentAt, MESSAGE_CONTEXT)
      : null
    : await repo.messagesBefore(conversationId, null, MESSAGE_CONTEXT);
  const [sent, unsent] = await Promise.all([repo.profileEvidence(sender), unsentCopiesIn(ctx, conversationId)]);
  return file(
    ctx,
    { reporterId, targetType: 'message', targetId: message?.id ?? conversationId, targetUserId: sender, contextId: conversationId, reason: input.reason, detail },
    {
      message: message ? toEvidence(message) : null,
      // Oldest first: the messages just before the reported one, or (the
      // whole conversation reported) its latest.
      context: (before ?? []).reverse().map(toEvidence),
      // What the conversation's unsent messages said, kept for 30 days for exactly this (oldest first, each `unsent: true`).
      unsent,
      senderHandle: sent?.handle ?? null,
    },
  );
}
