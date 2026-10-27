'use client';

import { forwardRef, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { PaperSheet } from '@/components/atoms/PaperSheet/PaperSheet';
import { ReactionGlyph } from '@/components/atoms/ReactionGlyph/ReactionGlyph';
import { REACTION_IDS, type ReactionId } from '@/lib/design/reactions';
import { wobCircle } from '@/lib/design/wobCircle';
import styles from './Thread.module.css';

/** The tray's size: five 44 cells on 6 of paper each side — 232 × 52 (round 16 §3). */
export const TRAY_W = 232;
export const TRAY_H = 52;
/** Its corners: a 52-tall sheet at 26 is a pill. */
const TRAY_R = 26;

export interface ReactionTrayProps {
  /** The viewer's reaction to the message now (its cell sits on a wash, `aria-pressed`). */
  current: ReactionId | null;
  /** A sticker was chosen: that one, or null when it was the current one (taken back). */
  onPick: (reaction: ReactionId | null) => void;
  seed: number;
  /**
   * The stickers lie on a paper sheet (a fine pointer's ☺ popover, over the bare thread: the default), or float
   * on their own (round 17 §2.2: over the held message's scrim, which already sets them apart).
   */
  paper?: boolean;
}

/**
 * The five reactions (round 16 §3, §4): ❤️ 🥹 😆 🫂 👍 in that order, each a
 * 44 cell with its sticker at 32, popping in one after another — floating on
 * the held message's scrim (round 17 §2.2), or on a borderless paper sheet
 * (atoms/PaperSheet, with its shadow) where a fine pointer's ☺ opens them
 * over the bare thread. The viewer's own sits on an opaque wobbly disc (the
 * accent's light wash; at night the accent over the raised paper) and is
 * pressed: choosing it again takes it back. A toolbar to the keyboard — one stop in the Tab order,
 * ← → (and Home / End) walking it, starting on the chosen one.
 */
export const ReactionTray = forwardRef<HTMLDivElement, ReactionTrayProps>(function ReactionTray({ current, onPick, seed, paper = true }, ref) {
  const t = useTranslations('messages');
  const [focus, setFocus] = useState(() => Math.max(0, current ? REACTION_IDS.indexOf(current) : 0));
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  // The chosen one's wash: a wobbly disc inset 2 in its 44 cell.
  const disc = useMemo(() => wobCircle(22, 22, 20, seed + 3, { segments: 7, mag: 1.4, cpJitter: 0.5 }), [seed]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = REACTION_IDS.length;
    // From the tray itself (a finger opened it), an arrow first lands on the cell it would start from.
    const onTray = e.target === e.currentTarget;
    const to =
      onTray && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') ? focus
      : e.key === 'ArrowRight' ? (focus + 1) % n
      : e.key === 'ArrowLeft' ? (focus - 1 + n) % n
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : null;
    if (to == null) return;
    e.preventDefault();
    setFocus(to);
    cells.current[to]?.focus();
  };

  return (
    <div
      ref={ref}
      className={styles.tray}
      role="toolbar"
      aria-label={t('reactionsLabel')}
      aria-orientation="horizontal"
      // Focusable itself, for an overlay a finger opened: the reader is in it, and no ring shows under the finger.
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {paper && <PaperSheet w={TRAY_W} h={TRAY_H} R={TRAY_R} seed={seed} />}
      {REACTION_IDS.map((id, i) => {
        const chosen = current === id;
        return (
          <button
            key={id}
            ref={(el) => {
              cells.current[i] = el;
            }}
            type="button"
            className={styles.trayCell}
            style={{ animationDelay: `${i * 20}ms` }}
            aria-label={t(`reactions.${id}`)}
            aria-pressed={chosen}
            tabIndex={i === focus ? 0 : -1}
            onFocus={() => setFocus(i)}
            onClick={() => onPick(chosen ? null : id)}
          >
            {chosen && (
              <svg className={styles.trayWash} width={44} height={44} viewBox="0 0 44 44" aria-hidden="true">
                <path d={disc} />
              </svg>
            )}
            <span className={styles.traySticker}>
              <ReactionGlyph id={id} size={32} />
            </span>
          </button>
        );
      })}
    </div>
  );
});
