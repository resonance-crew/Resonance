'use client';

import { useEffect, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { InkPill } from '@/components/atoms/InkPill/InkPill';
import type { IconName } from '@/components/atoms/Icon';
import styles from './Toast.module.css';

/** What a toast offers to do about what it says — undo it, mostly. */
export interface ToastAction {
  /** The verb, set in bold after the message (「復原」). */
  label: string;
  /** The button's name: the visible words first (WCAG 2.5.3), then what it acts on (「已移到垃圾桶 · 復原〈title〉」). */
  ariaLabel: string;
  icon?: IconName;
  onAction: () => void;
}

export interface ToastItem {
  id: number;
  /** The words on the pill. */
  message: string;
  /** What the live region says instead, when the pill's words aren't the whole of it (「〈title〉已移到垃圾桶」). */
  announce?: string;
  action?: ToastAction;
}

export interface ToastProps {
  /** The toast showing, or null. */
  toast: ToastItem | null;
  /** The pointer is over it (true) or has left (false); stable, as a state setter is. */
  onHover: (over: boolean) => void;
  /** Focus has come into it (true) or left it (false); stable, as a state setter is. */
  onFocusWithin: (inside: boolean) => void;
  onDismiss: () => void;
  onAction: () => void;
}

/** How long a toast takes to fade out (Toast.module.css's toastOut). */
const LEAVE_MS = 140;

/**
 * The shell's one toast (providers/ToastProvider owns which and for how
 * long): an InkPill floating over the foot of the window — the whole pill
 * the button when it offers an action — and the one polite live region that
 * speaks every toast, always mounted so a screen reader hears the first one
 * too. It never takes focus; Escape dismisses it while focus is in it.
 */
export function Toast({ toast, onHover, onFocusWithin, onDismiss, onAction }: ToastProps) {
  // The toast that just went keeps its face while it fades (inert, out of the
  // way of a pointer); a new one replaces it at once.
  const [prev, setPrev] = useState(toast);
  const [leaving, setLeaving] = useState<ToastItem | null>(null);
  if (toast !== prev) {
    setPrev(toast);
    setLeaving(toast ? null : prev);
  }
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  const shown = toast ?? leaving;
  // Gone from the page, it is under no pointer and holds no focus (no leave
  // event comes from a face that is no longer there), so the next toast's time runs.
  const showing = shown != null;
  useEffect(() => {
    if (showing) return;
    onHover(false);
    onFocusWithin(false);
  }, [showing, onHover, onFocusWithin]);
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onFocusWithin(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    onDismiss();
  };

  return (
    <>
      <div className={styles.region} role="status" aria-live="polite" aria-atomic="true">
        {/* A node of its own per toast, so the same words twice are said twice. */}
        {toast && <span key={toast.id}>{toast.announce ?? toast.message}</span>}
      </div>
      {shown && (
        <div
          className={styles.host}
          data-leaving={toast ? undefined : ''}
          inert={!toast}
          onPointerEnter={() => onHover(true)}
          onPointerLeave={() => onHover(false)}
          onFocus={() => onFocusWithin(true)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        >
          {shown.action ? (
            <InkPill
              key={shown.id}
              size="md"
              className={styles.face}
              icon={shown.action.icon}
              label={
                <>
                  {shown.message}
                  <span aria-hidden="true"> · </span>
                  <strong className={styles.verb}>{shown.action.label}</strong>
                </>
              }
              ariaLabel={shown.action.ariaLabel}
              onClick={onAction}
            />
          ) : (
            <InkPill key={shown.id} size="md" className={styles.face} label={shown.message} />
          )}
        </div>
      )}
    </>
  );
}
