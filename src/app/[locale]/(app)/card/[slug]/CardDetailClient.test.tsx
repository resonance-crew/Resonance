// @vitest-environment jsdom
import type * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { SWRConfig } from 'swr';
import enMessages from '@/messages/en.json';
import { renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import type { CardSeed } from '@/lib/data/cardSeed';
import type { Card, User } from '@/lib/db/types';

// The card page in the browser, on the real data hooks: the client read layer
// (Firestore through the rules), the viewer's blocks and auth are the module
// boundary. Covers how it takes over from the server's HTML (CardSeed).
const mockUseAuth = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getCardById: vi.fn(),
  getCardBySlugOrId: vi.fn(),
  getPublicCardView: vi.fn(),
  resolveCardId: vi.fn(),
  getUserById: vi.fn(),
  getUsersByIds: vi.fn(async () => ({})),
  getRelatedCards: vi.fn(async () => []),
  getResonanceCards: vi.fn(async () => []),
  isConnected: vi.fn(async () => false),
}));
vi.mock('@/lib/db/firestore/client/blocks', () => ({
  getMyBlockedIds: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));
// Signed in, the page's lists come from /api/v1 (callApi sends the ID token).
vi.mock('@/lib/db/firestore/client/api', () => ({
  callApi: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
// The trash's own writes (the banner's 還原 / 永久刪除) go through the server; here they are the boundary.
const mockDeleteForever = vi.fn(async (..._a: unknown[]) => {});
vi.mock('@/lib/db/firestore/client/cards', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/firestore/client/cards')>()),
  deleteCardForever: (...a: unknown[]) => mockDeleteForever(...a),
}));
// Leaf components with reads of their own (bookmarks, notes) aren't the subject.
vi.mock('@/components/molecules/CardDetail/ReadAfterArea', () => ({
  // It draws what the page hands it to end its row (the card's share and ⋯).
  ReadAfterArea: ({ trailing }: { trailing?: React.ReactNode }) => <div data-testid="read-after-area">{trailing}</div>,
}));

import {
  getCardById,
  getCardBySlugOrId,
  getPublicCardView,
  getRelatedCards,
  getResonanceCards,
  getUserById,
  getUsersByIds,
  resolveCardId,
} from '@/lib/db/firestore/client/reads';
import { getMyBlockedIds } from '@/lib/db/firestore/client/blocks';
import { ApiError, callApi } from '@/lib/db/firestore/client/api';
import type { CardDetailBody, FeedCardBody } from '@/lib/api/v1/schemas';
import { CardDetailClient, storyGate } from './CardDetailClient';
import { SESSION_MARK_STORAGE_KEY } from './cardHold';
import { SESSION_MARK_KEY } from '@/lib/auth/firebase/client';

const STORY = 'The kettle ticks while the street is still blue.';

function card(id: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    authorId: 'a1',
    slug: 'a-quiet-morning',
    thoughtCore: 'The core thought of this card',
    story: 'The longer story body of this card.',
    tags: ['grief', 'growth'],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 1,
    resonanceCount: 2,
    inviteCount: 0,
    ...extra,
  };
}
function author(): User {
  return {
    id: 'a1',
    handle: '@author',
    region: 'Taipei',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: true,
    phoneHash: '',
    avatarSeed: '7',
    initials: 'AU',
    accentColor: 'var(--accent)',
    joinedAt: new Date('2025-01-01'),
    handleChangedAt: new Date('2025-01-01'),
  };
}

/** What the server render hands over for a public card (see CardSeed). */
function seed(extra: { anonymous?: boolean; id?: string } = {}): CardSeed {
  const anonymous = extra.anonymous === true;
  return {
    id: extra.id ?? 'pub1',
    view: {
      card: {
        id: extra.id ?? 'pub1',
        authorId: anonymous ? '' : 'a1',
        slug: 'a-quiet-morning',
        thoughtCore: 'A quiet morning',
        story: STORY,
        tags: ['dawn'],
        media: null,
        originalLocale: 'en',
        referenceCardId: null,
        publishedAt: '2026-03-01T23:30:00.000Z',
        resonanceCount: 0,
        accentHue: 55,
        anonymous,
      },
      author: anonymous
        ? null
        : {
            id: 'a1',
            handle: '@author',
            bio: null,
            region: 'Taipei',
            verified: true,
            avatarSeed: '7',
            avatarUrl: null,
            initials: 'AU',
            accentColor: 'var(--accent)',
          },
    },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function Providers({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
}

function renderPage(props: { slug?: string; seed?: CardSeed | null } = {}) {
  return renderWithIntl(
    <Providers>
      <CardDetailClient slug={props.slug ?? 'a-quiet-morning'} seed={props.seed ?? null} />
    </Providers>,
  );
}

/** The story is on screen: in the document, and not inside a held (hidden) container. */
function storyVisible(text = STORY): boolean {
  const el = screen.queryByText(text);
  if (!el) return false;
  const held = el.closest('[data-card-hold]') as HTMLElement | null;
  return !held || held.style.visibility !== 'hidden';
}

const signIn = () => window.localStorage.setItem(SESSION_MARK_KEY, JSON.stringify({ uid: 'me', expiresAt: Date.now() + 86_400_000 }));

beforeEach(() => {
  window.localStorage.clear();
  mockUseAuth.mockReturnValue({ user: null, loading: false });
  vi.mocked(getMyBlockedIds).mockResolvedValue(new Set());
  vi.mocked(getUserById).mockResolvedValue(author());
});
afterEach(() => vi.clearAllMocks());

describe('CardDetailClient (no server content)', () => {
  it('renders the fetched card body, author, and tags once loaded', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1'));
    renderPage({ slug: 'c1' });

    expect(await screen.findByText('The core thought of this card')).toBeInTheDocument();
    expect(screen.getByText('The longer story body of this card.')).toBeInTheDocument();
    // Author appears in both the mobile header and the desktop aside (responsive
    // markup; CSS hides one). At least one should be present.
    expect(screen.getAllByText('@author').length).toBeGreaterThan(0);
    expect(screen.getByText('grief')).toBeInTheDocument();
    expect(getCardBySlugOrId).toHaveBeenCalledWith('c1');
    // The marks the paper puppets find the story by (lib/mascots/reading/measure).
    const title = screen.getByRole('heading', { level: 1, name: 'The core thought of this card' });
    expect(title).toHaveAttribute('data-mascot', 'story-title');
    expect(title.closest('[data-mascot-zone="card"]')?.querySelector('[data-mascot="story"]')).toHaveTextContent('The longer story body');
  });

  it('shows the not-found message when the card is missing or not visible', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(null);
    renderPage({ slug: 'c1' });
    expect(await screen.findByText("This card can't be found")).toBeInTheDocument();
    expect(screen.queryByText('The core thought of this card')).not.toBeInTheDocument();
    // The way home is a button, filled as every button is: the tonal pill.
    const home = screen.getByRole('button', { name: 'Back to home' });
    expect(home).toHaveAttribute('data-variant', 'tonal');
    await userEvent.click(home);
    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  // A read that failed offline used to come back as null — "this card can't be
  // found", kept by SWR. Now it is an error: the page says so and reads again.
  it('says a failed read failed, not that the card is missing, and reads it again on request', async () => {
    vi.mocked(getCardBySlugOrId).mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1'));
    const user = userEvent.setup();
    renderPage({ slug: 'c1' });

    expect(await screen.findByText("Couldn't load this — please try again")).toBeInTheDocument();
    expect(screen.queryByText("This card can't be found")).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('The core thought of this card')).toBeInTheDocument();
  });

  it('shows a skeleton (neither article nor not-found) while loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderPage({ slug: 'c1' });
    expect(screen.queryByText("This card can't be found")).not.toBeInTheDocument();
    expect(screen.queryByText('The core thought of this card')).not.toBeInTheDocument();
  });
});

describe('taking over from the server render', () => {
  it("shows a signed-out reader the server's story at once, and reads the card by its id — no slug lookup", async () => {
    vi.mocked(getCardById).mockReturnValue(new Promise(() => {}));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderPage({ seed: seed() });

    expect(storyVisible()).toBe(true);
    await waitFor(() => expect(getCardById).toHaveBeenCalledWith('pub1'));
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
    expect(resolveCardId).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("replaces the server's content with the browser's own read: an edit shows, a card gone private is not found", async () => {
    vi.mocked(getCardById).mockResolvedValue(card('pub1', { story: 'Edited after the page was cached.' }));
    const edited = renderPage({ seed: seed() });
    expect(await screen.findByText('Edited after the page was cached.')).toBeInTheDocument();
    expect(screen.queryByText(STORY)).not.toBeInTheDocument();
    edited.unmount();
    vi.mocked(getCardById).mockClear();

    // Private now (the rules refuse the read), and the slug still names it.
    vi.mocked(getCardById).mockResolvedValue(null);
    vi.mocked(resolveCardId).mockResolvedValue('pub1');
    renderPage({ seed: seed() });
    expect(await screen.findByText("This card can't be found")).toBeInTheDocument();
    expect(screen.queryByText(STORY)).not.toBeInTheDocument();
    // The same id again is not read twice.
    expect(getCardById).toHaveBeenCalledTimes(1);
  });

  it('follows a slug that went to another card since the render', async () => {
    vi.mocked(getCardById).mockImplementation(async (id) =>
      id === 'newer' ? card('newer', { thoughtCore: 'The card that has this slug now' }) : null,
    );
    vi.mocked(resolveCardId).mockResolvedValue('newer');
    renderPage({ seed: seed() });
    expect(await screen.findByText('The card that has this slug now')).toBeInTheDocument();
    expect(resolveCardId).toHaveBeenCalledWith('a-quiet-morning');
  });

  it('never shows a signed-in reader the story of an author they blocked, not even while their blocks load', async () => {
    signIn();
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: true });
    vi.mocked(getCardById).mockResolvedValue(card('pub1', { story: STORY }));
    const blocks = deferred<Set<string>>();
    vi.mocked(getMyBlockedIds).mockReturnValue(blocks.promise);

    const view = renderPage({ seed: seed() });
    // Auth still restoring: held.
    expect(screen.getByText(STORY)).toBeInTheDocument();
    expect(storyVisible()).toBe(false);

    // Signed in, block list on its way: still held.
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Providers>
          <CardDetailClient slug="a-quiet-morning" seed={seed()} />
        </Providers>
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(getMyBlockedIds).toHaveBeenCalled());
    expect(storyVisible()).toBe(false);

    await act(async () => blocks.resolve(new Set(['a1'])));
    expect(await screen.findByText("This card can't be found")).toBeInTheDocument();
    expect(screen.queryByText(STORY)).not.toBeInTheDocument();
  });

  it('shows a signed-in reader the story once their block list is known and clear of the author', async () => {
    signIn();
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    vi.mocked(getCardById).mockReturnValue(new Promise(() => {}));
    const blocks = deferred<Set<string>>();
    vi.mocked(getMyBlockedIds).mockReturnValue(blocks.promise);

    renderPage({ seed: seed() });
    expect(storyVisible()).toBe(false);
    expect(screen.getByText(STORY).closest('[data-card-hold]')).toHaveAttribute('aria-busy', 'true');
    await act(async () => blocks.resolve(new Set(['someone-else'])));
    await waitFor(() => expect(storyVisible()).toBe(true));
  });

  // Someone else's anonymous card: the rules refuse the browser's own read (its
  // document names its author), so the page asks the server, which answers it
  // without its author and applies the reader's blocks to it.
  describe("someone else's anonymous card", () => {
    /** The rules refuse the read; the server answers GET /api/v1/cards/{slug} with `answer`. */
    function serverAnswers(answer: Promise<CardDetailBody | null>) {
      vi.mocked(getCardById).mockResolvedValue(null);
      vi.mocked(resolveCardId).mockResolvedValue('pub1');
      vi.mocked(callApi).mockImplementation((async (path: string) => {
        if (path === '/api/v1/cards/a-quiet-morning') {
          const body = await answer;
          if (!body) throw new ApiError(404, 'not_found', 'No such card.');
          return body;
        }
        return detail({ card: summary('pub1', 'A quiet morning', { anonymous: true, author: null }), anonymous: true });
      }) as never);
    }

    it("is held until the server answers — and is not found when it is by someone the reader blocked", async () => {
      signIn();
      mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
      const answer = deferred<CardDetailBody | null>();
      serverAnswers(answer.promise);

      renderPage({ seed: seed({ anonymous: true }) });
      await waitFor(() => expect(callApi).toHaveBeenCalledWith('/api/v1/cards/a-quiet-morning'));
      expect(storyVisible()).toBe(false);

      // The server knows the author, and that this reader blocked them.
      await act(async () => answer.resolve(null));
      expect(await screen.findByText("This card can't be found")).toBeInTheDocument();
      // The author was never named to the browser, nor their profile fetched.
      expect(getUserById).not.toHaveBeenCalled();
    });

    it('shows its story under the anonymous byline once the server answered, and can be reported — not its author blocked', async () => {
      signIn();
      mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
      serverAnswers(
        Promise.resolve(
          detail({ card: summary('pub1', 'A quiet morning', { anonymous: true, author: null }), anonymous: true, story: STORY }),
        ),
      );

      renderPage({ seed: seed({ anonymous: true }) });
      await waitFor(() => expect(storyVisible()).toBe(true));
      expect(getUserById).not.toHaveBeenCalled();

      // The ⋯ is named by what it holds: with no author to block, the report alone.
      // The byline's ⋯ (a short story has no second one at its end).
      expect(screen.getAllByRole('button', { name: 'Report this card' })).toHaveLength(1);
      await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getAllByRole('button', { name: 'Report this card' })[0]);
      expect(screen.getByRole('menuitem', { name: /Report this card/ })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /Block/ })).not.toBeInTheDocument();
    });

    it('signed out: takes the public card from the server (the page seed), story and all', async () => {
      vi.mocked(getCardById).mockResolvedValue(null);
      vi.mocked(resolveCardId).mockResolvedValue('pub1');
      const anon = seed({ anonymous: true });
      vi.mocked(getPublicCardView).mockResolvedValue({
        ...anon,
        view: { ...anon.view!, card: { ...anon.view!.card, story: 'Read again, from the server.' } },
      });
      renderPage({ seed: anon });
      expect(await screen.findByText('Read again, from the server.')).toBeInTheDocument();
      expect(getPublicCardView).toHaveBeenCalledWith('a-quiet-morning');
      expect(callApi).not.toHaveBeenCalled();
    });
  });

  it('shows the story when this browser remembers a sign-in the SDK no longer has', async () => {
    signIn();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.mocked(getCardById).mockReturnValue(new Promise(() => {}));
    renderPage({ seed: seed() });
    await waitFor(() => expect(storyVisible()).toBe(true));
  });

  it('hydrates the server HTML without a mismatch, then lets a signed-out reader keep reading', async () => {
    // The server render: auth unknown, no browser.
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    vi.mocked(getCardById).mockReturnValue(new Promise(() => {}));
    const ui = (
      <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
        <Providers>
          <CardDetailClient slug="a-quiet-morning" seed={seed()} />
        </Providers>
      </NextIntlClientProvider>
    );
    // Rendered on a server in UTC, hydrated by a reader in Taipei — where the
    // card was published on another day (23:30 UTC).
    const tz = process.env.TZ;
    process.env.TZ = 'UTC';
    const container = document.createElement('div');
    container.innerHTML = renderToString(ui);
    document.body.appendChild(container);
    process.env.TZ = 'Asia/Taipei';
    expect(container.textContent).toContain(STORY);
    expect(container.querySelector('[data-card-hold]')).not.toBeNull();

    const recoverable = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, ui, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/hydrat/i);
    consoleError.mockRestore();

    // After hydration, a signed-out browser releases the hold at once, and the
    // date turns to the reader's own.
    expect(container.querySelector('[data-card-hold]')).toBeNull();
    expect(container.textContent).toContain(STORY);
    expect(container.textContent).toContain('Mar 2');
    act(() => root.unmount());
    container.remove();
    process.env.TZ = tz;
  });
});

