'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { GetTheApp } from '@/components/molecules/GetTheApp/GetTheApp';
import { Link } from '@/i18n/navigation';
import { makePrng } from '@/lib/design/prng';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { pointsToBezier } from '@/lib/design/wavyPath';
import { Clauses } from './Clauses';
import { copyFor } from './copy';
import { FLOOR_SEED, VIEW_H, VIEW_W, floorPoints } from './floor';
import { HUSH_OUTLINE, HUSH_TORSO_BOX } from './hushOutline';
import { PalAt } from './PalAt';
import { PillLink } from './PillLink';
import { RestToggle } from './RestToggle';
import type { Stills } from './tiles';
import { stagedAttrs, useScene } from './useScene';
import styles from './oneday.module.css';

const LINKS = [
  ['about', '/about'],
  ['pals', '/paper-pals'],
  ['contact', '/support'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
] as const;

/** The curtain call, left to right: who waves first, the arm on the row's outside. 悄悄 bows last, under its hole. */
const CALL: { slug: 'dot' | 'tuck' | 'tag' | 'card'; arm: 'l' | 'r' }[] = [
  { slug: 'dot', arm: 'l' },
  { slug: 'tuck', arm: 'l' },
  { slug: 'tag', arm: 'r' },
  { slug: 'card', arm: 'r' },
];

/** Ms between two of them waving, and how long each waves. */
const TURN_MS = 320;
const WAVE_MS = 2400;

type Star = { x: number; y: number; s: number; i: number };

/**
 * Pinpricks in the night paper, the same on every render (seeded), kept off the words: some in the sky above the
 * heading (`top`), some at the band's sides beside the centred words (`side`: a phone has no sides, so none), the
 * rest in the sky over the curtain call (`call`).
 */
function useStars() {
  return useMemo(() => {
    const r = makePrng(977);
    const size = () => (r() < 0.18 ? 3 : r() < 0.55 ? 2 : 1.5);
    let i = 0;
    const make = (n: number, x: () => number, y: () => number): Star[] =>
      Array.from({ length: n }, () => ({ x: x(), y: y(), s: size(), i: i++ }));
    const top = make(12, () => r() * 100, () => 10 + r() * 80);
    const side = make(12, () => (r() < 0.5 ? r() * 17 : 83 + r() * 17), () => Math.pow(r(), 1.2) * 100);
    const call = make(10, () => 4 + r() * 92, () => r() * 100);
    return { top, side, call };
  }, []);
}

function Stars({ stars, className }: { stars: Star[]; className: string }) {
  return (
    <span className={className} aria-hidden="true">
      {stars.map((s) => (
        <span key={s.i} className={styles.star} style={{ left: `${s.x}%`, top: `${s.y}%`, '--s': `${s.s}px`, '--i': s.i } as CSSProperties} />
      ))}
    </span>
  );
}

/**
 * The hole in the sky 悄悄 was cut from: its own outline at its own size, right above it, a dashed cut line round the
 * dusk paper showing through from behind the night.
 */
function Hole() {
  const b = HUSH_TORSO_BOX;
  return (
    <svg className={styles.hole} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} aria-hidden="true">
      <path d={HUSH_OUTLINE} fill="var(--night-hole)" />
      <path d={HUSH_OUTLINE} fill="none" stroke="var(--night-cut)" strokeWidth={INK} strokeDasharray="6 5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Night · the curtain call, and the footer in the same night (a band colour-fixed in both schemes, as /paper-pals'
 * 悄悄's): pinprick stars come out one by one as it scrolls in, beside a crescent cut from paper and a 悄悄-shaped hole
 * where 悄悄 was cut out of the sky. The five stand on the floor and wave in turn; 悄悄 last, under its hole, twinkles
 * and dozes off. Its line is a link to one more story.
 */
export function Night({ locale, stills }: { locale: string; stills: Stills }) {
  const c = copyFor(locale).night;
  const t = useTranslations('footer');
  const root = useRef<HTMLDivElement>(null);
  const call = useRef<HTMLDivElement>(null);
  const [turn, setTurn] = useState(-1);
  const stars = useStars();
  const scene = useScene(root, () => import('./scenes').then((m) => m.nightScene(CALL.length * TURN_MS + 300)), undefined);
  const floor = floorPoints(FLOOR_SEED.call);

  // As the row comes into view they wave in turn, once (CSS: data-hello on each still).
  useEffect(() => {
    const el = call.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timers: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        CALL.forEach((_, i) => timers.push(window.setTimeout(() => setTurn(i), i * TURN_MS)));
        timers.push(window.setTimeout(() => setTurn(-1), (CALL.length - 1) * TURN_MS + WAVE_MS));
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach((x) => window.clearTimeout(x));
    };
  }, []);

  return (
    <div ref={root} className={styles.night} data-night="" data-scene="night" {...stagedAttrs(scene)}>
      <div className={styles.sky} aria-hidden="true">
        <Stars stars={stars.top} className={styles.skyTop} />
        <Stars stars={stars.side} className={styles.skySides} />
        <svg className={styles.moon} viewBox="0 0 80 80">
          <path d="M52 8 C30 8 12 25 12 44 C12 62 28 76 47 74 C34 68 26 56 26 42 C26 26 37 13 52 8 Z" fill="var(--night-moon)" stroke="var(--night-moon-pen)"
            strokeWidth={INK_LIGHT} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <section className={styles.nightShow} aria-labelledby="oneday-night">
        <h2 id="oneday-night" className={styles.h2}>{c.title}</h2>
        <p className={styles.nightSub}><Clauses text={c.sub} /></p>
        <GetTheApp tone="ink" className={styles.nightApp} />
        <PillLink href="/paper-pals" face="night" size="sm">
          {c.pals}
          <span aria-hidden="true"> →</span>
        </PillLink>

        <div ref={call} className={styles.call} data-call="">
          <Stars stars={stars.call} className={styles.skyCall} />
          <div className={styles.callRow}>
            {CALL.map((p, i) => (
              <span key={p.slug} className={styles.callPal} data-hello={turn === i ? '' : undefined}>
                <PalAt still={stills[p.slug]} waveArm={p.arm} phase={i * 1.3} className={styles.inflow} />
              </span>
            ))}
            <span className={styles.callHush} data-hush="">
              <Hole />
              {/* standing there from the first moment, until its stage brings it on (it pops up where it stands) */}
              <PalAt still={stills.night} live={scene.live.has('night')} eyes="sleepy" waveArm="r" phase={3.1} className={styles.inflow} />
            </span>
          </div>
          <svg className={styles.callFloor} data-callfloor="" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
            <path d={pointsToBezier(floor)} fill="none" stroke="var(--night-pen)" strokeWidth={INK_LIGHT} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <Link href="/home" className={styles.hushLine}>
          {c.hush}
          <span aria-hidden="true"> →</span>
        </Link>
      </section>

      <footer className={styles.foot}>
        <div className={styles.footBrand}>
          <ResonanceIcon size={24} />
          <span>Resonance</span>
        </div>
        <nav className={styles.footLinks} aria-label="Resonance">
          {LINKS.map(([k, href]) => (
            <Link key={k} href={href} className={styles.footLink}>
              {t(k)}
            </Link>
          ))}
        </nav>
        <p className={styles.footSmall}>{t('trademarks')}</p>
        <div className={styles.footEnd}>
          <p className={styles.footSmall}>{t('copyright')}</p>
          <RestToggle locale={locale} face="night" />
        </div>
      </footer>
    </div>
  );
}
