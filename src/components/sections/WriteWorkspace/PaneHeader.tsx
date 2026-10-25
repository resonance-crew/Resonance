'use client';

import { useMemo, type CSSProperties, type ReactNode, type Ref } from 'react';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { HEADER_STROKE_Y } from '@/components/sections/AppHeader/HeaderChrome';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import barStyles from '@/components/sections/AppHeader/HeaderBar.module.css';
import styles from './WriteWorkspace.module.css';

/** The wave under the header: drawn this wide and stretched to the pane (its stroke keeps its width). */
const WAVE_W = 720;
const WAVE_H = 14;

function wavePaths() {
  const pts = wavyPoints(WAVE_W, WAVE_H / 2, 1.4, 157, 8);
  const strokeD = pointsToBezier(pts);
  // The paper above the wave: down the right edge, back along the wave, up the left.
  const f = (n: number) => +n.toFixed(2);
  const last = pts[pts.length - 1];
  let paperD = `M 0,0 L ${WAVE_W},0 L ${f(last[0])},${f(last[1])}`;
  for (let i = pts.length - 2; i >= 0; i--) {
    const [x0, y0] = pts[i + 1];
    const [x1, y1] = pts[i];
    const midX = (x0 + x1) / 2;
    paperD += ` C ${f(midX)},${f(y0)} ${f(midX)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  return { strokeD, paperD: `${paperD} Z` };
}

export interface PaneHeaderProps {
  /** What the pane shows (編輯卡片, 編輯已發布的卡片, 共振的原文). */
  title: ReactNode;
  /** The back arrow's name and tooltip: 返回 / Back. */
  backLabel: string;
  /** Back to the map: the pane hides (its edits are already saved). */
  onBack: () => void;
  /** Something has scrolled under it: the pen line inks in whole. */
  scrolled: boolean;
  /** The arrow waits (a request on its way that leaving would cut short). */
  backDisabled?: boolean;
  /** A quiet line under the title (the editor's save state), as the writer's bar has it (round 11 §5). */
  status?: ReactNode;
  /** What closes the row on the right (the editor's ✓), as the writer's bar has it: the title gives way. */
  trailing?: ReactNode;
  /** The title, for a host that moves the focus to it (the publish step names itself here). */
  titleRef?: Ref<HTMLHeadingElement>;
}

/**
 * The thought-map page's editor pane's own header row below the 1200px split,
 * where the pane covers the map — the writer's bar in small, as tall: on the
 * pane's paper over what it shows, a wavy pen line under it that what scrolls
 * passes beneath; the back arrow and the pane's title on the left, as the
 * writer's own bar has them (HeaderBar) — the way back to the map (the edits
 * are saved as they are made, so it hides, it never discards — hence no ✕) —
 * and what the editor does next at the row's end (下一步), as the bar has it.
 * At the split the pane has no header: its divider hides it.
 */
export function PaneHeader({ title, backLabel, onBack, scrolled, backDisabled = false, status, trailing, titleRef }: PaneHeaderProps) {
  const { strokeD, paperD } = useMemo(wavePaths, []);
  return (
    <header
      className={styles.paneHeader}
      data-scrolled={scrolled || undefined}
      style={{ '--pane-bar-h': `${HEADER_STROKE_Y}px` } as CSSProperties}
    >
      <div className={styles.paneHeaderRow}>
        <BareIconButton
          icon="arrow-right"
          mirror
          tone="ink"
          label={backLabel}
          iconSize={18}
          tip="below"
          tipAlign="start"
          seed={13}
          className={barStyles.back}
          disabled={backDisabled}
          onClick={onBack}
        />
        <div className={barStyles.titles}>
          <h2 ref={titleRef} tabIndex={titleRef ? -1 : undefined} className={barStyles.title}>
            {title}
          </h2>
          {status !== undefined && <div className={barStyles.subtitle}>{status}</div>}
        </div>
        {trailing != null && <div className={barStyles.trailing}>{trailing}</div>}
      </div>
      <svg
        aria-hidden="true"
        className={styles.paneWave}
        viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
        preserveAspectRatio="none"
      >
        <path d={paperD} className={styles.panePaper} />
        <path
          d={strokeD}
          fill="none"
          className={styles.paneLine}
          strokeWidth={INK}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </header>
  );
}