/** A v1 card summary, as the server answers lists. */
function summary(id: string, title: string, extra: Partial<FeedCardBody> = {}): FeedCardBody {
  return {
    id,
    slug: id,
    title,
    excerpt: `${title}, briefly`,
    tags: [],
    publishedAt: '2026-02-01T00:00:00.000Z',
    author: { id: `by-${id}`, handle: `writer-${id}`, initials: 'W', accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: null },
    anonymous: false,
    visibility: 'public',
    imageUrl: null,
    imageLabel: null,
    accentHue: null,
    readMinutes: 4,
    referenceCardId: null,
    reason: null,
    ...extra,
  };
}

/** What GET /api/v1/cards/{id}?include=… answers this viewer. */
function detail(extra: Partial<CardDetailBody> = {}): CardDetailBody {
  return {
    card: summary('pub1', 'A quiet morning'),
    story: STORY,
    visibility: 'public',
    anonymous: false,
    resonanceCount: 1,
    coreInsight: null,
    isOwner: false,
    referenceCard: summary('origin', 'The card it answers'),
    resonances: { cards: [summary('reply', 'A reply to it')] },
    related: { cards: [summary('near', 'A card nearby')] },
    links: { cards: [] },
    embeds: { cards: [summary('walk', 'The walk it embeds'), summary('letter', 'An unsigned letter', { anonymous: true, author: null })] },
    ...extra,
  };
}

