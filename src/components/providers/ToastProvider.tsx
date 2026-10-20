'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toast, type ToastAction, type ToastItem } from '@/components/molecules/Toast/Toast';

export type { ToastAction } from '@/components/molecules/Toast/Toast';

export interface ToastOptions {
  /** The words on the pill: one fragment, no full stop (「已還原」, 「已移到垃圾桶」). */
  message: string;
  /** What the live region says instead, when the words alone aren't the whole of it (「〈title〉已移到垃圾桶」). */
  announce?: string;
  /** Makes the whole pill a button that does this — undo, mostly. */
  action?: ToastAction;
}

export interface Toasts {
  /** Shows a toast in place of any showing (that one simply goes); returns its id. */
  show: (options: ToastOptions) => number;
  /** Takes the toast down: the one with this id, or whichever is showing. */
  dismiss: (id?: number) => void;
}

/** How long a toast stays: long enough to read a status, longer to reach its action. */
export const TOAST_MS = 4_000;
export const TOAST_ACTION_MS = 8_000;
/** What is left of a toast's time, at least, once the pointer or focus that held it leaves. */
export const TOAST_RESUME_MS = 2_000;

// Outside the signed-in shell (the landing page, a test that doesn't need it)
// there is no toast to show: it is dropped.
const ToastContext = createContext<Toasts>({ show: () => 0, dismiss: () => {} });

/** The shell's one toast (molecules/Toast): `show({ message, announce?, action? })`. */
export function useToast(): Toasts {
  return useContext(ToastContext);
}

/**
 * Holds the one toast of the signed-in shell and how long it stays (4 s, 8 s
 * with an action), mounted once in AppShell so it outlives a page's
 * `router.replace`. A new toast replaces the one showing. The time stops
 * while the pointer is over the toast or focus is in it, and resumes with
 * at least 2 s left. Anything a toast says is also somewhere that stays (the
 * trash shelf, the page itself), so its timer is never the only way back
 * (WCAG 2.2.1). The toast renders after the children: in AppShell, after <main>.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const paused = hover || focusIn;
  const nextId = useRef(0);
  // The time the showing toast has left, by its id (a replaced toast's clean-up must not spend a new one's).
  const left = useRef<{ id: number; ms: number; resumed: boolean }>({ id: 0, ms: 0, resumed: false });

  const show = useCallback((options: ToastOptions) => {
    const id = ++nextId.current;
    left.current = { id, ms: options.action ? TOAST_ACTION_MS : TOAST_MS, resumed: false };
    setToast({ id, ...options });
    return id;
  }, []);

  const dismiss = useCallback((id?: number) => {
    setToast((current) => (current && (id == null || current.id === id) ? null : current));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const time = left.current;
    if (time.id !== toast.id) return;
    if (paused) {
      time.resumed = true;
      return;
    }
    if (time.resumed) time.ms = Math.max(time.ms, TOAST_RESUME_MS);
    time.resumed = false;
    const started = Date.now();
    const timer = setTimeout(() => dismiss(toast.id), time.ms);
    return () => {
      clearTimeout(timer);
      if (left.current.id === toast.id) left.current.ms = Math.max(0, left.current.ms - (Date.now() - started));
    };
  }, [toast, paused, dismiss]);

  const act = useCallback(() => {
    if (!toast?.action) return;
    const { onAction } = toast.action;
    dismiss(toast.id);
    onAction();
  }, [toast, dismiss]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast toast={toast} onHover={setHover} onFocusWithin={setFocusIn} onDismiss={() => dismiss()} onAction={act} />
    </ToastContext.Provider>
  );
}
