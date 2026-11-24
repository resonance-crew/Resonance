'use client';

import { useEffect, useState } from 'react';

/**
 * The tap lists' family (round 33 §Q1–§Q3): who resonated — the reader's (TapFaces) and the author's (AuthorTaps) —
 * and who picked one sentence (PickedPeople); the passages' dialog (TapPassages) shares its paper and its floating way
 * out. One place for what they must agree on, so no one of them drifts again.
 */

/**
 * How long a list's dialog waits for its first page before it opens on stand-ins (round 32 §P3, round 33 §Q1 for the
 * whole family — the apps' `firstPageWait` / `PICKED_OPEN_WAIT_MS`): an answer inside it opens the dialog whole, its
 * notes' and quotes' lines included, at its final height; a slower one opens on as many stand-ins as will come.
 */
export const TAP_LIST_HOLD_MS = 300;

/**
 * The family's paper (round 33 §Q2): 24 above and at each side (it was 28 a side, 22–32 above), nothing below — the
 * scroll region reaches the paper's bottom and keeps its own room there for the floating way out (§Q3).
 */
export const TAP_DIALOG_PADDING = '24px 24px 0';

/**
 * How many rows a list will open with, known before it answers (round 32 §P3, round 33 §Q1): the faces already on
 * the page — the faces' line above the capsule, the author's line, a picked sentence's mark — at most 3; three when
 * there are others past them (`more`: a first page holds at least that many). Never under 1 (a line is drawn only
 * when someone is on it) and never a default count.
 */
export function tapRowsKnown(known: { people?: readonly unknown[] | null; more?: boolean | null }): number {
  return Math.max(1, Math.min(3, known.people?.length ?? 0) || (known.more ? 3 : 1));
}

/**
 * Whether a list's dialog may be drawn yet (§Q1): at once when its first page is here (`ready`), else once
 * {@link TAP_LIST_HOLD_MS} has passed since it was asked for — then on its stand-ins.
 */
export function useTapListHold(ready: boolean): boolean {
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), TAP_LIST_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return ready || waited;
}
