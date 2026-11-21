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

import { SAFETY_PULL_MS, pokeSignal, resetSignals, watchSignal } from './signals';

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

  it('pulls everything watched every minute while the page is in the foreground, never in the background', () => {
    const inbox = vi.fn();
    watchSignal('me', 'inbox', inbox);
    vi.advanceTimersByTime(SAFETY_PULL_MS);
    expect(inbox).toHaveBeenCalledTimes(1);

    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    vi.advanceTimersByTime(SAFETY_PULL_MS * 3);
    expect(inbox).toHaveBeenCalledTimes(1);

    // Back in the tab after more than a minute: pulled at once.
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

    // The rules not deployed yet, say: the listener fails; the minute's pull still carries the page.
    live()[0].onError(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    window.dispatchEvent(new Event('online'));
    expect(firestore.listeners).toHaveLength(2);
    expect(live()).toHaveLength(1);
  });

  it("listens for one account at a time: another signing in stops the one before's listener", () => {
    watchSignal('me', 'inbox', vi.fn());
    watchSignal('you', 'inbox', vi.fn());
    expect(live().map((l) => l.path)).toEqual([['signals', 'you']]);
  });
});
