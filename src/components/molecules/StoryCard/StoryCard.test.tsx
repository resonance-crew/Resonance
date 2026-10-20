// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
import { StoryCard, type Story } from './StoryCard';

// The card and its pills draw only once measured.
mockElementSize(320, 480);

const story: Story = {
  title: 'A quiet realization',
  excerpt: 'It came slowly.',
  author: 'friend',
  authorInitials: 'FR',
  readTime: '3 min',
  tags: ['tea', 'rest'],
};

/** `oklch(92% 0.075 88)` → [92, '0.075 88']: the lightness, and the rest of the colour. */
function lightness(fill: string | null) {
  const m = fill?.match(/^oklch\((\d+)% (.+)\)$/);
  if (!m) throw new Error(`not an oklch fill: ${fill}`);
  return [Number(m[1]), m[2]] as const;
}

describe('StoryCard tags', () => {
  // The pills carry no outline, and on desktop hover the card's interior washes
  // to close to the card's accent fill — a pill in that exact fill would vanish.
  // So each is filled a few points deeper, in the same colour family.
  it.each([0, 1, 2, 3, 4, 5])('fills the tags deeper than the card accent (palette %i)', (index) => {
    const { container } = render(<StoryCard story={story} index={index} />);

    // The cover placeholder is painted in the card's accent fill.
    const [accentL, accentRest] = lightness(container.querySelector('svg rect[fill]')?.getAttribute('fill') ?? null);

    for (const tag of ['tea', 'rest']) {
      const pill = screen.getByText(tag).parentElement as HTMLElement;
      const fill = pill.querySelector(':scope > svg path[fill]')?.getAttribute('fill') ?? null;
      const [tagL, tagRest] = lightness(fill);
      expect(tagL).toBe(accentL - 5);
      expect(tagRest).toBe(accentRest);
    }
  });
});

describe('StoryCard hover', () => {
  // On a wide screen the card washes deeper from where the pointer came in.
  // The wash must not repaint the card on every frame of its spread — the
  // card's chalk and grain are filters, the costliest thing on the page to
  // redraw — so it is a disc grown by transform, clipped to the card's outline.
  it('washes the card from the pointer, inside its own outline, without repainting it', () => {
    const { container } = render(<StoryCard story={story} index={2} />);
    const card = container.querySelector('article') as HTMLElement;
    const region = card.querySelector('[data-brush-wash]') as HTMLElement;
    const disc = region.firstElementChild as HTMLElement;
    const scale = () => Number(disc.style.transform.match(/scale\(([^)]+)\)/)?.[1]);

    // The card's paper is drawn with the same outline the wash is cut to.
    const paper = card.querySelector('path[filter]');
    expect(region.style.clipPath).toBe(`path('${paper?.getAttribute('d')}')`);
    expect(scale()).toBe(0);

    fireEvent.mouseEnter(card, { clientX: 20, clientY: 30 });
    expect(scale()).toBeGreaterThan(0);
    // The card's own hover tone (92.5% 0.024 at its hue; jsdom writes 92.5% as 0.925).
    expect(disc.style.background).toMatch(/^oklch\((92\.5%|0\.925) 0\.024 140\)$/);

    fireEvent.mouseLeave(card, { clientX: 300, clientY: 470 });
    expect(scale()).toBe(0);
    // No SVG mask whose radius animates (each frame of it a repaint).
    expect(card.querySelector('mask')).toBeNull();
  });
});

// The writer's publish step shows the card as a list will: the same card, its cover the editor's.
describe('StoryCard as the writer\'s preview', () => {
  it('is a picture of the card named by its caption, with the cover slot in the cover\'s frame', () => {
    const { container } = render(
      <>
        <StoryCard story={story} preview labelledBy="cap" bleed="var(--page-pad-x)" coverSlot={<button>Add an image</button>} />
        <p id="cap">How the card looks in a list</p>
      </>,
    );
    const card = screen.getByRole('group', { name: 'How the card looks in a list' });
    expect(card.style.getPropertyValue('--story-bleed')).toBe('var(--page-pad-x)');
    // The slot sits in the cover's frame, the placeholder's own label stepping aside.
    const frame = container.querySelector('svg rect[fill]')!.closest('div[style*="padding-bottom"]')!;
    expect(frame).toContainElement(screen.getByRole('button', { name: 'Add an image' }));
    expect(screen.queryByText('story illustration')).toBeNull();
    // No wash from the pointer, and no arrow saying it opens.
    const disc = card.querySelector('[data-brush-wash]')!.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(card, { clientX: 20, clientY: 30 });
    expect(Number(disc.style.transform.match(/scale\(([^)]+)\)/)?.[1])).toBe(0);
  });

  it('is the feed\'s card, unchanged, without them', () => {
    render(<StoryCard story={story} />);
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByText('story illustration')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A quiet realization' }).closest('article')).not.toHaveAttribute('data-preview');
  });
});
