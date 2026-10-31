import type { CSSProperties } from 'react';
import { unitsPerRigUnit } from '@/lib/mascots/pals/still';
import styles from './PaperPalsPage.module.css';

/**
 * The one who isn't anyone yet (the owner's 「X 先生」): a sheet of blank paper, nothing written on it, no pattern,
 * no decoration — and still one of the family, made the way the five are: brass brads at the shoulders, the shared
 * cream mittens, a pencil face (no blush: not decided yet), plain strip legs. It stands beside the five at the page's
 * end for whoever reads it. Drawn here in the series' rig units (ground y 700), with the cast's own paper recipes
 * (designs/mascots/cast/card/rig.svg's cut card and torn strip); not in the cast, so no stage brings it anywhere else.
 */

/** Rig units: what the drawing covers (the shadow under the ground included), and ground to the top of the sheet. */
const BOX = { x: 180, y: 286, w: 340, h: 434 };
const HEIGHT = 400;
const K = unitsPerRigUnit(HEIGHT);

const SHEET = 'oklch(97.6% 0.006 92)';
const STRIP = 'oklch(87% 0.012 84)';
const SOLE = 'oklch(72% 0.012 78)';
const MITTEN = 'oklch(93% 0.026 86)';
const PENCIL = 'oklch(29% 0.018 60)';

