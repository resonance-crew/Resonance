// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import type { TapPassageBody } from '@/lib/api/v1/schemas';
import { INK_LIGHT } from '@/lib/design/strokes';
import { BAND_END_KEY, bandCurvePath, bandRegion } from '@/lib/design/listBands';
import { PASSAGE_CHOSEN_MS, TapPassages } from './TapPassages';

/**
 * Round 27 §U1: which part stayed with the reader — a small centred dialog (never a sheet, never a popover): the
 * title naming it, the author's own sentences as banded rows wrapped in full, 略過 alone at the foot (floating over it since round 33 §Q3). A press holds
 * the row's ink and its check, then closes; the picked row, reopened, rests chosen and a press on it clears the pick.
 */

const LONG = '那天我把舊家的鑰匙交回去，房東說不用擦了，可是我還是把每一扇窗都擦了一遍，好像這樣就能把住過的日子留下來，留在玻璃上一點點的光裡面，讓下一個人也看得見。';
const PASSAGES: TapPassageBody[] = [
  { id: '14fecaaf', text: '雨停的時候，巷口的燈先亮了。' },
  { id: '8b3a1c4d', text: LONG },
  { id: '85007cbf', text: '我想把這一段路走得慢一點。' },
];

function renderDialog(picked: string | null = null, script?: 'cjk' | 'latin') {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const page = renderWithIntl(<TapPassages passages={PASSAGES} picked={picked} script={script} onPick={onPick} onClose={onClose} />, {
    locale: 'zh-TW',
    messages: zhMessages,
  });
  return { ...page, onPick, onClose };
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 });

