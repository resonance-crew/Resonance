// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { render, screen, fireEvent, userEvent } from '@/../test/render';
import { mockElementSize, penLines } from '@/../test/organic';
import { OrganicButton, type OrganicButtonVariant } from './OrganicButton';
import { Icon } from '../Icon';
import styles from './OrganicButton.module.css';

// The button draws nothing until it is measured; give it a box.
mockElementSize(120, 40);

const ALL: OrganicButtonVariant[] = [
  'primary', 'secondary', 'ghost', 'outline', 'ctaLight', 'ctaGhost', 'secondaryOutline',
  'solid', 'tonal', 'danger', 'dangerTonal', 'dangerText', 'quiet', 'ink', 'text', 'textAccent', 'paper',
];

function renderVariant(variant: OrganicButtonVariant) {
  render(<OrganicButton variant={variant}>Press me</OrganicButton>);
  return screen.getByRole('button', { name: 'Press me' });
}

// The face is the first shape drawn (fill only — its stroke is transparent).
const face = (btn: HTMLElement) => btn.querySelector('svg path')?.getAttribute('fill');

describe('OrganicButton variants', () => {
  // A button is a filled shape: the pen outline belongs to containers (cards,
  // modals, panels, bars) and inputs, never to a control — on bare paper or
  // inside a frame alike.
  it.each(ALL)('%s draws no pen outline', (variant) => {
    const btn = renderVariant(variant);
    expect(btn).toHaveAttribute('data-variant', variant);
    expect(penLines(btn)).toHaveLength(0);
    expect(btn).toHaveTextContent('Press me');
  });

  it.each(ALL)('%s keeps the hover ink, spreading from the pointer', (variant) => {
    const btn = renderVariant(variant);
    // The wash is a disc grown by transform under the button's outline.
    const ink = () => {
      const disc = btn.querySelector('[data-brush-wash] > *') as HTMLElement;
      return Number(disc.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
    };
    expect(ink()).toBe(0);
    fireEvent.mouseEnter(btn, { clientX: 10, clientY: 10 });
    expect(ink()).toBeGreaterThan(0);
    fireEvent.mouseLeave(btn);
    expect(ink()).toBe(0);
  });

  // What says "press me" is the fill, ranked: the verb deep terracotta,
  // everything beside it the tonal tint, the final destructive confirm solid
  // red and the button that opens that flow the red tint.
  it.each([
    ['solid', 'var(--button-fill)', 'var(--color-cream)'],
    ['tonal', 'var(--button-tonal)', 'var(--button-on-tonal)'],
    ['danger', 'var(--danger-fill)', 'var(--color-cream)'],
    ['dangerTonal', 'var(--button-danger-tonal)', 'var(--button-on-danger-tonal)'],
    ['dangerText', 'transparent', 'var(--danger-fill)'],
    ['quiet', 'transparent', 'var(--color-text-muted)'],
    ['ink', 'var(--apple-fill)', 'var(--apple-label)'],
    ['paper', 'var(--color-card-bg)', 'var(--color-text)'],
    // On the call-to-action band: its own tokens, light words on a deep band in either scheme.
    ['ctaLight', 'var(--cta-ink)', 'var(--cta-verb-ink)'],
    ['ctaGhost', 'var(--cta-ghost)', 'var(--cta-ink)'],
  ] as const)('%s wears the %s face with a %s label', (variant, fill, label) => {
    const btn = renderVariant(variant);
    expect(face(btn)).toBe(fill);
    expect(btn.style.color).toBe(label);
  });

  // The trash's 清空 (round 9 §5) and a dialog's quiet way (the link editor's 移除連結, round 17 review D5) are the
  // faces with no fill: their words alone (the danger ink, the muted ink), no grain — only their wash says they press.
  it.each(['dangerText', 'quiet'] as const)('draws %s as its words alone: no fill, no grain', (variant) => {
    const bare = renderVariant(variant);
    expect(bare.querySelector('filter')).toBeNull();
    render(<OrganicButton variant="dangerTonal">Filled</OrganicButton>);
    expect(screen.getByRole('button', { name: 'Filled' }).querySelector('filter')).not.toBeNull();
  });

  // The older names keep working and wear the rank they stood for, so call
  // sites can move to the rank names at their own pace. Cancel / Close /
  // Load more (`text`, `textAccent`) were bare words; a word alone did not
  // read as a button beside a filled verb, so they wear the tonal pill.
  it.each([
    ['primary', 'solid'],
    ['outline', 'tonal'],
    ['ghost', 'tonal'],
    ['secondary', 'tonal'],
    ['secondaryOutline', 'tonal'],
    ['text', 'tonal'],
    ['textAccent', 'tonal'],
  ] as const)('%s wears the %s face', (legacy, rank) => {
    render(
      <>
        <OrganicButton variant={legacy}>Old name</OrganicButton>
        <OrganicButton variant={rank}>Rank name</OrganicButton>
      </>,
    );
    const legacyBtn = screen.getByRole('button', { name: 'Old name' });
    const rankBtn = screen.getByRole('button', { name: 'Rank name' });
    expect([face(legacyBtn), legacyBtn.style.color]).toEqual([face(rankBtn), rankBtn.style.color]);
  });

  // With no pen line and the browser's ring switched off, a Tab-focused
  // button would be invisible. jsdom cannot evaluate :focus-visible, so pin
  // the stylesheet contract and check the button is reachable by keyboard.
  it.each(ALL)('%s is reachable by Tab and rings the focus colour', async (variant) => {
    const btn = renderVariant(variant);
    await userEvent.tab();
    expect(btn).toHaveFocus();

    const css = readFileSync(
      join(process.cwd(), 'src/components/atoms/OrganicButton/OrganicButton.module.css'),
      'utf8',
    );
    const [, body] = css.match(/\.btn:focus-visible\s*\{([^}]*)\}/) ?? [];
    expect(body).toMatch(/outline:\s*2px solid var\(--field-border-focus\)/);
    expect(body).toMatch(/outline-offset:/);
  });

  // On the terracotta band a terracotta ring would vanish into it.
  it('rings the band\'s buttons in cream', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/components/atoms/OrganicButton/OrganicButton.module.css'),
      'utf8',
    );
    const [, selectors, body] = css.match(/\.btn:is\(([^)]*)\):focus-visible\s*\{([^}]*)\}/) ?? [];
    expect(selectors).toContain("[data-variant='ctaLight']");
    expect(selectors).toContain("[data-variant='ctaGhost']");
    expect(body).toMatch(/outline-color:\s*var\(--color-cream\)/);
  });

  // Every label clears 4.5:1 on its face in every theme and scheme: the faces
  // are palette tokens (lib/design/palette, whose test checks each pair), and
  // a label on the solid face is the paper colour in both schemes.
  it('takes its faces from the button tokens', () => {
    const tsx = readFileSync(join(process.cwd(), 'src/components/atoms/OrganicButton/OrganicButton.tsx'), 'utf8');
    for (const t of ['--button-fill', '--button-tonal', '--button-on-tonal', '--button-danger-tonal', '--button-on-danger-tonal']) {
      expect(tsx, t).toContain(`var(${t})`);
    }
    const palette = readFileSync(join(process.cwd(), 'src/styles/palette.css'), 'utf8');
    for (const t of ['--button-fill', '--button-tonal', '--button-on-tonal', '--button-danger-tonal', '--button-on-danger-tonal']) {
      expect(palette.split(`${t}:`).length - 1, t).toBeGreaterThanOrEqual(3); // light, the system's dark, the chosen dark
    }
  });

  // No face is see-through: a button always shows the shape you press — but the trash's 清空, the one
  // word-only button (round 9 §5), pinned on its own above.
  it.each(ALL.filter((v) => v !== 'dangerText' && v !== 'quiet'))('%s has a fill', (variant) => {
    const btn = renderVariant(variant);
    expect(face(btn)).toBeTruthy();
    expect(face(btn)).not.toBe('transparent');
    expect(btn.style.getPropertyValue('--shape-fill')).not.toBe('transparent');
  });

  // Sign in with Apple asks for a black button: the ink face with a cream
  // label, as large as its neighbour and, like it, no pen line.
  // Sign in with Apple: the ink colour under a cream label on light paper, Apple's white style on dark (palette.ts).
  it('ink wears the Apple button tokens', () => {
    const btn = renderVariant('ink');
    expect(btn.style.color).toBe('var(--apple-label)');
    expect(btn.style.getPropertyValue('--shape-fill')).toBe('var(--apple-fill)');
  });

  it('still takes clicks', async () => {
    const onClick = vi.fn();
    render(<OrganicButton variant="text" onClick={onClick}>Cancel</OrganicButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

// A dialog's verb before there is anything to act on (the resonate picker's
// 共振 until a card is chosen): it can't be pressed and doesn't answer a hover.
describe('disabled', () => {
  it('takes no click and grows no hover ink', async () => {
    const onClick = vi.fn();
    render(
      <OrganicButton variant="solid" disabled onClick={onClick}>
        Resonate
      </OrganicButton>,
    );
    const btn = screen.getByRole('button', { name: 'Resonate' });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.mouseEnter(btn, { clientX: 10, clientY: 10 });
    const disc = btn.querySelector('[data-brush-wash] > *') as HTMLElement;
    expect(Number(disc.style.transform.match(/scale\(([^)]+)\)/)?.[1])).toBe(0);
  });

  it('is pressable by default', () => {
    expect(renderVariant('solid')).toBeEnabled();
  });
});

// A sheet's provider buttons span its width: the face is drawn across all of
// it — the size it measures — and the label stays in the middle.
describe('block', () => {
  it('fills its container and draws its face at that width', () => {
    render(<OrganicButton variant="solid" block>Continue with Google</OrganicButton>);
    const btn = screen.getByRole('button', { name: 'Continue with Google' });
    expect(btn.classList).toContain(styles.block);
    // The width the button measures (mockElementSize's box above).
    expect(btn.querySelector('svg')).toHaveAttribute('width', '120');

    const css = readFileSync(
      join(process.cwd(), 'src/components/atoms/OrganicButton/OrganicButton.module.css'),
      'utf8',
    );
    const [, block] = css.match(/\.block\s*\{([^}]*)\}/) ?? [];
    expect(block).toMatch(/width:\s*100%/);
    const [, btnRule] = css.match(/\.btn\s*\{([^}]*)\}/) ?? [];
    expect(btnRule).toMatch(/justify-content:\s*center/);
  });

  it('is off by default', () => {
    render(<OrganicButton>Explore</OrganicButton>);
    expect(screen.getByRole('button', { name: 'Explore' }).classList).not.toContain(styles.block);
  });
});

