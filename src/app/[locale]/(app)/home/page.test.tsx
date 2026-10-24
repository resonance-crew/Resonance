// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import { ToastProvider } from '@/components/providers/ToastProvider';
import type { Card, User } from '@/lib/db/types';

// The page's data boundary is the SWR hooks. We mock them to drive the page
// through its states (loading / loaded-with-cards / empty, and the latest and
// recommended streams arriving in either order) and assert what the reader
// sees.
const mockUseFeed = vi.fn();
const mockUseRecommendedFeed = vi.fn();
vi.mock('@/lib/data/hooks', () => ({
  useFeed: () => mockUseFeed(),
  useRecommendedFeed: () => mockUseRecommendedFeed(),
}));
// The grid seeds the card page's cache on click (cardPrefill), which reads the viewer.
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));
vi.mock('@/lib/hints', () => ({
  useHint: () => ({ visible: true, dismiss: vi.fn() }),
}));
// next-intl's Link needs routing config we don't stand up here; a plain anchor
// is enough to assert the card links the page builds.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import HomeFeedPage from './page';

/** The page inside the signed-in shell's toast, as AppShell mounts it. */
function WithToasts() {
  return (
    <ToastProvider>
      <HomeFeedPage />
    </ToastProvider>
  );
}

function card(id: string, authorId: string, thoughtCore: string): Card {
  return {
    id,
    authorId,
    thoughtCore,
    story: 'a story body',
    tags: ['tag'],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
  };
}
function user(id: string): User {
  return {
    id,
    handle: `@${id}`,
    region: 'TW',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: false,
    phoneHash: '',
    avatarSeed: '1',
    initials: 'AA',
    accentColor: 'var(--accent)',
    joinedAt: new Date('2025-01-01'),
    handleChangedAt: new Date('2025-01-01'),
  };
}

// The personalized feed is incidental to these tests; default it to "no
// recommendations" so the page renders only the latest feed. (clearAllMocks
// keeps implementations, so this default survives across tests.)
mockUseRecommendedFeed.mockReturnValue({ data: undefined });

afterEach(() => vi.clearAllMocks());

