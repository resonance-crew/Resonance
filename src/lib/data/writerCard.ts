'use client';

import { useEffect, useRef, useState } from 'react';
import { getCardById } from '@/lib/db/firestore/client/reads';
import { getPendingCardEdit, type PendingCardEdit } from '@/lib/db/firestore/client/cardEdits';
import type { Card } from '@/lib/db/types';

/** What the writer opens on: the card, whole, and a published card's pending edit (its buffered revision). */
export interface WriterCard {
  /** Null: no such card, or not one this viewer may read. */
  card: Card | null;
  pending: PendingCardEdit | null;
}

/**
 * The one way the writer reads a card it opens — its page (`write/[id]`) and
 * the thought map's pane alike (W21): the card and its pending edit side by
 * side, not one after the other. `known` is a copy the caller holds already:
 * a whole card is used as it is; a list summary (the map's, W11) holds an
 * excerpt, never the story, so the card is read whole — an editor handed an
 * excerpt would autosave it over the story.
 *
 * The pending edit is asked for before it is known whether the card is
 * published; its answer counts only for a published card (a draft has none),
 * and only there does its failing fail the read (an editor on the live fields
 * would save over a buffer it couldn't read). Throws when a read fails.
 */
export async function readWriterCard(id: string, known?: Card): Promise<WriterCard> {
  const whole = known && !known.summary ? known : null;
  const askPending = !whole || !!whole.publishedAt;
  const [card, pending] = await Promise.all([
    whole ?? getCardById(id),
    askPending
      ? getPendingCardEdit(id).then(
          (p) => ({ ok: true as const, p }),
          (error: unknown) => ({ ok: false as const, error }),
        )
      : null,
  ]);
  if (!card?.publishedAt || !pending) return { card, pending: null };
  if (!pending.ok) throw pending.error;
  return { card, pending: pending.p };
}

/** {@link useWriterCard}'s answer: undefined while it reads. */
export interface WriterCardState {
  data?: WriterCard;
  /** The read failed (offline…): nothing is known, so no editor — it would save over what it couldn't read. */
  failed: boolean;
  /** Reads again (再試一次). */
  retry: () => void;
}

/**
 * The card a writer opens, read by {@link readWriterCard} — fresh on every
 * opening (each mount, and each new `key`), never from a cache: the editor
 * copies what it is given once and autosaves over the card from there, so a
 * copy from an earlier visit would put older words over what was written
 * since. `key` names the opening (the card and the viewer); null: not yet.
 */
export function useWriterCard(key: string | null, id: string | undefined, known?: Card): WriterCardState {
  const [read, setRead] = useState<{ key: string; attempt: number; data?: WriterCard; failed?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const knownRef = useRef(known);
  knownRef.current = known;
  useEffect(() => {
    if (!key || !id) return;
    let live = true;
    readWriterCard(id, knownRef.current).then(
      (data) => live && setRead({ key, attempt, data }),
      () => live && setRead({ key, attempt, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [key, id, attempt]);
  // Only what was read for this opening, on this attempt.
  const mine = read && read.key === key && read.attempt === attempt ? read : null;
  return { data: mine?.data, failed: !!mine?.failed, retry: () => setAttempt((n) => n + 1) };
}
