'use client';

import { useEffect, useRef, useState } from 'react';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { BlankPal } from './BlankPal';
import type { Still } from '@/lib/mascots/pals/still';
import styles from './PaperPalsPage.module.css';

export interface ReunionPal {
  still: Still;
  waveArm: 'l' | 'r';
  eyes?: 'open' | 'sleepy';
  phase: number;
}

/** Ms they wave for, once, as the ending comes into view. */
const WAVE_MS = 2600;

/**
 * The page's last picture: the five back together, and a little apart from them a sixth on blank paper — nobody
 * yet, with nothing written on it (BlankPal). Nothing says whose it is. As it comes into view they all wave once.
 * Decoration: the vision's words under it say it.
 */
export function PalsReunion({ pals }: { pals: ReunionPal[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hello, setHello] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    let timer = 0;
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        setHello(true);
        timer = window.setTimeout(() => setHello(false), WAVE_MS);
      },
      { threshold: 0.7 },
    );
    seen.observe(el);
    return () => {
      seen.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <div ref={ref} className={`${styles.lineup} ${styles.reunion}`} data-hello={hello ? '' : undefined} aria-hidden="true">
      {pals.map((p) => (
        <span key={p.still.slug} className={styles.posing} data-pal={p.still.slug}>
          <PaperPalStill still={p.still} waveArm={p.waveArm} eyes={p.eyes} phase={p.phase} />
        </span>
      ))}
      <span className={styles.newcomer}>
        <BlankPal />
      </span>
    </div>
  );
}
