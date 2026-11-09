'use client';

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { GetTheApp } from '@/components/molecules/GetTheApp/GetTheApp';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { Link } from '@/i18n/navigation';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { wavyLine } from '@/lib/design/wavyPath';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { copyFor } from './copy';
import type { IssueStory } from './data';
import { Kicker } from './marks';
import { LinkPill } from './LinkPill';
import { STILLS } from './stills';
import { useDrawnOnView } from './useDrawn';
import { askVisit, useLiveStage } from './useLiveStage';
import s from './issue.module.css';
import l from './last.module.css';

/**
 * Ruled lines as a mask tile: three hand-drawn rules, one at the foot of each of three lines `lh` px tall (three seeds,
 * so the paper doesn't repeat itself line after line). Each line of the ruled page wears it under its own line boxes,
 * so a heading that wraps gets a rule under every line, and a rule never runs through a button or a badge.
 */
function ruleTile(lh: number, seed: number): string {
  const paths = [0, 1, 2]
    .map((i) => `<path d="${wavyLine(600, seed + i * 13, 0.9, 8)}" transform="translate(0 ${lh * (i + 1) - 1.6})"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 ${lh * 3}" preserveAspectRatio="none"><g fill="none" stroke="black" stroke-width="${INK_LIGHT}" stroke-linecap="round">${paths}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * 04 最後一頁: the issue ends on a spread too — on the left a story printed nowhere else in the issue, trailing off;
 * on the right a blank page ruled by hand, where everything stands on a rule: 聆聆's pencilled line on the first, the
 * heading on the next (a rule under every line it wraps to), the line under it, each row of buttons and the badges.
 * 聆聆, the index card that writes down what it hears, stands at the heading's first rule (on a phone, on a rule of its
 * own above it), writes, then points at 寫下你的故事.
 */
export function LastPage({ locale, story }: { locale: string; story: IssueStory | null }) {
  const t = copyFor(locale);
  const pages = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const write = useRef<HTMLAnchorElement>(null);
  const { w, h } = useElementSize(pages, 1100, 640);
  const [live, setLive] = useState(false);
  useDrawnOnView(pages, 0.3);
  // the rule tiles, one for a line one rule tall (the line, the badges' row) and one for two (the heading, the buttons)
  const tiles = useMemo(() => ({ '--rule-1': ruleTile(34, 1201), '--rule-2': ruleTile(68, 1301) }) as CSSProperties, []);

  useLiveStage(layer, (kit, el) => {
    const target = (box: DOMRect) => {
      const b = write.current?.getBoundingClientRect();
      return b ? ([b.left + b.width / 2 - box.left, b.top + b.height / 2 - box.top] as [number, number]) : undefined;
    };
    const handle = kit.mountLive(window, el, {
      createStage: kit.createStage,
      cast: kit.cast.filter((c) => c.slug === 'card'),
      spots: [{ id: 'rule', still: 'card', enter: 'pop', acts: ['write', 'look', 'point', 'write', 'wave'], target }],
      options: { first: [999, 999], visit: [40, 70], gap: [1.5, 3], pairChance: 0, meetChance: 0, greetChance: 0 },
      onEvent: (e) => {
        if (e.type === 'enter') setLive(true);
      },
    });
    // once the page is mostly in view: it pops up where its still stood, writes, then points at 寫下你的故事
    const sight = new IntersectionObserver(
      (entries) => {
        if (!entries.some((x) => x.isIntersecting)) return;
        sight.disconnect();
        askVisit(window, () => !!handle.stage()?.visit({ ledge: 'rule', slug: 'card', acts: ['write', 'point'] }));
      },
      { threshold: 0.5 },
    );
    sight.observe(el.parentElement ?? el);
    return {
      ...handle,
      destroy() {
        sight.disconnect();
        handle.destroy();
      },
    };
  });

  return (
    <section className={l.last} aria-labelledby="last-title">
      <div className={s.sheet}>
        <span className={s.folio} aria-hidden="true">
          04
        </span>
        <Kicker>{t.last.kicker}</Kicker>
      </div>
      <div className={l.book}>
        <div ref={pages} className={l.pages}>
          <div className={l.sheetBorder} aria-hidden="true">
            <HandDrawnBorder w={w} h={h} R={22} seed={907} fillColor="var(--color-card-bg)" strokeColor="var(--field-border)" strokeWidth={INK} />
          </div>
          {story && (
            <div className={l.left}>
              <p className={l.leftTitle} lang={story.lang} data-script={story.script}>
                {story.title}
              </p>
              <p className={l.leftOpening} lang={story.lang} data-script={story.script}>
                {story.excerpt}
              </p>
              <p className={l.leftMeta}>
                <span>{story.author ?? t.cover.unsigned}</span>
                <span aria-hidden="true">·</span>
                <Link href={story.href} className={s.textLink}>
                  {t.last.finish}
                  <span aria-hidden="true"> →</span>
                </Link>
              </p>
            </div>
          )}
          <div className={l.fold} aria-hidden="true" />
          <div className={l.blank} style={tiles}>
            {/* the first rule: 聆聆's pencilled line (and, on a phone, 聆聆 itself standing at its end) */}
            <div className={`${l.nodRow} ${l.ruled}`} aria-hidden="true" style={{ '--row': 0 } as CSSProperties}>
              <span className={l.nodLine}>
                <span className={l.sit}>{t.last.nod}</span>
              </span>
            </div>
            <div ref={layer} className={l.nodLayer} aria-hidden="true" data-live={live ? '' : undefined}>
              <span className={l.nodStill} data-still="card" data-below={STILLS.card.below}>
                <PaperPalStill still={STILLS.card} phase={2.2} />
              </span>
            </div>
            <h2 id="last-title" className={`${s.h2} ${l.h2} ${l.ruled}`} style={{ '--row': 1 } as CSSProperties}>
              <span className={l.sit}>{t.last.title}</span>
            </h2>
            <p className={`${l.line} ${l.ruled}`} style={{ '--row': 2 } as CSSProperties}>
              <span className={l.sit}>{t.last.line}</span>
            </p>
            <div className={`${l.actions} ${l.ruled}`} style={{ '--row': 3 } as CSSProperties}>
              <span className={l.action}>
                <LinkPill href="/write" variant="solid" linkRef={write}>
                  {t.last.write}
                </LinkPill>
              </span>
              <span className={l.action}>
                <LinkPill href="/home" variant="tonal">
                  {t.last.read}
                </LinkPill>
              </span>
            </div>
            <div className={`${l.apps} ${l.ruled}`} style={{ '--row': 4 } as CSSProperties}>
              <span className={l.phone}>{t.last.phone}</span>
              <GetTheApp qr={false} size="sm" className={l.badges} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
