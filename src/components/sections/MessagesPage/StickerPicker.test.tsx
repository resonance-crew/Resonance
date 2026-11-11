// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderWithIntl, screen } from '@/../test/render';
import { BREATH_STAGGER_MS } from '@/lib/chat/stickerBreath';
import { stickerOf } from '@/lib/stickers/catalog';
import { PICKER_PLAYING_PHONE, PICKER_PLAYING_WIDE, StickerPicker } from './StickerPicker';
import { STICKER_POPOVER_H, STICKER_POPOVER_W } from './StickerPopover';

// Round 23 (the owner's: 「預覽的時候就讓它會動(只有在視線範圍內的這些會動)，點擊就直接傳送出去」): the cells in view
// breathe, a few at a time; a tap sends.

/** The watcher the picker made, and what it watches: a test says which cells come into view. */
const watcher = vi.hoisted(() => ({
  callback: null as IntersectionObserverCallback | null,
  observed: new Set<Element>(),
  options: null as IntersectionObserverInit | null,
}));
class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
    watcher.callback = callback;
    watcher.options = options;
  }
  observe(el: Element) {
    watcher.observed.add(el);
  }
  unobserve(el: Element) {
    watcher.observed.delete(el);
  }
  disconnect() {
    watcher.observed.clear();
  }
}

const cells = () => Array.from(document.querySelectorAll<HTMLElement>('[data-sticker]'));
/** These cells now show this much of themselves. */
function show(list: HTMLElement[], ratio: number) {
  act(() =>
    watcher.callback!(
      list.map((target) => ({ target, isIntersecting: ratio > 0, intersectionRatio: ratio }) as unknown as IntersectionObserverEntry),
      {} as IntersectionObserver,
    ),
  );
}
const moving = () => cells().filter((c) => c.hasAttribute('data-moving'));