/** jsdom lays nothing out: every element measures `w` × `h`, as a row would, so the measured shapes draw. */
function laidOut(w = 320, h = 60) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(w);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(h);
}
const rows = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLButtonElement>('[data-passage]')];

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('TapPassages (§U1)', () => {
  it('sets the rows in the story’s own type: a Latin story in its body face and leading, as iOS and Android do', async () => {
    renderDialog(null, 'latin');
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('[data-tap-passages]')).toHaveAttribute('data-script', 'latin');
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/TapPassages.module.css'), 'utf8');
    const latin = css.match(/\.body\[data-script='latin'\]\s*\{([^}]*)\}/g)?.join('\n') ?? '';
    expect(latin).toMatch(/--passage-face:\s*var\(--font-body\)/);
    expect(latin).toMatch(/--story-leading-latin\)/);
    expect(latin).toMatch(/--story-leading-latin-compact\)/);
  });

  it('a story in CJK (the default) keeps the CJK face and leading', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('[data-tap-passages]')).toHaveAttribute('data-script', 'cjk');
  });

  it('is a dialog named by its title, the passages as rows in full, 略過 alone at its foot', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: '哪一段讓你有共鳴' });
    expect(dialog.querySelector('[data-tap-passages]')).not.toBeNull();
    expect(within(dialog).getByRole('heading', { name: '哪一段讓你有共鳴' })).toBeInTheDocument();
    const r = rows(dialog);
    expect(r.map((b) => b.getAttribute('data-passage'))).toEqual(['14fecaaf', '8b3a1c4d', '85007cbf']);
    expect(r.map((b) => b.getAttribute('data-testid'))).toEqual(['tap-passage-0', 'tap-passage-1', 'tap-passage-2']);
    // Wrapped in full (M2): the long sentence whole, never cut, never 「…」.
    expect(r[1].textContent).toBe(LONG);
    expect(dialog.textContent).not.toMatch(/…|\.\.\./);
    for (const b of r) expect(b).toHaveAttribute('aria-pressed', 'false');
    // The foot: one small 略過, no ✕ and no other button.
    const buttons = within(dialog).getAllByRole('button').filter((b) => !b.hasAttribute('data-passage'));
    expect(buttons.map((b) => b.textContent)).toEqual(['略過']);
    // The rows set no text-overflow anywhere: their words wrap.
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/TapPassages.module.css'), 'utf8');
    expect(css).not.toMatch(/text-overflow|line-clamp|nowrap/);
  });

  it('starts focus on the first row; reopened with a pick, on the picked one, which rests chosen', async () => {
    const first = renderDialog();
    await waitFor(() => expect(document.activeElement?.getAttribute('data-passage')).toBe('14fecaaf'));
    first.unmount();

    renderDialog('8b3a1c4d');
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement?.getAttribute('data-passage')).toBe('8b3a1c4d'));
    const [a, b] = rows(dialog);
    expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(b.hasAttribute('data-band-pressed')).toBe(true);
    expect(a).toHaveAttribute('aria-pressed', 'false');
    expect(a.hasAttribute('data-band-pressed')).toBe(false);
  });

  it('held open for a screenshot (no press came before), it puts focus on no row: no keyboard ring in the capture', async () => {
    renderWithIntl(<TapPassages passages={PASSAGES} picked={null} onPick={vi.fn()} onClose={vi.fn()} focusRow={false} />, {
      locale: 'zh-TW',
      messages: zhMessages,
    });
    await screen.findByRole('dialog');
    // Longer than the row's own 30 frames of trying.
    await new Promise((r) => setTimeout(r, 600));
    expect(document.activeElement?.hasAttribute('data-passage')).toBe(false);
  });

  it('a press holds the row’s ink, sends the pick, then closes a moment later', async () => {
    const { onPick, onClose } = renderDialog();
    const dialog = await screen.findByRole('dialog');
    const b = rows(dialog)[1];
    await user().click(b);
    expect(onPick).toHaveBeenCalledWith('8b3a1c4d');
    expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(b.hasAttribute('data-band-pressed')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: PASSAGE_CHOSEN_MS + 700 });
    // A second press while it holds chooses nothing more.
    await user().click(rows(dialog)[0]);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('pressing the picked row again clears the pick; pressing another replaces it', async () => {
    const cleared = renderDialog('8b3a1c4d');
    await user().click(rows(await screen.findByRole('dialog'))[1]);
    expect(cleared.onPick).toHaveBeenCalledWith(null);
    expect(rows(screen.getByRole('dialog'))[1]).toHaveAttribute('aria-pressed', 'false');
    cleared.unmount();

    const replaced = renderDialog('8b3a1c4d');
    await user().click(rows(await screen.findByRole('dialog'))[2]);
    expect(replaced.onPick).toHaveBeenCalledWith('85007cbf');
  });

  it('closes at once after a pick under reduced motion', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList,
    );
    const { onClose } = renderDialog();
    await user().click(rows(await screen.findByRole('dialog'))[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('略過 and Escape close it with no pick', async () => {
    const skip = renderDialog();
    await user().click(within(await screen.findByRole('dialog')).getByRole('button', { name: '略過' }));
    expect(skip.onClose).toHaveBeenCalledTimes(1);
    expect(skip.onPick).not.toHaveBeenCalled();
    skip.unmount();

    const esc = renderDialog();
    await screen.findByRole('dialog');
    await user().keyboard('{Escape}');
    expect(esc.onClose).toHaveBeenCalled();
    expect(esc.onPick).not.toHaveBeenCalled();
  });

  // Round 32 §P1 (the owner: 「把标题放进同一个滚动容器内…整个弹窗只有一个统一滚动区，标题随文字滚走，底部「略过」固定」);
  // round 33 §Q3 (「按钮固定浮在滚动区底部渐变之上…用有颜色的浮动按钮」): 略過 is the family's small tonal pill now,
  // floating over the region's foot — not round 32's quiet words in a footer under it (this case pinned those).
  it('scrolls the title with the rows in one region, 略過 the tonal pill floating over its foot', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    const title = within(dialog).getByRole('heading', { name: '哪一段讓你有共鳴' });
    const region = title.parentElement!;
    // The title is the scroll region's first child; the rows are in the same region.
    expect(region.firstElementChild).toBe(title);
    for (const row of rows(dialog)) expect(region.contains(row)).toBe(true);
    expect(region.querySelectorAll('[data-passage]')).toHaveLength(3);
    // 略過: outside what scrolls, beside it in the region's own box — so it never moves with the rows; tonal.
    const skip = within(dialog).getByRole('button', { name: '略過' });
    expect(region.contains(skip)).toBe(false);
    expect(skip.closest('[data-float-close]')).toBe(region.parentElement);
    expect(skip).toHaveAttribute('data-variant', 'tonal');
    expect(dialog.querySelector('[data-quiet]')).toBeNull();
    const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
    // The region's cap: the apps' min(560, 70 %) and never more than the window leaves — the backdrop's margin and
    // the paper's 24 above (no foot under the region any more) — so the whole dialog fits.
    const css = read('src/components/molecules/CardDetail/TapPassages.module.css');
    expect(css).toMatch(/--passages-room: calc\(2 \* clamp\(12px, 3vw, 32px\) \+ 24px \+ 6px\);/);
    expect(css).toMatch(/--dialog-scroll-max: min\(560px, 70vh, calc\(100dvh - var\(--passages-room\)\)\);/);
    expect(read('src/components/molecules/Modal/Modal.module.css')).toMatch(/\.backdrop \{[^}]*padding: clamp\(12px, 3vw, 32px\);/);
  });

  it('keeps the shared close a tonal pill everywhere else', async () => {
    const { Modal } = await import('@/components/molecules/Modal/Modal');
    renderWithIntl(
      <Modal open onClose={vi.fn()} closeButton ariaLabel="x">
        <p>x</p>
      </Modal>,
      { locale: 'zh-TW', messages: zhMessages },
    );
    const close = within(await screen.findByRole('dialog')).getByRole('button', { name: '關閉' });
    expect(close).toHaveAttribute('data-variant', 'tonal');
    expect(close.closest('[data-float-close]')).toBeNull();
  });

  // Round 32 §P2 (the owner: 「区段与区段之间加上分隔线…左右与文字内容齐平、适当内缩」).
  it('draws a quiet rule between two rows only, from the words’ start to their end, at the light pen', async () => {
    laidOut();
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    const items = [...dialog.querySelectorAll('li')];
    expect(items.map((li) => li.querySelectorAll('[data-band-rule]').length)).toEqual([0, 1, 1]);
    for (const li of items.slice(1)) {
      const rule = li.querySelector('[data-band-rule]')!;
      expect(rule).toHaveAttribute('aria-hidden');
      // before its row: the held row's see-through band washes over it
      expect(rule.compareDocumentPosition(li.querySelector('[data-passage]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(rule.querySelector('path')).toHaveAttribute('stroke-width', String(INK_LIGHT));
    }
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/TapPassages.module.css'), 'utf8');
    // the words' own insets (the rows' padding), never the paper's edges nor the drawn bar's gutter; no room taken
    expect(css).toMatch(/\.rule \{\s*clip-path: inset\(0 var\(--bell-inset-end, 20px\) 0 var\(--bell-inset, 20px\)\);/);
    expect(css).toMatch(/\.row \{[^}]*padding: 0 var\(--bell-inset-end, 20px\) 0 var\(--bell-inset, 20px\);/);
  });

  // Round 34 §6 (the owner: a press fills exactly between its two rules — 「同一路径、同一位置」): the rule is the bands'
  // own edge, drawn from the one curve — the row below's top edge and the row above's bottom edge, at the same place.
  it('draws each rule as the very curve its two bands end on, at their boundary', async () => {
    laidOut(320, 60);
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    const items = [...dialog.querySelectorAll('li')];
    for (const [i, li] of items.entries()) {
      if (i === 0) continue;
      const rule = li.querySelector('[data-band-rule] path')!.getAttribute('d')!;
      const key = `passage:${PASSAGES[i].id}`;
      expect(rule).toBe(bandCurvePath(0, 320, key));
      // The row's band starts on that path (its top edge)…
      const band = li.querySelector('[data-passage] [data-band] path')!.getAttribute('d')!;
      expect(band.startsWith(rule)).toBe(true);
      expect(band).toBe(bandRegion(320, 60, key, i + 1 < PASSAGES.length ? `passage:${PASSAGES[i + 1].id}` : BAND_END_KEY));
      // …and the row above's band ends on it (its bottom edge, the same curve moved down by its height).
      const above = items[i - 1].querySelector('[data-passage] [data-band] path')!.getAttribute('d')!;
      expect(above).toBe(bandRegion(320, 60, `passage:${PASSAGES[i - 1].id}`, key));
      // On the boundary itself: the rule's box is centred on the row's top edge, the curve on its middle.
      expect(li.querySelector('[data-band-rule]')!.parentElement).toBe(li);
    }
    const css = readFileSync(join(process.cwd(), 'src/components/atoms/BandWash/BandWash.module.css'), 'utf8');
    expect(css).toMatch(/\.rule \{[^}]*position: absolute;[^}]*left: 0;[^}]*right: 0;[^}]*top: -4px;[^}]*height: 8px;/);
    expect(css).toMatch(/\.rule > \.svg \{\s*top: 4px;/);
  });

  // Round 35 (the owner: 「把这个 dialog 里面的勾勾拿掉……选中的就是现在的这个变色的效果就好了」): no check anywhere, and
  // no slot kept for one — the words are a row's only part, the whole width; the chosen row is its resting ink alone.
  it('draws no check: the chosen row is its ink alone, the words the row’s only part', async () => {
    renderDialog('8b3a1c4d');
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('[data-check]')).toBeNull();
    for (const r of rows(dialog)) {
      const inner = r.querySelector('[class*="rowInner"]')!;
      expect(inner.children).toHaveLength(1);
      expect(inner.firstElementChild!.className).toMatch(/text/);
    }
    const chosen = rows(dialog)[1];
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    expect(chosen.hasAttribute('data-band-pressed')).toBe(true);
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/TapPassages.module.css'), 'utf8');
    expect(css).not.toMatch(/\.check\b/);
  });
});
