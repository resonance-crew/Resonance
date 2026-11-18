'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { ReadingReportInput } from '@/lib/api/v1/schemas';
import { appCheckHeaders } from '@/lib/auth/firebase/appCheck';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';

/**
 * How a reader read a card in one page view (round 26 §U7), for their own picks — never shown to anyone by name
 * (POST /api/v1/cards/{id}/reading, lib/api/v1/reading): active seconds (the page in front, and a scroll, a touch or
 * a key within the last 30 s), how far through the story they scrolled, whether they reached its end, and whether
 * they shared it. Sent as the session's running totals — never deltas — whenever the page hides (the tab hidden,
 * the page left, the card page unmounting): the server keeps the largest of each per session and adds sessions up.
 */

/** Activity older than this no longer counts the seconds after it as read. */
export const IDLE_AFTER_MS = 30_000;
/** "Read to the end": the end in view after at least this share of the story's expected time (the server's rule too). */
export const END_SHARE = 0.4;
/** A tick's longest stretch: a sleeping tab's timer coming back late counts no more than this. */
const MAX_TICK_MS = 2_000;
/** The ID token is fetched again before its hour is up, so a hide never waits for one. */
const TOKEN_REFRESH_MS = 45 * 60_000;

/** A page view's id: 8–40 of A–Z a–z 0–9 - (the contract's). */
export function newReadingSession(): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : '';
  return id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * One page view's reading, as plain numbers (the hook below feeds it the page's events). Its `report()` is the
 * session's running totals so far.
 */
export class ReadingSession {
  readonly id: string;
  private active = 0;
  private lastTick: number;
  private lastActivity: number;
  private furthest = 0;
  private endSeen = false;
  private shared = false;

  constructor(
    /** How long the story takes to read, in seconds (lib/readTime readSeconds, unrounded). */
    private readonly expectedSeconds: number,
    now: number,
    id = newReadingSession(),
  ) {
    this.id = id;
    this.lastTick = now;
    // Opening the page is the first thing the reader did.
    this.lastActivity = now;
  }

  /** A scroll, a touch, a key. */
  activity(now: number): void {
    this.lastActivity = now;
  }

  /** Time passing: counted while the page is in front and the reader did something within the last 30 s. */
  tick(now: number, visible: boolean): void {
    const step = Math.min(Math.max(0, now - this.lastTick), MAX_TICK_MS);
    this.lastTick = now;
    if (visible && now - this.lastActivity <= IDLE_AFTER_MS) this.active += step;
  }

  /** How much of the story has been scrolled through, 0…1 (the furthest is kept). */
  progress(share: number): void {
    if (Number.isFinite(share)) this.furthest = Math.max(this.furthest, Math.min(1, Math.max(0, share)));
  }

  /** The end of the story came into view. */
  sawEnd(): void {
    this.endSeen = true;
  }

  share(): void {
    this.shared = true;
  }

  get activeSeconds(): number {
    return Math.round(this.active / 100) / 10;
  }

  /** The end seen, after at least 0.4 of the story's expected time: a short card shown whole isn't read on sight. */
  get reachedEnd(): boolean {
    return this.endSeen && this.activeSeconds >= this.expectedSeconds * END_SHARE;
  }

  report(): ReadingReportInput {
    return {
      session: this.id,
      activeSeconds: this.activeSeconds,
      progress: Math.round(this.furthest * 1000) / 1000,
      reachedEnd: this.reachedEnd,
      ...(this.shared ? { shared: true } : {}),
    };
  }
}

/** How far through the story the bottom of the window has come: 0 at its top, 1 at its foot (or all of it in view). */
export function storyShare(story: DOMRect, viewportHeight: number): number {
  if (story.height <= 0) return 0;
  return (viewportHeight - story.top) / story.height;
}

interface Credentials {
  token: string;
  headers: Record<string, string>;
  at: number;
}

/**
 * Sends `body` as the page goes: a keepalive fetch with the ID token fetched beforehand (a hide can't wait for one);
 * else a beacon, which carries the session cookie; else nothing — a report is worth less than a page that hangs.
 */
