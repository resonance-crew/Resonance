'use client';

/**
 * The film's cards are the platform's own (the owner, round 3: 「改的和原本首頁的設計是一樣的」): every one is the
 * landing page's `StoryCard` — its hand-drawn outline, chalk-free still grain, the cover in its organic clip, the tags,
 * the title, the excerpt, the wavy rule and the byline — framed at every width (it floats over the stage), each in the
 * colour family the film's list gave it.
 * - FilmStoryCard: a story, a link to its card page (摺摺's card, the answer, the night's stories);
 * - DrawnCard: 聆聆's own answer as a drawing in the same shape (the lab's `?b=drawn`; aria-hidden, never focusable);
 * - CtaCard: the card of the story not written yet — a page being written for its cover (three ruled lines, a pencil
 *   on the first), the night's line, and one action.
 * Each is laid out at full size and only ever scaled down by the director.
 */
import { useEffect, useRef, useState } from 'react';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { StoryCard, type Story } from '@/components/molecules/StoryCard/StoryCard';
import { Link } from '@/i18n/navigation';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { wavyLine } from '@/lib/design/wavyPath';
import { wobRect } from '@/lib/design/wobRect';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { copyFor } from './copy';
import grainTile from './grain.png';
import type { FilmTile } from './model';
import styles from './film.module.css';

/** The stage's grain tile (a bitmap: a card moving on every frame wears no live filter). */
export const STILL_GRAIN: string = typeof grainTile === 'string' ? grainTile : (grainTile as { src: string }).src;

/** A tile as the StoryCard draws it (the feed's adapter, cardToStory, from the fields the film may hold). */
export function storyOf(tile: FilmTile, locale: string, opts: { cover?: boolean; avatar?: boolean; tags?: number } = {}): Story {
  const c = copyFor(locale).card;
  return {
    title: tile.title,
    excerpt: tile.excerpt,
    author: tile.author?.name ?? c.anonymous,
    authorInitials: tile.author?.initials ?? '·',
    // a deferred card's avatar waits with its cover (its initials meanwhile): a card never seen fetches neither
    avatarUrl: opts.avatar === false ? undefined : tile.author?.avatar,
    avatarSeed: tile.author?.seed ?? tile.anonSeed,
    readTime: c.minutes(tile.minutes),
    tags: (tile.tags ?? []).slice(0, opts.tags ?? 4),
    imageUrl: opts.cover === false ? undefined : tile.cover,
    imageLabel: tile.title.slice(0, 24),
  };
}

/**
 * Whether a card's cover may be fetched yet: at once, or (`defer`) once the director says its slot is about to be
 * seen (`data-covers` on the slot: live, or a scene ahead) — a hidden card in the first screen's viewport would
 * otherwise fetch its cover with the page, lazy or not. Until then the cover's place shows the card's own stripes.
 */
function useCoverWanted(defer: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [wanted, setWanted] = useState(!defer);
  useEffect(() => {
    if (wanted) return;
    const slot = ref.current?.closest<HTMLElement>('[data-slot]');
    if (!slot) {
      setWanted(true);
      return;
    }
    const check = () => {
      if (slot.hasAttribute('data-covers')) setWanted(true);
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(slot, { attributes: true, attributeFilter: ['data-covers'] });
    return () => mo.disconnect();
  }, [wanted]);
  return { ref, wanted };
}

export interface FilmStoryCardProps {
  tile: FilmTile;
  locale: string;
  /** What the runtime and the tests know it by (`data-film-card`). */
  id: string;
  /** Its cover fetched only once its slot is about to be seen. */
  defer?: boolean;
  /** At most this many tags (a small card keeps to one row). */
  tags?: number;
  /** The position seed of its outline (the feed's `index`). */
  index?: number;
  onOpen?: () => void;
}

/** A real story, as the landing page draws it, framed: a link to its card page. */
export function FilmStoryCard({ tile, locale, id, defer = false, tags, index = 0, onOpen }: FilmStoryCardProps) {
  const { ref, wanted } = useCoverWanted(defer);
  const story = storyOf(tile, locale, { cover: wanted, avatar: wanted, tags });
  return (
    <div ref={ref} className={styles.filmCard} data-film-card={id}>
      {/* no prefetch as it comes into view: the stage holds five of these from the first frame (hidden ones too), and
          each card page fetched then is 100 KB taken from the film's own start; a pointer over one still fetches it */}
      <Link href={tile.href} className={styles.cardLink} onClick={onOpen} prefetch={false}>
        <StoryCard
          story={story}
          index={index}
          palette={tile.family}
          framed
          stillGrain={STILL_GRAIN}
          // its stripes, unlabelled, while its cover waits to be fetched
          coverSlot={tile.cover && !wanted ? <span /> : undefined}
        />
      </Link>
    </div>
  );
}

/* ───────────── 聆聆's drawing (?b=drawn) ───────────── */

const DRAWN_FILL = 'oklch(90% 0.035 290)';
const DRAWN_PEN = 'oklch(40% 0.03 290)';

/** A tiny seeded wobble, for the crayon's hand. */
const jit = (seed: number) => {
  let x = seed * 9301 + 49297;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280 - 0.5;
  };
};

