import { ApiFailure } from '@/lib/api/v1/http';
import { refuseInTrash } from '@/lib/api/v1/inTrash';
import { visibilityOf } from '@/lib/api/v1/present';
import {
  mapOpOf,
  type CreateDraftInput,
  type CreatedDraftBody,
  type DraftMediaInput,
  type DraftSavedBody,
  type MapOpInput,
  type MapOpsResponseBody,
  type PendingEditBody,
  type PendingEditBoxBody,
  type PendingEditInput,
  type ThoughtMapBody,
  type UpdateDraftInput,
} from '@/lib/api/v1/schemas';
import { ANONYMOUS_VISIBILITY_MESSAGE, anonymousForConnections, cardContentProblem, editedAudience } from '@/lib/db/firestore/cardContent';
import type { Card } from '@/lib/db/types';
import { isCoverFrame } from '@/lib/images/coverFrame';
import { publicBases, storageKeyOf } from '@/lib/storage/publicUrl';
import type { ServerCtx } from '@/server/ctx';
import { cardVisible } from '@/server/domain/visibility';
import { MapOpRefused, draftLogExpiry, mapReadsOf, planMapOps, revApplies, storedRev } from '@/server/domain/writer';
import type { RealtimeTopic } from '@/server/ports/realtime';
import type { CardRow } from '@/server/ports/repos/cards';
import type { DraftCover, DraftPatch, EditCopy, NewDraft } from '@/server/ports/repos/writer';

/**
 * The writer's services (任務 #3 Phase 2, lane 2a-writer): the thought map,
 * a draft's creation and autosaves, and a published card's pending edit,
 * written by the server for the clients that wrote them straight to
 * Firestore. Each is held to what firebase/firestore.rules let the client
 * write (the request schemas carry the rules' limits; these the rest), and
 * each one that writes tells its author's other screens (`map`, `drafts`).
 */

const notFound = () => new ApiFailure('not_found', 'No such card.');

/** The refusal for an autosave onto a published card: its changes wait in its pending edit (edits/current), never on the live card. */
export const PUBLISHED_DRAFT_MESSAGE = 'A published card saves through its pending edit.';
/** The refusal for a draft id already taken (by someone else's card) or deleted for good. */
export const DRAFT_ID_TAKEN_MESSAGE = 'This id is taken: make another.';

