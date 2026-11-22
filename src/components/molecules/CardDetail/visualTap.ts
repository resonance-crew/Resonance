'use client';

import { useEffect, useRef } from 'react';
import { useSWRConfig } from 'swr';
import type { AuthorBody, CardTapBody } from '@/lib/api/v1/schemas';
import { USE_FIREBASE_EMULATOR } from '@/lib/auth/firebase/client';
import { cardPageKey, type LoadedCardPageLists } from '@/lib/data/hooks';
import { withMine, withPassage } from '@/lib/data/taps';

/** The release screenshots' states of the passages' dialog (scripts/visual/screens.ts §V2), as the apps' launch args name them. */
export type VisualTap = 'passages' | 'picked';

/** `?visualTap=passages|picked` on the page's address, in an emulator build only; else null. */
export function visualTapAsked(search: string, emulator = USE_FIREBASE_EMULATOR): VisualTap | null {
  if (!emulator) return null;
  const v = new URLSearchParams(search).get('visualTap');
  return v === 'passages' || v === 'picked' ? v : null;
}

/**
 * Emulator builds only — the web's twin of the apps' `-visualTap` / `cardEnd` launch args (round 27 §V2): the tap
 * shown on and the passages' dialog open (`picked`: the second row chosen, in its ink and check), on the card page's
 * answer alone — nothing is written, so every device and theme of a run captures the same seeded state (a real
 * press would turn the stored tap off again on the next one). Calls `open` once, when the tap and the reader are in.
 */
export function useVisualTap(cardId: string, uid: string | undefined, tap: CardTapBody | null | undefined, me: AuthorBody | null, open: () => void) {
  const { mutate } = useSWRConfig();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !uid || !tap || !me) return;
    const asked = typeof window === 'undefined' ? null : visualTapAsked(window.location.search);
    const passages = tap.passages ?? [];
    if (!asked || passages.length < 2) return;
    done.current = true;
    const passage = asked === 'picked' ? passages[1].id : null;
    void mutate<LoadedCardPageLists | null>(
      cardPageKey(cardId, uid),
      (cur) => (cur?.tap ? { ...cur, tap: withPassage(withMine(cur.tap, true, me), passage) } : cur),
      { revalidate: false },
    ).then(open);
  }, [cardId, uid, tap, me, mutate, open]);
}