/** Handwriting no one can read: a looping pencil line (a prolate cycloid, wobbled), `len` long, about 9 tall. */
function scribble(len: number, seed: number): string {
  const r = jit(seed);
  const pts: string[] = [];
  const step = 0.32;
  const a = 2.1;
  const d = 3.3;
  for (let t = 0; a * t - d * Math.sin(t) < len - 4; t += step) {
    const x = a * t - d * Math.sin(t) + 3;
    const y = 5 - d * Math.cos(t) * (0.8 + 0.25 * Math.sin(t * 0.37 + seed)) + r() * 0.5;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join('L')}`;
}

/**
 * 聆聆's own answer card as a drawing (the lab's `?b=drawn`), in the story card's shape: its lavender paper in the
 * card's outline, a crayon picture where the cover would be (a sun over a hill), looping pencil "handwriting" for the
 * title and the story, the wavy rule, a dot and a line for the byline.
 */
export function DrawnCard() {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, 300, 440);
  const d = w > 0 && h > 0 ? wobRect(w, h, 22, 67, Math.min(w, h) * 0.025, { segmentsH: [3, 4], segmentsV: [5, 6], curve: 0.55, cornerJitter: 0.7, cornerOffset: 4 }) : '';
  const r = jit(7);
  const sun = Array.from({ length: 13 }, (_, i) => {
    const t = (i / 12) * Math.PI * 2;
    const rr = 18 + r() * 2;
    return `${(200 + Math.cos(t) * rr).toFixed(1)},${(52 + Math.sin(t) * rr).toFixed(1)}`;
  });
  return (
    <div ref={ref} className={styles.drawnCard} aria-hidden="true" data-film-card="drawn">
      <svg className={styles.drawnPaper} width={w} height={h} viewBox={`0 0 ${w || 1} ${h || 1}`} focusable="false">
        {d && <path d={d} fill={DRAWN_FILL} stroke={DRAWN_PEN} strokeWidth={INK} strokeLinejoin="round" />}
      </svg>
      <div className={styles.drawnInner}>
        <svg className={styles.drawnCover} viewBox="0 0 256 158" preserveAspectRatio="xMidYMid slice" focusable="false">
          {/* crayon: a sun, its rays, a hill */}
          <rect x="2" y="2" width="252" height="154" rx="16" fill="oklch(95% 0.02 290)" stroke={DRAWN_PEN} strokeWidth={INK_LIGHT} strokeOpacity={0.5} />
          <path d={`M${sun.join('L')}Z`} fill="oklch(86% 0.12 85)" stroke="oklch(72% 0.14 70)" strokeWidth={INK} strokeLinejoin="round" />
          <path d="M200 22 v-10 M226 32 l7 -7 M232 54 h10 M174 32 l-7 -7" stroke="oklch(72% 0.14 70)" strokeWidth={INK} strokeLinecap="round" />
          <path d="M6 120 C46 82 92 84 124 104 C150 92 196 86 250 112 L250 152 L6 152 Z" fill="oklch(72% 0.09 150)" stroke="oklch(48% 0.07 150)" strokeWidth={INK} strokeLinejoin="round" />
        </svg>
        <svg className={styles.drawnLines} viewBox="0 0 256 92" preserveAspectRatio="xMinYMid meet" focusable="false">
          {[
            [0, 190, 3],
            [26, 120, 5],
            [56, 236, 9],
            [76, 168, 11],
          ].map(([y, len, seed]) => (
            <path key={seed} d={scribble(len, seed)} transform={`translate(0 ${y})`} fill="none" stroke={DRAWN_PEN} strokeWidth={INK_LIGHT} strokeLinecap="round" strokeLinejoin="round" opacity={y < 40 ? 1 : 0.6} />
          ))}
        </svg>
        <svg className={styles.drawnRule} viewBox="0 0 200 6" preserveAspectRatio="none" focusable="false">
          <path d={wavyLine(200, 91, 1.2, 6)} transform="translate(0 3)" fill="none" stroke={DRAWN_PEN} strokeWidth={INK_LIGHT} strokeLinecap="round" opacity={0.6} />
        </svg>
        <span className={styles.drawnByline}>
          <span className={styles.drawnDot} />
          <svg viewBox="0 0 60 8" width="60" height="8" focusable="false">
            <path d={wavyLine(48, 85, 1, 4)} transform="translate(0 4)" fill="none" stroke="var(--color-text-muted)" strokeWidth={INK_LIGHT} strokeLinecap="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

/* ───────────── the card of the story not written yet ───────────── */

/** The family the night's card wears: a calm one (cardColours' order), whatever tonight's list gave the others. */
export const CTA_FAMILY = 4;

/**
 * The night's call to action (SPEC §5.5; the owner, round 3: 「看起來也很擁擠…不是我們原本首頁的卡片的設計」): the
 * story card of a story not written yet — the striped cover a card wears before its picture, with a pen on it; the
 * line 「下一個故事，由你來寫」 as its title (a heading only by look: the h2s are the narration's); one line under it;
 * and, in place of a byline, its one action, 寫下你的故事.
 */
/**
 * The night card's cover: a page being written — three ruled lines in the card's own pen, the first begun in ink, a
 * pencil at the place it has reached. Round 4 (the owner's list: 「夜晚那張空白卡片的條紋封面，看起來還有點像圖片沒載入」):
 * the stripes a card wears before its picture read as a picture that failed to load; this is plainly a drawing.
 */
function CtaCover() {
  const rule = (y: number, seed: number, w = 190) => <path d={wavyLine(w, seed, 1.6, 6)} transform={`translate(65 ${y})`} />;
  return (
    <svg className={styles.ctaCover} viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g className={styles.ctaRules} strokeWidth={INK}>
        {rule(64, 11)}
        {rule(100, 12)}
        {rule(136, 13, 120)}
      </g>
      <path d={wavyLine(84, 11, 1.6, 3)} transform="translate(65 64)" className={styles.ctaInk} strokeWidth={INK} />
      {/* the pencil, its point where the line has got to */}
      <g transform="translate(150 63) rotate(38)" className={styles.ctaPencil}>
        <path d="M-5 -58C-5 -61 5 -61 5 -58L5.4 -12L0 0L-5.4 -12Z" className={styles.ctaPencilBody} strokeWidth={INK_LIGHT} />
        <path d="M-5.3 -12L0 0L5.3 -12" className={styles.ctaPencilTip} strokeWidth={INK_LIGHT} />
        <path d="M-5 -50L5 -50" className={styles.ctaPencilBand} strokeWidth={INK_LIGHT} />
      </g>
    </svg>
  );
}

export function CtaCard({ locale }: { locale: string }) {
  const c = copyFor(locale).cta;
  const story: Story = { title: c.line, excerpt: c.sub, author: '', authorInitials: '', readTime: '', tags: [] };
  return (
    <div className={styles.ctaCard} data-film-card="cta">
      {/* a picture of a card, not a link to one: its one link is the action */}
      <StoryCard
        story={story}
        index={3}
        palette={CTA_FAMILY}
        framed
        preview
        stillGrain={STILL_GRAIN}
        coverSlot={<CtaCover />}
        foot={
          <Link href="/write" className={styles.ctaWrite} prefetch={false}>
            <OrganicButton variant="solid" block>
              {c.write}
            </OrganicButton>
          </Link>
        }
      />
    </div>
  );
}
