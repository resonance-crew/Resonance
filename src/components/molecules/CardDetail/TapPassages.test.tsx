// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import type { TapPassageBody } from '@/lib/api/v1/schemas';
import { PASSAGE_CHOSEN_MS, TapPassages } from './TapPassages';

/**
 * Round 27 §U1: which part stayed with the reader — a small centred dialog (never a sheet, never a popover): the
 * title naming it, the author's own sentences as banded rows wrapped in full, 略過 alone at the foot. A press holds
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
    // The chosen row's check in the text ink, as the apps draw it.
    expect(css).toMatch(/\.check\s*\{[^}]*color:\s*var\(--color-text\)/);
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
    expect(b.querySelector('svg')).not.toBeNull();
    expect(a).toHaveAttribute('aria-pressed', 'false');
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

  it('a press holds the row’s ink and its check, sends the pick, then closes a moment later', async () => {
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
});
