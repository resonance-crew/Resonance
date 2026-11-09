'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DriftingBlobs } from '@/components/atoms/DriftingBlobs/DriftingBlobs';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { GetTheApp } from '@/components/molecules/GetTheApp/GetTheApp';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { whenIdle } from '@/components/sections/LandingStage/LandingStage';
import { Link } from '@/i18n/navigation';
import { DOWNLOAD_ANCHOR } from '@/lib/appStores';
import { resolvedScheme } from '@/lib/design/appearance';
import { INK_LIGHT, INK_STRONG } from '@/lib/design/strokes';
import { wavyLine, wavyVertical } from '@/lib/design/wavyPath';
import type { CastEntry, StageEvent } from '@/lib/mascots/types';
import { copyFor } from './copy';
import type { IssueStory } from './data';
import { ripple } from './ripple';
import { STILLS } from './stills';
import { askVisit, useLiveStage } from './useLiveStage';
import s from './issue.module.css';
import c from './cover.module.css';

/** The vertical title's cells, read right to left: column 0 (right) 用故事 and the empty fourth cell, column 1 回應故事. */
const ZH_CELLS: { ch: string; col: 0 | 1; row: number; accent?: boolean }[] = [
  { ch: '用', col: 0, row: 0 },
  { ch: '故', col: 0, row: 1 },
  { ch: '事', col: 0, row: 2 },
  { ch: '回', col: 1, row: 0, accent: true },
  { ch: '應', col: 1, row: 1, accent: true },
  { ch: '故', col: 1, row: 2 },
  { ch: '事', col: 1, row: 3 },
];
/** The empty cell the puppet stands in. */
const CELL = { col: 0, row: 3 };

/** Seconds each character waits when the ripple starts in the puppet's cell and spreads, like a pebble in water. */
const FROM_CELL = ZH_CELLS.map((g) => Math.hypot(g.col - CELL.col, g.row - CELL.row) * 0.075 - 0.07);

/** The manuscript grid (稿紙) the title is set in, 2 × 4 cells of 100 units: soft hand-drawn lines. */
function gridPaths(): string[] {
  const out: string[] = [];
  for (let i = 0; i <= 2; i++) out.push(wavyVertical(400, 31 + i * 7, 0.9, 9));
  for (let j = 0; j <= 4; j++) out.push(wavyLine(200, 53 + j * 11, 0.9, 5));
  return out;
}

export interface CoverProps {
  locale: string;
  story: IssueStory | null;
}

export function Cover({ locale, story }: CoverProps) {
  const t = copyFor(locale);
  const zh = locale !== 'en';
  return (
    <section id="about" className={c.cover} data-script={zh ? 'cjk' : 'latin'} aria-labelledby="issue-title">
      <div className={`${s.sheet} ${c.sheet}`}>
        <span className={s.folio} aria-hidden="true">01</span>
        <div className={c.body}>
          <p className={c.kicker}>
            {t.cover.kicker}
            <svg className={c.kickerRule} viewBox="0 -4 60 8" preserveAspectRatio="none" aria-hidden="true">
              <path d={wavyLine(60, 5, 1.6, 4)} fill="none" stroke="currentColor" strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            </svg>
          </p>
          <div className={c.copy}>
            <p className={c.dek}>
              {zh
                ? t.cover.dekUnits.map((unit) => (
                    <span key={unit} className={c.phrase}>
                      {unit}
                    </span>
                  ))
                : t.cover.dek}
            </p>
            {story && <CoverLine story={story} locale={locale} />}
          </div>
          {zh ? <ZhTitle title={t.cover.title} /> : <EnTitle lines={t.cover.enLines} />}
          <GetTheApp id={DOWNLOAD_ANCHOR} className={c.download} />
        </div>
      </div>
    </section>
  );
}

