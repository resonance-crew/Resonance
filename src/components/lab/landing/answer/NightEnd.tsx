'use client';

import { Fragment, useMemo, useRef, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Divider } from '@/components/atoms/Divider/Divider';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { GetTheApp } from '@/components/molecules/GetTheApp/GetTheApp';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { titleClauses } from '@/components/sections/CTASection/CTASection';
import { Link } from '@/i18n/navigation';
import { makePrng } from '@/lib/design/prng';
import { edgePoints, EDGE_VIEW_W, type EdgeSpec } from '@/lib/design/sectionEdge';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';
import type { Ledge } from '@/lib/mascots/types';
import type { Still } from '@/lib/mascots/pals/still';
import { copyFor } from './copy';
import { LinkButton } from './LinkButton';
import { RestToggle, useAnswered } from './rest';
import { useSoloStage, type SoloBuild } from './useSolo';
import s from './night.module.css';

/** The night's wave, where the stories' paper runs down into it. */
const EDGE: EdgeSpec = { seed: 509, height: 96, amplitude: 0.16, steps: 12 };
/** Where 摺摺 stands on it, a fraction of the width: near the folded corner. */
const TUCK_AT = 0.7;
const TUCK_AT_PHONE = 0.62;

/** The wave's y (its box's px) at a fraction of the width, as SectionEdge draws it at that width. */
function waveY(width: number | null, frac: number): number {
  const pts = edgePoints(EDGE, width);
  const x = frac * EDGE_VIEW_W;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= x) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return pts[pts.length - 1][1];
}

/** 摺摺's place: a spot on the wave, popped up at (its stage's layer is the wave's box and the air over it). */
function tuckBuild(win: Window, root: HTMLElement): SoloBuild | null {
  const box = root.getBoundingClientRect();
  if (box.width <= 0) return null;
  const air = box.height - EDGE.height;
  const frac = box.width < 640 ? TUCK_AT_PHONE : TUCK_AT;
  const x = Math.round(box.width * frac);
  const y = Math.round(air + waveY(box.width, frac) + 1);
  const spot: Ledge = { id: 'wave', kind: 'spot', x, y, stance: 'stand', enter: 'pop', acts: ['wave', 'reveal', 'look', 'stretch'] };
  return { box: { x: 0, y: 0, w: box.width, h: box.height }, ledges: [spot], first: { ledge: 'wave', slug: 'tuck', acts: ['wave', 'reveal'] } };
}

/** 悄悄's: napping on the pen line under its own words, 「晚安，再讀一個就好」 (it twinkles first, as it arrives). */
function hushBuild(win: Window, root: HTMLElement): SoloBuild | null {
  const box = root.getBoundingClientRect();
  if (box.width <= 0) return null;
  const y = Math.round(box.height - 12);
  const x = Math.round(box.width / 2);
  const ledges: Ledge[] = [
    { id: 'nap', kind: 'spot', x, y, stance: 'floor', enter: 'pop', acts: ['nap', 'twinkle', 'look'], ink: { light: 'light', dark: 'light' }, prefer: ['night'] },
  ];
  return { box: { x: 0, y: 0, w: box.width, h: box.height }, ledges, first: { ledge: 'nap', slug: 'night', acts: ['twinkle', 'nap'] } };
}

