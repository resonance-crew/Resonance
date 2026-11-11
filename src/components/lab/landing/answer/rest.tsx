'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { copyFor } from './copy';
import styles from './answer.module.css';

/** This browser's choice to let the puppets rest (a convenience: never anything that must persist). */
const KEY = 'resonance:lab-answer:pals-rest';

interface Rest {
  resting: boolean;
  toggle: () => void;
}

const RestContext = createContext<Rest>({ resting: false, toggle: () => {} });

/**
 * The page's pause (WCAG 2.2.2): resting, every stage is put away and the puppets stand as the server drew them,
 * and every looping motion (their breathing and blinking, the heart on the blank card) stops.
 */
export function PalsRestProvider({ children }: { children: ReactNode }) {
  const [resting, setResting] = useState(false);
  useEffect(() => {
    try {
      // a stored choice, read once the page is up (the server's HTML is always awake)
      if (window.localStorage.getItem(KEY) === '1') setResting(true);
    } catch {
      /* storage blocked: awake */
    }
  }, []);
  const toggle = useCallback(() => {
    setResting((r) => {
      const next = !r;
      try {
        window.localStorage.setItem(KEY, next ? '1' : '0');
      } catch {
        /* storage blocked: for this visit only */
      }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ resting, toggle }), [resting, toggle]);
  return (
    <RestContext.Provider value={value}>
      <div data-pals-rest={resting ? '' : undefined}>{children}</div>
    </RestContext.Provider>
  );
}

export function usePalsRest(): Rest {
  return useContext(RestContext);
}

/** The pause control, in the brand's voice. */
export function RestToggle({ locale, className }: { locale: string; className?: string }) {
  const { resting, toggle } = usePalsRest();
  const c = copyFor(locale);
  return (
    <>
      <button type="button" className={[styles.rest, className].filter(Boolean).join(' ')} aria-pressed={resting} onClick={toggle}>
        <span className={styles.restDot} aria-hidden="true" />
        {resting ? c.pause.wake : c.pause.rest}
      </button>
      {/* without scripts there is nothing it could put to rest */}
      <noscript>
        <style>{`.${styles.rest}{display:none}`}</style>
      </noscript>
    </>
  );
}

/** Whether the puppets may move at all here: a stage is wanted (no Save-Data) and motion is welcome. Null on the server. */
export function useMotionOk(): boolean | null {
  return useSyncExternalStore(
    subscribeMotion,
    () => {
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
      return !saveData && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },
    () => null,
  );
}

function subscribeMotion(fn: () => void): () => void {
  const q = window.matchMedia('(prefers-reduced-motion: reduce)');
  q.addEventListener('change', fn);
  return () => q.removeEventListener('change', fn);
}

/** What the visitor wrote on the desk, for the night's line further down (this page's life only). */
let answered: string | null = null;
const listeners = new Set<() => void>();
export function setAnswered(line: string | null): void {
  answered = line;
  listeners.forEach((l) => l());
}
export function useAnswered(): string | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => answered,
    () => null,
  );
}

/** A story picked on the shelf (「回應這個」): the desk takes it. */
let picked: { id: string; n: number } | null = null;
const pickListeners = new Set<() => void>();
export function pickStory(id: string): void {
  picked = { id, n: (picked?.n ?? 0) + 1 };
  pickListeners.forEach((l) => l());
}
export function usePicked(): { id: string; n: number } | null {
  return useSyncExternalStore(
    (fn) => {
      pickListeners.add(fn);
      return () => pickListeners.delete(fn);
    },
    () => picked,
    () => null,
  );
}
