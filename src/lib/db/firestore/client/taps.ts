'use client';

import type { TapListBody } from '@/lib/api/v1/schemas';
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
 * Who resonated with a card, newest first (`GET /api/v1/cards/{id}/taps`):
 * its author gets everyone, 30 a page, each with their latest note's first line
 * on a named card; a reader gets themselves and the people they are connected
 * with, in one page.
 */
export function listTaps(cardId: string, pageToken?: string | null): Promise<TapListBody> {
  const q = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
  return callApi<TapListBody>(`/api/v1/cards/${encodeURIComponent(cardId)}/taps${q}`);
}
