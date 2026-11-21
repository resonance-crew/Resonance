'use client';

import type { PendingEditBoxBody } from '@/lib/api/v1/schemas';
import type { CardMedia, Visibility } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { ApiError, callApi } from './api';
import { draftMedia } from './cards';
import { dropOutbox, enqueueSave, flushOutbox, noteRev } from './draftOutbox';

/**
 * Pending edits to an **already-published** card.
 *
 * A draft autosaves straight onto its card — nobody can read it yet. A
 * published card cannot: readers are looking at it right now, so autosaving
 * into it would push every half-written sentence live. Instead the editor
 * autosaves the whole working copy into `cards/{id}/edits/current` (its
 * author's alone), through the server (GET / PUT / DELETE
 * /api/v1/cards/{id}/edits/current) and the writer's outbox (./draftOutbox:
 * in order, counted by `rev`), and the server merges it into the live fields
 * when the author explicitly saves. Discarding is a delete.
 *
 * The buffer never carries `publishedAt`: applying an edit updates a card, it
 * does not re-publish it.
 */

/** Everything the editor can change about a card. */
export interface CardEditValues {
  thoughtCore: string;
  story: string;
  tags: string[];
  visibility: Visibility;
  media?: CardMedia;
  accentHue?: number | null;
  anonymous: boolean;
}

export interface PendingCardEdit extends CardEditValues {
  /** When autosave last wrote the buffer (null when the kept copy has no time). */
  updatedAt: Date | null;
}

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

const path = (cardId: string) => `/api/v1/cards/${encodeURIComponent(cardId)}/edits/current`;

/** The author's unsaved working copy, or null when there is none. */
export async function getPendingCardEdit(cardId: string): Promise<PendingCardEdit | null> {
  let box: PendingEditBoxBody;
  try {
    box = await callApi<PendingEditBoxBody>(path(cardId));
  } catch (e) {
    // Not the author's card (or no such card) reads as "no pending edit". A failed read throws: an editor
    // opened on the live fields instead would autosave them over the working copy.
    if (e instanceof ApiError && (e.status === 404 || e.status === 403 || e.status === 401)) return null;
    throw e;
  }
  const edit = box.edit;
  if (!edit) return null;
  // This browser's next save counts on from the kept copy's.
  noteRev('edit', cardId, edit.rev);
  const media = edit.media;
  return {
    thoughtCore: edit.thoughtCore,
    story: edit.story,
    tags: edit.tags,
    visibility: edit.visibility,
    media: media
      ? {
          type: media.type,
          url: media.url,
          ...(media.thumbUrl ? { thumbUrl: media.thumbUrl } : {}),
          ...(media.label ? { label: media.label } : {}),
          ...(media.frame ? { frame: media.frame } : {}),
        }
      : undefined,
    accentHue: edit.accentHue,
    anonymous: edit.anonymous,
    updatedAt: edit.updatedAt ? new Date(edit.updatedAt) : null,
  };
}

/**
 * Autosave target for a published card — replaces the whole working copy, in
 * order through the outbox (the newest copy wins; one on its way at a time).
 */
export async function savePendingCardEdit(cardId: string, values: CardEditValues): Promise<void> {
  requireUid();
  await enqueueSave('edit', cardId, {
    thoughtCore: values.thoughtCore,
    story: values.story,
    tags: values.tags,
    visibility: values.visibility,
    anonymous: values.anonymous,
    ...(values.media ? { media: draftMedia(values.media) } : {}),
    ...(values.accentHue != null ? { accentHue: values.accentHue } : {}),
  });
}

/**
 * Throw the working copy away; the live card is left exactly as it was. A
 * save not sent yet is forgotten, and one on its way lands first, so nothing
 * puts the copy back after it is gone.
 */
export async function discardPendingCardEdit(cardId: string): Promise<void> {
  requireUid();
  await dropOutbox('edit', cardId);
  await callApi<{ deleted: boolean }>(path(cardId), { method: 'DELETE' });
}

/** What applying answers (POST /api/v1/cards/{id}/edits/apply). */
export interface AppliedCardEdit {
  id: string;
  /** Where the card lives: its English slug, or null (it is served at its id). */
  slug: string | null;
  /** False when there was no working copy to apply — nothing changed. */
  applied: boolean;
}

/**
 * Make the working copy the live card, through the server (the call the apps
 * make): in one transaction it copies what `edits/current` holds onto the
 * card, held to a card's limits, and deletes the buffer, so a reader never
 * sees half of a revision. `publishedAt` and the slug are left alone — an
 * edit must not re-date a card (every feed orders by it) or move it. List
 * excerpts, the cached pages and the recommendation index follow on the
 * server. It applies the buffer, not the screen: every save still in the
 * outbox goes first (a save of the screen before it is the caller's).
 */
export async function applyPendingCardEdit(cardId: string): Promise<AppliedCardEdit> {
  requireUid();
  await flushOutbox('edit', cardId);
  return callApi<AppliedCardEdit>(`/api/v1/cards/${encodeURIComponent(cardId)}/edits/apply`, { method: 'POST' });
}
