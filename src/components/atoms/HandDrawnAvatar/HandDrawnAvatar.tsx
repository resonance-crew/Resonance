'use client';

import { useMemo } from 'react';
import { avatarWobPath, initialsScale } from '@/lib/design/avatar';
import { HandDrawnBorder } from '../HandDrawnBorder/HandDrawnBorder';
import { INK } from '@/lib/design/strokes';

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

  const path = useMemo(
    () => (src ? avatarWobPath(size, seed) : ''),
    [src, size, seed]
  );

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {src ? (
        // The picture is a plain <img> clipped to the outline (an SVG <image>
        // can't load lazily, and avatars sit on every card of a feed), with
        // the drawn outline on top.
        <span className="res-shape-fade-in" style={{ position: 'absolute', inset: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={initials}
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
              stroke="oklch(36% 0.06 60 / 0.55)"
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
            fillColor={color}
            strokeColor="oklch(36% 0.06 60 / 0.55)"
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