const realMatchMedia = window.matchMedia;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIntersectionObserver;
  watcher.callback = null;
  watcher.observed.clear();
  URL.createObjectURL = vi.fn(() => `blob:anim-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('webp')));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.matchMedia = realMatchMedia;
});

/** Lets the blob reads settle (they are promises, not timers). */
const settle = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

describe('the sticker picker', () => {
  it('sends a sticker on one tap, saying what a tap does', () => {
    const onPick = vi.fn();
    renderWithIntl(<StickerPicker recents={[]} onPick={onPick} />);
    const thanks = screen.getAllByRole('button', { name: 'Thanks' })[0];
    expect(thanks).toHaveAccessibleDescription('Send sticker');
    expect(thanks).not.toHaveAttribute('aria-pressed');
    fireEvent.click(thanks);
    expect(onPick).toHaveBeenCalledWith({ pack: 'twine', id: 'thanks' });
  });

  it('moves only the cells mostly in view, six at a time on a phone, the first in reading order first', async () => {
    renderWithIntl(<StickerPicker recents={[]} onPick={() => {}} />);
    expect(watcher.options?.root === document.querySelector('[class*="stickerGrid"]')).toBe(true);
    expect(watcher.options?.threshold).toEqual([0, 0.6]);
    const all = cells();
    // Half in view: still. Then twelve mostly in view (a phone's three rows of four).
    show(all.slice(12, 16), 0.5);
    show(all.slice(0, 12), 0.8);
    act(() => void vi.advanceTimersByTime(BREATH_STAGGER_MS * 20));
    await settle();
    expect(moving()).toEqual(all.slice(0, PICKER_PLAYING_PHONE));
    expect(PICKER_PLAYING_PHONE).toBe(6);
    // A moving cell shows its file (a fresh address), the others their key frame.
    expect(all[0].querySelector('img')!.getAttribute('src')).toMatch(/^blob:anim-/);
    expect(all[8].querySelector('img')!.getAttribute('src')).toMatch(/\.thumb\.webp/);
  });

  it('plays twelve at a time in the popover', async () => {
    renderWithIntl(<StickerPicker recents={[]} onPick={() => {}} variant="popover" />);
    show(cells().slice(0, 16), 1);
    act(() => void vi.advanceTimersByTime(BREATH_STAGGER_MS * 20));
    await settle();
    expect(moving()).toHaveLength(PICKER_PLAYING_WIDE);
    expect(PICKER_PLAYING_WIDE).toBe(12);
  });

  // Round 23 review: a first play fetches its file, which may take a while — its loops run from when it shows, and
  // a file arriving once its turn is over is never shown (nor moving outside the limit).
  it('times a play from when its file is showing, and never shows one that comes after its turn ended', async () => {
    const answers = new Map<string, () => void>();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => new Promise<Response>((resolve) => answers.set(url, () => resolve(new Response('webp'))))),
    );
    renderWithIntl(<StickerPicker recents={[]} onPick={() => {}} />);
    // The last pack's last two: no test before fetched them (a file is kept for the page's life once read).
    const [slow, late] = cells().slice(-2);
    const answer = (cell: HTMLElement) => [...answers].find(([url]) => url.startsWith(`/stickers/${cell.dataset.sticker}.webp`))![1];
    show([slow, late], 1);
    act(() => void vi.advanceTimersByTime(BREATH_STAGGER_MS * 2));
    await settle();
    expect(answers.size).toBe(2);
    expect(moving()).toEqual([]);
    // One leaves the view while its file is on its way; the other's comes two seconds after it was asked for.
    show([late], 0);
    act(() => void vi.advanceTimersByTime(2000));
    answer(slow)();
    answer(late)();
    await settle();
    expect(moving()).toEqual([slow]);
    expect(late.querySelector('img')!.getAttribute('src')).toMatch(/\.thumb\.webp/);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    // Its two loops from when it showed: still moving just before their end, on its key frame at it.
    const [pack, id] = slow.dataset.sticker!.split('/');
    const play = stickerOf(pack, id)!.durationMs * 2 + 120;
    act(() => void vi.advanceTimersByTime(play - 1));
    expect(moving()).toEqual([slow]);
    act(() => void vi.advanceTimersByTime(1));
    expect(moving()).toEqual([]);
  });

  it('starts no cell while the grid scrolls', async () => {
    renderWithIntl(<StickerPicker recents={[]} onPick={() => {}} />);
    const grid = document.querySelector<HTMLElement>('[class*="stickerGrid"]')!;
    fireEvent.scroll(grid);
    show(cells().slice(0, 4), 1);
    act(() => void vi.advanceTimersByTime(100));
    await settle();
    expect(moving()).toHaveLength(0);
    act(() => void vi.advanceTimersByTime(BREATH_STAGGER_MS * 6));
    await settle();
    expect(moving()).toHaveLength(4);
  });

  it('holds every cell on its key frame with less motion asked for, or the data saved', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    renderWithIntl(<StickerPicker recents={[]} onPick={() => {}} />);
    expect(watcher.callback).toBeNull();
    expect(cells().every((c) => /\.thumb\.webp/.test(c.querySelector('img')!.getAttribute('src')!))).toBe(true);
  });

  it('draws its cells bigger (round 23): 2 inside each, 4 apart, four to a row in the popover of 400 × 460', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/sections/MessagesPage/Thread.module.css'), 'utf8');
    const rule = (sel: string) => {
      const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return [...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
    };
    expect(rule('.stickerCell')).toMatch(/padding:\s*2px/);
    expect(rule('.stickerCells')).toMatch(/gap:\s*4px/);
    expect(rule('.stickerGrid')).toMatch(/padding:\s*0 0 8px/);
    // The panel reaches 6 past the foot's 14 on each side: its grid 8 from a phone's edges.
    expect(rule('.dock > .stickerPanel')).toMatch(/align-self:\s*center;[\s\S]*width:\s*calc\(100% \+ 12px\)/);
    expect(rule(".stickerPicker[data-variant='popover'] .stickerCells")).toMatch(/repeat\(4,/);
    expect([STICKER_POPOVER_W, STICKER_POPOVER_H]).toEqual([400, 460]);
    expect(rule('.stickerPopover')).toMatch(/width:\s*400px;[\s\S]*height:\s*460px/);
    expect(rule('.stickerPopoverBody')).toMatch(/inset:\s*8px/);
    // A press washes the cell's own drawn outline; nothing stays marked as chosen.
    expect(rule('.stickerCell:active .cellWash')).toMatch(/terracotta-light/);
    expect(css).not.toMatch(/stickerCell\[aria-pressed/);
    expect(css).not.toMatch(/stickerPreview|previewSlot|popoverPreview/);
  });
});