// The server's HTML has no measured size, so no drawn shape: a primary's cream
// label stood on the cream hero, invisible until the scripts ran (or forever
// without them). Until measured the button is a plain pill of its own fill —
// `.res-shape-stand-in` in globals.css, which the drawn one replaces.
describe('before it is measured', () => {
  it('stands in as a plain pill of its own fill in the server HTML', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(<OrganicButton variant="primary">Explore</OrganicButton>);
    const btn = host.querySelector('button')!;
    expect(btn).toHaveAttribute('data-shape-pending');
    expect(btn.classList).toContain('res-shape-stand-in');
    expect(btn.style.getPropertyValue('--shape-fill')).toBe('var(--button-fill)');
    // No pen line to stand in for.
    expect(btn.style.getPropertyValue('--shape-ink')).toBe('');

    const css = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf8');
    const [, rule] = css.match(/\.res-shape-stand-in\[data-shape-pending\]\s*\{([^}]*)\}/) ?? [];
    expect(rule).toMatch(/background-color:\s*var\(--shape-fill/);
  });

  it('drops the stand-in once drawn', () => {
    expect(renderVariant('primary')).not.toHaveAttribute('data-shape-pending');
  });
});

// B6: a button whose action is on its way keeps its word and its size, draws a
// small pen loop in its label's ink, says it is busy and takes no second press —
// but keeps the focus (no `disabled`) and its full colour.
describe('in progress (loading)', () => {
  const loaders = (btn: HTMLElement) => btn.querySelectorAll('[data-button-loader]');

  it('keeps its label, says it is busy, ignores presses and stays focusable', async () => {
    const onClick = vi.fn();
    render(<OrganicButton loading onClick={onClick}>Publish</OrganicButton>);
    const btn = screen.getByRole('button', { name: 'Publish' });
    expect(btn).toHaveTextContent('Publish');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).not.toBeDisabled();
    expect(loaders(btn)).toHaveLength(1);
    // The loop is drawn in the label's own ink, at the house pen.
    const link = loaders(btn)[0].querySelector('path')!;
    expect(link).toHaveAttribute('stroke', 'currentColor');
    expect(loaders(btn)[0]).toHaveAttribute('aria-hidden', 'true');

    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    btn.focus();
    expect(btn).toHaveFocus();
  });

  it('stands the loader before a bare label, outside its box, and moves the pair to stay centred', () => {
    const { rerender } = render(<OrganicButton loading>Publish</OrganicButton>);
    const label = () => screen.getByRole('button').querySelector(`.${styles.label}`) as HTMLElement;
    // md: a 16 loader + 6 → the label moves 11 toward the end.
    expect(label()).toHaveAttribute('data-loading-shift');
    expect(label().style.getPropertyValue('--loader-shift')).toBe('11px');
    expect(label().querySelector(`.${styles.loaderSlot} [data-button-loader]`)).toHaveAttribute('width', '16');
    // sm: 14 + 6 → 10.
    rerender(<OrganicButton loading size="sm">Publish</OrganicButton>);
    expect(label().style.getPropertyValue('--loader-shift')).toBe('10px');
    // Idle again: nothing moved, no loader.
    rerender(<OrganicButton size="sm">Publish</OrganicButton>);
    expect(label()).not.toHaveAttribute('data-loading-shift');
    expect(loaders(screen.getByRole('button'))).toHaveLength(0);
  });

  it('takes a leading icon’s place at the icon’s size, moving nothing', () => {
    render(
      <OrganicButton loading>
        <Icon name="document" size={18} />
        Download
      </OrganicButton>,
    );
    const btn = screen.getByRole('button', { name: 'Download' });
    const [loader] = loaders(btn);
    expect(loader).toHaveAttribute('width', '18');
    // The icon is gone (the loader is the only drawing in the label), and the label didn't move.
    const label = btn.querySelector(`.${styles.label}`) as HTMLElement;
    expect(label.querySelectorAll('svg')).toHaveLength(1);
    expect(label).not.toHaveAttribute('data-loading-shift');
  });

  it('leaves the loader to the caller when asked (a brand mark’s slot)', () => {
    render(<OrganicButton loading callerLoader>Continue</OrganicButton>);
    const btn = screen.getByRole('button', { name: 'Continue' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(loaders(btn)).toHaveLength(0);
  });

  it('keeps a form from submitting while busy', async () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    render(
      <form onSubmit={(e) => onSubmit(e.nativeEvent)}>
        <OrganicButton loading>Send</OrganicButton>
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Reduced motion: the loop is drawn once and only breathes — no travelling dash.
  it('has a still loop for reduced motion and travels otherwise', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/atoms/ButtonLoader/ButtonLoader.module.css'), 'utf8');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.link\s*\{\s*display:\s*none/);
    expect(reduced).toMatch(/\.still\s*\{\s*display:\s*inline/);
    expect(css).toMatch(/\.link\s*\{\s*animation:\s*sweep 1100ms linear infinite/);
  });
});
