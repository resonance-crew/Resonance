'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Divider } from '@/components/atoms/Divider/Divider';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { whenIdle } from '@/components/sections/LandingStage/LandingStage';
import { Link } from '@/i18n/navigation';
import { cardVar } from '@/lib/design/cardColours';
import { INK_LIGHT } from '@/lib/design/strokes';
import type { Ledge } from '@/lib/mascots/types';
import type { Still } from '@/lib/mascots/pals/still';
import { storyType } from '@/lib/text/script';
import { Chip } from './Chip';
import { copyFor } from './copy';
import { LinkButton } from './LinkButton';
import { Paper } from './Paper';
import { pickStory } from './rest';
import type { LabStory } from './story';
import { useSoloStage, type SoloBuild } from './useSolo';
import s from './shelf.module.css';

/** 點點 on the shelf's top rule: hopping along it, stopping over a card to look down at it. */
const RULE_ACTS = ['hop', 'look', 'wave'];
const OVER_ACTS = ['look', 'hop', 'look'];

/** The top rule's places, in the strip's own px: the rule itself, and a spot over each card in reach below it. */
function shelfBuild(win: Window, root: HTMLElement): SoloBuild | null {
  const box = root.getBoundingClientRect();
  if (box.width <= 0) return null;
  const y = Math.round(box.height - 12);
  const section = root.closest('section');
  const cards = Array.from(section?.querySelectorAll<HTMLElement>('[data-shelf-card]') ?? [])
    .map((el) => el.getBoundingClientRect())
    // the first row (the cards right under the rule), and on a phone those in view across the row
    .filter((r) => r.top - box.bottom < 80 && r.left < box.right - 40 && r.right > box.left + 40);
  const ledges: Ledge[] = [{ id: 'rule', kind: 'line', points: [[6, y], [box.width - 6, y]], acts: RULE_ACTS, weight: 0.6 }];
  const xs = cards.length
    ? cards.map((r) => Math.min(Math.max((r.left + r.right) / 2 - box.left, 60), box.width - 60))
    : [box.width * 0.3, box.width * 0.72];
  xs.forEach((x, i) => {
    ledges.push({
      id: `over-${i}`,
      kind: 'spot',
      x: Math.round(x),
      y,
      stance: 'stand',
      acts: OVER_ACTS,
      // what it looks down at: the card's middle
      target: [Math.round(x), y + 140],
    });
  });
  const first = `over-${Math.min(1, xs.length - 1)}`;
  return { box: { x: 0, y: 0, w: box.width, h: box.height }, ledges, first: { ledge: first, slug: 'dot', acts: ['hop', 'look'] } };
}

function ShelfCard({ story, index, locale }: { story: LabStory; index: number; locale: string }) {
  const c = copyFor(locale);
  const type = storyType(story.title, story.opening);
  const latin = type.script === 'latin' ? 'latin' : undefined;
  return (
    <article className={s.cardBox} data-shelf-card="">
      <Paper seed={140 + index * 37} fill={cardVar('interior', story.palette)} pen={cardVar('border', story.palette)} className={s.card} bodyClassName={s.cardBody}>
        {story.cover && (
          <OrganicImage src={story.cover} alt="" seed={index * 13 + 5} ratio={0.5} className={s.cover} />
        )}
        <h3 className={`story-title ${s.title}`} data-script={latin} data-density="compact" lang={type.lang}>
          <Link href={story.href} className={s.link}>
            {story.title}
          </Link>
        </h3>
        <p className={`story-prose ${s.excerpt}`} data-script={latin} data-density="compact" lang={type.lang} data-cover={story.cover ? '' : undefined}>
          {story.opening}
        </p>
        <div className={s.foot}>
          <p className={s.byline}>
            <span className={s.author}>{story.author ?? c.story.anonymous}</span>
            <span aria-hidden="true"> · </span>
            {c.story.minutes(story.minutes)}
          </p>
          <Chip seed={71 + index * 11} className={s.answerThis} label={c.shelf.answerThisAria(story.title)} onClick={() => pickStory(story.id)}>
            {c.shelf.answerThis}
          </Chip>
        </div>
      </Paper>
    </article>
  );
}