const EMBEDDING_STORY = `${STORY}\n\n[Walk](/card/walk)\n\n[Letter](/card/letter)\n\n[Gone](/card/gone)`;

describe('the lists around the card and its embedded cards', () => {
  function signedIn(viewer = 'me') {
    signIn();
    mockUseAuth.mockReturnValue({ user: { id: viewer }, loading: false });
  }
  const seedWith = (story: string): CardSeed => {
    const s = seed();
    return { ...s, view: { ...s.view!, card: { ...s.view!.card, story } } };
  };

  it('signed in: come in one request, keyed by the id the server found, beside the read of the card itself', async () => {
    signedIn();
    vi.mocked(getCardById).mockReturnValue(new Promise(() => {}));
    vi.mocked(callApi).mockResolvedValue(detail());

    renderPage({ seed: seedWith(EMBEDDING_STORY) });

    // The resonance section: the card it answers, then the replies; then the related cards.
    expect(await screen.findByText('Cards resonating with this')).toBeInTheDocument();
    expect(screen.getAllByText('The card it answers').length).toBeGreaterThan(0);
    expect(screen.getAllByText('A reply to it').length).toBeGreaterThan(0);
    expect(screen.getByText('Extended cards')).toBeInTheDocument();
    expect(screen.getAllByText('A card nearby').length).toBeGreaterThan(0);
    // A related card keeps its whole story's read time, though only its excerpt came.
    expect(screen.getAllByText('4 min').length).toBeGreaterThan(0);

    // The embedded cards come with it: no read of their own.
    expect(screen.getByText('The walk it embeds')).toBeInTheDocument();
    expect(screen.getByText('writer-walk')).toBeInTheDocument();
    expect(screen.getByText('An unsigned letter')).toBeInTheDocument();
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
    // One the viewer can't read (or that is gone) stays a plain link.
    expect(screen.getByRole('link', { name: 'Gone' })).toHaveAttribute('href', '/card/gone');

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/api/v1/cards/pub1?include=resonances,related,links,embeds');
    // While the browser's own read of the card is still out (it never comes back here).
    expect(getCardById).toHaveBeenCalled();
    expect(getRelatedCards).not.toHaveBeenCalled();
    expect(getResonanceCards).not.toHaveBeenCalled();
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
    expect(getUsersByIds).not.toHaveBeenCalled();
  });

  it("shows its author the cards linking to it, from the same answer", async () => {
    signedIn('a1');
    vi.mocked(getCardById).mockResolvedValue(card('pub1', { story: STORY }));
    vi.mocked(callApi).mockResolvedValue(detail({ isOwner: true, links: { cards: [summary('link', 'A card linking here')] } }));

    renderPage({ seed: seed() });
    expect(await screen.findByText('Cards linked to this')).toBeInTheDocument();
    expect(screen.getAllByText('A card linking here').length).toBeGreaterThan(0);
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('lets each embed read its own card when the request fails', async () => {
    signedIn();
    vi.mocked(getCardById).mockReturnValue(new Promise(() => {}));
    vi.mocked(callApi).mockRejectedValue(new Error('offline'));
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('walk', { thoughtCore: 'The walk, read by itself' }));

    renderPage({ seed: seedWith(`${STORY}\n\n[Walk](/card/walk)`) });
    expect(await screen.findByText('The walk, read by itself')).toBeInTheDocument();
    expect(getCardBySlugOrId).toHaveBeenCalledWith('walk');
  });

  it('signed out: read the public lists through the rules, each embed its own card — and never ask the API', async () => {
    vi.mocked(getCardById).mockResolvedValue(card('pub1', { story: `${STORY}\n\n[Walk](/card/walk)` }));
    vi.mocked(getResonanceCards).mockResolvedValue([card('reply', { authorId: 'a2', thoughtCore: 'A public reply' })]);
    vi.mocked(getRelatedCards).mockResolvedValue([card('near', { authorId: 'a2', thoughtCore: 'A public neighbour' })]);
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('walk', { thoughtCore: 'The walk, read by itself' }));

    renderPage({ seed: seedWith(`${STORY}\n\n[Walk](/card/walk)`) });
    expect((await screen.findAllByText('A public reply')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('A public neighbour')).length).toBeGreaterThan(0);
    expect(await screen.findByText('The walk, read by itself')).toBeInTheDocument();
    expect(getResonanceCards).toHaveBeenCalledWith('pub1');
    expect(callApi).not.toHaveBeenCalled();
  });
});