/** Tell `uid`'s screens, after the write committed; never fails the write. */
async function touch(ctx: ServerCtx, uid: string, topic: RealtimeTopic): Promise<void> {
  // After the response (ctx.later.soon): an autosave's answer never waits on the signal write.
  await ctx.later.soon(() => ctx.realtime.touch(uid, [topic]).catch((e: unknown) => ctx.log.error('[writer] touch', topic, e)), 'writer');
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/* ───────────── the thought map ───────────── */

/** GET /api/v1/me/thought-map: the viewer's whole map, as the clients load it (client/thoughtMap.ts loadMyThoughtMap). */
export async function getThoughtMapIn(ctx: ServerCtx, uid: string): Promise<ThoughtMapBody> {
  const map = await ctx.data.writer.loadMap(uid);
  return {
    nodes: map.nodes.map((n) => ({ id: n.id, cardId: n.cardId, x: n.x, y: n.y, groupId: n.groupId, createdAt: iso(n.createdAt), updatedAt: iso(n.updatedAt) })),
    edges: map.edges.map((e) => ({ id: e.id, sourceCardId: e.sourceCardId, targetCardId: e.targetCardId, label: e.label, createdAt: iso(e.createdAt) })),
    groups: map.groups.map((g) => ({ id: g.id, title: g.title, hue: g.hue, x: g.x, y: g.y, w: g.w, h: g.h, createdAt: iso(g.createdAt) })),
  };
}

/**
 * POST /api/v1/me/thought-map/ops: a batch of map changes in one
 * transaction, in order — all of them or none. Only the viewer's own map is
 * ever read or written (`uid` is the caller), and it names cards by id only.
 */
export async function applyMapOpsIn(ctx: ServerCtx, uid: string, flat: readonly unknown[]): Promise<MapOpsResponseBody> {
  const ops: MapOpInput[] = flat.map((o) => mapOpOf(o));
  await ctx.limits.spend(uid, 'mapOps');
  const { keys, removedCards, removedGroups } = mapReadsOf(ops);
  const result = await ctx.uow.run(async (tx) => {
    const [items, touching, members] = await Promise.all([
      tx.writer.getMapItems(uid, keys),
      removedCards.length ? tx.writer.edgesTouching(uid, removedCards) : [],
      removedGroups.length ? tx.writer.nodesInGroups(uid, removedGroups) : [],
    ]);
    const byId = <T extends { id: string }>(...lists: T[][]) => [...new Map(lists.flat().map((r) => [r.id, r])).values()];
    let plan;
    try {
      plan = planMapOps({ nodes: byId(items.nodes, members), edges: byId(items.edges, touching), groups: items.groups }, ops);
    } catch (e) {
      if (e instanceof MapOpRefused) throw new ApiFailure('invalid_request', e.message, [{ path: `ops.${e.index}`, message: e.message }]);
      throw e;
    }
    tx.writer.writeMap(uid, plan.writes, ctx.clock.date());
    return plan;
  }, { label: 'thoughtMapOps' });
  if (result.writes.length) await touch(ctx, uid, 'map');
  return { applied: result.applied, skipped: result.skipped };
}

/* ───────────── drafts ───────────── */

/** A cover as sent, without its null fields; null when none was sent. */
function coverOf(m: DraftMediaInput | null | undefined): DraftCover | null {
  if (!m) return null;
  return {
    type: m.type,
    url: m.url,
    ...(m.thumbUrl != null ? { thumbUrl: m.thumbUrl } : {}),
    ...(m.label != null ? { label: m.label } : {}),
    ...(m.frame != null ? { frame: m.frame } : {}),
  };
}

/**
 * What is wrong with a cover the client sends (the rules' validMedia beyond
 * the schema): on our own storage where the server knows it, unless it is
 * the card's cover already — and its copy always there.
 */
function refuseCover(cover: DraftCover | null, keptUrl: unknown): void {
  if (!cover) return;
  const { thumbUrl, ...rest } = cover;
  const problem = cardContentProblem({ thoughtCore: '', story: '', tags: [], media: rest }, { keptMediaUrl: typeof keptUrl === 'string' ? keptUrl : null });
  const bases = publicBases();
  if (problem || (thumbUrl && bases.length && !storageKeyOf(thumbUrl, bases))) {
    throw new ApiFailure('invalid_request', 'The cover is not one of ours.', [{ path: 'media', message: 'Out of bounds.' }]);
  }
}

const keptCoverUrl = (row: CardRow | null) => {
  const media = row?.media as { url?: unknown } | null | undefined;
  return media && typeof media === 'object' ? media.url : null;
};

/**
 * POST /api/v1/cards: a new draft under the id the client made (the rules'
 * create): its id 20 letters and digits, never a card's in use nor one
 * deleted for good (a tombstone: links, bookmarks and threads still name
 * it); unpublished, counters zeroed; never anonymous and for connections
 * only; answering only a card the writer may read, and never across a block
 * unless the original is anonymous (the writer keeps their own block list:
 * a refusal only across a block would name who wrote it). Sent again, it
 * answers the draft already there (`created: false`) and writes nothing.
 */
export async function createDraftIn(ctx: ServerCtx, uid: string, input: CreateDraftInput): Promise<CreatedDraftBody> {
  const cover = coverOf(input.media);
  const draft: NewDraft = {
    thoughtCore: input.thoughtCore,
    story: input.story,
    tags: input.tags,
    visibility: input.visibility,
    anonymous: input.anonymous ?? false,
    ...(input.originalLocale != null ? { originalLocale: input.originalLocale } : {}),
    ...(cover ? { media: cover } : {}),
    ...(input.accentHue != null ? { accentHue: input.accentHue } : {}),
    ...(input.referenceCardId != null ? { referenceCardId: input.referenceCardId } : {}),
  };
  if (anonymousForConnections(draft)) throw new ApiFailure('invalid_request', ANONYMOUS_VISIBILITY_MESSAGE);
  refuseCover(cover, null);
  await ctx.limits.spend(uid, 'draftCreate');
  const result = await ctx.uow.run(async (tx) => {
    const [stored, tombstoned, target] = await Promise.all([
      tx.writer.getCard(input.id),
      tx.writer.isTombstoned(input.id),
      draft.referenceCardId ? tx.writer.getAnswerTarget(uid, draft.referenceCardId) : null,
    ]);
    if (stored) {
      if (stored.authorId === uid && stored.publishedAt == null) return { id: input.id, created: false, rev: storedRev(stored.draftRev) };
      throw new ApiFailure('conflict', DRAFT_ID_TAKEN_MESSAGE);
    }
    if (tombstoned) throw new ApiFailure('conflict', DRAFT_ID_TAKEN_MESSAGE);
    if (draft.referenceCardId) {
      const original = target?.card as unknown as Card | undefined;
      if (!target || !original || !cardVisible(original, uid, () => target.connected)) throw notFound();
      if (original.anonymous !== true && target.blocked) throw new ApiFailure('blocked', 'You can\'t answer this card.');
    }
    tx.writer.createDraft(input.id, uid, draft, ctx.clock.date());
    return { id: input.id, created: true, rev: 0 };
  }, { label: 'createDraft' });
  if (result.created) await touch(ctx, uid, 'drafts');
  return result;
}

/**
 * PATCH /api/v1/cards/{id}/draft: an autosave of your draft — only the
 * fields sent, only the ones the rules let a client write on its own card
 * (title, story, tags, visibility, byline, cover, hue), applied when `rev`
 * is above the stored count (`draftRev`), else nothing changes and the
 * stored count comes back. Never onto a card in the trash (409, as the
 * rules) nor a published one (409: its changes go to its pending edit,
 * where readers never see a half-written sentence). A draft may become
 * anonymous and for connections only (the rules let an unpublished one, for
 * the app builds before letters); publishing refuses it so. Each applied
 * save is kept 7 days in the patch log (`draftLog/{rev}`), to bring words
 * back should a client's count go wrong.
 */
export async function saveDraftIn(ctx: ServerCtx, uid: string, id: string, input: UpdateDraftInput): Promise<DraftSavedBody> {
  const { rev, clear, media, ...fields } = input;
  const cover = coverOf(media);
  const set: DraftPatch['set'] = Object.fromEntries(Object.entries({ ...fields, ...(cover ? { media: cover } : {}) }).filter(([, v]) => v != null));
  const patch: DraftPatch = { set, clear: [...new Set(clear ?? [])].filter((f) => !(f in set)) };
  await ctx.limits.spend(uid, 'draftSave');
  const at = ctx.clock.date();
  const result = await ctx.uow.run(async (tx) => {
    const stored = await tx.writer.getCard(id);
    if (!stored || stored.authorId !== uid) throw notFound();
    refuseInTrash({ get: (f) => stored[f] });
    if (stored.publishedAt != null) throw new ApiFailure('conflict', PUBLISHED_DRAFT_MESSAGE);
    if (!revApplies(stored.draftRev, rev)) return { applied: false, rev: storedRev(stored.draftRev), updatedAt: null };
    refuseCover(cover, keptCoverUrl(stored));
    tx.writer.patchDraft(id, patch, rev, at);
    tx.writer.logDraftPatch(id, uid, { rev, patch, expireAt: draftLogExpiry(at) }, at);
    return { applied: true, rev, updatedAt: at.toISOString() };
  }, { label: 'saveDraft' });
  if (result.applied) await touch(ctx, uid, 'drafts');
  return result;
}

/* ───────────── a published card's pending edit (edits/current) ───────────── */

function editOf(e: CardRow, card: CardRow): PendingEditBody {
  const m = e.media as Record<string, unknown> | null | undefined;
  const media =
    m && typeof m === 'object' && (m.type === 'image' || m.type === 'video') && typeof m.url === 'string'
      ? {
          type: m.type as 'image' | 'video',
          url: m.url,
          ...(typeof m.thumbUrl === 'string' ? { thumbUrl: m.thumbUrl } : {}),
          ...(typeof m.label === 'string' ? { label: m.label } : {}),
          ...(isCoverFrame(m.frame) ? { frame: m.frame } : {}),
        }
      : null;
  const updatedAt = e.updatedAt instanceof Date ? e.updatedAt.toISOString() : null;
  return {
    thoughtCore: typeof e.thoughtCore === 'string' ? e.thoughtCore : '',
    story: typeof e.story === 'string' ? e.story : '',
    tags: Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === 'string') : [],
    // As applying it leaves the card (editedAudience): the copy's visibility, else the card's.
    visibility: visibilityOf(editedAudience(e, card).visibility),
    anonymous: e.anonymous === true,
    media,
    accentHue: typeof e.accentHue === 'number' ? e.accentHue : null,
    updatedAt,
    rev: storedRev(e.rev),
  };
}

