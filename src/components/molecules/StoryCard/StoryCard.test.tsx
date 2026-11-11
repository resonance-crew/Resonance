// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
import { StoryCard, type Story } from './StoryCard';
import { paletteFor, type PaletteToken } from '@/lib/design/palette';

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

describe('StoryCard tags', () => {
  // The pills carry no outline, and on desktop hover the card's interior washes
  // to close to the card's fill — a pill in that exact fill would vanish. So
  // each wears its family's tag colour, a few points deeper (palette.ts
  // card-tag; in dark a step above the fill), and every colour is a palette
  // token, so the server's card is right in either scheme.
  it.each([0, 1, 2, 3, 4, 5])('fills the tags in the family’s tag colour, the cover in its fill (palette %i)', (index) => {
    const { container } = render(<StoryCard story={story} index={index} />);
    expect(container.querySelector('svg rect[fill]')).toHaveAttribute('fill', `var(--card-fill-${index})`);
    for (const tag of ['tea', 'rest']) {
      const pill = screen.getByText(tag).parentElement as HTMLElement;
      expect(pill.querySelector(':scope > svg path[fill]')).toHaveAttribute('fill', `var(--card-tag-${index})`);
    }
    const light = paletteFor('terracotta', 'light');
    expect(light[`card-tag-${index}` as PaletteToken].L).toBeCloseTo(light[`card-fill-${index}` as PaletteToken].L - 0.05);
    expect(container.innerHTML).not.toMatch(/oklch\(\d/);
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
    // The card's own hover tone (its family's, which the scheme draws).
    expect(disc.style.background).toBe('var(--card-hover-2)');

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

// The landing film floats real cards over its stage: framed at every width, its grain still (the card moves on every
// frame, and WebKit draws a filter again each time), and its last card offering an action in place of a byline.
describe('StoryCard over a moving stage', () => {
  it('stays the framed card on a phone: no band chrome, marked for the CSS that keeps its outline', () => {
    const { container } = render(<StoryCard story={story} framed />);
    const card = container.querySelector('article')!;
    expect(card).toHaveAttribute('data-framed');
    // one chrome only: the hand-drawn card's (its band's grain and wavy rules are never drawn)
    expect(card.querySelectorAll('[data-mascot="card-edge"]')).toHaveLength(1);
    expect(card.querySelector('[data-mascot="card-edge"] path[stroke="var(--card-border-0)"]')).toBeTruthy();
    // the feed's card keeps both, CSS showing one
    const feed = render(<StoryCard story={story} />).container.querySelector('article')!;
    expect(feed).not.toHaveAttribute('data-framed');
    expect(feed.querySelectorAll('[data-mascot="card-edge"]')).toHaveLength(2);
  });

  it('wears a still grain cut to its outline, and no live noise filter anywhere', () => {
    const { container } = render(<StoryCard story={story} framed stillGrain="/grain.png" />);
    const card = container.querySelector('article')!;
    expect(card.querySelector('feTurbulence')).toBeNull();
    expect(card.querySelector('[filter]')).toBeNull();
    const grain = card.querySelector('[data-mascot="card-edge"] > span[aria-hidden]') as HTMLElement;
    const outline = card.querySelector('[data-mascot="card-edge"] path[stroke="var(--card-border-0)"]')!.getAttribute('d');
    expect(grain.style.clipPath).toBe(`path('${outline}')`);
    expect(grain.style.getPropertyValue('--still-grain')).toBe("url('/grain.png')");
    // without it, the card's paper is the live grain it always was
    expect(render(<StoryCard story={story} />).container.querySelector('feTurbulence')).toBeTruthy();
  });

  it('carries its foot in place of the byline', () => {
    render(<StoryCard story={{ ...story, tags: [] }} framed preview foot={<button type="button">Write your story</button>} />);
    expect(screen.getByRole('button', { name: 'Write your story' })).toBeInTheDocument();
    expect(screen.queryByText('friend')).toBeNull();
    expect(screen.queryByText('3 min')).toBeNull();
  });
});
