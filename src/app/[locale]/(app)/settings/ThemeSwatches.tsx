'use client';

import { useMemo, useRef, type KeyboardEvent } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { wobCircle } from '@/lib/design/wobCircle';
import { INK, INK_STRONG } from '@/lib/design/strokes';
import { ACCENTS, cssOklch, paletteFor, type Accent } from '@/lib/design/palette';
import { useAppearance } from '@/lib/design/useAppearance';
import styles from './ThemeSwatches.module.css';

/** A swatch's box: its paper disc, and room around it for the chosen ring's wobble. */
const BOX = 64;
const C = BOX / 2;

export interface ThemeSwatchesProps {
  value: Accent;
  onChange: (accent: Accent) => void;
  /** Each theme's name (赤陶 · 鼠尾草 · 薰衣草 · 金黃). */
  names: Record<Accent, string>;
  /** What the group is (主題色), for a screen reader. */
  label: string;
}

/**
 * Settings → 外觀's 主題色: one hand-drawn disc per theme — the theme's paper
 * with its accent laid on it, as the scheme the page wears now draws them
 * (a dark page shows each theme's night paper) — its name under it. A radio
 * group: the chosen one is ringed in the focus pen and ticked; the arrow keys
 * move the choice, as radios do, and Tab reaches the chosen one.
 */
export function ThemeSwatches({ value, onChange, names, label }: ThemeSwatchesProps) {
  const { scheme } = useAppearance();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shapes = useMemo(
    () =>
      ACCENTS.map((_, i) => ({
        paper: wobCircle(C, C, 23, 401 + i * 17, { segments: 7, mag: 0.9 }),
        accent: wobCircle(C, C, 11.5, 433 + i * 13, { segments: 6, mag: 0.7 }),
        ring: wobCircle(C, C, 29, 467 + i * 11, { segments: 8, mag: 1.1 }),
      })),
    [],
  );
  const colours = useMemo(
    () =>
      ACCENTS.map((a) => {
        const p = paletteFor(a, scheme);
        return { paper: cssOklch(p['color-cream']), accent: cssOklch(p['color-terracotta']), label: cssOklch(p['color-cream']) };
      }),
    [scheme],
  );

  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (i + step + ACCENTS.length) % ACCENTS.length;
    onChange(ACCENTS[next]);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={styles.group}>
      {ACCENTS.map((a, i) => {
        const chosen = a === value;
        return (
          <button
            key={a}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={chosen ? 0 : -1}
            className={styles.swatch}
            data-chosen={chosen || undefined}
            onClick={() => onChange(a)}
            onKeyDown={(e) => move(e, i)}
          >
            <span className={styles.disc}>
              <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden="true">
                <path d={shapes[i].paper} fill={colours[i].paper} stroke="var(--field-border-hover)" strokeWidth={INK} strokeLinejoin="round" />
                <path d={shapes[i].accent} fill={colours[i].accent} />
                {chosen && (
                  <path d={shapes[i].ring} fill="none" stroke="var(--field-border-focus)" strokeWidth={INK_STRONG} strokeLinecap="round" />
                )}
              </svg>
              {chosen && (
                <span className={styles.tick}>
                  <Icon name="check" size={14} color={colours[i].label} />
                </span>
              )}
            </span>
            <span className={styles.name}>{names[a]}</span>
          </button>
        );
      })}
    </div>
  );
}
