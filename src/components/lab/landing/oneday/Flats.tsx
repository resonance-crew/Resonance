import { pointsToBezier } from '@/lib/design/wavyPath';
import { INK_LIGHT } from '@/lib/design/strokes';
import { VIEW_H, VIEW_W, fillUnder, flatPoints, floorPoints } from './floor';
import styles from './oneday.module.css';

/**
 * A scene's foot: two paper flats in the colours between this scene's paper and the next one's, wavy as the brand's
 * section edges, sliding past each other with the scroll (CSS, scroll-driven); in front of them the floor, the next
 * scene's paper under a pen line the puppets stand on. Decoration: aria-hidden. Server-drawn, the same at every width.
 */
export function Flats({ seed, from, to, tint, pen = 'var(--soft-pen)', className }: {
  seed: number;
  from: string;
  to: string;
  /** The time of day the back flat carries a little of (a palette token). */
  tint?: string;
  pen?: string;
  className?: string;
}) {
  const back2 = flatPoints(seed + 11, 20, 11, 8);
  const back1 = flatPoints(seed + 23, 46, 9, 10);
  const floor = floorPoints(seed);
  const mix = (k: number) => `color-mix(in oklab, ${to} ${k}%, ${from})`;
  const back2Fill = tint ? `color-mix(in oklab, ${tint} 22%, ${mix(34)})` : mix(34);
  const back1Fill = tint ? `color-mix(in oklab, ${tint} 12%, ${mix(68)})` : mix(68);
  const edge = (p: string, op: number) => `color-mix(in oklch, ${p} ${op}%, transparent)`;
  return (
    <div className={`${styles.flats} ${className ?? ''}`} data-flats="" aria-hidden="true">
      <svg className={`${styles.flat} ${styles.flatBack2}`} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none">
        <path d={fillUnder(back2)} fill={back2Fill} />
        <path d={pointsToBezier(back2)} fill="none" stroke={edge(pen, 28)} strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" />
      </svg>
      <svg className={`${styles.flat} ${styles.flatBack1}`} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none">
        <path d={fillUnder(back1)} fill={back1Fill} />
        <path d={pointsToBezier(back1)} fill="none" stroke={edge(pen, 32)} strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" />
      </svg>
      <svg className={`${styles.flat} ${styles.flatFront}`} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none">
        <path d={fillUnder(floor)} fill={to} />
        <path d={pointsToBezier(floor)} fill="none" stroke={edge(pen, 62)} strokeWidth={INK_LIGHT} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
