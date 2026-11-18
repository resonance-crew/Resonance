// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const auth = vi.hoisted(() => ({ currentUser: { getIdToken: () => Promise.resolve('token-1') } as { getIdToken: () => Promise<string> } | null }));
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: () => auth }));
vi.mock('@/lib/auth/firebase/appCheck', () => ({ appCheckHeaders: () => Promise.resolve({}) }));

import { ReadingSession, END_SHARE, IDLE_AFTER_MS, useReadingReport } from './readingReport';

// Round 26 §U7: how a reader read a card, sent as running totals when the page hides — never for its author.

const fetchMock = vi.fn((..._args: unknown[]) => Promise.resolve(new Response(null, { status: 204 })));
const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T10:00:00Z'));
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ReadingSession', () => {
  it('does not call a short card shown whole read to the end before 0.4 of its expected time', () => {
    const start = Date.now();
    const s = new ReadingSession(20, start, 'session-abc');
    // All of it in view at once: scrolled through, its end seen.
    s.progress(1);
    s.sawEnd();
    expect(s.report()).toMatchObject({ progress: 1, reachedEnd: false });
    // 7 s read (< 0.4 × 20): not yet.
    for (let t = 1; t <= 7; t++) s.tick(start + t * 1000, true);
    expect(s.reachedEnd).toBe(false);
    // 8 s (= 0.4 × 20): read to the end.
    s.tick(start + 8000, true);
    expect(s.activeSeconds).toBe(20 * END_SHARE);
    expect(s.reachedEnd).toBe(true);
  });

  it('counts only the seconds in front and within 30 s of something the reader did', () => {
    const start = Date.now();
    const s = new ReadingSession(120, start, 'session-abc');
    let t = start;
    // A minute with no scroll, touch or key: the first 30 s count.
    for (let i = 0; i < 60; i++) s.tick((t += 1000), true);
    expect(s.activeSeconds).toBe(IDLE_AFTER_MS / 1000);
    // In the background: nothing counts.
    s.activity(t);
    for (let i = 0; i < 10; i++) s.tick((t += 1000), false);
    expect(s.activeSeconds).toBe(30);
    // A tab asleep for an hour counts no more than one tick's stretch when it wakes.
    s.activity(t);
    s.tick((t += 3_600_000), true);
    expect(s.activeSeconds).toBeLessThanOrEqual(32);
  });

  it('keeps the furthest progress, clamped to 0…1', () => {
    const s = new ReadingSession(60, Date.now(), 'session-abc');
    s.progress(0.4);
    s.progress(0.2);
    expect(s.report().progress).toBe(0.4);
    s.progress(3);
    expect(s.report().progress).toBe(1);
  });
});

describe('useReadingReport', () => {
  const story = document.createElement('div');
  story.getBoundingClientRect = () => ({ top: 0, height: 4000, bottom: 4000, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) });

  it('sends running totals each time the page hides, in one session, not deltas', async () => {
    const { unmount } = renderHook(() =>
      useReadingReport({ cardId: 'c1', enabled: true, expectedSeconds: 300, storyRef: { current: story }, endEl: null }),
    );
    // The token comes in before the first hide.
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(10_000);
    setVisibility('hidden');
    setVisibility('visible');
    window.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(5_000);
    setVisibility('hidden');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/cards/c1/reading');
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    const [first, second] = bodies();
    expect(second.session).toBe(first.session);
    expect(first.session).toMatch(/^[A-Za-z0-9-]{8,40}$/);
    expect(first.activeSeconds).toBeGreaterThanOrEqual(10);
    // The second is the whole session so far (10 + 5), not the 5 since the first.
    expect(second.activeSeconds).toBeGreaterThanOrEqual(first.activeSeconds + 5);
    expect(second.reachedEnd).toBe(false);

    // Nothing new since the last: nothing sent again when the page goes.
    unmount();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('says the share button was used', async () => {
    const { result } = renderHook(() =>
      useReadingReport({ cardId: 'c1', enabled: true, expectedSeconds: 60, storyRef: { current: story }, endEl: null }),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    result.current.markShared();
    window.dispatchEvent(new Event('pagehide'));
    expect(bodies().at(-1)).toMatchObject({ shared: true });
  });

  it("sends nothing for the card's author (or anyone it isn't enabled for)", async () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: beacon });
    const { unmount } = renderHook(() =>
      useReadingReport({ cardId: 'c1', enabled: false, expectedSeconds: 60, storyRef: { current: story }, endEl: null }),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    unmount();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('falls back to a beacon (the session cookie) when no token is at hand', async () => {
    auth.currentUser = null;
    const beacon = vi.fn((..._args: unknown[]) => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: beacon });
    renderHook(() => useReadingReport({ cardId: 'c2', enabled: true, expectedSeconds: 60, storyRef: { current: story }, endEl: null }));
    await vi.advanceTimersByTimeAsync(3_000);
    setVisibility('hidden');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe('/api/v1/cards/c2/reading');
    auth.currentUser = { getIdToken: () => Promise.resolve('token-1') };
  });
});
