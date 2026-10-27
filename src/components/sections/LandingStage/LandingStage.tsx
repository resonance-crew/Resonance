'use client';

import { Component, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

// The engine, the cast and the layer: a chunk of their own, fetched once the page is up and the browser is idle.
const StageLayer = dynamic(() => import('./StageLayer'), { ssr: false });

/**
 * Renders nothing once anything under it has failed: the stage's chunk not loading (a deploy while the page was open,
 * a dropped connection — next/dynamic throws that into the tree) or the stage failing as it starts. The landing page
 * never trades itself for its decoration.
 */
export class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    if (process.env.NODE_ENV === 'development') console.warn('[landing stage] left out', error);
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Whether this browser should have the stage: not when it asks for less data (Save-Data). */
export function wantsStage(nav: Navigator | undefined): boolean {
  const connection = (nav as (Navigator & { connection?: { saveData?: boolean } }) | undefined)?.connection;
  return !connection?.saveData;
}

/**
 * Runs `fn` once the page has loaded — or `loadWait` ms have passed without it (a picture that never finishes must
 * not hold the stage back) — and the browser has a moment to spare (or `timeout` ms of none); the answer cancels it.
 */
export function whenIdle(win: Window, fn: () => void, { timeout = 2500, loadWait = 5000 } = {}): () => void {
  let cancelled = false;
  let scheduled = false;
  let idle = 0;
  let timer = 0;
  let cap = 0;
  const run = () => {
    if (!cancelled) fn();
  };
  const schedule = () => {
    if (cancelled || scheduled) return;
    scheduled = true;
    win.removeEventListener('load', schedule);
    if (cap) win.clearTimeout(cap);
    if (typeof win.requestIdleCallback === 'function') idle = win.requestIdleCallback(run, { timeout });
    else timer = win.setTimeout(run, 300);
  };
  if (win.document.readyState === 'complete') schedule();
  else {
    win.addEventListener('load', schedule, { once: true });
    cap = win.setTimeout(schedule, loadWait);
  }
  return () => {
    cancelled = true;
    win.removeEventListener('load', schedule);
    if (cap) win.clearTimeout(cap);
    if (idle && typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idle);
    if (timer) win.clearTimeout(timer);
  };
}

/**
 * The landing page's paper puppets (摺摺 and the four others) visiting the page's words, cards and buttons — on the
 * landing page only. Nothing of it is in the server's HTML or on the first paint: the stage loads once the page is up
 * and the browser idle, never when the browser asks to save data; reduced motion leaves one standing still. If its
 * chunk fails to load or it fails to start, the page simply has no puppets.
 */
export function LandingStage() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!wantsStage(navigator)) return;
    return whenIdle(window, () => setOn(true));
  }, []);
  return on ? (
    <QuietBoundary>
      <StageLayer />
    </QuietBoundary>
  ) : null;
}