export function sendReport(cardId: string, report: ReadingReportInput, creds: Credentials | null): boolean {
  const url = `/api/v1/cards/${encodeURIComponent(cardId)}/reading`;
  const body = JSON.stringify(report);
  if (creds && Date.now() - creds.at < 55 * 60_000 && typeof fetch === 'function') {
    try {
      void fetch(url, {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.token}`, ...creds.headers },
        body,
      }).catch(() => {});
      return true;
    } catch {
      // Fall through to the beacon.
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      return navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
    } catch {
      return false;
    }
  }
  return false;
}

export interface ReadingReportOptions {
  cardId: string | undefined;
  /** A signed-in reader reading someone else's published card (never its author, never through a shared pass). */
  enabled: boolean;
  /** The story's text: its expected reading time. */
  expectedSeconds: number;
  storyRef: RefObject<HTMLElement | null>;
  /** What stands right after the story: in view, the end has been reached. */
  endEl: HTMLElement | null;
}

/**
 * Measures the card page's reading and reports it as the page hides (see above). Returns `markShared`, for the
 * card's share button.
 */
export function useReadingReport({ cardId, enabled, expectedSeconds, storyRef, endEl }: ReadingReportOptions): { markShared: () => void } {
  const session = useRef<ReadingSession | null>(null);
  const expected = useRef(expectedSeconds);
  expected.current = expectedSeconds;

  useEffect(() => {
    if (!enabled || !cardId) return;
    let creds: Credentials | null = null;
    let lastSent = '';
    let s = new ReadingSession(expected.current, Date.now());
    session.current = s;

    const fetchCreds = () => {
      let user: ReturnType<typeof getFirebaseClientAuth>['currentUser'] = null;
      try {
        user = getFirebaseClientAuth().currentUser;
      } catch {
        // No client SDK here (it couldn't start): the beacon and its cookie will do.
      }
      if (!user) return;
      void Promise.all([user.getIdToken(), appCheckHeaders().catch(() => ({}))]).then(
        ([token, headers]) => {
          creds = { token, headers, at: Date.now() };
        },
        () => {},
      );
    };
    fetchCreds();
    const refresh = window.setInterval(fetchCreds, TOKEN_REFRESH_MS);

    const visible = () => document.visibilityState === 'visible';
    const measure = () => {
      const story = storyRef.current;
      if (story) s.progress(storyShare(story.getBoundingClientRect(), window.innerHeight));
    };
    const send = () => {
      s.tick(Date.now(), visible());
      measure();
      const report = s.report();
      const key = JSON.stringify(report);
      if (key === lastSent) return;
      if (sendReport(cardId, report, creds)) lastSent = key;
    };
    const onActivity = () => {
      s.activity(Date.now());
    };
    const onScroll = () => {
      onActivity();
      measure();
    };
    const tick = window.setInterval(() => s.tick(Date.now(), visible()), 1_000);
    const onVisibility = () => {
      if (visible()) {
        s.tick(Date.now(), false);
        s.activity(Date.now());
        if (!creds || Date.now() - creds.at > TOKEN_REFRESH_MS) fetchCreds();
      } else send();
    };
    const onPageHide = () => send();
    // Back from the browser's page cache: a new page view, a new session.
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      s = new ReadingSession(expected.current, Date.now());
      session.current = s;
      lastSent = '';
      measure();
    };

    measure();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onActivity);
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('touchstart', onActivity, { passive: true });
    window.addEventListener('wheel', onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      // The card page going (another page of the site): its totals go with it.
      send();
      window.clearInterval(tick);
      window.clearInterval(refresh);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.removeEventListener('wheel', onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      session.current = null;
    };
  }, [cardId, enabled, storyRef]);

  // The end in view (its own effect: the element may come after the session started, and must not start another).
  useEffect(() => {
    if (!enabled || !endEl) return;
    if (typeof IntersectionObserver === 'undefined') {
      const r = endEl.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) session.current?.sawEnd();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) session.current?.sawEnd();
    });
    io.observe(endEl);
    return () => io.disconnect();
  }, [enabled, endEl, cardId]);

  const markShared = useCallback(() => session.current?.share(), []);
  return { markShared };
}
