'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { InkPill } from '@/components/atoms/InkPill/InkPill';
import { Divider } from '@/components/atoms/Divider/Divider';
import { PaperCard } from '@/components/sections/AboutPage/AboutArt';
import { wantsStage, whenIdle } from '@/components/sections/LandingStage/LandingStage';
import { INK_LIGHT } from '@/lib/design/strokes';
import type { PalSlug, Still } from '@/lib/mascots/pals/still';
import { placeSaid, type TitleSceneHandle } from '@/lib/mascots/pals/titleScene';
import type { Rect } from '@/lib/mascots/types';
import styles from './PaperPalsPage.module.css';

declare global {
  interface Window {
    /** Development builds only: the Paper Pals page's opening, for poking at it from devtools. */
    __palsTitle?: TitleSceneHandle;
  }
}

export interface ScenePal {
  still: Still;
  /** What it says when it is tapped. */
  line: string;
  eyes?: 'open' | 'sleepy';
  phase: number;
}

/** Ms its words stay over its head. */
const SAID_MS = 2400;

/**
 * The page's opening: its title on a story card, and the five around it, each at something of its own (摺摺 reading
 * on the card's top, 悄悄 dozing at the other end, 點點 peeking from behind it, 聆聆 and 牽牽 meeting beside it — under
 * it on a narrow screen). The server draws them standing still where each one's place is; once the page is up and
 * the browser idle, each comes alive there (lib/mascots/pals/titleScene) and its still gives way. Tapping one: it
 * hops, and says its line where the words cover nobody — over its head, or beside it (`placeSaid`). Never alive under reduced motion or Save-Data; if the stage fails, the
 * stills stay. Where a stage is coming the stills wait unseen (the CSS), so nobody stands there and then pops up again.
 */
export function PalsTitleScene({ pals, children }: { pals: Record<PalSlug, ScenePal>; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<ReadonlySet<string>>(new Set());
  // A stage started (the stills stay unseen: each one comes on with its own entrance), or none is coming (they show).
  const [staged, setStaged] = useState<'staged' | 'stills' | null>(null);
  const [said, setSaid] = useState<{ slug: string; body: Rect; n: number } | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const saidRef = useRef<HTMLSpanElement>(null);
  const handleRef = useRef<TitleSceneHandle | null>(null);
  const timer = useRef(0);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (!wantsStage(navigator) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStaged('stills');
      return;
    }
    let handle: TitleSceneHandle | null = null;
    let gone = false;
    const cancel = whenIdle(window, () => {
      Promise.all([import('@/lib/mascots'), import('@/lib/mascots/cast.generated'), import('@/lib/mascots/pals/titleScene')])
        .then(([{ createStage }, { MASCOT_CAST }, { mountTitleScene }]) => {
          if (gone) return;
          const h = mountTitleScene(window, root, {
            createStage,
            cast: MASCOT_CAST,
            onEnter: (slug) => setLive((s) => new Set(s).add(slug)),
            onPoke: (slug, body) => {
              window.clearTimeout(timer.current);
              setAt(null);
              setSaid((s) => ({ slug, body, n: (s?.n ?? 0) + 1 }));
              timer.current = window.setTimeout(() => setSaid(null), SAID_MS);
            },
          });
          handle = h;
          handleRef.current = h;
          setStaged('staged');
          if (process.env.NODE_ENV === 'development') window.__palsTitle = h;
        })
        .catch((e) => {
          // decoration: the scene stays as the server drew it
          if (!gone) setStaged('stills');
          if (process.env.NODE_ENV === 'development') console.warn('[pals title] left out', e);
        });
    });
    return () => {
      gone = true;
      cancel();
      window.clearTimeout(timer.current);
      handle?.destroy();
      handleRef.current = null;
    };
  }, []);
  // Its words go where they cover no one and none of the card's words: measured once drawn, placed before paint.
  useLayoutEffect(() => {
    const pill = saidRef.current;
    const root = ref.current;
    if (!said || !pill || !root) return;
    const h = handleRef.current;
    const others = (h?.bodies() ?? []).filter((b) => b.slug !== said.slug);
    const card = h?.card();
    const r = root.getBoundingClientRect();
    // the scene's sides, and a little over its top (under the page's header still)
    const bounds = { x: 4, y: -24, w: r.width - 8, h: r.height + 24 };
    setAt(placeSaid({ w: pill.offsetWidth, h: pill.offsetHeight }, said.body, card ? [...others, card] : others, bounds));
  }, [said]);
  const still = (slug: PalSlug) => (
    <span
      key={slug}
      className={styles.sceneStill}
      data-still={slug}
      data-below={pals[slug].still.below}
      data-live={live.has(slug) ? '' : undefined}
      aria-hidden="true"
    >
      <PaperPalStill still={pals[slug].still} eyes={pals[slug].eyes} phase={pals[slug].phase} />
    </span>
  );
  return (
    <div
      ref={ref}
      className={styles.scene}
      data-staged={staged === 'staged' ? '' : undefined}
      data-stills={staged === 'stills' ? '' : undefined}
    >
      <div className={styles.sceneCard} data-pals-card="">
        {still('dot')}
        <PaperCard seed={211} className={styles.titleCard} turnsEvery={110}>
          {children}
        </PaperCard>
        {still('tuck')}
        {still('night')}
      </div>
      <div className={styles.sceneFloor} data-pals-floor="" aria-hidden="true">
        <div className={styles.sceneFloorLine}>
          <Divider seed={23} amplitude={1.5} steps={7} strokeWidth={INK_LIGHT} spacing={0} />
        </div>
        {still('card')}
        {still('tag')}
      </div>
      {said && (
        <span
          key={said.n}
          ref={saidRef}
          className={styles.sceneSaid}
          data-placed={at ? '' : undefined}
          style={at ? { left: at.x, top: at.y } : { left: 0, top: 0 }}
        >
          <InkPill label={pals[said.slug as PalSlug]?.line} />
        </span>
      )}
      <p className={styles.srOnly} aria-live="polite">
        {said ? pals[said.slug as PalSlug]?.line : ''}
      </p>
    </div>
  );
}
