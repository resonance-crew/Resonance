'use client';

import { useCallback, useRef } from 'react';
import { useSWRConfig } from 'swr';
import type { AuthorBody, CardTapBody } from '@/lib/api/v1/schemas';
import type { User } from '@/lib/db/types';
import { setTap, setTapPassage } from '@/lib/db/firestore/client/taps';
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
 * says so: on, their own face first and the others after it; off, their face
 * gone and the others as they were. The list stays whole and `more` stays the
 * server's — it is cut to three (the blank disc after) only where it is drawn
 * (TapFaces' `shownFaces`), so on and off again gives every face back, as the
 * apps do. The card's passages (round 27) stay as they are either way; the reader's pick goes with the tap (the
 * server clears it in the same write), so off leaves none and on again starts without one. What the server answers
 * next replaces it.
 */
export function withMine(tap: CardTapBody, on: boolean, me: AuthorBody): CardTapBody {
  const others = tap.faces.filter((f) => f.id !== me.id);
  const next: CardTapBody = { ...tap, mine: on, faces: on ? [me, ...others] : others };
  if (!on && next.passage != null) next.passage = null;
  // Off takes their pick, and so their face, off the picked sentences too (Wave 2 #3b: readers see them); a sentence
  // left with no one goes. On adds nothing there: there is no pick yet.
  if (!on && tap.picked) {
    const picked = tap.picked
      .map((p) => ({ ...p, people: p.people.filter((f) => f.id !== me.id) }))
      .filter((p) => p.people.length > 0 || p.more);
    if (picked.length) next.picked = picked;
    else delete next.picked;
  }
  return next;
}

/** The tap with the reader's pick set (an id of its passages, or null): the passages themselves untouched. */
export function withPassage(tap: CardTapBody, passage: string | null): CardTapBody {
  return { ...tap, passage };
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
      // The reader's pick before the flip: a refused take-back puts it back with the tap (the server still has it).
      let before: string | null = null;
      await mutate<LoadedCardPageLists | null>(
        key,
        (cur) => {
          shown = !!cur?.tap;
          before = cur?.tap?.passage ?? null;
          return cur?.tap ? { ...cur, tap: withMine(cur.tap, on, me) } : cur;
        },
        { revalidate: false },
      );
      try {
        await setTap(cardId, on);
        // Nothing here to flip (an older answer without the tap): the page reads the card again. Taking it back took
        // the reader off the picked sentences already (withMine); their lists are read again when opened.
        if (!shown) void mutate(key);
        void mutate(pickedListKey(cardId));
        return null;
      } catch (err) {
        if (turn === latest.current) {
          const back = before;
          await mutate<LoadedCardPageLists | null>(
            key,
            (cur) => (cur?.tap ? { ...cur, tap: { ...withMine(cur.tap, !on, me), passage: back } } : cur),
            { revalidate: false },
          );
        }
        const status = (err as { status?: number }).status;
        const code = (err as { code?: string }).code;
        return status === 403 && code === 'forbidden' ? 'penName' : 'failed';
      }
    },
    [cardId, uid, mutate],
  );
}

/** Every cached page of a card's lists of who picked a sentence (PickedPeople's keys), to read again. */
export function pickedListKey(cardId: string) {
  return (key: unknown) => Array.isArray(key) && key[0] === 'taps-picked' && key[1] === cardId;
}

/** Why a pick didn't go through: the card's passages or the tap changed (read the card again, say nothing), or anything else. */
export type PassageFailure = 'gone' | 'failed';

/**
 * Picking a passage on a tap that is on (round 27 §U1.5): the card page's answer (`cardPageKey`) shows the pick at
 * once and the server is asked after; the reader's own list (`['taps', cardId, uid]`) is read again once it is in,
 * so their row quotes it. A 400 or 409 (the passages or the tap changed) reads the card again and says nothing; any
 * other refusal puts back the pick the reader had — the tap itself stays as it is either way.
 */
export function useTapPassage(cardId: string | undefined, uid: string | undefined) {
  const { mutate } = useSWRConfig();
  const latest = useRef(0);
  return useCallback(
    async (passage: string | null): Promise<PassageFailure | null> => {
      if (!cardId || !uid) return 'failed';
      const key = cardPageKey(cardId, uid);
      const turn = ++latest.current;
      let before: string | null = null;
      await mutate<LoadedCardPageLists | null>(
        key,
        (cur) => {
          before = cur?.tap?.passage ?? null;
          return cur?.tap ? { ...cur, tap: withPassage(cur.tap, passage) } : cur;
        },
        { revalidate: false },
      );
      try {
        await setTapPassage(cardId, passage);
        void mutate(['taps', cardId, uid]);
        // The card again (Wave 2 #3b): their sentence's wash and face in the story, and each sentence's list of who
        // picked it, as every reader now sees them.
        if (turn === latest.current) void mutate(key);
        void mutate(pickedListKey(cardId));
        return null;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 400 || status === 409) {
          void mutate(key);
          return 'gone';
        }
        if (turn === latest.current) {
          const back = before;
          await mutate<LoadedCardPageLists | null>(key, (cur) => (cur?.tap ? { ...cur, tap: withPassage(cur.tap, back) } : cur), {
            revalidate: false,
          });
        }
        return 'failed';
      }
    },
    [cardId, uid, mutate],
  );
}
