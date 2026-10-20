'use client';

import { useRef, type ReactNode } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './MarkdownEditor.module.css';

export interface ToolButtonProps {
  label: ReactNode;
  aria: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  seed: number;
  /** Its place in a toolbar's one tab stop (roving tabindex): 0 for the button that has it, -1 for the rest. */
  tabIndex?: number;
  /** The keyboard bar's 44px finger target (the visual stays the toolbar's). */
  touch?: boolean;
}

/**
 * A word button of the story's toolbars (the framed editor's, the canvas's
 * selection bubble and its keyboard bar): its hover and active wash is a
 * wobbly curved fill — the header badge's hand-drawn chip — rather than a
 * flat rounded rectangle; no pen line (it sits in the toolbar's own frame).
 * Pressing it never takes the focus from the story, so the selection stays
 * where the command is to go.
 */
export function ToolButton({ label, aria, onClick, active, disabled, seed, tabIndex, touch = false }: ToolButtonProps) {
  // The wash is drawn round the face inside the button: on the keyboard bar the button is the 44px finger
  // target and the face keeps the toolbar's own size.
  const ref = useRef<HTMLSpanElement>(null);
  const { w, h } = useElementSize(ref);
  return (
    <button
      type="button"
      className={styles.toolBtn}
      data-active={active || undefined}
      data-touch={touch || undefined}
      data-tool=""
      disabled={disabled}
      aria-label={aria}
      aria-pressed={active}
      title={aria}
      tabIndex={tabIndex}
      // Keep the selection / caret in the story while pressing it.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <span ref={ref} className={styles.toolFace}>
        {w > 0 && h > 0 && (
          <HandDrawnBorder
            w={w}
            h={h}
            R={h * 0.4}
            seed={seed}
            mag={1.4}
            segmentsH={2}
            segmentsV={1}
            curve={1.5}
            cornerJitter={2.6}
            cornerOffset={h * 0.05}
            fillColor="var(--tool-btn-fill)"
          />
        )}
        <span className={styles.toolBtnLabel}>{label}</span>
      </span>
    </button>
  );
}

/**
 * A toolbar's arrow keys (WAI-ARIA toolbar): ← and → walk its buttons,
 * Home and End go to either end, the one with the focus being the toolbar's
 * one tab stop.
 */
export function rovingKeyDown(e: React.KeyboardEvent<HTMLElement>): boolean {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return false;
  const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-tool]:not(:disabled)'));
  if (buttons.length === 0) return false;
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const to =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? buttons.length - 1
        : e.key === 'ArrowRight'
          ? (at + 1) % buttons.length
          : at <= 0
            ? buttons.length - 1
            : at - 1;
  e.preventDefault();
  for (const [i, b] of buttons.entries()) b.tabIndex = i === to ? 0 : -1;
  buttons[to].focus();
  return true;
}
