'use client';

import useSWR from 'swr';
import { getPrivateShares } from '@/lib/db/firestore/client/cards';

/**
 * Whether the viewer's card `cardId` was ever shared privately in a message —
 * asked only while `asking` (the publish step on screen; the writer holds the
 * viewer's own cards alone). True only on the server's yes: no card yet, a
 * failed read or a 404 say nothing, and nothing waits on it (the owner's
 * call: warn, never refuse).
 */
export function useSharedPrivately(cardId: string | undefined, asking: boolean): boolean {
  // A failure is no warning, not an error to retry: publishing never waits on it.
  const { data } = useSWR(cardId && asking ? `privateShares:${cardId}` : null, () => getPrivateShares(cardId!).catch(() => false));
  return data === true;
}
