'use client';

import type { CardDetailBody } from '@/lib/api/v1/schemas';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { ApiError, callApi } from './api';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

const path = (cardId: string) => `/api/v1/me/bookmarks/${encodeURIComponent(cardId)}`;

/**
 * Save a card (收藏) or let it go — the purely private "speak to yourself"
 * layer — through the server (PUT / DELETE /api/v1/me/bookmarks/{cardId}),
 * both idempotent. `save` says which; without it the card's current state is
 * read first and flipped. Returns the new state. Never counted, never
 * notifies the author. The saver's own taste in the recommender reads it on
 * the server (round 26 §A3) — never the card's standing for anyone else.
 */
export async function toggleBookmark(cardId: string, save?: boolean): Promise<boolean> {
  requireUid();
  const next = save ?? !(await isBookmarked(cardId));
  await callApi(path(cardId), { method: next ? 'PUT' : 'DELETE' });
  return next;
}

/**
 * Whether the viewer saved this card: the card's own v1 read says
 * (`CardDetail.bookmarked`) — the same GET the card page makes, so it is
 * usually a 304. A card the viewer can't read (404) is not saved.
 */
export async function isBookmarked(cardId: string): Promise<boolean> {
  if (!getFirebaseClientAuth().currentUser) return false;
  try {
    const body = await callApi<CardDetailBody>(`/api/v1/cards/${encodeURIComponent(cardId)}`);
    return body.bookmarked === true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return false;
    throw e;
  }
}