describe('HomeFeedPage', () => {
  it('renders the fetched feed cards as links into their detail pages', () => {
    mockUseFeed.mockReturnValue({
      data: {
        cards: [card('c1', 'a1', 'A first resonant thought'), card('c2', 'a1', 'A second one')],
        authors: { a1: user('a1') },
      },
      isLoading: false,
    });

    renderWithIntl(<HomeFeedPage />);

    // Card titles (thoughtCore) render, and each is wrapped in a /card/:id link.
    expect(screen.getAllByText('A first resonant thought').length).toBeGreaterThan(0);
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/card/'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/card/c1', '/card/c2'])
    );
  });

  it('shows the empty-state CTA when the feed loaded with no cards', () => {
    mockUseFeed.mockReturnValue({ data: { cards: [], authors: {} }, isLoading: false });
    renderWithIntl(<HomeFeedPage />);
    expect(screen.getByText('Write your first card')).toBeInTheDocument();
  });

  it('shows skeletons (not the empty state) while the feed is loading', () => {
    mockUseFeed.mockReturnValue({ data: undefined, isLoading: true });
    renderWithIntl(<HomeFeedPage />);
    expect(screen.queryByText('Write your first card')).not.toBeInTheDocument();
  });

  it('offers "load more" only while the feed has more pages', async () => {
    const loadMore = vi.fn();
    mockUseFeed.mockReturnValue({
      data: { cards: [card('c1', 'a1', 'A thought')], authors: { a1: user('a1') } },
      isLoading: false,
      hasMore: true,
      loadMore,
    });

    const { unmount } = renderWithIntl(<HomeFeedPage />);
    const btn = screen.getByRole('button', { name: 'Load more' });
    // Its words alone under the list, not a form's pill: no OrganicButton face.
    expect(btn).not.toHaveAttribute('data-variant');
    await userEvent.setup().click(btn);
    expect(loadMore).toHaveBeenCalled();
    unmount();

    // Exhausted feed: the button disappears, and nothing else asks to write (the header's pen does).
    mockUseFeed.mockReturnValue({
      data: { cards: [card('c1', 'a1', 'A thought')], authors: { a1: user('a1') } },
      isLoading: false,
      hasMore: false,
      loadMore,
    });
    renderWithIntl(<HomeFeedPage />);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(screen.queryByText('Write a card')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /write/i })).not.toBeInTheDocument();
  });

  it('says the next page is on its way and takes no second click while it loads', async () => {
    const loadMore = vi.fn();
    mockUseFeed.mockReturnValue({
      data: { cards: [card('c1', 'a1', 'A thought')], authors: { a1: user('a1') } },
      isLoading: false,
      isLoadingMore: true,
      hasMore: true,
      loadMore,
    });

    renderWithIntl(<HomeFeedPage />);
    const btn = screen.getByRole('button', { name: 'Load more' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    await userEvent.setup().click(btn);
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('has no page title over the feed, and ends with the quiet end mark only once nothing more can load', () => {
    mockUseFeed.mockReturnValue({
      data: { cards: [card('c1', 'a1', 'A thought')], authors: { a1: user('a1') } },
      isLoading: false,
      hasMore: true,
      loadMore: vi.fn(),
    });
    const { unmount } = renderWithIntl(<HomeFeedPage />);
    expect(screen.queryByText('Stories picked for you')).not.toBeInTheDocument();
    // While more can load: the button alone, no sentence.
    expect(screen.queryByText("That's all for now")).not.toBeInTheDocument();
    expect(screen.queryByText('You are caught up on the latest public cards')).not.toBeInTheDocument();
    unmount();

    mockUseFeed.mockReturnValue({
      data: { cards: [card('c1', 'a1', 'A thought')], authors: { a1: user('a1') } },
      isLoading: false,
      hasMore: false,
      loadMore: vi.fn(),
    });
    renderWithIntl(<HomeFeedPage />);
    const end = screen.getByText("That's all for now");
    // One quiet line, not a heading.
    expect(end.tagName).toBe('P');
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).not.toContain("That's all for now");
  });

  it('renders recommended cards without surfacing their match reasons', () => {
    mockUseFeed.mockReturnValue({ data: { cards: [], authors: {} }, isLoading: false });
    mockUseRecommendedFeed.mockReturnValue({
      data: {
        cards: [card('r1', 'a2', 'A resonant match')],
        authors: { a2: user('a2') },
        reasons: { r1: 'you both wrote about letting go' },
      },
    });

    renderWithIntl(<HomeFeedPage />);

    // The pick itself shows…
    expect(screen.getAllByText('A resonant match').length).toBeGreaterThan(0);
    // …but neither the hint line nor the per-card reason caption does — the
    // reason is deliberately hidden to keep the surprise of opening the card.
    expect(
      screen.queryByText('The insights you write decide which stories find you'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('because of “you both wrote about letting go”'),
    ).not.toBeInTheDocument();
  });
});

// Today's picks come from a server call that can take a while; the latest
// public cards come straight from Firestore. Whichever reaches the reader
// first shows first; picks that come after the latest cards go on top of them
// at once (no pill to ask for them), without moving what a reader who has
// scrolled into the feed is looking at — and nothing is ever swapped back for
// the skeleton.
describe('HomeFeedPage — latest first, picks when they come', () => {
  const latest = {
    data: {
      cards: [card('l1', 'a1', 'Latest one'), card('l2', 'a1', 'Latest two')],
      authors: { a1: user('a1') },
    },
    isLoading: false,
    hasMore: false,
    loadMore: vi.fn(),
  };
  const picks = {
    data: {
      cards: [card('r1', 'a2', 'A pick for you')],
      authors: { a2: user('a2') },
      reasons: { r1: 'why' },
    },
    isLoading: false,
  };
  /** The card links on screen, in reading order. */
  const shown = () =>
    screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((h) => h?.startsWith('/card/'));

  it('shows the latest cards while the picks are still on their way', () => {
    mockUseFeed.mockReturnValue(latest);
    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: true });
    renderWithIntl(<HomeFeedPage />);
    expect(screen.getAllByText('Latest one').length).toBeGreaterThan(0);
    expect(shown()).toEqual(['/card/l1', '/card/l2']);
  });

  it('puts the picks on top of the latest cards the moment they arrive, with no pill to ask for them', () => {
    mockUseFeed.mockReturnValue(latest);
    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = renderWithIntl(<HomeFeedPage />);
    expect(shown()).toEqual(['/card/l1', '/card/l2']);

    mockUseRecommendedFeed.mockReturnValue(picks);
    rerender(<HomeFeedPage />);
    expect(shown()).toEqual(['/card/r1', '/card/l1', '/card/l2']);
    expect(screen.queryByRole('button', { name: "Today's picks are ready" })).not.toBeInTheDocument();
  });

  it('says nothing more when the picks come in at the top, where the reader sees them', () => {
    mockUseFeed.mockReturnValue(latest);
    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = renderWithIntl(<WithToasts />);
    mockUseRecommendedFeed.mockReturnValue(picks);
    rerender(<WithToasts />);
    expect(shown()).toEqual(['/card/r1', '/card/l1', '/card/l2']);
    expect(screen.queryByRole('button', { name: /Today's picks are in/ })).toBeNull();
  });

  // Scrolled into the feed, the reader keeps the card they are looking at where it stood: the picks go in above.
  it('keeps the card a scrolled reader is looking at where it stood as the picks go in above it', () => {
    mockUseFeed.mockReturnValue(latest);
    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = renderWithIntl(<HomeFeedPage />);

    // The reader is down the page, l1 under the bar; the pick, once above it, pushes it 600px down.
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { value: 900, configurable: true });
    const box = (top: number) => ({ top, bottom: top + 500, left: 0, right: 0, width: 0, height: 500, x: 0, y: top, toJSON: () => ({}) });
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const pushed = document.querySelector('[data-card-id="r1"]') ? 600 : 0;
      const tops: Record<string, number> = { r1: -480, l1: 120 + pushed, l2: 640 + pushed };
      return box(tops[this.dataset.cardId ?? ''] ?? 0) as DOMRect;
    });
    try {
      mockUseRecommendedFeed.mockReturnValue(picks);
      rerender(<HomeFeedPage />);
      expect(shown()).toEqual(['/card/r1', '/card/l1', '/card/l2']);
      expect(scrollBy).toHaveBeenCalledWith(0, 600);
    } finally {
      rect.mockRestore();
      scrollBy.mockRestore();
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    }
  });

  // The picks went in out of sight: the shell's toast says they came, and takes the reader up to them.
  describe('when the picks come in above a scrolled reader', () => {
    async function picksAboveTheReader() {
      mockUseFeed.mockReturnValue(latest);
      mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: true });
      const view = renderWithIntl(<WithToasts />);
      vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
      Object.defineProperty(window, 'scrollY', { value: 900, configurable: true });
      // l1 under the bar, the reader's card.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
        () => ({ top: 120, bottom: 620, left: 0, right: 0, width: 0, height: 500, x: 0, y: 120, toJSON: () => ({}) }) as DOMRect,
      );
      mockUseRecommendedFeed.mockReturnValue(picks);
      view.rerender(<WithToasts />);
      return screen.findByRole('button', { name: "Today's picks are in · See them" });
    }
    afterEach(() => {
      vi.restoreAllMocks();
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    });

    it('says so in the toast, whose tap scrolls up to them', async () => {
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      const toast = await picksAboveTheReader();
      expect(toast).toHaveTextContent("Today's picks are in");
      await userEvent.click(toast);
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
      await waitFor(() => expect(screen.queryByRole('button', { name: "Today's picks are in · See them" })).toBeNull());
    });

    it('takes the toast down when the reader scrolls up to the picks themselves', async () => {
      await picksAboveTheReader();
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      act(() => {
        fireEvent.scroll(window);
      });
      await waitFor(() => expect(screen.queryByRole('button', { name: "Today's picks are in · See them" })).toBeNull());
    });
  });

  it('never falls back to the skeleton once cards are showing', () => {
    // A signed-in reader: the picks' request only starts once auth has
    // restored, after the public latest cards are already up.
    mockUseFeed.mockReturnValue(latest);
    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: false });
    const { rerender } = renderWithIntl(<HomeFeedPage />);
    expect(shown()).toEqual(['/card/l1', '/card/l2']);

    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: true });
    rerender(<HomeFeedPage />);
    expect(shown()).toEqual(['/card/l1', '/card/l2']);
  });

  it('leads with the picks when they are ready before the latest cards', async () => {
    mockUseFeed.mockReturnValue({ data: undefined, isLoading: true, hasMore: false, loadMore: vi.fn() });
    mockUseRecommendedFeed.mockReturnValue(picks);
    const { rerender } = renderWithIntl(<HomeFeedPage />);
    expect(shown()).toEqual(['/card/r1']);

    // Latest cards arriving later wait behind「載入更多」, as they always have.
    mockUseFeed.mockReturnValue(latest);
    rerender(<HomeFeedPage />);
    expect(shown()).toEqual(['/card/r1']);
    expect(screen.queryByRole('button', { name: "Today's picks are ready" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load more' }));
    expect(shown()).toEqual(['/card/r1', '/card/l1', '/card/l2']);
  });

  it('waits for the picks before calling an empty latest feed empty', () => {
    mockUseFeed.mockReturnValue({ data: { cards: [], authors: {} }, isLoading: false });
    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = renderWithIntl(<HomeFeedPage />);
    expect(screen.queryByText('Write your first card')).not.toBeInTheDocument();

    mockUseRecommendedFeed.mockReturnValue({ data: { cards: [], authors: {}, reasons: {} }, isLoading: false });
    rerender(<HomeFeedPage />);
    expect(screen.getByText('Write your first card')).toBeInTheDocument();
  });
});
