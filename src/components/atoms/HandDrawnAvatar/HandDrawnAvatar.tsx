'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { avatarWobPath, initialsScale } from '@/lib/design/avatar';
import { HandDrawnBorder } from '../HandDrawnBorder/HandDrawnBorder';
import { INK } from '@/lib/design/strokes';
import { personFill } from '@/lib/design/personFill';
import { brokenImage } from '@/lib/images/broken';

export interface HandDrawnAvatarProps {
  initials?: string;
  /** uploaded avatar image URL; when set, the picture fills the wobbly shape */
  src?: string;
  size?: number;
  color?: string;
  seed?: number;
}

// The outline and the initials' size are lib/design/avatar's (the link-preview
// image draws the same avatar on the server); re-exported for the components.
export { avatarWobPath, initialsScale };

export function HandDrawnAvatar({
  initials = '?',
  src,
  size = 36,
  color = 'var(--color-terracotta-light)',
  seed = 1,
}: HandDrawnAvatarProps) {
  const R = size * 0.4;
  const mag = size * 0.022;
  const cornerOffset = size * 0.06;

  // A picture that won't load (its host unreachable, a lookup that failed) gives way to the
  // initials on the person's colour, never the browser's broken-image glyph. One that failed
  // before hydration fired its error unheard, so the mount asks the element itself.
  const [failed, setFailed] = useState<string | null>(null);
  const picture = src && failed !== src ? src : undefined;
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (src && img && brokenImage(img)) setFailed(src);
  }, [src]);

  const path = useMemo(
    () => (picture ? avatarWobPath(size, seed) : ''),
    [picture, size, seed]
  );
  // A stored colour is drawn as the scheme draws a person's colour (lib/design/personFill).
  const disc = personFill(color);

  return (
    <div className={disc.className || undefined} style={{ ...disc.style, position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {picture ? (
        // The picture is a plain <img> clipped to the outline (an SVG <image>
        // can't load lazily, and avatars sit on every card of a feed), with
        // the drawn outline on top.
        <span className="res-shape-fade-in" style={{ position: 'absolute', inset: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={picture}
            alt={initials}
            onError={() => setFailed(picture)}
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            style={{
              position: 'absolute',
              inset: 0,
              width: size,
              height: size,
              objectFit: 'cover',
              clipPath: `path('${path}')`,
            }}
          />
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
          >
            <path
              d={path}
              fill="none"
              stroke="var(--avatar-stroke)"
              strokeWidth={INK}
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : (
        <>
          <HandDrawnBorder
            w={size}
            h={size}
            R={R}
            seed={seed}
            mag={mag}
            fillColor={disc.fill}
            strokeColor="var(--avatar-stroke)"
            strokeWidth={INK}
            segmentsH={1}
            segmentsV={1}
            curve={1.3}
            cornerJitter={3.2}
            cornerOffset={cornerOffset}
          />
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: size * initialsScale(initials),
              color: 'var(--color-text)',
              userSelect: 'none',
            }}
          >
            {initials}
          </span>
        </>
      )}
    </div>
  );
}

