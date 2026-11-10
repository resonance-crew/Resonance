// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stickerPlayback } from '@/lib/chat/stickerPlayback';
import { stickerArtTop, stickerTrim } from '@/lib/chat/stickerBox';
import { stickerOf } from '@/lib/stickers/catalog';
import { StickerPart } from './StickerPart';

const threadCss = readFileSync(join(process.cwd(), 'src/components/sections/MessagesPage/Thread.module.css'), 'utf8');
/** A selector's own CSS block(s) in the thread's stylesheet. */
const cssRule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...threadCss.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
};

// The thread's IntersectionObserver: each sticker's, to say it came on screen (or left it).
const seen = new Map<Element, (entries: { isIntersecting: boolean }[]) => void>();
class FakeObserver {
  constructor(private readonly cb: (entries: { isIntersecting: boolean }[]) => void) {}
  observe(el: Element) {
    seen.set(el, this.cb);
  }
  disconnect() {}
}
const onScreen = (key: string, on = true) => {
  const el = document.querySelector(`[data-testid="${key}"]`)!.firstElementChild!;
  act(() => seen.get(el)!([{ isIntersecting: on }]));
};
const srcOf = (key: string) => document.querySelector(`[data-testid="${key}"] img`)!.getAttribute('src');

let still = false;
let urls = 0;
beforeEach(() => {
  seen.clear();
  urls = 0;
  still = false;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['anim']) })));
  URL.createObjectURL = vi.fn(() => `blob:play-${++urls}`);
  URL.revokeObjectURL = vi.fn();
  window.matchMedia = ((query: string) => ({
    matches: still && query.includes('reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of stickerPlayback.moving) stickerPlayback.end(key);
});

function sticker(key: string, pack = 'twine', id = 'thanks') {
  return (
    <span data-testid={key} key={key}>
      <StickerPart messageKey={key} sticker={{ pack, id }} fallback="〔貼圖：謝謝〕" interactive />
    </span>
  );
}

// Round 22 §4.5: a sticker plays its two loops when it first comes on screen, then rests on its key frame; a tap
// plays it again; at most three move at once; with reduced motion it only ever shows its key frame.
describe('a sticker in the thread', () => {
  it('rests on its key frame, plays once on first sight from a fresh address, and a tap replays it', async () => {
    renderWithIntl(sticker('k1'));
    expect(screen.getByRole('button', { name: 'Sticker: Thanks' })).toBeInTheDocument();
    expect(srcOf('k1')).toContain('/stickers/twine/thanks.thumb.webp');
    onScreen('k1');
    await waitFor(() => expect(srcOf('k1')).toBe('blob:play-1'));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/stickers/twine/thanks.webp'));

    // Seen before: coming back on screen doesn't play it again.
    onScreen('k1', false);
    expect(srcOf('k1')).toContain('.thumb.webp');
    onScreen('k1');
    expect(srcOf('k1')).toContain('.thumb.webp');

    // A tap plays it again — a new address, so the animation starts from its beginning; the file fetched once.
    await userEvent.click(screen.getByRole('button', { name: 'Sticker: Thanks' }));
    await waitFor(() => expect(srcOf('k1')).toBe('blob:play-2'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps three moving at most: the fourth to start stops the first', async () => {
    renderWithIntl(<>{['a', 'b', 'c', 'd'].map((k) => sticker(k, 'pip', 'hi'))}</>);
    for (const k of ['a', 'b', 'c']) onScreen(k);
    await waitFor(() => expect(stickerPlayback.moving).toEqual(['a', 'b', 'c']));
    onScreen('d');
    await waitFor(() => expect(stickerPlayback.moving).toEqual(['b', 'c', 'd']));
    expect(srcOf('a')).toContain('/stickers/pip/hi.thumb.webp');
  });

  it('shows only its key frame with reduced motion', async () => {
    still = true;
    renderWithIntl(sticker('r1', 'nod', 'hug'));
    onScreen('r1');
    await userEvent.click(screen.getByRole('button', { name: 'Sticker: Hug' }));
    expect(srcOf('r1')).toContain('/stickers/nod/hug.thumb.webp');
    expect(fetch).not.toHaveBeenCalled();
  });

  // Round 24 (the owner's: 點點's sticker left empty paper over it in the thread): it lays out by its drawing — its
  // box as tall as the drawing with 2 % over and under it, the square drawn whole past the box, answering no pointer.
  it('takes the room of its drawing, not its square, and a tap takes that box', async () => {
    renderWithIntl(sticker('t1', 'pip', 'haha'));
    const box = document.querySelector<HTMLElement>('[data-testid="t1"]')!.firstElementChild as HTMLElement;
    const haha = stickerOf('pip', 'haha')!;
    const trim = stickerTrim(haha.box);
    expect(box.style.getPropertyValue('--sticker-trim-top')).toBe(String(trim.top));
    expect(box.style.getPropertyValue('--sticker-trim-h')).toBe(String(trim.height));
    expect(box.style.getPropertyValue('--sticker-art')).toBe(String(stickerArtTop(haha.box, haha.poseBox)));
    // The box: the square's width, the drawing's height; the square drawn whole above and past it, taking no pointer.
    expect(cssRule('.sticker')).toMatch(/width:\s*var\(--sticker-size\);\s*height:\s*calc\(var\(--sticker-size\) \* var\(--sticker-trim-h, 1\)\)/);
    expect(cssRule('.sticker')).not.toMatch(/overflow/);
    expect(cssRule('.sticker img')).toMatch(/position:\s*absolute;\s*top:\s*calc\(-1 \* var\(--sticker-size\) \* var\(--sticker-trim-top, 0\)\)/);
    expect(cssRule('.sticker img')).toMatch(/width:\s*var\(--sticker-size\);\s*height:\s*var\(--sticker-size\)/);
    expect(cssRule('.sticker img')).toMatch(/pointer-events:\s*none/);
    expect(cssRule('.stickerButton')).toMatch(/width:\s*100%;\s*height:\s*100%/);
    // A tap on the box plays it, as before.
    await userEvent.click(screen.getByRole('button', { name: 'Sticker: Haha' }));
    await waitFor(() => expect(srcOf('t1')).toMatch(/^blob:/));
  });

  it('keeps its square for a sticker this build has no numbers for, and reads its drawing’s top from its key frame', () => {
    // The key frame as the canvas reads it at 32²: nothing above row 8, ink from there down — its drawing starts a
    // quarter of the way down its square.
    const pixels = new Uint8ClampedArray(32 * 32 * 4);
    for (let row = 8; row < 32; row++) for (let x = 0; x < 32; x++) pixels[(row * 32 + x) * 4 + 3] = 255;
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage: () => {}, getImageData: () => ({ data: pixels }) } as unknown as RenderingContext);
    try {
      renderWithIntl(<StickerPart messageKey="u2" sticker={{ pack: 'later', id: 'wave' }} fallback="〔貼圖〕" interactive />);
      const button = screen.getByRole('button', { name: '〔貼圖〕' });
      const box = button.parentElement!;
      // No numbers: its square, and nothing to take off over a quote until its key frame has been read.
      expect(box.style.getPropertyValue('--sticker-trim-top')).toBe('0');
      expect(box.style.getPropertyValue('--sticker-trim-h')).toBe('1');
      expect(box.style.getPropertyValue('--sticker-art')).toBe('0');

      // Its key frame loads: read once, the drawing's top taken from its ink. The box keeps its square.
      const img = button.querySelector('img')!;
      Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 432 });
      fireEvent.load(img);
      expect(getContext).toHaveBeenCalledTimes(1);
      expect(box.style.getPropertyValue('--sticker-art')).toBe('0.25');
      expect(box.style.getPropertyValue('--sticker-trim-top')).toBe('0');
      expect(box.style.getPropertyValue('--sticker-trim-h')).toBe('1');
    } finally {
      getContext.mockRestore();
    }
  });

  it('never reads the key frame of a sticker the catalog has numbers for', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    try {
      renderWithIntl(sticker('n1', 'pip', 'hi'));
      const img = document.querySelector<HTMLImageElement>('[data-testid="n1"] img')!;
      Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 432 });
      fireEvent.load(img);
      expect(getContext).not.toHaveBeenCalled();
      const hi = stickerOf('pip', 'hi')!;
      const box = document.querySelector<HTMLElement>('[data-testid="n1"]')!.firstElementChild as HTMLElement;
      expect(box.style.getPropertyValue('--sticker-art')).toBe(String(stickerArtTop(hi.box, hi.poseBox)));
    } finally {
      getContext.mockRestore();
    }
  });

  it('names a sticker this build doesn’t know by its fallback words, and says when it can’t be drawn', () => {
    const failed = vi.fn();
    renderWithIntl(<StickerPart messageKey="u1" sticker={{ pack: 'later', id: 'wave' }} fallback="〔貼圖〕" interactive onFailed={failed} />);
    const button = screen.getByRole('button', { name: '〔貼圖〕' });
    // Read from the site all the same (a later pack), until it fails.
    expect(button.querySelector('img')).toHaveAttribute('src', '/stickers/later/wave.thumb.webp?v=0');
    act(() => {
      button.querySelector('img')!.dispatchEvent(new Event('error'));
    });
    expect(failed).toHaveBeenCalled();
  });
});
