'use client';

import { useTranslations } from 'next-intl';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ReactionGlyph } from '@/components/atoms/ReactionGlyph/ReactionGlyph';
import type { ReactionCount } from '@/lib/chat/message';
import styles from './Thread.module.css';

/** A chip's height and its sticker (round 16 §3): 18 on 4 of paper. */
const CHIP_H = 26;
const STICKER = 18;
/** A second distinct reaction steps this much further out. */
const STEP = 20;
/** The width the「2」of a reaction both gave adds. */
const COUNT_W = 11;
/** How far over the bubble's edge the chip lies. */
export const CHIP_OVERLAP = 6;

/** A chip's width for these reactions. */
export function chipWidth(counts: readonly ReactionCount[]): number {
  if (!counts.length) return 0;
  return CHIP_H + (counts.length - 1) * STEP + (counts.some((c) => c.count > 1) ? COUNT_W : 0);
}

export interface ReactionChipsProps {
  counts: readonly ReactionCount[];
  /** The message is the viewer's own (the chip lies left of its bubble; theirs, right). */
  own: boolean;
  otherHandle: string;
  seed: number;
  /** A tap on the chip: the overlay for its message (null for the lifted copy, which shows it only). */
  onOpen: ((el: HTMLElement, byKeyboard: boolean) => void) | null;
}

/**
 * A message's reactions (round 16 §3): a paper capsule in the gutter beside
 * the bubble's foot — never under it, so a reaction never changes the row's
 * height — toward the middle of the thread (own: left of the bubble, theirs:
 * right), its foot on the bubble's, lying 6 over its edge. Cream with a 2 px
 * ring of the thread's paper (a second, larger wob behind it) and no pen
 * line; each distinct reaction's sticker at 18, a second one 20 further out;
 * the same reaction from both, its sticker and a quiet「2」. A tap opens the
 * message's overlay. Its name says who reacted with what.
 */
export function ReactionChips({ counts, own, otherHandle, seed, onOpen }: ReactionChipsProps) {
  const t = useTranslations('messages');
  if (!counts.length) return null;
  const w = chipWidth(counts);
  const label = counts
    .flatMap((c) => {
      const reaction = t(`reactions.${c.id}`);
      const theirs = c.count > (c.mine ? 1 : 0);
      return [...(c.mine ? [t('reactedYou', { reaction })] : []), ...(theirs ? [t('reactedThem', { handle: otherHandle, reaction })] : [])];
    })
    .join(', ');
  const body = (
    <>
      <HandDrawnBorder w={w + 4} h={CHIP_H + 4} R={(CHIP_H + 4) / 2} seed={seed + 11} fillColor="var(--color-cream)" />
      <span className={styles.chipFace}>
        <HandDrawnBorder w={w} h={CHIP_H} R={CHIP_H / 2} seed={seed} fillColor="var(--color-cream)" />
      </span>
      <span className={styles.chipStickers} data-own={own || undefined}>
        {counts.map((c) => (
          <span key={c.id} className={styles.chipSticker}>
            <ReactionGlyph id={c.id} size={STICKER} />
            {c.count > 1 && <span className={styles.chipCount}>{c.count}</span>}
          </span>
        ))}
      </span>
    </>
  );
  const style = { width: w + 4, height: CHIP_H + 4 };
  return onOpen ? (
    <button
      type="button"
      className={styles.chips}
      data-own={own || undefined}
      style={style}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(e.currentTarget, e.detail === 0);
      }}
    >
      {body}
    </button>
  ) : (
    <span className={styles.chips} data-own={own || undefined} style={style} aria-hidden="true">
      {body}
    </span>
  );
}
