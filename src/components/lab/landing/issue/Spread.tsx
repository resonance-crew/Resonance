'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { DriftingBlobs } from '@/components/atoms/DriftingBlobs/DriftingBlobs';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { Link } from '@/i18n/navigation';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { wavyVertical } from '@/lib/design/wavyPath';
import { useElementSize } from '@/lib/hooks/useElementSize';
import type { StageEvent } from '@/lib/mascots/types';
import { copyFor } from './copy';
import { rippleParts, type SpreadPage } from './data';
import { InkTitle, PenRule } from './marks';
import { ripple } from './ripple';
import { STILLS } from './stills';
import { useDrawnOnView } from './useDrawn';
import { useLiveStage } from './useLiveStage';
import s from './issue.module.css';
import p from './spread.module.css';

/** How far page B gives under a pull (px), and how hard it resists. */
const PULL_MAX = 60;
const PULL_SOFT = 90;

export interface SpreadProps {
  locale: string;
  a: SpreadPage;
  b: SpreadPage;
  /** Set as if one answered the other (the prototype's stand-in for the newest real resonance): said so, quietly. */
  faked: boolean;
}

/**
 * 03 對頁: a story printed facing the story that answered it. The fold between them is a pen line with the brand's
 * three waves crossing it (drawn in as the spread scrolls into view). At the foot of the two pages 牽牽 and 點點 stand
 * facing each other across the fold; once the spread is well in view the two meet there, resonate, and 牽牽 hands
 * 點點 the folded note — and the answer's title rings. Once per visit. With a mouse, page B can be pulled a little away
 * from page A (the waves stretch with it) and it hops back in stop-motion steps.
 */
