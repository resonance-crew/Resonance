'use client';

import { useMemo, useRef } from 'react';
import { bubblePath, bubbleStandInRadius, seedFromId } from '@/lib/design/bubble';
import { INK_LIGHT } from '@/lib/design/strokes';
import type { RunPosition } from '@/lib/chat/rows';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './Thread.module.css';

export interface UnsentBubbleProps {
  seedKey: string;
  own: boolean;
  position: RunPosition;
  /** What it says: 「你收回了一則訊息」 / 「{handle} 收回了一則訊息」. */
  label: string;
}

/**
 * An unsent message's place in the thread (round 16 §3): one line tall, on
 * its sender's side — the bubble's own outline (its run's tucks too) in a
 * dashed light pen, no fill, and in it, muted, who unsent a message. Nothing
 * in it answers: no menu, no tools.
 */
export function UnsentBubble({ seedKey, own, position, label }: UnsentBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref);
  const opts = { own, run: position };
  const d = useMemo(() => (w > 0 && h > 0 ? bubblePath(w, h, seedFromId(seedKey), opts) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, h, seedKey, own, position]);
  return (
    <div ref={ref} className={styles.unsent} data-own={own || undefined} style={d ? undefined : { borderRadius: bubbleStandInRadius(opts) }} data-shaped={d ? '' : undefined}>
      {d && (
        <svg className={styles.unsentPen} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          <path d={d} fill="none" stroke="var(--soft-pen)" strokeWidth={INK_LIGHT} strokeDasharray="4 4" strokeLinecap="round" />
        </svg>
      )}
      <span className={styles.unsentWords}>{label}</span>
    </div>
  );
}
