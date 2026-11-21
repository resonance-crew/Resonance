'use client';

import { useLocale, useTranslations } from 'next-intl';
import { AVATAR_STEP, AvatarGroup } from '@/components/atoms/AvatarGroup/AvatarGroup';
import type { TapPickedBody } from '@/lib/api/v1/schemas';
import type { StoryScript } from '@/lib/text/script';
import { facesNames, memberOf } from './TapFaces';
import styles from './PassageFaces.module.css';

/**
 * Round 29 §S1–§S2: the faces of who picked a sentence of the author's own story — one group per washed sentence,
 * the house stack overlapped (each face 0.66 of its size after the one before, the first on top), at most three
 * faces and nothing after them (no blank disc, no number: the pop-up says who else). Where the group stands is
 * decided by the white right of the story's column: the right margin when there is room, else in the line after
 * the sentence's last character. The pure rules here are the ones the apps port (PassageMarksTests,
 * PassageMarksTest).
 */

/** The white right of the column, to the contents rail or the window's edge, from which the faces stand in the margin. */
export const PASSAGE_MARGIN_MIN = 70;
/** The group's left edge, right of the column's right edge, in the margin. */
export const PASSAGE_MARGIN_GAP = 8;
/** At most this many faces in a group, and nothing after them (§S2). */
export const PASSAGE_FACES_MAX = 3;
/** A face, at 1× (§S2). */
export const PASSAGE_FACE = 24;
/** A face in a Latin-script story on a compact window, where the line box is 28.8. */
export const PASSAGE_FACE_LATIN_COMPACT = 22;
/** The wash is the line box less this, so two lines' pieces never touch (§U2.1). */
export const PASSAGE_WASH_INSET = 6;
/** The wash reaches this far past a line's first and last glyph (§U2.1). */
export const PASSAGE_WASH_OUT = 2;

export type PassagePlacement = 'margin' | 'inline';

/** The white right of the column: to the rail when one stands (always 80), else to the window's edge. */
export function passageRoom(m: { columnRight: number; windowWidth: number; railLeft?: number | null }): number {
  return m.railLeft != null ? m.railLeft - m.columnRight : m.windowWidth - m.columnRight;
}

/** The right margin when its white is ≥ 70; in the line everywhere else (every phone, windows under 820 with no rail). */
export function passagePlacement(room: number): PassagePlacement {
  return room >= PASSAGE_MARGIN_MIN ? 'margin' : 'inline';
}

/** How wide a group of `n` overlapped faces is: 24 / 39.8 / 55.7 at 24. */
export function passageGroupWidth(n: number, size: number): number {
  return n <= 0 ? 0 : size * (1 + (n - 1) * (1 - AVATAR_STEP));
}

/**
 * A face's size (§S2): 24; 22 in a Latin-script story on a compact window; in the margin never so big that three
 * would come within 6 of the rail or the window's edge — `(room − 14) ÷ 2.32`, three overlapped faces being 2.32 of
 * one (the web's reading scale is 1, so beside a rail it stays 24).
 */
export function passageFaceSize(m: { placement: PassagePlacement; script: StoryScript; compact: boolean; room: number }): number {
  const base = m.script === 'latin' && m.compact ? PASSAGE_FACE_LATIN_COMPACT : PASSAGE_FACE;
  if (m.placement === 'inline') return base;
  const fit = (m.room - PASSAGE_MARGIN_GAP - 6) / passageGroupWidth(PASSAGE_FACES_MAX, 1);
  return Math.min(base, fit);
}

/**
 * The groups' centres in the margin, in the story's order: each on the line where its wash ends, a later one moved
 * down a line box where two would share a line (`y[i] = max(y[i], y[i-1] + lineBox)`).
 */
export function marginCentres(ends: readonly { y: number; lineBox: number }[]): number[] {
  const out: number[] = [];
  ends.forEach((e, i) => {
    out.push(i === 0 ? e.y : Math.max(e.y, out[i - 1] + ends[i - 1].lineBox));
  });
  return out;
}

export interface WashRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The wash under a sentence (§U2.1): one piece per line it runs on — its pieces of one line (cut at bold, a link, a
 * latin mark) joined into one — from its first glyph to its last on that line and 2 past each end, the line box
 * less 6 tall, centred on the line (an inline box's leading is split evenly above and below it). Rects in the
 * story's own coordinates, in the order the browser gives them (the story's).
 */
export function washPieces(rects: readonly { left: number; top: number; right: number; bottom: number; lineBox: number }[]): WashRect[] {
  const lines: { left: number; right: number; mid: number; lineBox: number }[] = [];
  for (const r of rects) {
    if (r.right - r.left <= 0) continue;
    const mid = (r.top + r.bottom) / 2;
    const same = lines.find((l) => Math.abs(l.mid - mid) < l.lineBox / 2);
    if (same) {
      same.left = Math.min(same.left, r.left);
      same.right = Math.max(same.right, r.right);
    } else {
      lines.push({ left: r.left, right: r.right, mid, lineBox: r.lineBox });
    }
  }
  return lines.map((l) => {
    const h = Math.max(l.lineBox - PASSAGE_WASH_INSET, 0);
    return { x: l.left - PASSAGE_WASH_OUT, y: l.mid - h / 2, w: l.right - l.left + 2 * PASSAGE_WASH_OUT, h };
  });
}

/** What a screen reader hears for a group: the faces' pen names, and that there are others when there are. */
export function passageFacesLabel(
  picked: Pick<TapPickedBody, 'people' | 'more'>,
  locale: string,
  words: { by: (names: string) => string; byMore: (names: string) => string },
): string {
  const names = facesNames(picked.people.slice(0, PASSAGE_FACES_MAX), undefined, locale);
  return picked.more ? words.byMore(names) : words.by(names);
}

export interface PassageFacesProps {
  picked: TapPickedBody;
  size: number;
  placement: PassagePlacement;
  onOpen: (id: string) => void;
  /** In the margin: where the group's centre stands, from the story's top. */
  top?: number;
}

/** One group: a button (its hit area 44 × 44 round it), opening the sentence's people (PickedPeople). */
export function PassageFaces({ picked, size, placement, onOpen, top }: PassageFacesProps) {
  const t = useTranslations('card.tap');
  const locale = useLocale();
  const label = passageFacesLabel(picked, locale, {
    by: (names) => t('pickedBy', { names }),
    byMore: (names) => t('pickedByMore', { names }),
  });
  const people = picked.people.slice(0, PASSAGE_FACES_MAX);
  if (!people.length) return null;
  return (
    <button
      type="button"
      className={styles.group}
      data-placement={placement}
      data-passage-faces={picked.id}
      aria-label={label}
      aria-haspopup="dialog"
      style={top != null ? { top: top - size / 2 } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(picked.id);
      }}
    >
      <AvatarGroup members={people.map(memberOf)} max={PASSAGE_FACES_MAX} size={size} />
    </button>
  );
}
