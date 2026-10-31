// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, within } from '../../../../test/render';
import { PaperPalsPage } from './PaperPalsPage';

// The strips' stages load once the browser is idle: never here (lib/mascots/pals has its own tests).
vi.mock('@/components/sections/LandingStage/LandingStage', () => ({
  wantsStage: () => true,
  whenIdle: () => () => {},
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('PaperPalsPage', () => {
  it('opens on its title on a card, the five drawn round it', () => {
    const { container } = renderWithIntl(<PaperPalsPage />);
    const title = screen.getByRole('heading', { level: 1, name: /Paper Pals/ });
    const card = container.querySelector('[data-pals-card]') as HTMLElement;
    expect(card).toContainElement(title);
    // each of the five where its place is: three by the card, two on the floor beside it
    expect([...card.querySelectorAll('[data-still]')].map((e) => e.getAttribute('data-still')).sort()).toEqual(['dot', 'night', 'tuck']);
    const floor = container.querySelector('[data-pals-floor]') as HTMLElement;
    expect([...floor.querySelectorAll('[data-still]')].map((e) => e.getAttribute('data-still')).sort()).toEqual(['card', 'tag']);
    // drawn from the stage's own part images, decoration only
    expect(card.querySelectorAll('img[src^="/mascots/tuck/"]').length).toBeGreaterThan(8);
    expect(card.querySelector('[data-still="tuck"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('ends with the five back together and a sixth on blank paper', () => {
    const { container } = renderWithIntl(<PaperPalsPage />);
    const vision = container.querySelector('[aria-labelledby="pals-vision"]') as HTMLElement;
    expect(vision.querySelectorAll('img[src*="/torso.webp"]')).toHaveLength(5);
    // the blank one: drawn in place, not one of the cast's part images
    const blank = vision.querySelector('svg filter#bk-card');
    expect(blank).not.toBeNull();
  });

  it('introduces each one: its name, its paper, its words, its story, and a strip where it lives', () => {
    const { container } = renderWithIntl(<PaperPalsPage />);
    for (const [slug, name] of [['tuck', 'Tuck'], ['tag', 'Twine'], ['card', 'Nod'], ['dot', 'Pip'], ['night', 'Hush']]) {
      const section = container.querySelector(`section#${slug}`) as HTMLElement;
      expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent(name);
      expect(section.querySelectorAll('p').length).toBeGreaterThanOrEqual(3);
      expect(section.querySelector(`[data-pal="${slug}"] img`)).not.toBeNull();
    }
    expect(within(container.querySelector('section#night') as HTMLElement).getByText(/A corner of a paper theatre/)).toBeInTheDocument();
  });

  it('ends on the meeting, what they stand for, and the way in', () => {
    renderWithIntl(<PaperPalsPage />);
    expect(screen.getByRole('heading', { name: 'Different papers can resonate too' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Everyone is a Paper Pal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Write your story/i })).toBeInTheDocument();
  });
});
