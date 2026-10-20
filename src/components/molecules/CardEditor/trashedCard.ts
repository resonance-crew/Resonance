import { ApiError, callApi } from '@/lib/db/firestore/client/api';
import type { Card } from '@/lib/db/types';

/**
 * The writer's side of the trash (trash.spec §5.5): a card moved to the
 * trash elsewhere (another tab, a phone) while it is open here. The rules
 * refuse its saves (permission-denied), publish and apply answer 409
 * 'This card is in the trash.' — either way the writer reads the card again
 * and, finding it trashed, says so with a way to restore it, keeping what is
 * typed. A card past its 30 days is gone, and reads as not found.
 */

/** Whether a card read back is in the trash (`trashedAt`, set by the server alone). */
export function isTrashed(card: Card | null | undefined): boolean {
  return (card as (Card & { trashedAt?: unknown }) | null | undefined)?.trashedAt != null;
}

/** The server's answer for a card in the trash: 409 `conflict` 'This card is in the trash.'. */
export function isTrashRefusal(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && /trash/i.test(err.message);
}

/** A refusal the card being in the trash could explain: the rules' (a write) or the server's. */
export function mayBeTrashed(err: unknown): boolean {
  return isTrashRefusal(err) || (err as { code?: unknown } | null)?.code === 'permission-denied';
}

/** Takes the card out of the trash (POST /api/v1/cards/{id}/restore), as it was before. */
export async function restoreTrashedCard(id: string): Promise<void> {
  await callApi(`/api/v1/cards/${encodeURIComponent(id)}/restore`, { method: 'POST' });
}