export function BlankPal() {
  const frame = {
    width: `calc(var(--unit) * ${(BOX.w * K).toFixed(4)})`,
    height: `calc(var(--unit) * ${(BOX.h * K).toFixed(4)})`,
    marginBottom: `calc(var(--unit) * ${((BOX.y + BOX.h - 700) * K).toFixed(4)} * -1)`,
  } as CSSProperties;
  return (
    <span className={styles.blankPal} style={frame} aria-hidden="true">
      <svg viewBox={`0 0 ${BOX.w} ${BOX.h}`} width="100%" height="100%">
        <defs>
          {/* card stock cut with scissors: the white fibre rim, the glue shadow down-right, a faint mottle */}
          <filter id="bk-card" filterUnits="userSpaceOnUse" x="100" y="240" width="500" height="520" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={2} seed={23} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={1.4} xChannelSelector="R" yChannelSelector="G" result="cut" />
            <feMorphology in="cut" operator="dilate" radius={1.6} result="fat" />
            <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves={1} seed={8} result="fn" />
            <feDisplacementMap in="fat" in2="fn" scale={1.8} result="fibre" />
            <feFlood floodColor="oklch(99% 0.006 90)" />
            <feComposite in2="fibre" operator="in" result="rim" />
            <feGaussianBlur in="fat" stdDeviation={3} />
            <feOffset dx={2.5} dy={4.5} result="off" />
            <feFlood floodColor="oklch(28% 0.03 55)" floodOpacity={0.24} />
            <feComposite in2="off" operator="in" result="shadow" />
            <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves={3} seed={5} result="m" />
            <feColorMatrix in="m" type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.89  0 0 0 0 0.86  0.3 0 0 0 -0.14" result="mottle" />
            <feComposite in="mottle" in2="cut" operator="in" result="mottles" />
            <feMerge>
              <feMergeNode in="shadow" />
              <feMergeNode in="rim" />
              <feMergeNode in="cut" />
              <feMergeNode in="mottles" />
            </feMerge>
          </filter>
          {/* torn strips and soles */}
          <filter id="bk-torn" filterUnits="userSpaceOnUse" x="100" y="240" width="500" height="520" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves={2} seed={7} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={3.2} xChannelSelector="R" yChannelSelector="G" result="torn" />
            <feMorphology in="torn" operator="dilate" radius={1.4} result="fat" />
            <feFlood floodColor="oklch(97.5% 0.012 85)" />
            <feComposite in2="fat" operator="in" result="rim" />
            <feGaussianBlur in="fat" stdDeviation={2.4} />
            <feOffset dx={2} dy={3.5} result="off" />
            <feFlood floodColor="oklch(28% 0.03 55)" floodOpacity={0.2} />
            <feComposite in2="off" operator="in" result="shadow" />
            <feMerge>
              <feMergeNode in="shadow" />
              <feMergeNode in="rim" />
              <feMergeNode in="torn" />
            </feMerge>
          </filter>
          <radialGradient id="bk-shadow">
            <stop offset="0" stopColor="oklch(30% 0.02 60)" stopOpacity="0.2" />
            <stop offset="1" stopColor="oklch(30% 0.02 60)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bk-brad" cx="0.38" cy="0.35">
            <stop offset="0" stopColor="oklch(90% 0.05 92)" />
            <stop offset="0.45" stopColor="oklch(74% 0.085 82)" />
            <stop offset="1" stopColor="oklch(56% 0.07 70)" />
          </radialGradient>
        </defs>
        <g transform={`translate(${-BOX.x} ${-BOX.y})`}>
          <ellipse cx={350} cy={702} rx={112} ry={13} fill="url(#bk-shadow)" />
          {/* legs: plain strips, a darker sole each */}
          <g filter="url(#bk-torn)">
            <path d="M311 590 L333 590 L331 690 L313 690 Z" fill={STRIP} />
            <path d="M367 590 L389 590 L387 690 L369 690 Z" fill={STRIP} />
            <path d="M295 686 Q296 680 322 680 Q342 680 342 691 Q341 699 318 699 Q294 699 295 686 Z" fill={SOLE} />
            <path d="M358 686 Q359 680 384 680 Q405 680 405 691 Q404 699 381 699 Q357 699 358 686 Z" fill={SOLE} />
          </g>
          {/* arms behind the sheet, out from under its edge: the right one waves on hello */}
          <g className={styles.blankArmL}>
            <path d="M262 470 L214 545 L196 534 L247 462 Z" fill={STRIP} filter="url(#bk-torn)" />
            <g filter="url(#bk-torn)">
              <circle cx={203} cy={556} r={22} fill={MITTEN} />
              <ellipse cx={222} cy={545} rx={7} ry={10} transform="rotate(35 222 545)" fill={MITTEN} />
            </g>
          </g>
          <g className={styles.blankArmR}>
            <path d="M438 470 L486 545 L504 534 L453 462 Z" fill={STRIP} filter="url(#bk-torn)" />
            <g filter="url(#bk-torn)">
              <circle cx={497} cy={556} r={22} fill={MITTEN} />
              <ellipse cx={478} cy={545} rx={7} ry={10} transform="rotate(-35 478 545)" fill={MITTEN} />
            </g>
          </g>
          {/* the sheet: blank */}
          <path
            d="M252 300 Q350 294 448 301 Q470 302 471 324 Q474 450 470 578 Q469 598 448 599 Q350 604 252 598 Q231 597 230 576 Q226 450 230 322 Q231 301 252 300 Z"
            fill={SHEET}
            filter="url(#bk-card)"
          />
          {/* brads, set in from the edge */}
          {[262, 438].map((x) => (
            <g key={x}>
              <circle cx={x + 1.5} cy={472.5} r={8.5} fill="oklch(30% 0.02 60)" opacity={0.18} />
              <circle cx={x} cy={470} r={8} fill="url(#bk-brad)" stroke="oklch(50% 0.06 68)" strokeWidth={1.2} />
              <circle cx={x - 2.5} cy={467.5} r={1.8} fill="oklch(95% 0.035 92)" />
            </g>
          ))}
          {/* a pencil face: two eyes with a glint each, a small mouth; no blush yet */}
          <g className={styles.blankEyes}>
            <ellipse cx={318} cy={418} rx={8} ry={10.5} fill={PENCIL} />
            <ellipse cx={382} cy={418} rx={8} ry={10.5} fill={PENCIL} />
            <circle cx={320.5} cy={414} r={2.4} fill="oklch(98% 0.01 85)" />
            <circle cx={384.5} cy={414} r={2.4} fill="oklch(98% 0.01 85)" />
          </g>
          <path d="M341 446 Q350 453 359 446" fill="none" stroke={PENCIL} strokeWidth={3} strokeLinecap="round" />
        </g>
      </svg>
    </span>
  );
}
