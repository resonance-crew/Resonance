'use client';

import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';
import { wobRect } from '@/lib/design/wobRect';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { brokenImage } from '@/lib/images/broken';
import { coverImageBox, type CoverFrame } from '@/lib/images/coverFrame';
import { useRevealRef } from '@/components/atoms/RevealImg/RevealImg';

/** How long a picture that failed waits before its one more try. */
export const IMAGE_RETRY_MS = 3000;

/** A cover's longer edge (the upload's) and its list copy's, as the `srcSet` names them. */
const COVER_W = 2048;
const THUMB_W = 960;
/** The card grid's columns: one on a phone, two from 640, three from 1024 (CardLinkGrid, MiniCardGrid). */
const LIST_SIZES = '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw';

export interface OrganicImageProps {
  /** Image to render, cover-fitted inside the organic clip. */
  src?: string;
  alt?: string;
  /** Seed for the wobbly clip path so the curve is stable across SSR/CSR. */
  seed?: number;
  /** Corner radius before wobble. */
  R?: number;
  /** Height of the padding-box as a ratio of width (e.g. 0.62 → 62%). */
  ratio?: number;
  className?: string;
  style?: CSSProperties;
  /** Overlays or fallback content rendered inside the clipped box. */
  children?: ReactNode;
  /**
   * Laid over the picture inside the clip, on the box itself (children reach past it by the wobble's
   * bleed): controls that sit on the picture — the writer's cover slot — keep their place in the frame.
   * What must cover the picture as far as it reaches (a veil over it) insets itself by
   * `calc(-1 * var(--image-bleed))`, which the box sets.
   */
  overlay?: ReactNode;
  /**
   * The page's main picture (the card page's cover): requested at once, ahead
   * of other images. Every other image waits until it nears the viewport —
   * the box already holds its space (`ratio`), so nothing moves when it lands.
   */
  priority?: boolean;
  /**
   * Where a cover is looked at (`media.frame`, round 25 §G1): the picture placed so its frame's crop for this box's
   * `ratio` fills it. Absent: covered and centred.
   */
  frame?: CoverFrame | null;
  /**
   * A smaller copy of `src` for a list (a cover's `thumbUrl`, ≤ 960 px on its longer edge): offered beside it as a
   * `srcSet`, so a card a third of the screen wide decodes about 960 px, not the 2048 px cover (the perf audit's W6).
   * The one more try after a failure asks for `src` alone.
   */
  thumbSrc?: string;
  /** The `sizes` the `srcSet` is chosen by (default: the card grid's columns — one, two from 640, three from 1024). */
  sizes?: string;
  /**
   * Laid over the picture once it has landed (a cover's grain): never while its place shimmers, so the shimmer
   * moves over nothing a filter or mask has to draw again (the perf audit's W2). With no picture, at once.
   */
  grain?: ReactNode;
}

/**
 * Wraps an image (or fallback content) in a hand-drawn, curvy clip so the edges
 * read as organic rather than a flat rounded rectangle. The clip is generated
 * with `wobRect` and applied via CSS `clip-path: path()` once the box has been
 * measured — anything rendered inside (the image, a grain overlay, a fallback
 * SVG) is masked to the same curve.
 */
