'use client';

import { useEffect, useRef } from 'react';
import { DriftingBlobs } from '@/components/atoms/DriftingBlobs/DriftingBlobs';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { GetTheApp } from '@/components/molecules/GetTheApp/GetTheApp';
import { Link } from '@/i18n/navigation';
import { DOWNLOAD_ANCHOR } from '@/lib/appStores';
import { INK_STRONG } from '@/lib/design/strokes';
import { Clauses } from './Clauses';
import { copyFor } from './copy';
import { FictionCard, LinkWaves } from './FictionCard';
import { Flats } from './Flats';
import { FLOOR_SEED } from './floor';
import { PalAt } from './PalAt';
import { RestToggle } from './RestToggle';
import type { Stills } from './tiles';
import { stagedAttrs, useScene } from './useScene';
import styles from './oneday.module.css';

function Accent({ children }: { children: string }) {
  if (!children) return null;
  return (
    <span className={styles.accent}>
      {children}
      <svg className={styles.accentWave} viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
        <path d="M2,8 C30,2 60,12 90,6 C120,0 150,10 198,6" stroke="var(--color-terracotta)" strokeWidth={INK_STRONG} fill="none"
          strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

/**
 * Morning · the cover plate. The h1 (the LCP: nothing covers it, nothing waits for it), the mechanic in one line, the
 * store badges, the way in to the stories; beside it (under it on a phone) two little cards that are pictures, not
 * records — one story, one answer — joined by the logo's three waves. Under them the floor, and on it 摺摺 (who walks in
 * from the scene's left edge and waves first) and 點點 (who pops up and hops).
 */
export function Hero({ locale, stills }: { locale: string; stills: Pick<Stills, 'tuck' | 'dot'> }) {
  const c = copyFor(locale).hero;
  const root = useRef<HTMLElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const scene = useScene(root, () => import('./scenes').then((m) => m.heroScene()));

  // A fine pointer slides the story card and the waves a few px sideways along the floor (they stay standing on it;
  // the answer card stays put, 點點 is behind it): depth by overlap alone (no shadow).
  useEffect(() => {
    const el = plate.current;
    const host = root.current;
    if (!el || !host) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || calm.matches) return;
    let raf = 0;
    let next = { x: 0, y: 0 };
    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      next = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: 0 };
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.setProperty('--dx', next.x.toFixed(3));
      });
    };
    host.addEventListener('pointermove', move);
    return () => {
      host.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={root} className={styles.hero} data-scene="hero" aria-labelledby="oneday-title" {...stagedAttrs(scene)}>
      <div className={styles.heroDrift} aria-hidden="true">
        <DriftingBlobs responsive>
          <span className={styles.heroBlob} data-drift="-1,0.25" data-drift-color="--color-sage">
            <OrganiBlob variant={2} fill="var(--color-sage)" size={420} grain={0.2} />
          </span>
        </DriftingBlobs>
      </div>

      <div className={styles.heroGrid}>
        <div className={styles.heroText}>
          <h1 id="oneday-title" className={styles.h1}>
            <span className={styles.h1Line}>
              {c.lineA.before}
              <Accent>{c.lineA.accent}</Accent>
              {c.lineA.after}
            </span>{' '}
            <span className={styles.h1Line}>
              {c.lineB.before}
              <Accent>{c.lineB.accent}</Accent>
              {c.lineB.after}
            </span>
          </h1>
          <p className={styles.heroSub}>
            <Clauses text={c.sub} />
          </p>
          <GetTheApp id={DOWNLOAD_ANCHOR} className={styles.heroApp} />
          <div className={styles.heroLinks}>
            <Link href="/home" className={styles.arrowLink}>
              {c.read}
              <span aria-hidden="true"> →</span>
            </Link>
          </div>
        </div>

        {/* the set, standing on the floor: the story and its answer joined by the logo's waves; 摺摺 beside the
            story, 點點 peeking over the answer from behind it */}
        <div className={styles.plate} ref={plate} aria-hidden="true">
          <div className={styles.plateStage}>
            <span className={styles.plateDot} data-spot="dot">
              <PalAt still={stills.dot} live={scene.live.has('dot')} phase={2.2} managed />
            </span>
            <FictionCard family={2} seed={7} className={styles.plateA} outline="a" />
            <LinkWaves className={styles.plateWaves} />
            <FictionCard family={1} seed={19} lines={4} className={styles.plateB} outline="b" />
            <span className={styles.plateTuck} data-spot="tuck">
              <PalAt still={stills.tuck} live={scene.live.has('tuck')} waveArm="r" phase={0.4} managed />
            </span>
          </div>
        </div>
      </div>

      {/* the page's pause, quiet, at the floor's end beside the puppets (the footer has it too) */}
      <RestToggle locale={locale} face="quiet" className={styles.heroRest} />

      <Flats seed={FLOOR_SEED.hero} from="var(--paper-hero)" to="var(--paper-stories)" tint="var(--color-sage)" />
    </section>
  );
}