describe("the owner's card in the trash", () => {
  const DAY = 86_400_000;
  const inTrash = (extra: Partial<Card> = {}) =>
    card('pub1', {
      authorId: 'a1',
      visibility: 'private',
      trashedAt: new Date(Date.now() - 2 * DAY),
      trashedFrom: { visibility: 'public', referenceCardId: null },
      ...extra,
    });
  const owner = () => {
    signIn();
    mockUseAuth.mockReturnValue({ user: { id: 'a1' }, loading: false });
  };

  it('heads the article with its banner, and shows nothing around the card — no ⋯, no lists', async () => {
    owner();
    vi.mocked(getCardBySlugOrId).mockResolvedValue(inTrash());
    // Lists from before it went in (a stale cache): never drawn while it is in the trash.
    vi.mocked(callApi).mockResolvedValue(detail({ isOwner: true }));
    renderPage({ slug: 'pub1' });

    const banner = await screen.findByText('This card is in the trash');
    expect(screen.getByText('Deleted forever in 28 days · Only you can see it')).toBeInTheDocument();
    // The article's first block, at every width.
    const article = banner.closest('article')!;
    expect(article.firstElementChild!.contains(banner)).toBe(true);
    expect(screen.getByText('The core thought of this card')).toBeInTheDocument();
    expect(screen.getByText('The longer story body of this card.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage card' })).toBeNull();
    expect(screen.queryByText('Cards resonating with this')).toBeNull();
    expect(screen.queryByText('Extended cards')).toBeNull();
    // One segmented shape: the verb's solid face, then the danger's tonal one.
    expect(screen.getByRole('button', { name: 'Restore' })).toHaveAttribute('data-face', 'solid');
    expect(screen.getByRole('button', { name: 'Delete forever' })).toHaveAttribute('data-face', 'dangerTonal');
    // Its story's notes are a named card's: no word of them.
    expect(screen.queryByText('The notes left on this anonymous card have been deleted')).toBeNull();
  });

  it('says an anonymous card went in without its notes', async () => {
    owner();
    vi.mocked(getCardBySlugOrId).mockResolvedValue(inTrash({ anonymous: true }));
    vi.mocked(callApi).mockResolvedValue(detail({ isOwner: true, resonances: { cards: [] }, related: { cards: [] } }));
    renderPage({ slug: 'pub1' });
    expect(await screen.findByText('The notes left on this anonymous card have been deleted')).toBeInTheDocument();
  });

  it('deletes it for good from the banner, asked first in red, then goes back to the card box', async () => {
    owner();
    vi.mocked(getCardBySlugOrId).mockResolvedValue(inTrash());
    vi.mocked(callApi).mockImplementation((async (path: string) => (path.includes('include=') ? detail({ isOwner: true }) : null)) as never);
    renderPage({ slug: 'pub1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Delete forever' }));
    expect(screen.getByText('Delete this card forever?')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    const verb = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Delete forever')!;
    expect(verb).toHaveAttribute('data-variant', 'danger');
    await userEvent.click(verb);
    await waitFor(() => expect(mockDeleteForever).toHaveBeenCalledWith('pub1', { onlyIfTrashed: true }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/me'));
  });

  it("is a missing card to everyone else, and to its owner too once its 30 days are up", async () => {
    signIn();
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    // The rules read it to its author alone, and the server answers anyone else as for a missing card.
    vi.mocked(getCardBySlugOrId).mockResolvedValue(null);
    vi.mocked(callApi).mockRejectedValue(new ApiError(404, 'not_found', 'No such card.'));
    const { unmount } = renderPage({ slug: 'pub1' });
    expect(await screen.findByText("This card can't be found")).toBeInTheDocument();
    unmount();

    owner();
    vi.mocked(getCardBySlugOrId).mockResolvedValue(inTrash({ trashedAt: new Date(Date.now() - 31 * DAY) }));
    renderPage({ slug: 'pub1' });
    expect(await screen.findByText("This card can't be found")).toBeInTheDocument();
    expect(screen.queryByText('This card is in the trash')).toBeNull();
  });
});

describe('its pictures', () => {
  it("asks for the cover first, and for the story's photos and the author's picture only as the reader nears them", async () => {
    vi.mocked(getCardById).mockReturnValue(new Promise(() => {}));
    const s = seed();
    renderPage({
      seed: {
        ...s,
        view: {
          card: {
            ...s.view!.card,
            media: { type: 'image', url: 'https://img.test/cover.avif', label: 'The kettle' },
            story: `${STORY}\n\n![A street at dawn](https://img.resonance.channel/street.avif)`,
          },
          author: { ...s.view!.author!, avatarUrl: 'https://img.test/author.avif' },
        },
      },
    });

    const cover = screen.getByRole('img', { name: 'The kettle' });
    expect(cover).toHaveAttribute('src', 'https://img.test/cover.avif');
    expect(cover).toHaveAttribute('loading', 'eager');
    expect(cover).toHaveAttribute('fetchpriority', 'high');

    const photo = screen.getByRole('img', { name: 'A street at dawn' });
    expect(photo).toHaveAttribute('loading', 'lazy');
    expect(photo).toHaveAttribute('decoding', 'async');

    // The byline sits in the header and the aside (CSS shows one); its avatar is a link out of the
    // accessibility tree (the pen name is the one link a screen reader meets).
    const avatars = screen.getAllByRole('img', { name: 'AU', hidden: true });
    expect(avatars.length).toBeGreaterThan(0);
    for (const avatar of avatars) {
      expect(avatar).toHaveAttribute('src', 'https://img.test/author.avif');
      expect(avatar).toHaveAttribute('loading', 'lazy');
    }
    await waitFor(() => expect(getCardById).toHaveBeenCalled());
  });
});

describe('the head: title, byline and actions', () => {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://resonance.channel';
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = env;
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  /** The row under the title: the byline, its meta line, the actions. */
  const bylineRow = () => screen.getByRole('heading', { level: 1 }).nextElementSibling as HTMLElement;
  /** What the meta line reads. */
  const metaLine = () => bylineRow().querySelector('p')!;
  const asOwner = () => {
    signIn();
    mockUseAuth.mockReturnValue({ user: { id: 'a1' }, loading: false });
    vi.mocked(callApi).mockResolvedValue(detail({ isOwner: true }));
  };

  it('sets the title by the story’s script, over a byline with the read time and the date — which the rail no longer shows', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1'));
    const { container } = renderPage({ slug: 'c1' });

    const title = await screen.findByRole('heading', { level: 1, name: 'The core thought of this card' });
    expect(title).toHaveClass('story-title');
    expect(title).toHaveAttribute('data-script', 'latin');
    expect(metaLine()).toHaveTextContent('1 min · Jan 1, 2026');
    // Under the title, before the story.
    expect(title.compareDocumentPosition(metaLine()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(metaLine().compareDocumentPosition(screen.getByText('The longer story body of this card.')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The byline names the author at every width, linking to their profile (round 8 §10.1).
    expect(within(bylineRow()).getByRole('link', { name: '@author' })).toHaveAttribute('href', '/u/@author');
    // No rail for a story without headings: no author block beside it, and the column centred.
    expect(container.querySelector('aside')).toBeNull();
    expect(container.querySelector('[data-contents]')).toBeNull();
    expect(container.querySelectorAll('time')).toHaveLength(1);
  });

  it('keeps a rail of the story’s contents beside one with headings, and the author out of it', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1', { story: '## The start\n\nWords.\n\n## The end\n\nMore words.' }));
    const { container } = renderPage({ slug: 'c1' });
    await screen.findByRole('heading', { level: 1 });
    expect(container.querySelector('[data-contents]')).not.toBeNull();
    const aside = container.querySelector('aside')!;
    expect(within(aside).queryByRole('link', { name: '@author' })).toBeNull();
  });

  // Round 12 §5–6: the card's share · ⋯ come again at the story's end only when the byline and the end can't
  // be in view at once — at ≥ 1200 at the end of the response row (its owner's: a row of its own), below it at
  // the end of the tags.
  describe('the share · ⋯ at the story’s end', () => {
    const realMatchMedia = window.matchMedia;
    const realRect = Element.prototype.getBoundingClientRect;
    afterEach(() => {
      window.matchMedia = realMatchMedia;
      Element.prototype.getBoundingClientRect = realRect;
    });
    const wideIs = (wide: boolean) => {
      window.matchMedia = ((query: string) => ({
        matches: query.includes('min-width: 1200px') ? wide : false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
    };
    // The story's end 3000 px under its byline: far out of a window's view.
    const longStory = () => {
      Element.prototype.getBoundingClientRect = function (this: Element) {
        const foot = this.className?.toString().includes('tagsRow') ? 3000 : 0;
        return { top: 0, bottom: foot, left: 0, right: 0, width: 0, height: foot, x: 0, y: 0, toJSON() {} } as DOMRect;
      };
    };
    const tagsRow = () => document.querySelector<HTMLElement>('[class*="tagsRow"]')!;

    it('says nothing twice on a short story: the byline’s alone', async () => {
      wideIs(true);
      vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1'));
      const view = renderPage({ slug: 'c1' });
      await screen.findByRole('heading', { level: 1 });
      expect(within(screen.getByTestId('read-after-area')).queryAllByRole('button', { name: 'Share' })).toHaveLength(0);
      expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(1);
      view.unmount();

      asOwner();
      vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1'));
      renderPage({ slug: 'c1' });
      await screen.findByRole('heading', { level: 1 });
      expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Manage card' })).toHaveLength(1);
    });

    it('ends a long story’s response row with them at ≥ 1200 — its owner’s with a row of their own', async () => {
      wideIs(true);
      longStory();
      vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1'));
      const view = renderPage({ slug: 'c1' });
      await screen.findByRole('heading', { level: 1 });
      await waitFor(() =>
        expect(within(screen.getByTestId('read-after-area')).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Share']),
      );
      expect(within(tagsRow()).queryAllByRole('button')).toHaveLength(0);
      view.unmount();

      asOwner();
      vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1'));
      renderPage({ slug: 'c1' });
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByTestId('read-after-area')).toBeNull();
      await waitFor(() => expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(2));
      expect(screen.getAllByRole('button', { name: 'Manage card' })).toHaveLength(2);
    });

    it('puts them at the end of a long story’s tags below 1200, and nowhere else', async () => {
      wideIs(false);
      longStory();
      asOwner();
      vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1'));
      renderPage({ slug: 'c1' });
      await screen.findByRole('heading', { level: 1 });
      await waitFor(() => expect(within(tagsRow()).getByRole('button', { name: 'Share' })).toBeInTheDocument());
      expect(within(tagsRow()).getByRole('button', { name: 'Manage card' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(2);
    });
  });

  it('puts the story’s language on the title and the story alone, never on the page around them', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(
      card('c1', { thoughtCore: '跑完 2400 公尺那天，教練說 don’t rush', story: '那年我用 iPhone 記下每一次配速……直到終點。' }),
    );
    const { container } = renderPage({ slug: 'c1' });
    const title = await screen.findByRole('heading', { level: 1 });
    expect(Array.from(container.querySelectorAll('[lang]')).map((el) => [el.tagName, el.getAttribute('lang')])).toEqual([
      ['H1', 'zh-TW'],
      ['DIV', 'zh-TW'],
    ]);
    expect(container.querySelector('.story-prose')).toHaveAttribute('data-script', 'cjk');
    expect(title).toHaveAttribute('data-script', 'cjk');
    // The apostrophe in don’t is set apart for the title's Latin face; the words read as written.
    expect(title.querySelectorAll('.story-latin-mark')).toHaveLength(1);
    expect(title).toHaveTextContent('跑完 2400 公尺那天，教練說 don’t rush');
  });

  it('gives a signed-out reader of a public card the share glyph alone', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1'));
    renderPage({ slug: 'c1' });
    await screen.findByRole('heading', { level: 1 });
    expect(within(bylineRow()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Share']);
  });

  it('gives the owner share, then their ⋯, in the byline row', async () => {
    asOwner();
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1'));
    renderPage({ slug: 'c1' });
    await screen.findByRole('heading', { level: 1 });
    expect(within(bylineRow()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Share', 'Manage card']);
  });

  it.each([
    ['a private card', { visibility: 'private' as const }],
    ['a connections-only card', { visibility: 'connections' as const }],
    ['a draft', { publishedAt: null }],
  ])('offers no share on %s — whoever got the link could not open it', async (_, extra) => {
    asOwner();
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1', extra));
    renderPage({ slug: 'c1' });
    await screen.findByRole('heading', { level: 1 });
    expect(within(bylineRow()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Manage card']);
  });

  // Round 9 §1: a 私人卡 — never published, or published and kept private — is read on its page by its owner,
  // which says no one else sees it and offers its pen where share would be.
  it.each([
    ['never published', { publishedAt: null }, '1 min · Private'],
    ['published and kept private', { visibility: 'private' as const }, '1 min · Jan 1, 2026 · Private'],
  ])('reads a 私人卡 (%s) to its owner: 🔒 私人卡 in the meta line, the pen before the ⋯', async (_, extra, meta) => {
    asOwner();
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1', extra));
    renderPage({ slug: 'c1' });
    await screen.findByRole('heading', { level: 1 });
    expect(metaLine().textContent).toBe(meta);
    const edit = within(bylineRow()).getByRole('link', { name: 'Edit' });
    expect(edit).toHaveAttribute('href', '/write/c1');
    const manage = within(bylineRow()).getByRole('button', { name: 'Manage card' });
    expect(edit.compareDocumentPosition(manage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says nothing of 私人卡 on a card readers have, and offers its pen only in the ⋯', async () => {
    asOwner();
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1', { visibility: 'connections' }));
    renderPage({ slug: 'c1' });
    await screen.findByRole('heading', { level: 1 });
    expect(metaLine().textContent).toBe('1 min · Jan 1, 2026');
    expect(within(bylineRow()).queryByRole('link', { name: 'Edit' })).toBeNull();
  });

  it('shows its owner an anonymous card under the anonymous byline, shared by its id with a word on what sharing it may say', async () => {
    asOwner();
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1', { anonymous: true, slug: 'a-quiet-morning-author' }));
    renderPage({ slug: 'c1' });
    await screen.findByRole('heading', { level: 1 });

    const row = bylineRow();
    expect(within(row).getByText('Anonymous')).toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row).queryByText('@author')).not.toBeInTheDocument();

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    // After the setup, which puts a clipboard of its own in place.
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(within(row).getByRole('button', { name: 'Share' }));
    expect(screen.getByText('Sharing it from your account may tell people it’s yours')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith('https://resonance.channel/card/c1');
  });

  it('gives a reader of someone else’s anonymous card no hint, and its link no slug', async () => {
    vi.mocked(getCardById).mockResolvedValue(null);
    vi.mocked(resolveCardId).mockResolvedValue('pub1');
    vi.mocked(getPublicCardView).mockResolvedValue(seed({ anonymous: true }));
    renderPage({ seed: seed({ anonymous: true }) });
    await screen.findByRole('heading', { level: 1 });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(within(bylineRow()).getByRole('button', { name: 'Share' }));
    expect(screen.queryByText(/may tell people/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith('https://resonance.channel/card/pub1');
  });
});

describe('storyGate', () => {
  const base = { signedInHere: true, authLoading: false, viewerId: 'me', blocked: new Set<string>(), authorId: 'a1', failed: false };
  it('lets the reader see their own card without waiting on anything', () => {
    expect(storyGate({ ...base, authorId: 'me', blocked: undefined })).toBe('show');
  });
  it('is unknown on the server and during hydration unless the author is known blocked', () => {
    expect(storyGate({ ...base, signedInHere: null, viewerId: undefined, blocked: undefined })).toBe('unknown');
  });
  it("holds someone else's anonymous card until its read answers (the server applied the blocks), or failed", () => {
    expect(storyGate({ ...base, authorId: '', failed: false })).toBe('hold');
    expect(storyGate({ ...base, authorId: '', failed: false, answered: true })).toBe('show');
    expect(storyGate({ ...base, authorId: '', failed: true })).toBe('show');
  });
});

describe('the pre-paint hold script', () => {
  it('looks for the same session mark the auth client writes', () => {
    expect(SESSION_MARK_STORAGE_KEY).toBe(SESSION_MARK_KEY);
  });
});

// Someone else's 私人卡 is read at all only when they shared it with the viewer in a message (api/v1/sharedCards):
// the rules refuse the browser's own read, the server answers it — to read, never to answer.
describe("someone else's 私人卡 shared in a message", () => {
  afterEach(() => {
    vi.mocked(callApi).mockReset();
    vi.mocked(getCardBySlugOrId).mockReset();
  });
  it('shows its story with the 私人卡 mark and a quiet line in place of the response row', async () => {
    signIn();
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    vi.mocked(getCardById).mockResolvedValue(null);
    vi.mocked(getCardBySlugOrId).mockResolvedValue(null);
    vi.mocked(resolveCardId).mockResolvedValue('kept1');
    vi.mocked(callApi).mockImplementation((async () =>
      detail({
        card: summary('kept1', 'A quiet morning', { visibility: 'private', slug: null, author: { ...summary('x', 'x').author!, id: 'a1', handle: 'bob' } }),
        visibility: 'private',
        story: STORY,
        referenceCard: null,
        resonances: { cards: [] },
        related: { cards: [] },
        embeds: { cards: [] },
      })) as never);

    renderPage({ slug: 'kept1' });
    await waitFor(() => expect(storyVisible()).toBe(true));
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('bob shared this private card with you — only you can read it')).toBeInTheDocument();
    expect(screen.queryByTestId('read-after-area')).not.toBeInTheDocument();
  });
});
