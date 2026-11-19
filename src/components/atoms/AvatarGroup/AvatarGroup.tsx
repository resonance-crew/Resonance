'use client';

import { useMemo, type CSSProperties } from 'react';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { avatarWobPath } from '@/lib/design/avatar';
import { INK } from '@/lib/design/strokes';
import styles from './AvatarGroup.module.css';

export interface AvatarGroupMember {
  id: string;
  initials: string;
  accentColor: string;
  avatarSeed: string;
  avatarUrl?: string;
}

export interface AvatarGroupProps {
  members: AvatarGroupMember[];
  /** How many faces to draw (the rest, when `more`, are one blank disc). */
  max?: number;
  size?: number;
  /** There are more than the faces drawn: a blank paper disc follows them — never a number (round 26 §U2). */
  more?: boolean;
  /** The member whose face slides in first (the viewer, as their tap turns on) — keyed so it slides in again. */
  arriving?: string;
  /** A member whose face slides out (the viewer, as their tap turns off): drawn once more, leaving. */
  leaving?: AvatarGroupMember;
  className?: string;
}

/** How far each face steps in over the one before it, as a share of its size. */
export const AVATAR_STEP = 0.34;

/** The blank paper disc after the faces when there are more (the avatar's shape, the faces' pen line, no number). */
function BlankDisc({ size, seed }: { size: number; seed: number }) {
  const d = useMemo(() => avatarWobPath(size, seed), [size, seed]);
  return (
    <svg className={styles.disc} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <path d={d} strokeWidth={INK} />
    </svg>
  );
}

const seedOf = (m: AvatarGroupMember, i: number) => Number(m.avatarSeed) || i + 1;

/**
 * Overlapping hand-drawn faces (the "avatar group"): each steps in over the one before by 0.34 of its size, the
 * first on top, each its own drawing — its fill (initials or photo) and its pen line, on no pad: the front face's
 * fill covers the one behind and its own pen line is what parts them (the owner, 2026-11-19: a pad of the page's
 * paper round each face made the overlap read wider). When there are more than `max`, one blank paper disc
 * follows — who, never how many. It draws faces only: its host makes it a button (the card page's faces open
 * their list) and names it. No shadow, no lift (round 18).
 */
export function AvatarGroup({ members, max = 3, size = 28, more = false, arriving, leaving, className }: AvatarGroupProps) {
  const shown = members.slice(0, max);
  const overflow = more || members.length > max;
  const step = size * AVATAR_STEP;
  const faces = leaving && !shown.some((m) => m.id === leaving.id) ? [leaving, ...shown] : shown;
  const count = faces.length + (overflow ? 1 : 0);
  return (
    <span
      className={[styles.stack, className].filter(Boolean).join(' ')}
      style={{ '--avatar-size': `${size}px`, '--avatar-step': `${step}px` } as CSSProperties}
      data-count={count}
    >
      {faces.map((m, i) => (
        <span
          key={m.id === arriving ? `${m.id}:in` : m.id}
          className={styles.item}
          style={{ zIndex: faces.length + 1 - i }}
          data-arriving={m.id === arriving || undefined}
          data-leaving={leaving?.id === m.id || undefined}
          data-face={m.id}
        >
          <HandDrawnAvatar src={m.avatarUrl} initials={m.initials} size={size} color={m.accentColor} seed={seedOf(m, i)} />
        </span>
      ))}
      {overflow && (
        <span className={styles.item} style={{ zIndex: 0 }} data-more="">
          <BlankDisc size={size} seed={97} />
        </span>
      )}
    </span>
  );
}
