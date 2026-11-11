'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { Link } from '@/i18n/navigation';
import { INK } from '@/lib/design/strokes';
import { wobRect } from '@/lib/design/wobRect';
import { useElementSize } from '@/lib/hooks/useElementSize';
import type { StageEvent } from '@/lib/mascots/types';
import { copyFor } from './copy';
import type { IssueStory } from './data';
import { LinkPill } from './LinkPill';
import { InkTitle, PenRule, Waves } from './marks';
import { STILLS } from './stills';
import { askVisit, useLiveStage } from './useLiveStage';
import s from './issue.module.css';
import k from './contents.module.css';

const SIDENOTE_QUERY = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';

function useMedia(query: string): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia(query);
    const set = () => setOn(m.matches);
    set();
    m.addEventListener('change', set);
    return () => m.removeEventListener('change', set);
  }, [query]);
  return on;
}

export interface ContentsProps {
  locale: string;
  stories: IssueStory[];
  names: string[];
  unsigned: boolean;
}

/**
 * 02 目次: the issue's six stories as words — a big numeral in the margin, the title in Ming, its first sentence as a
 * pull quote, the byline (or 不署名), minutes, two tags and, where it has one, a tiny cover cut out by hand. Rows are
 * ruled by pen lines that draw in as they come into view. With a mouse on a desktop, the sidenote beside the list
 * shows the story pointed at (or focused): its cover, four lines of it, its tags — and 點點, looking for the rest of
 * its own story, stands on the sidenote's top edge and turns to whichever is chosen.
 */
export function Contents({ locale, stories, names, unsigned }: ContentsProps) {
  const t = copyFor(locale);
  const [chosen, setChosen] = useState(0);
  const wide = useMedia(SIDENOTE_QUERY);
  const titles = useRef<(HTMLElement | null)[]>([]);
  return (
    <section id="stories" className={k.contents} aria-labelledby="contents-title">
      <PipDinkus line={t.contents.pip} />
      <div className={`${s.sheet} ${k.sheet}`}>
        <span className={s.folio} aria-hidden="true">
          {t.contents.folio}
        </span>
        <header className={`${s.head} ${k.head}`}>
          <InkTitle id="contents-title" text={t.contents.title} />
          <p className={s.dek}>{t.contents.dek(stories.length, names, unsigned)}</p>
        </header>
        <div className={k.layout}>
          <ol className={k.list}>
            {stories.map((story, i) => (
              <Row
                key={story.id}
                story={story}
                index={i}
                locale={locale}
                coverStory={i === 0}
                active={wide === true && chosen === i}
                onChoose={() => setChosen(i)}
                titleRef={(el) => {
                  titles.current[i] = el;
                }}
              />
            ))}
          </ol>
          {wide && <Sidenote stories={stories} chosen={chosen} locale={locale} titles={titles} />}
        </div>
        <div className={k.more}>
          <LinkPill href="/home" variant="tonal">
            {t.contents.all}
          </LinkPill>
        </div>
      </div>
    </section>
  );
}

