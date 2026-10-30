// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import { stickerPlayback } from '@/lib/chat/stickerPlayback';
import { StickerPart } from './StickerPart';

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
