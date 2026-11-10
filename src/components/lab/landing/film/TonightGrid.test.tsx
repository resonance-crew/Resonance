// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderWithIntl, waitFor } from '@/../test/render';
import type { FilmTile } from './model';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const auth = { user: null as { id: string } | null, loading: false };
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => auth }));
const callApi = vi.fn();
vi.mock('@/lib/db/firestore/client/api', () => ({ callApi: (...a: unknown[]) => callApi(...a) }));

import { TonightGrid } from './TonightGrid';

const tile = (id: string, over: Partial<FilmTile> = {}): FilmTile => ({
  id,
  href: `/card/${id}`,
  title: `Story ${id}`,
  excerpt: `The words of story ${id}`,
  author: { name: `pen ${id}`, initials: 'P' },
  tags: [],
  minutes: 3,
  family: 1,
  script: 'latin',
  ...over,
});
const SERVER = ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => tile(id));

/** A card as GET /api/v1/feed/recommended answers it (a FeedCard). */
const feedCard = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  slug: `slug-${id}`,
  title: `Mine ${id}`,
  excerpt: `Words picked for the reader, ${id}`,
  tags: ['sea'],
  publishedAt: '2026-11-01T00:00:00.000Z',
  author: { id: `u-${id}`, handle: `pen-${id}`, initials: 'P', verified: false, accentColor: '#000', avatarSeed: '3', avatarUrl: null, region: null },
  anonymous: false,
  visibility: 'public',
  imageUrl: null,
  imageLabel: null,
  accentHue: null,
  readMinutes: 4,
  referenceCardId: null,
  reason: 'SECRET-REASON',
  ...over,
});

const hrefs = (el: HTMLElement) => [...el.querySelectorAll('a[data-film-card="tile"]')].map((a) => a.getAttribute('href'));
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  auth.loading = false;
});

describe("tonight's stories (the end's list)", () => {
  it('shows the six recommended stories as they come: no pair row, nothing asked for a signed-out visitor', async () => {
    const { container } = renderWithIntl(<TonightGrid picks={SERVER} locale="en" />);
    expect(hrefs(container)).toEqual(SERVER.map((t) => t.href));
    expect(container.querySelectorAll('article')).toHaveLength(6);
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(container.querySelectorAll('[data-card-grid]')).toHaveLength(1);
    // every card inside the one grid (none on a row of its own before it)
    expect(container.querySelectorAll('[data-card-grid] a[data-film-card="tile"]')).toHaveLength(6);
    await settle();
    expect(callApi).not.toHaveBeenCalled();
    // nor while Auth is still restoring
    auth.loading = true;
    auth.user = { id: 'alice' };
    renderWithIntl(<TonightGrid picks={SERVER} locale="en" />);
    await settle();
    expect(callApi).not.toHaveBeenCalled();
  });

  it('gives a signed-in reader their own six once they arrive, the server\'s list until then', async () => {
    auth.user = { id: 'alice' };
    let answer!: (body: unknown) => void;
    callApi.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { container } = renderWithIntl(<TonightGrid picks={SERVER} locale="en" />);
    await waitFor(() => expect(callApi).toHaveBeenCalledWith('/api/v1/feed/recommended'));
    expect(hrefs(container)).toEqual(SERVER.map((t) => t.href));
    await act(async () => {
      answer({
        status: 'fresh',
        cards: [
          feedCard('m1'),
          // an anonymous pick: no author in the answer, linked by its id (never its slug), under the anonymous byline
          feedCard('m2', { anonymous: true, author: null, slug: 'slug-with-a-pen-name' }),
          feedCard('m3', { slug: null }),
          feedCard('m4'),
          // a blank card is never listed
          feedCard('blank', { title: '' }),
          feedCard('m5'),
          feedCard('m6'),
          feedCard('m7'),
        ],
      });
    });
    await waitFor(() => expect(hrefs(container)).toEqual(['/card/slug-m1', '/card/m2', '/card/m3', '/card/slug-m4', '/card/slug-m5', '/card/slug-m6']));
    // the same count, in the same grid; the reader's stories drawn as the feed draws them
    expect(container.querySelectorAll('article')).toHaveLength(6);
    expect(container.textContent).toContain('Mine m1');
    expect(container.textContent).toContain('pen-m1');
    expect(container.textContent).toContain('Anonymous');
    expect(container.textContent).not.toContain('SECRET-REASON');
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('keeps the list whole when the reader has only a few picks, and as it was when they have none or the request fails', async () => {
    auth.user = { id: 'alice' };
    callApi.mockResolvedValueOnce({ cards: [feedCard('m1'), feedCard('s2', { slug: null })] });
    const few = renderWithIntl(<TonightGrid picks={SERVER} locale="en" />).container;
    // theirs first, then the server's that aren't among them (s2 once): six still
    await waitFor(() => expect(hrefs(few)).toEqual(['/card/slug-m1', '/card/s2', '/card/s1', '/card/s3', '/card/s4', '/card/s5']));

    callApi.mockResolvedValueOnce({ cards: [] });
    const none = renderWithIntl(<TonightGrid picks={SERVER} locale="en" />).container;
    await settle();
    expect(hrefs(none)).toEqual(SERVER.map((t) => t.href));

    callApi.mockRejectedValueOnce(new Error('offline'));
    const failed = renderWithIntl(<TonightGrid picks={SERVER} locale="en" />).container;
    await settle();
    expect(hrefs(failed)).toEqual(SERVER.map((t) => t.href));
  });
});