function Row({
  story,
  index,
  locale,
  coverStory,
  active,
  onChoose,
  titleRef,
}: {
  story: IssueStory;
  index: number;
  locale: string;
  coverStory: boolean;
  active: boolean;
  onChoose: () => void;
  titleRef: (el: HTMLElement | null) => void;
}) {
  const t = copyFor(locale);
  const ref = useRef<HTMLAnchorElement>(null);
  const { w, h } = useElementSize(ref, 0, 0);
  const [wash, setWash] = useState<{ x: number; y: number; on: boolean } | null>(null);
  const d = useMemo(() => (w && h ? wobRect(w, h, 18, 401 + index * 13, Math.min(w, h) * 0.02, { segmentsH: [4, 6], segmentsV: [2, 3] }) : ''), [w, h, index]);
  const from = (e: PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };
  return (
    <li className={k.item}>
      {index > 0 && <PenRule seed={211 + index * 17} className={k.rule} />}
      <Link
        ref={ref}
        href={story.href}
        className={k.row}
        data-active={active ? '' : undefined}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') {
            setWash({ ...from(e), on: true });
            onChoose();
          }
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setWash({ ...from(e), on: false });
        }}
        onFocus={onChoose}
      >
        {wash && <BrushWash w={w} h={h} d={d} color="color-mix(in oklch, var(--color-terracotta-light) 38%, transparent)" x={wash.x} y={wash.y} on={wash.on} duration={420} />}
        <span className={k.numeral} aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className={k.body}>
          {coverStory && <span className={k.coverTag}>{t.cover.coverLine}</span>}
          <span ref={titleRef} className={k.title} lang={story.lang} data-script={story.script}>
            {story.title}
          </span>
          <span className={k.quote} lang={story.lang} data-script={story.script}>
            <span className={k.hang} aria-hidden="true">
              「
            </span>
            {story.quote}
            <span aria-hidden="true">」</span>
          </span>
          <span className={k.meta}>
            <span className={k.byline}>{story.author ?? t.cover.unsigned}</span>
            <span aria-hidden="true">·</span>
            <span>{t.cover.minutes(story.minutes)}</span>
            {story.tags.map((tag) => (
              <TagPill key={tag} size="sm" color={`var(--card-tag-${story.family})`}>
                {tag}
              </TagPill>
            ))}
          </span>
        </span>
        {story.cover && (
          <span className={k.thumb} aria-hidden="true">
            <OrganicImage src={story.cover} alt="" seed={37 + index * 11} ratio={0.78} R={12} />
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * The sidenote: the chosen story's cover cut out by hand, four lines of it and its tags, cross-fading (Motion) as the
 * choice moves. Its top edge never moves; 點點 stands on it. Decoration beside the list (the rows hold every word).
 */
function Sidenote({
  stories,
  chosen,
  locale,
  titles,
}: {
  stories: IssueStory[];
  chosen: number;
  locale: string;
  titles: React.RefObject<(HTMLElement | null)[]>;
}) {
  const t = copyFor(locale);
  const card = useRef<HTMLDivElement>(null);
  const panes = useRef<(HTMLDivElement | null)[]>([]);
  const layer = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(card, 360, 520);
  const [live, setLive] = useState(false);
  const last = useRef(chosen);

  // the cross-fade: Motion, fetched the first time the choice moves
  useEffect(() => {
    const prev = last.current;
    if (prev === chosen) return;
    last.current = chosen;
    const out = panes.current[prev];
    const into = panes.current[chosen];
    void import('motion')
      .then(({ animate }) => {
        if (out) animate(out, { opacity: 0 }, { duration: 0.18, ease: 'easeOut' });
        if (into) animate(into, { opacity: [0, 1] }, { duration: 0.18, ease: 'easeOut', delay: 0.04 });
      })
      .catch(() => {
        if (out) out.style.opacity = '0';
        if (into) into.style.opacity = '1';
      });
  }, [chosen]);

  const target = useCallback(
    (box: DOMRect) => {
      const el = titles.current?.[last.current];
      if (!el) return undefined;
      const r = el.getBoundingClientRect();
      return [r.right - box.left, r.top + r.height / 2 - box.top] as [number, number];
    },
    [titles],
  );

  const { handle } = useLiveStage(layer, (kit, el) => {
    const h = kit.mountLive(window, el, {
      createStage: kit.createStage,
      cast: kit.cast.filter((c) => c.slug === 'dot'),
      spots: [{ id: 'edge', still: 'dot', enter: 'pop', acts: ['look', 'point', 'look', 'hop', 'wave'], target }],
      options: { first: [999, 999], visit: [40, 70], gap: [1.2, 2.6], pairChance: 0, meetChance: 0, greetChance: 0 },
      onEvent: (e: StageEvent) => {
        if (e.type === 'enter') setLive(true);
      },
    });
    askVisit(window, () => !!h.stage()?.visit({ ledge: 'edge', slug: 'dot', acts: ['look', 'wave'] }));
    return h;
  });

  // the choice moved and stayed a moment: 點點 turns to it (its eyes on the chosen title; a wave if it may)
  useEffect(() => {
    const el = layer.current;
    const h = handle.current;
    if (!el || !h) return;
    const timer = window.setTimeout(() => {
      h.relayout();
      const title = titles.current?.[chosen];
      if (!title) return;
      const r = title.getBoundingClientRect();
      void import('./liveStage').then(({ nudge }) => nudge(el, { x: r.right, y: r.top + r.height / 2 }));
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [chosen, handle, titles]);

  return (
    <aside className={k.side} aria-hidden="true">
      <div className={k.sideSticky}>
        <div ref={layer} className={k.pipLayer} data-live={live ? '' : undefined}>
          <span className={k.pipStill} data-still="dot" data-below={STILLS.dot.below}>
            <PaperPalStill still={STILLS.dot} phase={0.9} />
          </span>
        </div>
        <p className={k.pipLine}>{t.contents.pip}</p>
        <div ref={card} className={k.sideCard}>
          <HandDrawnBorder w={w} h={h} R={20} seed={77} fillColor="var(--color-card-bg)" strokeColor="var(--field-border)" strokeWidth={INK} />
          <div className={k.panes}>
            {stories.map((story, i) => (
              <div
                key={story.id}
                ref={(el) => {
                  panes.current[i] = el;
                }}
                className={k.pane}
                style={{ opacity: i === chosen ? 1 : 0 } as CSSProperties}
              >
                {story.cover && (
                  <div className={k.sideCover}>
                    <OrganicImage src={story.cover} alt="" seed={91 + i} ratio={0.6} R={16} />
                  </div>
                )}
                <p className={k.sideQuote} lang={story.lang} data-script={story.script}>
                  {story.passage}
                </p>
                <div className={k.sideTags}>
                  {story.tags.map((tag) => (
                    <TagPill key={tag} size="sm" color={`var(--card-tag-${story.family})`}>
                      {tag}
                    </TagPill>
                  ))}
                  <Link href={story.href} className={k.sideRead} tabIndex={-1}>
                    {t.contents.readThis} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

/** A phone's ≋ row before the contents: 點點 lands here (the margin is 0 on a phone). */
function PipDinkus({ line }: { line: string }) {
  const layer = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const phone = useMedia('(max-width: 639px)');
  useLiveStage(
    layer,
    (kit, el) => {
      const h = kit.mountLive(window, el, {
        createStage: kit.createStage,
        cast: kit.cast.filter((c) => c.slug === 'dot'),
        spots: [
          { id: 'home', still: 'dot', enter: 'pop', acts: ['look', 'hop', 'wave', 'deco'] },
          { id: 'nook', still: 'dot', dx: 150, acts: ['look', 'hop', 'wave'] },
        ],
        floor: { acts: ['look', 'hop', 'wave'], inset: 24 },
        options: { first: [999, 999], visit: [16, 26], gap: [1.5, 3.5], pairChance: 0, meetChance: 0, greetChance: 0 },
        onEvent: (e) => {
          if (e.type === 'enter') setLive(true);
        },
      });
      askVisit(window, () => !!h.stage()?.visit({ ledge: 'home', slug: 'dot', acts: ['hop', 'look'] }));
      return h;
    },
    { enabled: phone === true },
  );
  return (
    <div className={k.dinkus} aria-hidden="true">
      <div ref={layer} className={k.dinkusLayer} data-live={live ? '' : undefined}>
        <span className={k.dinkusFloor}>
          <PenRule seed={503} amp={1} draw="none" />
        </span>
        <span className={k.dinkusMark}>
          <Waves width={40} />
        </span>
        <span className={k.dinkusStill} data-still="dot" data-below={STILLS.dot.below}>
          <PaperPalStill still={STILLS.dot} phase={0.3} />
        </span>
        <span className={k.dinkusLine}>{line}</span>
      </div>
    </div>
  );
}