/** Whose a pending edit is: a copy naming someone else (left under an id another card took) is not theirs. */
const editMine = (e: CardRow, uid: string) => e.authorId == null || e.authorId === uid;

/** GET /api/v1/cards/{id}/edits/current: your working copy of your card, or null — as the rules let only you read it. */
export async function getPendingEditIn(ctx: ServerCtx, uid: string, id: string): Promise<PendingEditBoxBody> {
  const [card, edit] = await Promise.all([ctx.data.writer.getCard(id), ctx.data.writer.getEdit(id)]);
  if (!card || card.authorId !== uid) throw notFound();
  return { edit: edit && editMine(edit, uid) ? editOf(edit, card) : null };
}

/**
 * PUT /api/v1/cards/{id}/edits/current: replace your working copy whole
 * (the rules' create/update): your card, not in the trash (restoring it
 * would otherwise meet a copy saved with the trash's 'private'), within a
 * card's limits, and never leaving the card anonymous and for connections
 * only unless it already is. Ordered by `rev` as a draft's autosaves.
 */
export async function putPendingEditIn(ctx: ServerCtx, uid: string, id: string, input: PendingEditInput): Promise<DraftSavedBody> {
  const cover = coverOf(input.media);
  const copy: EditCopy = {
    thoughtCore: input.thoughtCore,
    story: input.story,
    tags: input.tags,
    visibility: input.visibility,
    anonymous: input.anonymous,
    ...(cover ? { media: cover } : {}),
    accentHue: input.accentHue ?? null,
    rev: input.rev,
  };
  await ctx.limits.spend(uid, 'draftSave');
  const at = ctx.clock.date();
  const result = await ctx.uow.run(async (tx) => {
    const [card, edit] = await Promise.all([tx.writer.getCard(id), tx.writer.getEdit(id)]);
    if (!card || card.authorId !== uid) throw notFound();
    refuseInTrash({ get: (f) => card[f] });
    const leaves = editedAudience(copy, card);
    if (anonymousForConnections(leaves) && !anonymousForConnections(card)) throw new ApiFailure('invalid_request', ANONYMOUS_VISIBILITY_MESSAGE);
    if (edit && editMine(edit, uid) && !revApplies(edit.rev, input.rev)) return { applied: false, rev: storedRev(edit.rev), updatedAt: null };
    refuseCover(cover, keptCoverUrl(card));
    tx.writer.putEdit(id, uid, copy, at);
    return { applied: true, rev: input.rev, updatedAt: at.toISOString() };
  }, { label: 'putPendingEdit' });
  if (result.applied) await touch(ctx, uid, 'drafts');
  return result;
}

/**
 * DELETE /api/v1/cards/{id}/edits/current: throw your working copy away
 * (the rules' delete): yours by its author, or on your card when it names
 * no one else — your copy left after its card went, too.
 */
export async function deletePendingEditIn(ctx: ServerCtx, uid: string, id: string): Promise<{ deleted: boolean }> {
  const deleted = await ctx.uow.run(async (tx) => {
    const [card, edit] = await Promise.all([tx.writer.getCard(id), tx.writer.getEdit(id)]);
    const ownsCard = card?.authorId === uid;
    if (edit && (edit.authorId === uid || (ownsCard && editMine(edit, uid)))) {
      tx.writer.deleteEdit(id);
      return true;
    }
    if (!ownsCard) throw notFound();
    return false;
  }, { label: 'deletePendingEdit' });
  if (deleted) await touch(ctx, uid, 'drafts');
  return { deleted };
}