function CoverLine({ story, locale }: { story: IssueStory; locale: string }) {
  const t = copyFor(locale);
  return (
    <figure className={c.coverLine}>
      <figcaption className={c.coverLabel}>{t.cover.coverLine}</figcaption>
      <blockquote className={c.coverQuote} lang={story.lang} data-script={story.script}>
        <span className={c.hang} aria-hidden="true">「</span>
        {story.line}
        <span aria-hidden="true">」</span>
      </blockquote>
      <p className={c.coverMeta}>
        <span>{story.author ?? t.cover.unsigned}</span>
        <span className={c.dot} aria-hidden="true">·</span>
        <span lang={story.lang}>〈{story.title}〉</span>
        <span className={c.dot} aria-hidden="true">·</span>
        <span>{t.cover.minutes(story.minutes)}</span>
        <Link href={story.href} className={c.readLink}>
          {t.cover.read}
          <span aria-hidden="true"> →</span>
        </Link>
      </p>
    </figure>
  );
}

/**
 * The cast for the cell, by the page's scheme: 摺摺 by day, 悄悄 at night; 點點 now and then instead (less often) —
 * but never on a phone, where 點點 already sits on the ≋ row just below (one 點點 on a screen).
 */
function cellCast(cast: readonly CastEntry[], night: boolean, phone: boolean): CastEntry[] {
  const main = night ? 'night' : 'tuck';
  return cast
    .filter((e) => e.slug === main || (!phone && e.slug === 'dot'))
    .map((e) => (e.slug === 'dot' ? { ...e, traits: { ...e.traits, often: { light: 0.4, dark: 0.4 } } } : e));
}

const PHONE = '(max-width: 639px)';

/**
 * The cell's live state: `live` once a visitor came on (its still folded away), and false again once it has gone and
 * nobody is on (the still stands back up, so the cell is never empty between two visits).
 */
function useCellLive(): [boolean, (e: StageEvent, visitors: () => number) => void] {
  const [live, setLive] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onEvent = useCallback((e: StageEvent, visitors: () => number) => {
    if (e.type === 'enter') {
      window.clearTimeout(timer.current);
      setLive(true);
    }
    if (e.type === 'leave') {
      const back = (n: number) => {
        timer.current = window.setTimeout(() => {
          if (visitors() === 0) setLive(false);
          else if (n < 12) back(n + 1);
        }, 400);
      };
      back(0);
    }
  }, []);
  return [live, onEvent];
}

/**
 * The vertical title in its cells, and the puppet standing in the fourth cell of the first column as the character
 * that isn't there. Once the browser is idle a wave of weight runs through the seven characters; it runs again when
 * the title is tapped, and when the puppet hops in the cell (spreading from there).
 */