export function OrganicImage({
  src,
  alt = '',
  seed = 7,
  R = 18,
  ratio = 0.62,
  className,
  style,
  children,
  overlay,
  priority = false,
  frame,
  grain,
  thumbSrc,
  sizes = LIST_SIZES,
}: OrganicImageProps) {
  const framed = coverImageBox(frame, ratio);
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, 320, Math.round(320 * ratio));
  // While the picture is on its way its place shimmers (a story card tints the
  // shimmer with its own hue, --skeleton-highlight), as in the apps — so a slow
  // cover reads as loading, not as a card without one. The shimmer lies under
  // the picture and goes once it has landed or failed; a picture the browser
  // already had when the page hydrated is caught by `complete`.
  const imgRef = useRef<HTMLImageElement>(null);
  const [settled, setSettled] = useState<string | null>(null);
  // A picture that fails is asked for once more a moment later, on a fresh element (a lookup
  // that failed on a network just joined usually answers the second time), shimmering meanwhile;
  // only the second failure settles. `retryOf` names the src whose second element is mounted.
  const [retryOf, setRetryOf] = useState<string | null>(null);
  const retryTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(retryTimer.current), []);
  const failed = (failedSrc: string) => {
    if (retryOf === failedSrc) return setSettled(failedSrc);
    window.clearTimeout(retryTimer.current);
    retryTimer.current = window.setTimeout(() => setRetryOf(failedSrc), IMAGE_RETRY_MS);
  };
  useEffect(() => {
    const img = imgRef.current;
    if (!src || !img?.complete) return;
    // Failed before hydration: its error went unheard.
    if (brokenImage(img)) failed(src);
    else setSettled(src);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per src, as the element mounts
  }, [src]);
  const shimmering = !!src && settled !== src;
  // A picture that lands after its box is on screen comes in blur-to-sharp (lib/images/reveal); its shimmer stays
  // under it until it is sharp, and only then the grain is laid on. One the browser already had settles above.
  const settleTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);
  const revealRef = useRevealRef<HTMLImageElement>(
    'cover',
    (ms) => {
      const landed = src;
      if (!landed) return;
      window.clearTimeout(settleTimer.current);
      if (ms > 0) settleTimer.current = window.setTimeout(() => setSettled(landed), ms);
      else setSettled(landed);
    },
    imgRef,
  );

  const mag = Math.min(w, h) * 0.05;
  // The wobble pushes the path both inward and outward of the box edge. The
  // content must extend past the box by at least the outward swing (plus the
  // corner offset) so the bulges always sit on real image pixels instead of
  // being clipped to nothing — otherwise only the concave dips would read.
  const cornerOffset = 6;
  const bleed = Math.ceil(mag + cornerOffset + 4);

  const clip = useMemo(() => {
    if (!w || !h) return undefined;
    return wobRect(w, h, R, seed, mag, {
      segmentsH: [3, 4],
      segmentsV: [2, 3],
      curve: 0.4,
      cornerJitter: 1.1,
      cornerOffset,
    });
  }, [w, h, R, seed, mag]);

  const picture = src ? (
    // Plain <img>: the surrounding clip-path + outward `bleed` mask the
    // image organically; next/image's wrapper/sizing fights that layout.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={retryOf === src ? 'retry' : 'first'}
      ref={revealRef}
      src={src}
      {...(thumbSrc && thumbSrc !== src && retryOf !== src
        ? { srcSet: `${thumbSrc} ${THUMB_W}w, ${src} ${COVER_W}w`, sizes }
        : null)}
      onLoad={(e) => {
        // The reveal settles it (after its blur). React hears the load before the reveal's own listener, so look
        // once that has run: a picture it isn't revealing settles here.
        const img = e.currentTarget;
        window.setTimeout(() => {
          if (!img.hasAttribute('data-reveal')) setSettled(src);
        }, 0);
      }}
      onError={() => failed(src)}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? undefined : 'async'}
      fetchPriority={priority ? 'high' : undefined}
      data-frame={framed ? '' : undefined}
      style={
        framed
          ? { position: 'absolute', ...framed, maxWidth: 'none' }
          : { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
      }
    />
  ) : null;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        paddingBottom: `${ratio * 100}%`,
        clipPath: clip ? `path('${clip}')` : undefined,
        ['--image-bleed' as string]: `${clip ? bleed : 0}px`,
        ...style,
      }}
    >
      {/* Content bleeds past the box by `bleed` px so the clip's outward bulges
          land on image pixels rather than on empty space. */}
      <div style={{ position: 'absolute', inset: clip ? -bleed : 0 }}>
        {shimmering && <Skeleton radius={0} height="100%" style={{ position: 'absolute', inset: 0 }} />}
        {picture && framed ? (
          // A framed cover's percentages are of the ratio box itself (coverImageBox), not of this bled wrapper —
          // W + 2b by H + 2b would draw it out of shape and off its crop — so it sits in the box, back in by `bleed`.
          <div data-frame-box="" style={{ position: 'absolute', inset: clip ? bleed : 0 }}>
            {picture}
          </div>
        ) : (
          picture
        )}
        {children}
        {!shimmering && grain}
      </div>
      {overlay != null && <div style={{ position: 'absolute', inset: 0 }}>{overlay}</div>}
    </div>
  );
}
