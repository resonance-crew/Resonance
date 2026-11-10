// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, within } from '@/../test/render';
import type { FilmModel, FilmTile } from './model';

vi.mock('@/i18n/navigation', () => ({
  // (next/link's own `prefetch` is not an anchor's attribute)
  Link: ({ href, children, prefetch: _prefetch, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => '/lab/landing/film',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('@/components/sections/SiteHeader/SiteHeaderAccount', () => ({ SiteHeaderAccountMenu: () => null, SiteHeaderSignedInNav: () => null }));

import Page from './Page';

const tile = (id: string, over: Partial<FilmTile> = {}): FilmTile => ({
  id,
  href: `/card/${id}`,
  title: `Story ${id}`,
  excerpt: `The words of story ${id}`,
  author: { name: `pen ${id}`, initials: 'P' },
  tags: ['sea'],
  minutes: 3,
  family: 1,
  script: 'latin',
  ...over,
});

// the owner (round 3): the nearest real card is the film's answer card, B
const MODEL: FilmModel = {
  a: tile('lets-enjoy-me-time', { cover: 'https://img.resonance.channel/a.webp' }),
  b: tile('kin-card', { cover: 'https://img.resonance.channel/b.webp' }),
  relation: 'kin',
  sky: [tile('second'), tile('anon-id', { author: undefined, anonSeed: '3317' }), tile('third')],
  // the end's list is a list of its own (the owner, round 4): six recommended stories, the film's A among them like any
  picks: [tile('pick-1'), tile('lets-enjoy-me-time'), tile('pick-anon', { author: undefined, anonSeed: '3410' }), tile('pick-4'), tile('pick-5'), tile('pick-6')],
};

describe('the film page', () => {
  it('has one h1, the four scenes as h2s, and the cards as links (hidden ones inert)', () => {
    const { container } = renderWithIntl(<Page model={MODEL} locale="en" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const narration = container.querySelector('ol')!;
    expect(within(narration).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Write', 'Answer', 'Meet', 'Your turn']);
    // the card written in the film is the platform's own story card (the landing page's StoryCard, framed over the
    // stage), the same card where it pops and where the wind carries it
    const story = container.querySelector('[data-slot="story"] a')!;
    expect(story.getAttribute('href')).toBe('/card/lets-enjoy-me-time');
    expect(story.querySelector('article[data-framed]')).toBeTruthy();
    expect(within(story as HTMLElement).getByRole('heading', { name: 'Story lets-enjoy-me-time' })).toBeTruthy();
    const a = container.querySelector('[data-slot="a"]')!;
    expect(a.querySelector('a')?.getAttribute('href')).toBe('/card/lets-enjoy-me-time');
    expect(a.querySelector('article[data-framed]')).toBeTruthy();
    expect(a.hasAttribute('inert')).toBe(true);
    // the answer is the nearest real story, a card like A; 聆聆's drawing stays for the lab's ?b=drawn (never read out)
    const b = container.querySelector('[data-slot="b"]')!;
    expect(b.hasAttribute('inert')).toBe(true);
    expect(b.querySelector('[data-film-card="b"] a')?.getAttribute('href')).toBe('/card/kin-card');
    expect(b.querySelector('[data-film-card="drawn"]')?.getAttribute('aria-hidden')).toBe('true');
    // its cover waits until the director asks for it (a hidden card in the first screen fetches nothing)
    expect(b.querySelector('img')).toBeNull();
    // the night sky's stories are small story cards, an anonymous one linked by its id
    expect(container.querySelector('[data-slot="sky1"] a')?.getAttribute('href')).toBe('/card/anon-id');
    expect(container.querySelector('[data-slot="sky1"] article[data-framed]')).toBeTruthy();
    // the night's card: the story not written yet, its one action to write
    const cta = container.querySelector('[data-slot="cta"]')!;
    expect(within(cta as HTMLElement).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/write']);
    expect(cta.querySelector('article[data-framed]')).toBeTruthy();
  });

  it('keeps the player to ▶ and the progress line (no skip, step or rest buttons), the skip link first', () => {
    const { container } = renderWithIntl(<Page model={MODEL} locale="en" />);
    const lip = container.querySelector('[data-lip]') as HTMLElement;
    // the owner (round 3): only ▶ stays, beside the line a visitor can drag; the book's row keeps 播放動畫. The film
    // starts by itself (round 5): the one button is ❚❚ from the first frame — no button with words, no hint
    expect(within(lip).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Pause', 'Play the film']);
    expect(lip.textContent).not.toMatch(/Watch the film|Scroll down/);
    // the dot is a hand-drawn round (a path), never a CSS circle
    expect(lip.querySelector('[data-progress-dot] svg path')).toBeTruthy();
    const line = within(lip).getByRole('slider', { name: 'Film progress' });
    expect(line.getAttribute('aria-valuetext')).toBe('Scene 1 of 4: Write');
    expect(line.querySelectorAll('[data-tick]')).toHaveLength(4);
    expect(within(lip).queryByRole('link')).toBeNull();
    // no store badges on the first screen: they wait at the page's end
    expect(container.querySelector('[data-hero] a')).toBeNull();
    expect(container.querySelector('#download a[href*="apps.apple.com"]')).toBeTruthy();
    const film = container.querySelector('[data-film-root]')!;
    const firstLink = film.querySelector('a');
    expect(firstLink?.textContent).toBe('Skip the film and go to the stories');
    expect(firstLink?.getAttribute('href')).toBe('#stories');
  });

  it('is the film and nothing else: no picture book, no plates, and an arrow on to the stories for when it is over (round 4)', () => {
    const { container } = renderWithIntl(<Page model={MODEL} locale="zh-TW" />);
    const film = container.querySelector('[data-film-root]') as HTMLElement;
    // the narration is a screen reader's and the hash's: its four lines, no plate, no card, no puppet in it
    const narration = film.querySelector('ol')!;
    expect(narration.querySelectorAll('li')).toHaveLength(4);
    expect(narration.querySelector('figure, svg, img, article')).toBeNull();
    expect(film.querySelector('[data-plate]')).toBeNull();
    // one mode, decided before the first paint: the film (a short landscape window alone shows the opening still)
    const mode = [...film.querySelectorAll('script')].map((sc) => sc.textContent ?? '').find((t) => t.includes('data-film'))!;
    expect(mode).toContain("'(max-height: 500px)'");
    expect(mode).not.toMatch(/prefers-reduced-motion|saveData|deviceMemory|film-optin/);
    // the player has no bar of its own (no edge, no paper), and holds the way on once the film is over: out of reach
    // until then
    const lip = film.querySelector('[data-lip]') as HTMLElement;
    expect(lip.querySelector('svg[viewBox="0 0 1000 8"]')).toBeNull();
    const next = [...lip.querySelectorAll('button')].find((b) => b.textContent?.includes('往下看今晚的故事'))!;
    expect(next).toBeTruthy();
    expect(next.getAttribute('aria-hidden')).toBe('true');
    expect(next.tabIndex).toBe(-1);
    // no hint over the line, no button with words (round 5: the film starts by itself)
    expect(lip.textContent).not.toContain('往下滑');
    expect([...lip.querySelectorAll('[data-play]')].map((el) => el.textContent)).toEqual(['']);
  });

  it('ends as the landing page does: six recommended stories, the closing band, the footer', () => {
    const { container } = renderWithIntl(<Page model={MODEL} locale="zh-TW" />);
    const end = container.querySelector('[data-film-end]') as HTMLElement;
    expect(within(end).getByRole('heading', { level: 2, name: '今晚的故事' })).toBeTruthy();
    expect(within(end).getByText('推薦故事')).toBeTruthy();
    // the skip link's landing
    expect(end.querySelector('#stories')).toContainElement(within(end).getByRole('heading', { level: 2, name: '今晚的故事' }));
    // the owner (round 4): the recommended stories as they come, every one a StoryCard — the film's two have no row of
    // their own (no group, no ≋ between cards), and the night sky's cards are not the list
    const links = [...end.querySelectorAll('a[data-film-card="tile"]')].map((l) => l.getAttribute('href'));
    expect(links).toEqual(['/card/pick-1', '/card/lets-enjoy-me-time', '/card/pick-anon', '/card/pick-4', '/card/pick-5', '/card/pick-6']);
    expect(end.querySelectorAll('a[data-film-card="tile"] article')).toHaveLength(6);
    expect(end.querySelector('[role="group"]')).toBeNull();
    // (the ≋ is PairWave's glyph, in its own box: still over the stage, never in the list)
    expect(container.querySelector('[data-slot="wave"] svg[viewBox="2 4.5 20 15"]')).toBeTruthy();
    expect(end.querySelector('svg[viewBox="2 4.5 20 15"]')).toBeNull();
    expect(end.querySelectorAll('[data-card-grid]')).toHaveLength(1);
    // the list's cards are the feed's (bands on a phone), not framed
    expect(end.querySelector('article[data-framed]')).toBeNull();
    // no lab note under the list, whatever B is to A
    expect(end.textContent).not.toMatch(/實驗原型|Lab prototype/);
    expect(within(end).getByRole('link', { name: '瀏覽所有故事' }).getAttribute('href')).toBe('/home');
    const band = container.querySelector('#download') as HTMLElement;
    expect(within(band).getByRole('heading', { level: 2, name: '換你寫下一個故事' })).toBeTruthy();
    expect(within(band).getByRole('link', { name: '寫下你的故事' }).getAttribute('href')).toBe('/write');
    expect(within(band).getByRole('button', { name: '重看一次' })).toBeTruthy();
    expect(container.querySelector('footer')).toBeTruthy();
  });

  it('answers with 聆聆\'s drawing when there is no B, and with the card when a real resonance answers', () => {
    const alone = renderWithIntl(<Page model={{ ...MODEL, b: null, relation: 'alone' }} locale="en" />).container;
    const b = alone.querySelector('[data-slot="b"]')!;
    expect(b.querySelector('a')).toBeNull();
    expect(b.querySelector('[data-film-card="drawn"]')).toBeTruthy();
    // the end's list is the same six either way, and says nothing of how B stands to A
    expect(alone.querySelectorAll('[data-film-end] a[data-film-card="tile"]')).toHaveLength(6);
    const real = renderWithIntl(<Page model={{ ...MODEL, relation: 'resonance' }} locale="en" />).container;
    expect(real.querySelector('[data-film-end] [role="group"]')).toBeNull();
    expect(real.querySelector('[data-film-end]')?.textContent).not.toMatch(/Lab prototype/);
    expect(real.querySelector('[data-slot="b"] [data-film-card="drawn"]')).toBeNull();
  });
});
