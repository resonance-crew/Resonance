'use client';

import { useCallback, useRef } from 'react';
import { useSWRConfig } from 'swr';
import type { AuthorBody, CardTapBody } from '@/lib/api/v1/schemas';
import { TAP_FACES_MAX } from '@/lib/api/v1/schemas';
import type { User } from '@/lib/db/types';
import { setTap } from '@/lib/db/firestore/client/taps';
import { cardPageKey, type LoadedCardPageLists } from './hooks';

/** The viewer as a face (`Author`), from their own profile. */
export function faceOf(me: Pick<User, 'id' | 'handle' | 'initials' | 'accentColor' | 'avatarUrl' | 'avatarSeed' | 'verified' | 'region'>): AuthorBody {
  return {
    id: me.id,
    handle: me.handle,
    initials: me.initials,
    accentColor: me.accentColor,
    avatarUrl: me.avatarUrl ?? null,
    avatarSeed: me.avatarSeed ?? null,
    verified: !!me.verified,
    region: me.region ?? null,
  };
}

/**
 * The tap as it reads once the viewer turned it `on` or off, before the server
 * says so: on, their own face first (the others after it, at most three in
 * all, the rest a blank disc); off, their face gone and the others as they
 * were. What the server answers next replaces it.
 */
export function withMine(tap: CardTapBody, on: boolean, me: AuthorBody): CardTapBody {
  const others = tap.faces.filter((f) => f.id !== me.id);
  if (!on) return { ...tap, mine: false, faces: others };
  const faces = [me, ...others];
  return { ...tap, mine: true, faces: faces.slice(0, TAP_FACES_MAX), more: tap.more || faces.length > TAP_FACES_MAX };
}

/** Why a tap didn't go through: no pen name yet (ask for one), or anything else (say so and put it back). */
export type TapFailure = 'penName' | 'failed';

/**
 * Turning the tap on or off from the card page (§U1.6): it flips at once —
 * the card page's one signed-in answer (`cardPageKey`) changed in place, the
 * viewer's face sliding in or out — and the server is asked after. A refusal
 * puts back what the viewer saw (only for the latest flip: a later one has
 * already said what they want) and tells the caller why.
 */
export function useTapToggle(cardId: string | undefined, uid: string | undefined) {
  const { mutate } = useSWRConfig();
  const latest = useRef(0);
  return useCallback(
    async (on: boolean, me: AuthorBody): Promise<TapFailure | null> => {
      if (!cardId || !uid) return 'failed';
      const key = cardPageKey(cardId, uid);
      const turn = ++latest.current;
      let shown = false;
      const flip = (to: boolean) =>
        mutate<LoadedCardPageLists | null>(
          key,
          (cur) => {
            shown = !!cur?.tap;
            return cur?.tap ? { ...cur, tap: withMine(cur.tap, to, me) } : cur;
          },
          { revalidate: false },
        );
      await flip(on);
      try {
        await setTap(cardId, on);
        // Nothing here to flip (an older answer without the tap): the page reads the card again.
        if (!shown) void mutate(key);
        return null;
      } catch (err) {
        if (turn === latest.current) await flip(!on);
        const status = (err as { status?: number }).status;
        const code = (err as { code?: string }).code;
        return status === 403 && code === 'forbidden' ? 'penName' : 'failed';
      }
    },
    [cardId, uid, mutate],
  );
}
