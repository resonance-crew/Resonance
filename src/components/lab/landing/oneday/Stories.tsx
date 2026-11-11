'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from '@/i18n/navigation';
import { cardVar } from '@/lib/design/cardColours';
import { INK, INK_LIGHT, INK_STRONG } from '@/lib/design/strokes';
import { wavyLine } from '@/lib/design/wavyPath';
import { Clauses } from './Clauses';
import { copyFor } from './copy';
import { Flats } from './Flats';
import { FLOOR_SEED } from './floor';
import { PalAt } from './PalAt';
import { Paper } from './Paper';
import { PillButton, PillLink } from './PillLink';
import type { Stills, Tile } from './tiles';
import { stagedAttrs, useScene } from './useScene';
import styles from './oneday.module.css';

/** A shelf: a plank's lip in the section's darker paper under a pen line the row's cards stand on. */
function Shelf({ seed }: { seed: number }) {
  return (
    <svg className={styles.shelfBand} viewBox="0 0 1440 24" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${wavyLine(1440, seed, 1.6, 12)} L 1440,18 C 960,19.5 480,17 0,18.5 Z`} transform="translate(0 4)" fill="var(--shelf-lip)" />
      <path d={wavyLine(1440, seed, 1.6, 12)} transform="translate(0 4)" fill="none" stroke="var(--shelf-pen)" strokeWidth={INK_STRONG}
        strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d="M0,22.5 C480,21 960,23.5 1440,22" fill="none" stroke="var(--shelf-pen-light)" strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** One real story: its paper in its family's colours, its cover only if it has one (never a grey box). */
function StoryTile({ tile, index, locale }: { tile: Tile; index: number; locale: string }) {
  const c = copyFor(locale).stories;
  const f = tile.family;
  return (
    <Link href={tile.href} className={styles.tileLink}>
      <Paper
        seed={index * 77 + 13}
        fill={cardVar('interior', f)}
        pen={cardVar('border', f)}
        penWidth={INK}
        radius={20}
        className={styles.tile}
        outline={`tile-${index}`}
        as="article"
      >
        {tile.cover && (
          <div className={styles.tileCover} style={{ '--cover-wash': cardVar('accent', f) } as CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the card's own stored cover, as every card list draws it */}
            <img src={tile.cover} alt="" fetchPriority="low" decoding="async" />
          </div>
        )}
        <div className={styles.tileBody} data-script={tile.script} lang={tile.lang}>
          <h3 className={styles.tileTitle}>{tile.title}</h3>
          {tile.excerpt && <p className={styles.tileExcerpt}>{tile.excerpt}</p>}
          <p className={styles.tileByline} lang={locale}>
            <span className={styles.tileAvatar} style={{ '--avatar': cardVar('accent', f), '--avatar-pen': cardVar('border', f) } as CSSProperties} aria-hidden="true">
              {tile.author?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- the author's stored photo
                <img src={tile.author.avatar} alt="" loading="lazy" decoding="async" />
              ) : (
                tile.author?.initials ?? '·'
              )}
            </span>
            <span className={styles.tileName}>{tile.author?.name ?? c.anonymous}</span>
            <span className={styles.tileMinutes}>{c.minutes(tile.minutes)}</span>
          </p>
        </div>
      </Paper>
    </Link>
  );
}

/**
 * Noon · now showing: the six newest real stories, right after the cover. On a desktop they stand on two drawn
 * shelves, bottom-aligned, as books do (heights differ: a cover or none); on a phone they are a 紙芝居 — a pen-drawn
 * frame holding a row that snaps card by card, the next ones' coloured edges stacked at the frame's side, ‹ › to pull
 * the next, nothing moving on its own. 聆聆 reads on a card's top (the frame's, on a phone); 點點 peeks past the end.
 */
export function Stories({ locale, tiles, stills }: { locale: string; tiles: Tile[]; stills: Pick<Stills, 'card' | 'dot'> }) {
  const c = copyFor(locale).stories;
  const root = useRef<HTMLElement>(null);
  const row = useRef<HTMLOListElement>(null);
  const [at, setAt] = useState(0);
  const scene = useScene(root, () => import('./scenes').then((m) => m.storiesScene()));
  // The reading seat: the first card of the top shelf without a cover (the shortest, so there is room above it).
  const seat = Math.max(0, tiles.slice(0, 2).findIndex((t) => !t.cover));

  const step = useCallback((dir: number) => {
    const el = row.current;
    if (!el) return;
    const item = el.querySelector('li');
    const w = item ? item.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || '0') : el.clientWidth;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * w, behavior: calm ? 'auto' : 'smooth' });
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const read = () => {
      const item = el.querySelector('li');
      if (!item) return;
      const w = item.getBoundingClientRect().width + (parseFloat(getComputedStyle(el).columnGap || '0') || 0);
      setAt(Math.max(0, Math.min(tiles.length - 1, Math.round(el.scrollLeft / Math.max(1, w)))));
    };
    el.addEventListener('scroll', read, { passive: true });
    return () => el.removeEventListener('scroll', read);
  }, [tiles.length]);

  // The covers decoded once the page is idle, so a story's picture is ready the moment its shelf comes into view
  // (they load at a low priority with the page, not when scrolled to: a shelf is read at a glance, not card by card).
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => el.querySelectorAll('img').forEach((img) => img.decode?.().catch(() => {})));
    return () => cancel(id);
  }, []);

  const stack = [1, 2, 3].map((k) => tiles[at + k]).filter(Boolean);

  return (
    <section ref={root} className={styles.stories} data-scene="stories" aria-labelledby="oneday-stories" {...stagedAttrs(scene)}>
      <header className={styles.sectionHead}>
        <h2 id="oneday-stories" className={styles.h2}>{c.title}</h2>
        <p className={styles.sectionSub}><Clauses text={c.sub} /></p>
      </header>

      <div className={styles.kami}>
        <div className={styles.kamiWindow}>
        {/* the 紙芝居's frame (a phone's): terracotta pen, the stage of one story at a time */}
        <Paper seed={211} fill="var(--paper-stories)" pen="var(--terracotta-outline)" penWidth={INK_STRONG} radius={22} grain={0} className={styles.kamiFrame} outline="frame">
          <span className={styles.kamiStill} aria-hidden="true">
            <PalAt still={stills.card} live={scene.live.has('card')} phase={1.2} managed />
          </span>
        </Paper>
        <span className={styles.kamiPeek} aria-hidden="true">
          <PalAt still={stills.dot} live={scene.live.has('dot')} phase={2.6} managed />
        </span>
        <span className={styles.kamiStack} aria-hidden="true">
          {stack.map((t, k) => (
            <span key={t.id} className={styles.kamiEdge} style={{ '--k': k, '--edge': cardVar('fill', t.family), '--edge-pen': cardVar('border', t.family) } as CSSProperties} />
          ))}
        </span>
        <ol ref={row} className={styles.shelf} aria-label={c.frame}>
          {tiles.map((t, i) => (
            <li
              key={t.id}
              className={styles.shelfItem}
              data-seat={i === seat ? '' : undefined}
              aria-setsize={tiles.length}
              aria-posinset={i + 1}
            >
              <StoryTile tile={t} index={i} locale={locale} />
              {/* the shelf the row stands on (drawn by the row's first card, edge to edge of the view) */}
              <Shelf seed={31 + i * 17} />
              {i === seat && (
                <span className={styles.shelfReader} aria-hidden="true">
                  <PalAt still={stills.card} live={scene.live.has('card')} phase={1.2} managed />
                </span>
              )}
              {i === 0 && (
                // the top shelf's end, past the last card: 點點's place
                <span className={styles.shelfEnd} data-shelf-end="" aria-hidden="true">
                  <PalAt still={stills.dot} live={scene.live.has('dot')} waveArm="l" phase={2.6} managed />
                </span>
              )}
            </li>
          ))}
        </ol>
        </div>
        <div className={styles.kamiControls}>
          <PillButton face="tonal" size="sm" onClick={() => step(-1)} disabled={at === 0}>
            <span aria-hidden="true">‹</span>
            {c.prev}
          </PillButton>
          <p className={styles.kamiPos} aria-live="polite">{c.position(at + 1, tiles.length)}</p>
          <PillButton face="tonal" size="sm" onClick={() => step(1)} disabled={at >= tiles.length - 1}>
            {c.next}
            <span aria-hidden="true">›</span>
          </PillButton>
        </div>
      </div>

      <div className={styles.storiesAll}>
        <PillLink href="/home" face="tonal">
          {c.all}
          <span aria-hidden="true"> →</span>
        </PillLink>
      </div>

      <Flats seed={FLOOR_SEED.stories} from="var(--paper-stories)" to="var(--paper-answer)" tint="var(--color-yellow)" />
    </section>
  );
}