/** Pinprick stars, placed once (the same on the server and the client). */
function Stars({ seed, count }: { seed: number; count: number }) {
  const stars = useMemo(() => {
    const r = makePrng(seed);
    return Array.from({ length: count }, (_, i) => ({ x: r() * 100, y: r() * 100, s: 1 + r() * 1.6, tw: i % 5 === 0, d: r() * 4 }));
  }, [seed, count]);
  return (
    <div className={s.stars} aria-hidden="true">
      {stars.map((st, i) => (
        <i
          key={i}
          className={st.tw ? s.twinkle : undefined}
          data-loop={st.tw ? '' : undefined}
          style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${-st.d}s` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** The band's folded corner: a dog-ear that lifts as the band reaches the middle of the view, over three pencil lines. */
function Corner({ top }: { top: number }) {
  return (
    <div className={s.corner} style={{ top } as CSSProperties} aria-hidden="true">
      <svg className={s.cornerUnder} viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M2,0 L100,0 L100,98 Z" className={s.cornerGone} />
        <path d="M14,54 C22,52 30,56 40,53 M10,68 C20,66 32,70 46,67 M8,82 C18,80 26,84 34,81" fill="none" className={s.pencil} strokeWidth={INK_LIGHT} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={s.flap}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M1,1 L99,99 L3,97 Z" className={s.flapPaper} strokeWidth={INK} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d="M14,72 C26,70 36,74 52,71 M12,84 C22,82 30,86 40,83" fill="none" className={s.flapLines} strokeWidth={INK_LIGHT} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
}

/**
 * The ending, at night: a few folded lines of the visitor's own (摺摺, standing on the band's wave, lifts its corner
 * just as the band's corner lifts), write or read; it remembers what the visitor answered above.
 */
export function NightBand({ locale, still }: { locale: string; still: Still }) {
  const c = copyFor(locale);
  const said = useAnswered();
  const bandRef = useRef<HTMLElement>(null);
  const tuckRef = useRef<HTMLDivElement>(null);
  const { w } = useElementSize(bandRef);
  const width = w || null;
  const frac = width !== null && width < 640 ? TUCK_AT_PHONE : TUCK_AT;
  const live = useSoloStage(tuckRef, { slug: 'tuck', build: tuckBuild, rootMargin: '0px 0px -50% 0px', threshold: 0 });
  const clauses = titleClauses(c.night.title);
  const short = said && said.length > 22 ? `${said.slice(0, 22)}…` : said;
  return (
    <section ref={bandRef} className={s.band} data-night="" aria-labelledby="night-title">
      <SectionEdge topColor="var(--color-cream-dark)" {...EDGE} stroke="var(--night-edge-pen)" strokeWidth={INK_LIGHT} />
      {/* its top on the wave where the wave meets the band's right side: the corner folded away shows the paper above */}
      <Corner top={Math.round(waveY(width, 0.999) - 3)} />
      <Stars seed={17} count={46} />
      {/* 摺摺's place: the wave's box and the air over it */}
      <div ref={tuckRef} className={s.tuckZone} aria-hidden="true">
        <span
          className={s.tuckStill}
          data-gone={live ? '' : undefined}
          style={{ left: `${frac * 100}%`, top: `calc(100% - ${EDGE.height}px + ${waveY(width, frac).toFixed(1)}px)` } as CSSProperties}
        >
          <PaperPalStill still={still} waveArm="l" phase={0.8} />
        </span>
      </div>

      <div className={s.cta}>
        <h2 id="night-title" className={s.title}>
          {clauses.map((clause, i) => (
            <Fragment key={i}>
              {i > 0 && clauses[0].endsWith(',') && ' '}
              <span className={s.clause}>{clause}</span>
            </Fragment>
          ))}
        </h2>
        <p className={s.line}>
          {(short ? c.night.answered(short) : c.night.line).split(/(?<=——|— )/).map((part) => (
            <span key={part} className={s.clause}>
              {part}
            </span>
          ))}
        </p>
        <div className={s.buttons}>
          <LinkButton href="/write">{said ? c.night.finish : c.night.write}</LinkButton>
          <LinkButton href="/home" variant="tonal">
            {c.night.read}
          </LinkButton>
        </div>
      </div>
    </section>
  );
}

const LINKS = [
  ['about', '/about'],
  ['pals', '/paper-pals'],
  ['contact', '/support'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
] as const;

/**
 * The same night, as the page's footer, on the band's one axis: the name, 悄悄 napping on the pen line under its own
 * words (「晚安，再讀一個就好 →」, one more story), the app, the small print.
 */
export function NightFooter({ locale, still }: { locale: string; still: Still }) {
  const c = copyFor(locale);
  const t = useTranslations('footer');
  const hushRef = useRef<HTMLDivElement>(null);
  const live = useSoloStage(hushRef, { slug: 'night', build: hushBuild, night: true, threshold: 0.6 });
  return (
    <footer className={s.foot} data-night="">
      <Stars seed={53} count={30} />
      <div className={s.footInner}>
        <div className={s.brand}>
          <ResonanceIcon size={26} />
          <span className={s.brandName}>Resonance</span>
        </div>
        <p className={s.tagline}>{c.night.tagline}</p>
        <div className={s.goodnight}>
          <div className={s.hushLine} aria-hidden="true">
            <Divider seed={613} amplitude={2} steps={10} strokeWidth={INK_LIGHT} spacing={0} color="color-mix(in oklch, var(--color-text-muted) 55%, transparent)" />
          </div>
          <div ref={hushRef} className={s.hushZone} aria-hidden="true">
            <span className={s.hushStill} data-gone={live ? '' : undefined}>
              <PaperPalStill still={still} eyes="sleepy" phase={1.9} />
            </span>
          </div>
          <Link href="/home" className={s.oneMore}>
            {c.night.oneMore} <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={s.download}>
          <GetTheApp qr={false} size="sm" tone="ink" />
          <p className={s.trademarks}>{t('trademarks')}</p>
        </div>
        <nav className={s.links} aria-label="Resonance">
          {LINKS.map(([k, href]) => (
            <Link key={k} href={href} className={s.link}>
              {t(k)}
            </Link>
          ))}
        </nav>
        <p className={s.copyright}>{t('copyright')}</p>
        <RestToggle locale={locale} className={s.rest} />
      </div>
    </footer>
  );
}