export function Spread({ locale, a, b, faked }: SpreadProps) {
  const t = copyFor(locale);
  const pages = useRef<HTMLDivElement>(null);
  const footBox = useRef<HTMLDivElement>(null);
  const titleB = useRef<HTMLHeadingElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(pages, 1100, 560);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [pull, setPull] = useState(0);
  const [settling, setSettling] = useState(false);
  const drag = useRef<{ id: number; x: number } | null>(null);
  // the two's floor is drawn in one stroke as the foot comes into view, before anyone stands on it
  useDrawnOnView(footBox, 0.2);

  useLiveStage(foot, (kit, el) => {
    const dice = kit.leaningDice();
    let started = false;
    let asked = false;
    const left = new Set<string>();
    const onEvent = (e: StageEvent) => {
      const stage = h.stage();
      if (e.type === 'enter') setGone((g) => new Set(g).add(e.slug));
      // 牽牽 stands at the fold: 點點 is asked to come and meet it, and the meeting is the note
      if (e.type === 'arrive' && e.slug === 'tag' && !asked) {
        asked = true;
        window.setTimeout(() => stage?.meet('note'), 700);
      }
      // the hand-over's coin comes out 牽牽 (the one on the left): the dice lean from the resonance to the note
      if (e.type === 'act' && e.act === 'resonate') dice.lean(0.2);
      if (e.type === 'act' && e.act === 'note') {
        dice.lean(null);
        window.setTimeout(() => ripple(titleB.current, { kind: b.story.script === 'cjk' ? 'weight' : 'baseline', rest: 600, peak: 900 }), 1500);
      }
      if (e.type === 'leave') {
        left.add(e.slug);
        if (e.with) left.add(e.with);
        // both gone off the page: the stills stand where they stood, the scene told once
        if (left.has('tag') && left.has('dot')) {
          const back = () => {
            if (h.stage()?.visitors().length) window.setTimeout(back, 300);
            else setGone(new Set());
          };
          window.setTimeout(back, 600);
        }
      }
    };
    const h = kit.mountLive(window, el, {
      createStage: kit.createStage,
      cast: kit.cast.filter((c) => c.slug === 'tag' || c.slug === 'dot'),
      spots: [{ id: 'host', still: 'tag', enter: 'pop', meet: true, acts: ['look', 'wave'] }],
      floor: { acts: ['look', 'wave'], inset: 8 },
      options: {
        first: [999, 999],
        gap: [999, 999],
        visit: [26, 34],
        pairChance: 0,
        meetChance: 0,
        greetChance: 0,
        meetEvery: 0,
      },
      random: dice.random,
      onEvent,
    });
    // the scene, once the spread's foot is well in view
    const sight = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((x) => x.isIntersecting)) return;
        started = true;
        sight.disconnect();
        let tries = 0;
        const go = () => {
          if (h.stage()?.visit({ ledge: 'host', slug: 'tag', acts: ['look'] })) return;
          if (++tries < 14) window.setTimeout(go, 350);
        };
        go();
      },
      { threshold: 0.6 },
    );
    sight.observe(el);
    const destroy = h.destroy;
    return {
      ...h,
      destroy() {
        sight.disconnect();
        destroy();
      },
    };
  });

  // The pull: a mouse only, never a finger (a phone scrolls); never from a link.
  const onDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if ((e.target as Element).closest('a')) return;
    if (!window.matchMedia('(min-width: 900px)').matches) return;
    drag.current = { id: e.pointerId, x: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
    setSettling(false);
  };
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const raw = Math.max(0, e.clientX - d.x);
    setPull(PULL_MAX * Math.tanh(raw / PULL_SOFT));
  };
  const onUp = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setSettling(true);
    setPull(0);
  };
  useEffect(() => {
    if (!settling) return;
    const timer = window.setTimeout(() => setSettling(false), 600);
    return () => window.clearTimeout(timer);
  }, [settling]);

  const page = ({ story, passage }: SpreadPage, side: 'a' | 'b') => (
    <article
      className={p.page}
      data-side={side}
      aria-labelledby={`spread-${side}`}
      {...(side === 'b' ? { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp } : {})}
    >
      <p className={p.label}>
        <span className={p.labelWord}>{side === 'a' ? t.spread.story : t.spread.answer}</span>
        {side === 'b' && (
          <span className={p.answers} lang={a.story.lang}>
            {t.spread.answers(a.story.title)}
          </span>
        )}
        {side === 'b' && faked && <span className={p.sample}>{t.spread.sample}</span>}
      </p>
      <h3 id={`spread-${side}`} ref={side === 'b' ? titleB : undefined} className={p.title} lang={story.lang} data-script={story.script}>
        {side === 'b' ? (
          <>
            <span className={s.srOnly}>{story.title}</span>
            {rippleParts(story.title, story.script).map((part, i) =>
              /^\s+$/.test(part) ? (
                part
              ) : (
                <span key={i} aria-hidden="true" className={p.rippleChar} data-ripple="">
                  {part}
                </span>
              ),
            )}
          </>
        ) : (
          story.title
        )}
      </h3>
      <p className={p.opening} lang={story.lang} data-script={story.script}>
        {passage}
      </p>
      <p className={p.meta}>
        <span className={p.byline}>{story.author ?? t.cover.unsigned}</span>
        <span aria-hidden="true">·</span>
        <span>{t.cover.minutes(story.minutes)}</span>
        <Link href={story.href} className={s.textLink}>
          {t.spread.readAll}
          <span aria-hidden="true"> →</span>
        </Link>
      </p>
    </article>
  );

  return (
    <section className={p.spread} aria-labelledby="spread-title">
      <div className={s.sheet}>
        <span className={s.folio} aria-hidden="true">
          03
        </span>
        <header className={`${s.head} ${p.head}`}>
          <InkTitle id="spread-title" text={t.spread.title} />
          <p className={s.dek}>{t.spread.dek}</p>
        </header>
      </div>
      <div className={p.book}>
        <div
          ref={pages}
          className={p.pages}
          data-scrollfx=""
          data-settling={settling ? '' : undefined}
          data-pulled={pull > 0.5 ? '' : undefined}
          style={{ '--pull': `${pull.toFixed(1)}px` } as CSSProperties}
        >
          <div className={p.sheetBorder} aria-hidden="true">
            <HandDrawnBorder w={w} h={h} R={22} seed={311} fillColor="var(--color-card-bg)" strokeColor="var(--field-border)" strokeWidth={INK} />
          </div>
          {page(a, 'a')}
          <div className={p.gutter} aria-hidden="true">
            {/* a pool of sky where the waves cross the fold (inside the sheet: a shape, never a sliver at its edge) */}
            <div className={p.drift}>
              <DriftingBlobs responsive>
                <div className={p.blob} data-drift="0.4,-0.6" data-drift-color="--color-sky">
                  <OrganiBlob variant={3} fill="var(--color-sky)" size={300} grain={0.2} />
                </div>
              </DriftingBlobs>
            </div>
            <svg className={p.fold} viewBox="-4 0 8 400" preserveAspectRatio="none">
              <path d={wavyVertical(400, 61, 1.6, 12)} fill="none" stroke="currentColor" strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            </svg>
            <svg className={p.waves} viewBox="0 3 24 15" preserveAspectRatio="none" fill="none" stroke="var(--color-terracotta)" strokeWidth={INK} strokeLinecap="round">
              <path vectorEffect="non-scaling-stroke" d="M3.4,8.2 C5.4,5.9 7.3,5.8 9.2,8.0 C11.1,10.2 13.0,10.3 15.0,8.1 C16.9,6.0 18.8,5.9 20.7,8.1" />
              <path vectorEffect="non-scaling-stroke" d="M3.0,12.1 C5.1,9.7 7.1,9.8 9.0,12.0 C10.9,14.2 12.9,14.3 14.9,12.1 C16.8,9.9 18.8,9.8 20.9,12.0" />
              <path vectorEffect="non-scaling-stroke" d="M3.5,16.0 C5.4,13.8 7.4,13.7 9.3,15.9 C11.2,18.1 13.1,18.2 15.1,16.0 C17.0,13.9 18.9,13.8 20.8,16.0" />
            </svg>
            <span className={p.pullHint}>{t.spread.pull}</span>
          </div>
          {page(b, 'b')}
          <div ref={footBox} className={p.foot} aria-hidden="true">
            {/* a phone's: the same pool where the stacked pages meet */}
            <div className={p.footDrift}>
              <DriftingBlobs>
                <div className={p.footBlob} data-drift="0.6,-0.3" data-drift-color="--color-sky">
                  <OrganiBlob variant={3} fill="var(--color-sky)" size={170} grain={0.2} />
                </div>
              </DriftingBlobs>
            </div>
            <span className={p.footRule}>
              <PenRule seed={719} amp={1.1} steps={14} draw="once" />
            </span>
            <span className={p.footWaves}>
              <svg viewBox="0 3 24 15" fill="none" stroke="var(--color-terracotta)" strokeWidth={INK} strokeLinecap="round">
                <path vectorEffect="non-scaling-stroke" d="M3.4,8.2 C5.4,5.9 7.3,5.8 9.2,8.0 C11.1,10.2 13.0,10.3 15.0,8.1 C16.9,6.0 18.8,5.9 20.7,8.1" />
                <path vectorEffect="non-scaling-stroke" d="M3.0,12.1 C5.1,9.7 7.1,9.8 9.0,12.0 C10.9,14.2 12.9,14.3 14.9,12.1 C16.8,9.9 18.8,9.8 20.9,12.0" />
                <path vectorEffect="non-scaling-stroke" d="M3.5,16.0 C5.4,13.8 7.4,13.7 9.3,15.9 C11.2,18.1 13.1,18.2 15.1,16.0 C17.0,13.9 18.9,13.8 20.8,16.0" />
              </svg>
            </span>
            {/* the two's stage: a strip over the fold's foot, its ends fading into the pages */}
            <div ref={foot} className={p.footStage}>
              <span className={p.footStill} data-side="l" data-still="tag" data-below={STILLS.tag.below} data-live={gone.has('tag') ? '' : undefined}>
                <PaperPalStill still={STILLS.tag} waveArm="r" phase={0.4} />
              </span>
              <span className={p.footStill} data-side="r" data-still="dot" data-below={STILLS.dot.below} data-live={gone.has('dot') ? '' : undefined}>
                <PaperPalStill still={STILLS.dot} waveArm="l" phase={1.9} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
