'use client';

import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { GrainOverlay } from '@/components/atoms/GrainOverlay/GrainOverlay';
import { STORY_GRAIN } from '@/lib/design/grain';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import type { CoverFrame } from '@/lib/images/coverFrame';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { wobRect } from '@/lib/design/wobRect';
import { wavyLine } from '@/lib/design/wavyPath';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { cardVar, preferredPalette } from '@/lib/design/cardColours';
import { personFill } from '@/lib/design/personFill';
import styles from './MiniStoryCard.module.css';

export interface MiniStoryCardProps {
  title: string;
  author: string;
  authorInitials: string;
  authorSeed?: number;
  authorAvatarUrl?: string;
  imageUrl?: string;
  imageLabel?: string;
  /** Where the cover is looked at (`media.frame`, round 25 §G1). */
  imageFrame?: CoverFrame;
  /** Cover-image dominant hue snapped to the card palette (see lib/design/dominantHue). */
  accentHue?: number;
  index?: number;
  isLast?: boolean;
  /** The colour family its list chose (`cardPalettes`); unset: its own (cover hue, else position). */
  palette?: number;
}

/**
 * A pared-back story card — image, title, author only. No excerpt, no tags, no
 * read-time. Used in the "linked cards" surfaces (card detail + profile). Stays
 * clickable (its grid wraps it in a Link). Follows the same organic chrome and
 * mobile-bleed degradation as {@link StoryCard}.
 */
export function MiniStoryCard({
  title,
  author,
  authorInitials,
  authorSeed,
  authorAvatarUrl,
  imageUrl,
  imageLabel,
  imageFrame,
  accentHue,
  index = 0,
  isLast = false,
  palette,
}: MiniStoryCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLElement>(null);
  const { w, h } = useElementSize(cardRef, 320, 320);
  const isMobile = useIsMobile();

  const recordPointer = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  // The list's choice (no neighbour shares it), else the cover's family or the position's.
  const paletteIdx = palette ?? preferredPalette(accentHue, index);
  // The family's palette tokens (palette.css), so the server's paint is right in either scheme.
  const bc1 = cardVar('border', paletteIdx);
  // The avatar and an empty cover wear the card's own family, never the author's colour: on a card's
  // paper another person's colour fought it (the owner, 2026-10-29).
  const accent = cardVar('accent', paletteIdx);
  const fallback = personFill(accent);
  const seed = index * 71 + 19;
  const R = 20;
  const mag = Math.min(w, h) * 0.025;

  const cardInterior = cardVar('interior', paletteIdx);
  const cardHovered = cardVar('hover', paletteIdx);
  const dividerPath = useMemo(() => wavyLine(200, seed + 17, 1.4, 7), [seed]);

  const borderPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, seed, mag, {
      segmentsH: [3, 4],
      segmentsV: [4, 5],
      curve: 0.6,
      cornerJitter: 0.7,
      cornerOffset: 4,
    });
  }, [w, h, seed, mag]);

  const mobileBleed = 'clamp(24px, 5vw, 80px)';

  return (
    <article
      ref={cardRef}
      onMouseEnter={(e) => { recordPointer(e); setHovered(true); }}
      onMouseLeave={(e) => { recordPointer(e); setHovered(false); }}
      className={styles.card}
      style={{
        padding: isMobile ? `28px calc(18px + ${mobileBleed})` : '18px',
        marginLeft: isMobile ? `calc(-1 * ${mobileBleed})` : 0,
        marginRight: isMobile ? `calc(-1 * ${mobileBleed})` : 0,
        background: isMobile ? cardInterior : 'transparent',
      }}
    >
      {isMobile ? (
        <>
          <GrainOverlay still opacity={STORY_GRAIN.band} />
          <svg
            viewBox="0 0 200 6"
            preserveAspectRatio="none"
            aria-hidden="true"
            className={styles.mobileDivider}
            style={{ top: -3 }}
          >
            <path d={dividerPath} transform="translate(0,3)" stroke={bc1} strokeWidth={INK_LIGHT} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {isLast && (
            <svg
              viewBox="0 0 200 6"
              preserveAspectRatio="none"
              aria-hidden="true"
              className={styles.mobileDivider}
              style={{ bottom: -3 }}
            >
              <path d={dividerPath} transform="translate(0,3)" stroke={bc1} strokeWidth={INK_LIGHT} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </>
      ) : (
        <>
          <HandDrawnBorder
            w={w} h={h} R={R} seed={seed} mag={mag}
            fillColor={cardInterior}
            strokeColor="transparent"
            strokeWidth={0}
            chalkSeed={index}
            segmentsH={[3, 4]} segmentsV={[4, 5]}
            curve={0.6} cornerJitter={0.7} cornerOffset={4}
          />
          <BrushWash
            w={w} h={h} d={borderPath} color={cardHovered}
            x={pos.x} y={pos.y} on={hovered} duration={460}
          />
          {/* the paper's grain, a still tile cut to the outline (the perf audit's W1) */}
          {borderPath && (
            <span
              aria-hidden="true"
              data-grain="paper"
              className={styles.stillGrain}
              style={{ clipPath: `path('${borderPath}')`, opacity: `calc(${STORY_GRAIN.paper} * var(--grain-scale, 1))` }}
            />
          )}
          <HandDrawnBorder
            w={w} h={h} R={R} seed={seed} mag={mag}
            strokeColor={bc1}
            strokeWidth={INK}
            segmentsH={[3, 4]} segmentsV={[4, 5]}
            curve={0.6} cornerJitter={0.7} cornerOffset={4}
          />
        </>
      )}

      <div className={styles.content}>
        <OrganicImage
          src={imageUrl}
          alt={imageLabel ?? title}
          seed={seed + 5}
          ratio={0.56}
          frame={imageUrl ? imageFrame : undefined}
          className={styles.imagePlaceholder}
          grain={<GrainOverlay still opacity={STORY_GRAIN.cover} />}
        >
          {!imageUrl && (
            <div className={`${styles.imageFallback} ${fallback.className}`} style={{ ...fallback.style, background: fallback.fill }} aria-hidden />
          )}
        </OrganicImage>

        <h3 className={styles.title}>{title}</h3>

        <div className={styles.authorRow}>
          <HandDrawnAvatar
            src={authorAvatarUrl}
            initials={authorInitials}
            size={30}
            color={accent}
            seed={authorSeed ?? authorInitials.charCodeAt(0) * 13}
          />
          <span className={styles.authorName}>{author}</span>
        </div>
      </div>
    </article>
  );
}
