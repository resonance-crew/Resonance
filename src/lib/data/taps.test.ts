// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import { act, renderHook } from '@testing-library/react';
import { renderWithIntl, screen } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import type { AuthorBody, CardTapBody } from '@/lib/api/v1/schemas';
import { TapFaces } from '@/components/molecules/CardDetail/TapFaces';
import { cardPageKey, type LoadedCardPageLists } from './hooks';
import { useTapPassage, useTapToggle, withMine } from './taps';

/**
 * Round 26 §U2.3: the viewer's tap flips at once on the card page, before the server answers (or puts it back). The
 * faces' list is kept whole through it — cut to three only where it is drawn — so turning the tap on and off again
 * gives every face back, as the apps do (Android e3f7967c). It once cut [me, dora, eli, fay] to three on the way in
 * and kept `more`, so off again showed dora, eli and a blank disc where fay had been.
 */

const setTap = vi.fn((..._a: unknown[]): Promise<unknown> => Promise.resolve({}));
const setTapPassage = vi.fn((..._a: unknown[]): Promise<{ passage: string | null }> => Promise.resolve({ passage: null }));
vi.mock('@/lib/db/firestore/client/taps', () => ({
  setTap: (...a: unknown[]) => setTap(...a),
  setTapPassage: (...a: unknown[]) => setTapPassage(...a),
  listTaps: vi.fn(() => new Promise(() => {})),
}));

const face = (id: string): AuthorBody => ({ id, handle: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: null });
const [alice, dora, eli, fay] = ['alice', 'dora', 'eli', 'fay'].map(face);
const READ: CardTapBody = { mine: false, faces: [dora, eli, fay], more: false, mayNote: true };

function drawn(tap: CardTapBody) {
  const page = renderWithIntl(
    createElement(SWRConfig, { value: { provider: () => new Map() } }, createElement(TapFaces, { cardId: 'c1', tap, viewerId: 'alice' })),
    { locale: 'zh-TW', messages: zhMessages },
  );
  const faces = [...page.container.querySelectorAll('[data-face]')].map((f) => f.getAttribute('data-face'));
  const disc = !!page.container.querySelector('[data-more]');
  const name = screen.getByRole('button').getAttribute('aria-label');
  page.unmount();
  return { faces, disc, name };
}

describe('withMine', () => {
  it('gives every face back when the tap goes on and off again (and when a refused one is put back)', () => {
    const on = withMine(READ, true, alice);
    expect(on).toEqual({ mine: true, faces: [alice, dora, eli, fay], more: false, mayNote: true });
    expect(withMine(on, false, alice)).toEqual(READ);
    // Twice on is still one face of the viewer's.
    expect(withMine(on, true, alice).faces).toEqual([alice, dora, eli, fay]);
  });

  it('draws the tap on as three faces (no blank disc since round 29 §S5, still said), and off again as the three it had', () => {
    const on = drawn(withMine(READ, true, alice));
    expect(on.faces).toEqual(['alice', 'dora', 'eli']);
    expect(on.disc).toBe(false);
    expect(on.name).toBe('你共振了，與這張卡片共振的人：dora、eli，還有其他人');

    const off = drawn(withMine(withMine(READ, true, alice), false, alice));
    expect(off.faces).toEqual(['dora', 'eli', 'fay']);
    expect(off.disc).toBe(false);
    expect(off.name).toBe('與這張卡片共振的人：dora、eli、fay');
  });
});

/**
 * Round 27 §P7's web twin: the card page rebuilds the tap in place on every flip, so it must carry the card's
 * passages through (or the dialog would never open again after the first tap — M1) and drop the reader's pick when
 * the tap goes off (the server clears it in the same write). A pick shows at once and the server is asked after.
 */