function ZhTitle({ title }: { title: string }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [live, onLive] = useCellLive();
  const grid = useMemo(gridPaths, []);
  const taps = useRef(0);

  const { state } = useLiveStage(layer, (kit, el) => {
    const night = resolvedScheme(document) === 'dark';
    const dice = kit.leaningDice();
    const onEvent = (e: StageEvent) => {
      if (e.type === 'enter') taps.current = 0;
      onLive(e, () => h.stage()?.visitors().length ?? 0);
      if ((e.type === 'act' && e.act === 'hop') || (e.type === 'arrive' && e.slug === 'dot')) {
        ripple(h1.current, { kind: 'weight', delays: FROM_CELL.map((d) => Math.max(0, d)) });
      }
    };
    const h = kit.mountLive(window, el, {
      createStage: kit.createStage,
      cast: cellCast(kit.cast, night, window.matchMedia(PHONE).matches),
      spots: [{ id: 'cell', still: 'cell', enter: 'pop', acts: ['read', 'look', 'wave', 'stretch', 'reveal', 'read', 'hop'] }],
      options: {
        first: [999, 999],
        visit: [45, 80],
        gap: [1.2, 2.6],
        pairChance: 0,
        meetChance: 0,
        greetChance: 0,
      },
      random: dice.random,
      onEvent,
    });
    // its second tap is the one that lifts its corner (信任你了，才會掀開): the engine's tap answer, its dice leaned
    el.addEventListener(
      'click',
      (ev) => {
        if (!(ev.target as Element).closest?.('.ms-char')) return;
        taps.current += 1;
        if (taps.current === 2) {
          dice.lean(0.5);
          window.setTimeout(() => dice.lean(null), 0);
        }
      },
      { capture: true },
    );
    askVisit(window, () => !!h.stage()?.visit({ ledge: 'cell', slug: night ? 'night' : 'tuck', acts: ['read', 'look'] }));
    // the first scroll: it looks up from its book and waves to the reader
    const onScroll = () => {
      if (window.scrollY < 40) return;
      window.removeEventListener('scroll', onScroll);
      const r = el.getBoundingClientRect();
      kit.nudge(el, { x: r.left - 80, y: r.top + r.height * 0.5 });
      window.setTimeout(() => kit.nudge(el, { x: r.left - 80, y: r.top }, true), 1800);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return h;
  });

  // the idle ripple: once the page is up and the browser has a moment, a second after load
  useEffect(() => {
    let timer = 0;
    const cancel = whenIdle(window, () => {
      timer = window.setTimeout(() => ripple(h1.current, { kind: 'weight' }), 1000);
    });
    return () => {
      cancel();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className={c.titleBlock} data-staged={state === 'staged' ? '' : undefined} data-live={live ? '' : undefined}>
      <div className={c.spotlight} aria-hidden="true">
        <DriftingBlobs responsive>
          <div className={c.spotBlob} data-drift="-1,0.25" data-drift-color="--color-sage">
            <OrganiBlob variant={2} fill="var(--color-sage)" size={420} grain={0.2} />
          </div>
        </DriftingBlobs>
      </div>
      <svg className={c.grid} viewBox="-2 -2 204 404" preserveAspectRatio="none" aria-hidden="true">
        {grid.map((d, i) => (
          <path key={i} d={d} transform={i < 3 ? `translate(${i * 100} 0)` : `translate(0 ${(i - 3) * 100})`} fill="none" stroke="currentColor" strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        ))}
      </svg>
      <svg className={c.accentWave} viewBox="-3 0 6 200" preserveAspectRatio="none" aria-hidden="true">
        <path d={wavyVertical(200, 19, 2.2, 8)} fill="none" stroke="var(--color-terracotta)" strokeWidth={INK_STRONG} vectorEffect="non-scaling-stroke" strokeLinecap="round" opacity="0.6" />
      </svg>
      <h1
        id="issue-title"
        ref={h1}
        className={c.zhTitle}
        onClick={() => ripple(h1.current, { kind: 'weight' })}
      >
        <span className={s.srOnly}>{title}</span>
        {ZH_CELLS.map((g, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={c.glyph}
            data-ripple={g.accent ? 'accent' : ''}
            data-accent={g.accent ? '' : undefined}
            style={{ gridColumn: 2 - g.col, gridRow: g.row + 1 } as CSSProperties}
          >
            {g.ch}
          </span>
        ))}
      </h1>
      <div ref={layer} className={c.cellLayer} aria-hidden="true">
        <span className={`${c.cellStill} ${c.dayOnly}`} data-still="cell" data-below={STILLS.tuck.below}>
          <PaperPalStill still={STILLS.tuck} phase={0.6} />
        </span>
        <span className={`${c.cellStill} ${c.nightOnly}`} data-still="cell" data-below={STILLS.night.below}>
          <PaperPalStill still={STILLS.night} eyes="open" phase={1.4} />
        </span>
      </div>
    </div>
  );
}

/** The slot's hand-drawn cell (the zh grid's pen): four wavy sides of a 100-unit square. */
function slotPaths(): string[] {
  return [wavyLine(100, 71, 0.9, 3), wavyLine(100, 73, 0.9, 3), wavyVertical(100, 79, 0.9, 3), wavyVertical(100, 83, 0.9, 3)];
}
const SLOT_MOVES = [undefined, 'translate(0 100)', undefined, 'translate(100 0)'];

/**
 * en: the title across, "Answer" accented with the pen wave; before "with" an empty cell drawn in the zh grid's pen,
 * one line tall, and 摺摺 standing in it — the word that isn't there. Playfair is static here, so its ripple is a
 * per-word baseline wave. A phone sets it in four lines (Answer / stories / ▢ with / stories), big.
 */
function EnTitle({ lines }: { lines: [string, string] }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [live, onLive] = useCellLive();
  const { state } = useLiveStage(layer, (kit, el) => {
    const night = resolvedScheme(document) === 'dark';
    const h = kit.mountLive(window, el, {
      createStage: kit.createStage,
      cast: cellCast(kit.cast, night, window.matchMedia(PHONE).matches),
      spots: [{ id: 'cell', still: 'cell', enter: 'pop', acts: ['read', 'look', 'wave', 'stretch', 'reveal', 'hop'] }],
      options: { first: [999, 999], visit: [45, 80], gap: [1.2, 2.6], pairChance: 0, meetChance: 0, greetChance: 0 },
      onEvent: (e) => {
        onLive(e, () => h.stage()?.visitors().length ?? 0);
        if ((e.type === 'act' && e.act === 'hop') || (e.type === 'arrive' && e.slug === 'dot')) ripple(h1.current, { kind: 'baseline' });
      },
    });
    askVisit(window, () => !!h.stage()?.visit({ ledge: 'cell', slug: night ? 'night' : 'tuck', acts: ['read', 'look'] }));
    return h;
  });
  useEffect(() => {
    let timer = 0;
    const cancel = whenIdle(window, () => {
      timer = window.setTimeout(() => ripple(h1.current, { kind: 'baseline' }), 1000);
    });
    return () => {
      cancel();
      window.clearTimeout(timer);
    };
  }, []);
  const slot = useMemo(slotPaths, []);
  const word = (w: string, accent = false) => (
    <span className={c.enWord} data-ripple={accent ? 'accent' : ''} data-accent={accent ? '' : undefined}>
      {w}
      {accent && (
        <svg className={c.enWave} viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
          <path d="M2,8 C30,2 60,12 90,6 C120,0 150,10 198,6" stroke="var(--color-terracotta)" strokeWidth={INK_STRONG} fill="none" strokeLinecap="round" opacity="0.6" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </span>
  );
  const [first, ...more] = lines[0].split(' ');
  const second = lines[1].split(' ');
  return (
    <div className={c.enBlock} data-staged={state === 'staged' ? '' : undefined} data-live={live ? '' : undefined}>
      {/* the sage spotlight, centred on the slot (where the slot is, by the title's own em) */}
      <div className={c.spotlight} aria-hidden="true">
        <DriftingBlobs responsive>
          <div className={c.spotBlobEn} data-drift="1,0.2" data-drift-color="--color-sage">
            <OrganiBlob variant={2} fill="var(--color-sage)" size={340} grain={0.2} />
          </div>
        </DriftingBlobs>
      </div>
      <h1 id="issue-title" ref={h1} className={c.enTitle} onClick={() => ripple(h1.current, { kind: 'baseline' })}>
        <span className={s.srOnly}>{lines.join(' ')}</span>
        <span aria-hidden="true" className={c.enLine}>
          {word(first, true)}
          {more.map((w, i) => (
            <span key={i}>
              {' '}
              {word(w)}
            </span>
          ))}
        </span>
        <span aria-hidden="true" className={c.enLine}>
          <span className={c.slot}>
            <svg className={c.slotCell} viewBox="-2 -2 104 104" preserveAspectRatio="none">
              {slot.map((d, i) => (
                <path key={i} d={d} transform={SLOT_MOVES[i]} fill="none" stroke="currentColor" strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              ))}
            </svg>
            <span ref={layer} className={c.enCell}>
              <span className={`${c.cellStill} ${c.dayOnly}`} data-still="cell" data-below={STILLS.tuck.below}>
                <PaperPalStill still={STILLS.tuck} phase={0.6} />
              </span>
              <span className={`${c.cellStill} ${c.nightOnly}`} data-still="cell" data-below={STILLS.night.below}>
                <PaperPalStill still={STILLS.night} phase={1.4} />
              </span>
            </span>
          </span>
          {second.map((w, i) => (
            <span key={i}>
              {' '}
              {word(w)}
            </span>
          ))}
        </span>
      </h1>
    </div>
  );
}
