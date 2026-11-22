'use client';

import type { CSSProperties } from 'react';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
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
  /** How many faces to draw: the rest are not drawn at all — no blank disc, no number (round 29 §S5). */
  max?: number;
  size?: number;
  /** The member whose face slides in first (the viewer, as their tap turns on) — keyed so it slides in again. */
  arriving?: string;
  /** A member whose face slides out (the viewer, as their tap turns off): drawn once more, leaving. */
  leaving?: AvatarGroupMember;
  className?: string;
}

/** How far each face steps in over the one before it, as a share of its size. */
export const AVATAR_STEP = 0.34;

const seedOf = (m: AvatarGroupMember, i: number) => Number(m.avatarSeed) || i + 1;

/**
 * Overlapping hand-drawn faces (the "avatar group"): each steps in over the one before by 0.34 of its size, the
 * first on top, each its own drawing — its fill (initials or photo) and its pen line, on no pad: the front face's
 * fill covers the one behind and its own pen line is what parts them (the owner, 2026-11-19: a pad of the page's
 * paper round each face made the overlap read wider). At most `max` faces and nothing after them: no blank disc,
 * no number, no "+" (round 29 §S5, the owner: 「不要把當有第四、第五個的時候顯示成灰色」) — who else there is, the list its host
 * opens says. It draws faces only: its host makes it a button (the card page's faces open
 * their list) and names it. No shadow, no lift (round 18).
 */
export function AvatarGroup({ members, max = 3, size = 28, arriving, leaving, className }: AvatarGroupProps) {
  const shown = members.slice(0, max);
  const step = size * AVATAR_STEP;
  const faces = leaving && !shown.some((m) => m.id === leaving.id) ? [leaving, ...shown] : shown;
  const count = faces.length;
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
    </span>
  );
}
