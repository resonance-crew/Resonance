'use client';

import type { TapListBody, TapPassageResponseBody } from '@/lib/api/v1/schemas';
import { callApi } from './api';

/**
 * The resonance tap (共振, round 26) through the server, as the apps call it:
 * `PUT /api/v1/cards/{id}/tap` resonates, `DELETE` takes it back — `{ on,
 * changed }` either way. A refusal throws an ApiError: `forbidden` (403)
 * without a pen name, `blocked` (409) on a named card across a block,
 * `invalid_request` (400) on one's own card. Nothing here reaches the author:
 * the server rings them after its answer (lib/push/tapBell).
 */
export function setTap(cardId: string, on: boolean): Promise<{ on: boolean; changed: boolean }> {
  return callApi(`/api/v1/cards/${encodeURIComponent(cardId)}/tap`, { method: on ? 'PUT' : 'DELETE' });
}

/**
 * The passage a reader picked on a tap that is on (round 27 §P4, `PUT /api/v1/cards/{id}/tap/passage`): one of
 * `CardDetail.tap.passages`' ids, or null to clear it. Only the card's author learns it, and nothing rings. A
 * refusal throws an ApiError: 409 when the tap is off, 400 when the id is not one of the card's passages now, 404
 * when the card can't be tapped by this reader.
 */
export function setTapPassage(cardId: string, passage: string | null): Promise<TapPassageResponseBody> {
  return callApi<TapPassageResponseBody>(`/api/v1/cards/${encodeURIComponent(cardId)}/tap/passage`, { method: 'PUT', body: { passage } });
}

/**
 * Who resonated with a card, newest first (`GET /api/v1/cards/{id}/taps`):
 * its author gets everyone, 30 a page, each with their latest note's first line
 * on a named card; a reader gets themselves and the people they are connected
 * with, in one page.
 */
export function listTaps(cardId: string, pageToken?: string | null, passage?: string | null): Promise<TapListBody> {
  const params = new URLSearchParams();
  if (pageToken) params.set('pageToken', pageToken);
  // Round 29 §S4.4: the author's list of one picked sentence's people (a `TapPicked.id`).
  if (passage) params.set('passage', passage);
  // Not `params.size`: it is undefined before Safari 17 / Chrome 113, which would drop both parameters.
  const s = params.toString();
  const q = s ? `?${s}` : '';
  return callApi<TapListBody>(`/api/v1/cards/${encodeURIComponent(cardId)}/taps${q}`);
}