describe('the passages through a flip and a pick', () => {
  const PASSAGES = [
    { id: '14fecaaf', text: 'one' },
    { id: '8b3a1c4d', text: 'two' },
  ];
  const WITH: CardTapBody = { ...READ, mine: true, faces: [alice, ...READ.faces], passages: PASSAGES, passage: '8b3a1c4d' };

  it('keeps the passages on and off, and clears the pick when the tap goes off — on again starts without one', () => {
    const off = withMine(WITH, false, alice);
    expect(off.passages).toEqual(PASSAGES);
    expect(off.passage).toBeNull();
    const on = withMine(off, true, alice);
    expect(on.passages).toEqual(PASSAGES);
    expect(on.passage).toBeNull();
    // A short card's tap stays exactly as the server sent it: nothing added.
    expect(Object.keys(withMine(READ, false, alice)).sort()).toEqual(['faces', 'mayNote', 'mine', 'more']);
  });

  function harness(tap: CardTapBody) {
    const cache = new Map();
    const lists = { resonances: { cards: [], authors: {} }, related: { cards: [], authors: {} }, links: { cards: [], authors: {} }, embeds: { cards: [], authors: {} }, tap } as unknown as LoadedCardPageLists;
    const key = cardPageKey('c1', 'alice');
    const wrapper = ({ children }: { children: ReactNode }) => createElement(SWRConfig, { value: { provider: () => cache, dedupingInterval: 0 } }, children);
    const hook = renderHook(() => useTapPassage('c1', 'alice'), { wrapper });
    return { hook, cache, key, lists };
  }
  const seed = async (h: ReturnType<typeof harness>) => {
    h.cache.set(h.key, { data: h.lists });
  };
  const tapIn = (h: ReturnType<typeof harness>) => (h.cache.get(h.key)?.data as LoadedCardPageLists | undefined)?.tap;

  it('shows the pick at once on the card page’s answer and asks the server after', async () => {
    let answer: (v: { passage: string | null }) => void = () => {};
    setTapPassage.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    const h = harness({ ...WITH, passage: null });
    await seed(h);
    let done!: Promise<unknown>;
    await act(async () => {
      done = h.hook.result.current('14fecaaf');
    });
    expect(tapIn(h)?.passage).toBe('14fecaaf');
    expect(tapIn(h)?.passages).toEqual(PASSAGES);
    expect(setTapPassage).toHaveBeenCalledWith('c1', '14fecaaf');
    await act(async () => answer({ passage: '14fecaaf' }));
    expect(await done).toBeNull();
  });

  it('a refusal other than 400 / 409 puts the reader’s earlier pick back; a 409 says “gone” and keeps nothing to undo', async () => {
    setTapPassage.mockRejectedValueOnce(Object.assign(new Error('500'), { status: 500 }));
    const h = harness(WITH);
    await seed(h);
    let failed: unknown;
    await act(async () => {
      failed = await h.hook.result.current('14fecaaf');
    });
    expect(failed).toBe('failed');
    expect(tapIn(h)?.passage).toBe('8b3a1c4d');

    setTapPassage.mockRejectedValueOnce(Object.assign(new Error('409'), { status: 409 }));
    await act(async () => {
      failed = await h.hook.result.current(null);
    });
    expect(failed).toBe('gone');
  });

  it('a refused take-back puts the tap back with the reader’s pick (the server still has it), as iOS does', async () => {
    setTap.mockRejectedValueOnce(Object.assign(new Error('500'), { status: 500 }));
    const h = harness(WITH);
    await seed(h);
    const toggle = renderHook(() => useTapToggle('c1', 'alice'), {
      wrapper: ({ children }: { children: ReactNode }) => createElement(SWRConfig, { value: { provider: () => h.cache, dedupingInterval: 0 } }, children),
    });
    let failed: unknown;
    await act(async () => {
      failed = await toggle.result.current(false, alice);
    });
    expect(failed).toBe('failed');
    expect(setTap).toHaveBeenCalledWith('c1', false);
    expect(tapIn(h)?.mine).toBe(true);
    expect(tapIn(h)?.faces.map((f) => f.id)).toEqual(['alice', 'dora', 'eli', 'fay']);
    expect(tapIn(h)?.passage).toBe('8b3a1c4d');
  });
});