/** A shelf's drawn line, the width of the list (decoration: the list's own items are the cards). */
function ShelfLine({ seed }: { seed: number }) {
  return (
    <li className={s.shelfLine} role="presentation" aria-hidden="true">
      <Divider seed={seed} amplitude={1.3} steps={12} strokeWidth={INK_LIGHT} spacing={0} color="color-mix(in oklch, var(--soft-pen) 45%, transparent)" />
    </li>
  );
}

function FragmentRow({ children, lineAfter, seed }: { children: ReactNode; lineAfter: boolean; seed: number }) {
  return (
    <>
      {children}
      {lineAfter && <ShelfLine seed={seed} />}
    </>
  );
}

/**
 * The other stories, each waiting for an answer: on a wide screen standing on two drawn shelves (bottom-aligned, no
 * carousel), on a phone a native swipe row with the next card peeking in. 點點 lives on the top rule, hopping along
 * it and looking down at the cards (its own stage). Every card links to its page; 「回應這個」 brings it to the desk.
 */
export function Shelf({ stories, locale, still }: { stories: LabStory[]; locale: string; still: Still }) {
  const c = copyFor(locale);
  const stripRef = useRef<HTMLDivElement>(null);
  const live = useSoloStage(stripRef, { slug: 'dot', build: shelfBuild, threshold: 0.6 });
  const sectionRef = useRef<HTMLElement>(null);
  // the covers are lazy in the HTML (none on the first paint); once the page is idle they come in, so the shelf is
  // whole by the time anyone scrolls to it (never under Save-Data)
  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData) return;
    let t = 0;
    const cancel = whenIdle(window, () => {
      t = window.setTimeout(() => {
        sectionRef.current?.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((img) => {
          img.loading = 'eager';
          img.decoding = 'auto';
          img.decode?.().catch(() => {});
        });
      }, 1200);
    });
    return () => {
      cancel();
      window.clearTimeout(t);
    };
  }, []);
  return (
    <section ref={sectionRef} className={s.shelf} aria-labelledby="shelf-title">
      <SectionEdge topColor="var(--color-cream)" seed={41} height={80} amplitude={0.12} steps={14} stroke="color-mix(in oklch, var(--soft-pen) 28%, transparent)" strokeWidth={INK_LIGHT} />
      <div className={s.inner}>
        <div className={s.heading}>
          <h2 id="shelf-title" className={s.h2}>
            {c.shelf.title}
          </h2>
          <p className={s.sub}>{c.shelf.sub}</p>
        </div>

        <div ref={stripRef} className={s.strip} aria-hidden="true">
          <div className={s.rule}>
            <Divider seed={57} amplitude={1.5} steps={11} strokeWidth={INK_LIGHT} spacing={0} color="color-mix(in oklch, var(--soft-pen) 55%, transparent)" />
          </div>
          <span className={s.still} data-gone={live ? '' : undefined} style={{ '--x': 0.5 } as CSSProperties}>
            <PaperPalStill still={still} waveArm="r" phase={2.2} />
          </span>
        </div>

        {/* one list: on a wide screen two shelves, the cards standing on their lines; on a phone one row to swipe */}
        <ul className={s.cards} aria-label={c.shelf.title}>
          {stories.map((story, i) => (
            <FragmentRow key={story.id} lineAfter={i === 2} seed={91}>
              <li className={s.item}>
                <ShelfCard story={story} index={i} locale={locale} />
              </li>
            </FragmentRow>
          ))}
          <li className={s.browseItem}>
            <LinkButton href="/home" variant="tonal">
              {c.shelf.browse} <span aria-hidden="true">→</span>
            </LinkButton>
          </li>
          <ShelfLine seed={104} />
        </ul>
      </div>
    </section>
  );
}
