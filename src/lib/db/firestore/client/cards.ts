'use client';

import type {
  CreatedDraftBody,
  DraftMediaInput,
  EmptiedTrashBody,
  FeedCardBody,
  ResonateResponseBody,
  RestoredCardBody,
  TrashedCardBody,
} from '@/lib/api/v1/schemas';
import type { CardMedia, Locale, Visibility } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { callApi } from './api';
import { dropOutbox, enqueueSave, flushOutbox, forgetRevs, noteRev } from './draftOutbox';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A new card's id, made here — 20 letters and digits, as Firestore's auto ids
 * (`POST /api/v1/cards` takes no other). The writer keeps it across retries,
 * so a create whose answer was lost and is sent again finds its own draft
 * (`created: false`) instead of making a second one.
 */
export function newCardId(): string {
  let id = '';
  while (id.length < 20) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    // 62 letters: a byte from 248 up would favour the first ones, so it is skipped.
    for (const b of bytes) if (b < 248 && id.length < 20) id += ID_ALPHABET[b % 62];
  }
  return id;
}

/** What saving a draft answers: the card's id (its document is the server's). */
export interface SavedDraft {
  id: string;
}

/** A cover as the v1 draft calls take it (DraftMedia): its fields that are set, the whole of it. */
export function draftMedia(media: CardMedia): DraftMediaInput {
  return {
    type: media.type,
    url: media.url,
    ...(media.thumbUrl ? { thumbUrl: media.thumbUrl } : {}),
    ...(media.label ? { label: media.label } : {}),
    ...(media.frame ? { frame: media.frame } : {}),
  };
}

/**
 * Make a new draft through the server (POST /api/v1/cards), under `input.id`
 * or a new id: it checks the id, the card answered and the byline, and stamps
 * the draft. Sent again with the same id, it finds the one already made.
 */
export async function createCardDraft(input: {
  /** The id the writer made for it (newCardId), kept across retries. */
  id?: string;
  thoughtCore: string;
  story: string;
  tags: string[];
  visibility: Visibility;
  originalLocale: Locale;
  media?: CardMedia;
  /** Cover-image dominant hue, pre-snapped to the card palette (null = none). */
  accentHue?: number | null;
  referenceCardId?: string;
  anonymous?: boolean;
}): Promise<SavedDraft & { authorId: string }> {
  const uid = requireUid();
  const id = input.id ?? newCardId();
  const created = await callApi<CreatedDraftBody>('/api/v1/cards', {
    method: 'POST',
    body: {
      id,
      thoughtCore: input.thoughtCore,
      story: input.story,
      tags: input.tags,
      visibility: input.visibility,
      originalLocale: input.originalLocale,
      ...(input.media ? { media: draftMedia(input.media) } : {}),
      ...(input.accentHue != null ? { accentHue: input.accentHue } : {}),
      ...(input.referenceCardId ? { referenceCardId: input.referenceCardId } : {}),
      anonymous: input.anonymous ?? false,
    },
  });
  // Its saves count on from what the server stores (0 for a new one).
  noteRev('draft', created.id, created.rev);
  return { id: created.id, authorId: uid };
}

/**
 * Autosave a draft (PATCH /api/v1/cards/{id}/draft) through the writer's
 * outbox (./draftOutbox): in order, one at a time, the newest words winning,
 * tried again after a network failure. Only the fields given change; a cover
 * given as `undefined` and a hue as `null` are removed (`clear`).
 */
export async function updateCardDraft(
  id: string,
  patch: {
    thoughtCore?: string;
    story?: string;
    tags?: string[];
    visibility?: Visibility;
    media?: CardMedia;
    accentHue?: number | null;
    anonymous?: boolean;
  }
): Promise<SavedDraft> {
  requireUid();
  const fields: Record<string, unknown> = {};
  const clear: string[] = [];
  for (const key of ['thoughtCore', 'story', 'tags', 'visibility', 'anonymous'] as const) {
    if (patch[key] !== undefined) fields[key] = patch[key];
  }
  // A cover given as undefined is removed, never left behind; one given replaces the old whole.
  if ('media' in patch) {
    if (patch.media) fields.media = draftMedia(patch.media);
    else clear.push('media');
  }
  if ('accentHue' in patch) {
    if (patch.accentHue != null) fields.accentHue = patch.accentHue;
    else clear.push('accentHue');
  }
  await enqueueSave('draft', id, { fields, clear });
  return { id };
}

/** Every autosave of the draft still waiting or on its way, sent and stored (rejects when one can't be). */
export function flushCardDraft(id: string): Promise<void> {
  return flushOutbox('draft', id);
}

/** What publishing answers (POST /api/v1/cards/{id}/publish). */
export interface PublishedCard {
  id: string;
  /** The English URL slug; null if generating it failed (the card is live at its id). */
  slug: string | null;
  /** False when it was already live — publishing again never re-dates a card. */
  firstPublish: boolean;
}

/**
 * Whether the viewer's card `id` was ever sent privately in a message (a 私人卡
 * shared in a conversation): whoever read it knows whose it is, so the publish
 * step warns before it goes out anonymous. Server-only record; asked of the API.
 */
export async function getPrivateShares(id: string): Promise<boolean> {
  requireUid();
  return (await callApi<{ sharedPrivately: boolean }>(`/api/v1/cards/${encodeURIComponent(id)}/private-shares`)).sharedPrivately === true;
}

