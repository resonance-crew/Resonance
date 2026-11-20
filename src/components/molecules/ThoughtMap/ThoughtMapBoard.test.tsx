// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SWRConfig, type Cache } from 'swr';
import { renderWithIntl, screen, waitFor, userEvent } from '@/../test/render';
import type { Card } from '@/lib/db/types';

vi.mock('@/lib/db/firestore/client/thoughtMap', () => ({
  loadMyThoughtMap: vi.fn(),
  addMapNode: vi.fn().mockResolvedValue(undefined),
  createMapEdge: vi.fn(),
  createMapGroup: vi.fn(),
  edgeId: (a: string, b: string) => `${a}_${b}`,
  moveMapNode: vi.fn(),
  moveMapNodes: vi.fn(),
  removeMapEdge: vi.fn(),
  removeMapGroup: vi.fn(),
  removeMapNode: vi.fn(),
  setNodeGroups: vi.fn(),
  updateMapEdgeLabel: vi.fn(),
  updateMapGroup: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/reads', () => ({ getCardsByAuthor: vi.fn(), getCardById: vi.fn() }));
// Others' cards (the originals the viewer answered) come from the server.
vi.mock('@/lib/db/firestore/client/api', () => ({ callApi: vi.fn(async () => ({ cards: [] })), ApiError: class extends Error {} }));
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import { loadMyThoughtMap } from '@/lib/db/firestore/client/thoughtMap';
import { callApi } from '@/lib/db/firestore/client/api';
import { ThoughtMapBoard } from './ThoughtMapBoard';

const myCard: Card = {
  id: 'c1',
  authorId: 'me',
  thoughtCore: 'Core of mine',
  story: 'story',
  tags: [],
  originalLocale: 'en',
  translations: {},
  visibility: 'public',
  publishedAt: new Date('2026-01-01'),
  readCount: 0,
  resonanceCount: 0,
  inviteCount: 0,
};

afterEach(() => vi.clearAllMocks());

/** One SWR cache shared by every mount, exactly like the running app's. */
function renderBoard(cache: Cache) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
      <ThoughtMapBoard height="480px" />
    </SWRConfig>
  );
}

describe('ThoughtMapBoard', () => {
  it('keeps a freshly placed card when the board is mounted again', async () => {
    vi.mocked(loadMyThoughtMap).mockResolvedValue({ nodes: [], edges: [], groups: [] });
    // The viewer's own shelves, as the card box answers them (W11: list summaries, one request).
    vi.mocked(callApi).mockImplementation((async (path: string) =>
      path.startsWith('/api/v1/me/cardbox')
        ? {
            published: {
              cards: [
                {
                  id: myCard.id, slug: null, title: myCard.thoughtCore, excerpt: myCard.story, tags: [], publishedAt: '2026-01-01T00:00:00.000Z',
                  author: { id: 'me', handle: 'me', initials: 'M', accentColor: 'c', avatarUrl: null, avatarSeed: '1', verified: false, region: null },
                  anonymous: false, visibility: 'public', imageUrl: null, imageLabel: null, accentHue: null, readMinutes: 1, referenceCardId: null, reason: null,
                },
              ],
            },
          }
        : { cards: [] }) as never);

    const cache: Cache = new Map();
    const first = renderBoard(cache);

    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Add card/i }).length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: /Add card/i })[0]);
    await user.click(screen.getByRole('button', { name: /Core of mine/ }));
    expect(screen.getByText('Core of mine')).toBeInTheDocument();

    // Leaving for the card editor and coming back remounts the board against
    // the cache, which paints before the refetch lands. The arrangement must
    // still be there — it was written to Firestore, not thrown away.
    first.unmount();
    vi.mocked(loadMyThoughtMap).mockReturnValue(new Promise(() => {}));
    renderBoard(cache);

    await waitFor(() => expect(screen.getByText('Core of mine')).toBeInTheDocument());
  });
});
