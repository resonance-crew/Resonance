'use client';

import { useEffect } from 'react';
import { callApi } from '@/lib/db/firestore/client/api';

/**
 * Tell the server a signed-in reader is reading a card (POST
 * /api/v1/cards/{id}/read), which counts it toward the card's readCount —
 * once per reader, card and UTC day, never its author's (lib/api/v1/cardReads).
 * Asked once per reader and card for the page's life, so moving back and
 * forth between cards doesn't ask again; the server's answer is always 204,
 * and a failure is nobody's concern (the read just goes uncounted).
 */
const asked = new Set<string>();

export function useCountCardRead(viewerId: string | null | undefined, cardId: string | null | undefined, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !viewerId || !cardId) return;
    const key = `${viewerId}:${cardId}`;
    if (asked.has(key)) return;
    asked.add(key);
    Promise.resolve()
      .then(() => callApi(`/api/v1/cards/${encodeURIComponent(cardId)}/read`, { method: 'POST' }))
      .catch(() => {
        // Let a later visit try again.
        asked.delete(key);
      });
  }, [enabled, viewerId, cardId]);
}

/** For tests: forget what was asked. */
export function forgetCountedReads() {
  asked.clear();
}
