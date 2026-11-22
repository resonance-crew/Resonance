// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The signal channel on a fake listener: the one document (signals/{uid}) the
// web still listens to, whose counters say which /api/v1 reads to pull again.

type Doc = Record<string, unknown> | null;
const firestore = vi.hoisted(() => ({
  listeners: [] as { path: string[]; onData: (d: Doc) => void; onError: (e: Error) => void; stopped: boolean }[],
}));
vi.mock('./listen', () => ({
  listenLazily: (start: (rt: { listenDoc: unknown }) => () => void) =>
    start({
      listenDoc: (path: string[], onData: (d: Doc) => void, onError: (e: Error) => void) => {
        const l = { path, onData, onError, stopped: false };
        firestore.listeners.push(l);
        return () => {
          l.stopped = true;
        };
      },
    }),
}));

import { FAILED_PULL_MS, SAFETY_PULL_MS, pokeOwn, pokeSignal, resetSignals, watchSignal } from './signals';

const live = () => firestore.listeners.filter((l) => !l.stopped);
const hear = (d: Doc) => live().forEach((l) => l.onData(d));

beforeEach(() => {
  vi.useFakeTimers();
  firestore.listeners = [];
});
afterEach(() => {
  resetSignals();
  vi.useRealTimers();
});

describe('the signal channel', () => {
  it('listens to the one document for the viewer, however many watch, and stops with the last', () => {
    const stopInbox = watchSignal('me', 'inbox', vi.fn());
    const stopBell = watchSignal('me', 'bell', vi.fn());
    expect(firestore.listeners.map((l) => l.path)).toEqual([['signals', 'me']]);
    stopInbox();
    expect(live()).toHaveLength(1);
    stopBell();
    expect(live()).toHaveLength(0);
  });

  it('calls only the watchers whose counter moved — a conversation by its pair — and nothing on the first answer', () => {
    const inbox = vi.fn();
    const bell = vi.fn();
    const thread = vi.fn();
    const other = vi.fn();
    watchSignal('me', 'inbox', inbox);
    watchSignal('me', 'bell', bell);
    watchSignal('me', 'thread:bob_me', thread);
    watchSignal('me', 'thread:carol_me', other);

    hear({ v: 1, inbox: 3, bell: 1, threads: { bob_me: 2 } });
    expect([inbox, bell, thread, other].map((f) => f.mock.calls.length)).toEqual([0, 0, 0, 0]);

    // A message from bob: both his thread and the list.
    hear({ v: 1, inbox: 4, bell: 1, threads: { bob_me: 3 } });
    expect([inbox, bell, thread, other].map((f) => f.mock.calls.length)).toEqual([1, 0, 1, 0]);

    // A reaction: the thread only. A bell row: the bell only.
    hear({ v: 1, inbox: 4, bell: 1, threads: { bob_me: 4 } });
    hear({ v: 1, inbox: 4, bell: 2, threads: { bob_me: 4 } });
    expect([inbox, bell, thread, other].map((f) => f.mock.calls.length)).toEqual([1, 1, 2, 0]);

    // A first message from carol: her pair's counter appears.
    hear({ v: 1, inbox: 5, bell: 2, threads: { bob_me: 4, carol_me: 1 } });
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('pulls everything watched every safety interval while the page is in the foreground, never in the background', () => {
    const inbox = vi.fn();
    watchSignal('me', 'inbox', inbox);
    vi.advanceTimersByTime(SAFETY_PULL_MS);
    expect(inbox).toHaveBeenCalledTimes(1);

    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    vi.advanceTimersByTime(SAFETY_PULL_MS * 3);
    expect(inbox).toHaveBeenCalledTimes(1);

    // Back in the tab after more than the interval: pulled at once.
    hidden.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(inbox).toHaveBeenCalledTimes(2);
    hidden.mockRestore();
  });

  it("pulls at once what this browser wrote itself, and listens again after a refusal once back", () => {
    const graph = vi.fn();
    watchSignal('me', 'graph', graph);
    pokeSignal('graph');
    expect(graph).toHaveBeenCalledTimes(1);

    // The rules not deployed yet, say: the listener fails; the shorter pulls carry the page.
    live()[0].onError(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    window.dispatchEvent(new Event('online'));
    expect(firestore.listeners).toHaveLength(2);
    expect(live()).toHaveLength(1);
  });

  it('pulls every five minutes while the listener is live, every minute while it has failed, and everything once when it hears again', () => {
    expect(SAFETY_PULL_MS).toBe(5 * 60_000);
    const inbox = vi.fn();
    watchSignal('me', 'inbox', inbox);
    hear({ v: 1, inbox: 1 });
    vi.advanceTimersByTime(4 * 60_000);
    expect(inbox).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(60_000);
    expect(inbox).toHaveBeenCalledTimes(1);

    // The listener fails: nothing tells of a change now, so the pulls go every minute.
    live()[0].onError(new Error('unavailable'));
    vi.advanceTimersByTime(3 * FAILED_PULL_MS);
    expect(inbox).toHaveBeenCalledTimes(4);

    // Back online: it listens again, and its first answer pulls everything (what moved meanwhile was never heard).
    window.dispatchEvent(new Event('online'));
    const pulledBefore = inbox.mock.calls.length;
    hear({ v: 1, inbox: 1 });
    expect(inbox).toHaveBeenCalledTimes(pulledBefore + 1);
    // …then the five minutes again.
    inbox.mockClear();
    vi.advanceTimersByTime(4 * 60_000);
    expect(inbox).toHaveBeenCalledTimes(0);
  });

  // Ratchet (numbers may fall, never rise): a visible tab on the messages page — the list and the header's
  // badge share one watcher of `inbox`, the bell one of `bell` — over an hour with nothing happening.
  // Before 2026-11-22 it was 60 pulls of each (a minute's safety pull), each a GET of the whole list.
  it('ratchet: an idle visible hour costs at most 12 pulls of each list', () => {
    const inbox = vi.fn();
    const bell = vi.fn();
    watchSignal('me', 'inbox', inbox);
    watchSignal('me', 'bell', bell);
    hear({ v: 1, inbox: 3, bell: 2 });
    vi.advanceTimersByTime(60 * 60_000);
    expect(inbox.mock.calls.length).toBeLessThanOrEqual(12);
    expect(bell.mock.calls.length).toBeLessThanOrEqual(12);
  });

  it("pulls a write of this browser's once: the listener bringing the same touch pulls nothing more, anyone else's still does", () => {
    const inbox = vi.fn();
    const thread = vi.fn();
    watchSignal('me', 'inbox', inbox);
    watchSignal('me', 'thread:bob_me', thread);
    hear({ v: 1, inbox: 3, threads: { bob_me: 7 } });

    // A send: its answer says the sender's own counters went to 4 and 8 — pulled now, once.
    pokeOwn(['thread:bob_me', 'inbox'], { 'thread:bob_me': 8, inbox: 4 });
    expect([inbox, thread].map((f) => f.mock.calls.length)).toEqual([1, 1]);
    // The listener brings that touch: nothing more.
    hear({ v: 1, inbox: 4, threads: { bob_me: 8 } });
    expect([inbox, thread].map((f) => f.mock.calls.length)).toEqual([1, 1]);
    // A snapshot from before the send, late: kept as heard, nothing pulled.
    hear({ v: 1, inbox: 3, threads: { bob_me: 7 } });
    expect([inbox, thread].map((f) => f.mock.calls.length)).toEqual([1, 1]);
    // Bob answers: the counters move past what the answer said — pulled.
    hear({ v: 1, inbox: 5, threads: { bob_me: 9 } });
    expect([inbox, thread].map((f) => f.mock.calls.length)).toEqual([2, 2]);

    // The listener heard the touch before the answer came: its watchers were pulled then, after the write.
    hear({ v: 1, inbox: 6, threads: { bob_me: 10 } });
    expect([inbox, thread].map((f) => f.mock.calls.length)).toEqual([3, 3]);
    pokeOwn(['thread:bob_me', 'inbox'], { 'thread:bob_me': 10, inbox: 6 });
    expect([inbox, thread].map((f) => f.mock.calls.length)).toEqual([3, 3]);

    // No counters in the answer (an older server, a touch that failed): pulled, as pokeSignal.
    pokeOwn(['inbox'], null);
    expect(inbox).toHaveBeenCalledTimes(4);
  });

  it("listens for one account at a time: another signing in stops the one before's listener", () => {
    watchSignal('me', 'inbox', vi.fn());
    watchSignal('you', 'inbox', vi.fn());
    expect(live().map((l) => l.path)).toEqual([['signals', 'you']]);
  });
});