/**
 * Publish one of your cards through the server, the same call the apps make.
 * The rules keep `publishedAt` and the slug out of the client's reach: the
 * server stamps the card once (re-stamping would re-date it in every feed),
 * names it, and for a resonance connects the two authors and rings the
 * original author's bell, re-checking visibility and blocks. Editing a
 * published card goes through the pending-edit buffer (see ./cardEdits) and
 * never comes here.
 */
export async function publishCard(id: string): Promise<PublishedCard> {
  requireUid();
  // What was typed last goes out before the card does.
  await flushOutbox('draft', id);
  return callApi<PublishedCard>(`/api/v1/cards/${encodeURIComponent(id)}/publish`, { method: 'POST' });
}

/**
 * Change one of your cards' visibility and/or byline through the server
 * (PATCH /api/v1/cards/{id}, the call the apps make): it also carries the
 * change into a pending edit, takes a card that is no longer public out of
 * the recommender's pool, and drops the cached pages that showed it as it
 * was. Answers the card as your card box shows it (your byline kept on an
 * anonymous card).
 */
export async function updateCardSettings(
  id: string,
  patch: { visibility?: Visibility; anonymous?: boolean },
): Promise<FeedCardBody> {
  requireUid();
  return callApi<FeedCardBody>(`/api/v1/cards/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
}

/**
 * Move one of your cards to the trash through the server (POST
 * /api/v1/cards/{id}/trash) — what 刪除 does now: private to everyone but
 * you until you restore it, deleted for good after 30 days. A resonance is
 * taken back at once; the notes on an anonymous card are deleted. Answers
 * the card as the trash shelf shows it, and whether it changed (false: it
 * was there already).
 */
export async function trashCard(id: string): Promise<TrashedCardBody> {
  requireUid();
  return callApi<TrashedCardBody>(`/api/v1/cards/${encodeURIComponent(id)}/trash`, { method: 'POST' });
}

/**
 * Bring one of your cards back from the trash as it was (POST
 * /api/v1/cards/{id}/restore). `droppedResonance`: a resonance that came back
 * on its own, no longer answering the card it answered.
 */
export async function restoreCard(id: string): Promise<RestoredCardBody> {
  requireUid();
  return callApi<RestoredCardBody>(`/api/v1/cards/${encodeURIComponent(id)}/restore`, { method: 'POST' });
}

/**
 * Delete one of your cards for good, draft or published, through the server
 * (DELETE /api/v1/cards/{id}): with its pending edit, the notes on it and its
 * recommendation vectors, and the cached pages that showed it dropped. The
 * trash's own 永久刪除 sends `onlyIfTrashed`: a card restored meanwhile (on
 * another device) is refused with 409 (`ApiError.code === 'conflict'`) and stays.
 */
export async function deleteCardForever(id: string, opts: { onlyIfTrashed?: boolean } = {}): Promise<void> {
  requireUid();
  // Nothing still waiting for the card lands after it is gone.
  await Promise.all([dropOutbox('draft', id), dropOutbox('edit', id)]);
  const query = opts.onlyIfTrashed ? '?onlyIfTrashed=true' : '';
  await callApi<null>(`/api/v1/cards/${encodeURIComponent(id)}${query}`, { method: 'DELETE' });
  forgetRevs(id);
}

/** How many calls one emptying makes at most (each deletes a page of 50). */
const EMPTY_TRASH_CALLS = 20;

/**
 * Empty your trash (DELETE /api/v1/me/trash), a page at a time: the first
 * call fixes the cut-off (now), the next ones send it back, so a card moved
 * to the trash meanwhile is never taken — and it stops once nothing is left,
 * or once a call deleted nothing (a card that keeps failing must not keep it
 * going). Answers how many went, and how many are left from before it began.
 */
export async function emptyTrash(): Promise<{ deleted: number; remaining: number }> {
  requireUid();
  let before: string | null = null;
  let deleted = 0;
  let remaining = 0;
  for (let call = 0; call < EMPTY_TRASH_CALLS; call++) {
    const page: EmptiedTrashBody = await callApi<EmptiedTrashBody>(
      `/api/v1/me/trash${before ? `?before=${encodeURIComponent(before)}` : ''}`,
      { method: 'DELETE' },
    );
    before = page.before;
    deleted += page.deleted;
    remaining = page.remaining;
    if (page.remaining <= 0 || page.deleted <= 0) break;
  }
  return { deleted, remaining };
}

/**
 * What resonating with a card answers (POST /api/v1/cards/{id}/resonances):
 * your card as your card box shows it, now answering that card, and whether
 * anything changed (false: it already answered it, no one was rung).
 */
export type ResonateResult = ResonateResponseBody;

/**
 * Make one of your published public cards a resonance of `targetId` through
 * the server (the call the apps make): the rules never let the browser point
 * a card written already at another. The server connects the two authors and
 * rings the original's author as publishing a resonance does, and refuses
 * with 409 (`ApiError.code === 'conflict'`) a card already answering another
 * one, or a second card of yours for the same original.
 */
export async function resonateWith(targetId: string, cardId: string): Promise<ResonateResult> {
  requireUid();
  return callApi<ResonateResult>(`/api/v1/cards/${encodeURIComponent(targetId)}/resonances`, { method: 'POST', body: { cardId } });
}

/**
 * Your card stops answering `targetId` and stays as a card of its own
 * (DELETE /api/v1/cards/{id}/resonances/{cardId}); asking again is harmless.
 */
export async function unresonate(targetId: string, cardId: string): Promise<void> {
  requireUid();
  await callApi<null>(`/api/v1/cards/${encodeURIComponent(targetId)}/resonances/${encodeURIComponent(cardId)}`, { method: 'DELETE' });
}
