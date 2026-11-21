// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import type { User } from '@/lib/db/types';

// The card box on the real data hooks; the client read layer, auth and
// navigation are the boundary.
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' }, loading: false }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
}));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getCardById: vi.fn(),
  getCardsByAuthor: vi.fn(),
  getMyDrafts: vi.fn(),
  getCurrentUserProfile: vi.fn(),
  getUsersByIds: vi.fn(),
}));
// Every shelf comes from the server (phase 2b): the viewer's own as the others'.
vi.mock('@/lib/db/firestore/client/api', () => ({ callApi: vi.fn() }));

import { getCardsByAuthor, getCurrentUserProfile, getMyDrafts, getUsersByIds } from '@/lib/db/firestore/client/reads';
import { callApi } from '@/lib/db/firestore/client/api';
import type { FeedCardBody } from '@/lib/api/v1/schemas';
import MyCardBoxPage from './page';

/** One of the viewer's cards as their card box's shelves answer it. */
function card(id: string, extra: Partial<FeedCardBody> = {}): FeedCardBody {
  return {
    id,
    slug: null,
    title: `Card ${id}`,
    excerpt: 'story',
    tags: [],
    publishedAt: '2026-01-01T00:00:00.000Z',
    author: { id: 'me', handle: 'me', initials: 'ME', accentColor: 'c', avatarUrl: null, avatarSeed: '1', verified: false, region: null },
    anonymous: false,
    visibility: 'public',
    imageUrl: null,
    imageLabel: null,
    accentHue: null,
    readMinutes: 1,
    referenceCardId: null,
    reason: null,
    ...extra,
  };
}

/** The paths the box asked the server for, in order. */
const asked = () => vi.mocked(callApi).mock.calls.map((c) => c[0]);
const me: User = {
  id: 'me',
  handle: 'me',
  region: 'TW',
  primaryLocale: 'en',
  autoTranslateTo: [],
  verified: false,
  phoneHash: '',
  avatarSeed: '1',
  initials: 'ME',
  accentColor: 'var(--accent)',
  joinedAt: new Date('2025-01-01'),
  handleChangedAt: new Date('2025-01-01'),
};

function renderPage() {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MyCardBoxPage />
    </SWRConfig>,
  );
}

beforeEach(() => {
  vi.mocked(getCurrentUserProfile).mockResolvedValue(me);
  vi.mocked(getUsersByIds).mockResolvedValue({ me });
  vi.mocked(callApi).mockImplementation((async (path: string) => {
    if (path === '/api/v1/me/cardbox?shelves=draft,private') return { draft: { cards: [card('d1', { publishedAt: null })] }, private: { cards: [] } };
    const tab = /tab=(\w+)/.exec(path)?.[1];
    return { cards: tab === 'published' ? [card(`${tab}-1`)] : [] };
  }) as never);
});
afterEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe('the card box', () => {
  it('reads the shelf the viewer left on, and no other until it is opened', async () => {
    window.sessionStorage.setItem('me:cardbox-tab', 'draft');
    renderPage();

    expect((await screen.findAllByText('Card d1')).length).toBeGreaterThan(0);
    expect(asked()).toEqual(['/api/v1/me/cardbox?shelves=draft,private']);
    expect(getMyDrafts).not.toHaveBeenCalled();
    expect(getCardsByAuthor).not.toHaveBeenCalled();
  });

  // One 私人卡 shelf holds every card only its author sees — never published, or kept private (round 8 §1.1,
  // round 9 §1) — and one left on the old private shelf opens it.
  it('has one 私人卡 shelf for drafts and private cards, and opens it for a viewer who left on the old one', async () => {
    window.sessionStorage.setItem('me:cardbox-tab', 'private');
    renderPage();
    expect((await screen.findAllByText('Card d1')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('tab', { name: 'Private' })).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Private' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reads the next shelf when its tab is opened', async () => {
    renderPage();
    expect((await screen.findAllByText('Card published-1')).length).toBeGreaterThan(0);
    expect(asked()).toEqual(['/api/v1/me/cards?tab=published']);

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Private' }));
    expect((await screen.findAllByText('Card d1')).length).toBeGreaterThan(0);
    expect(asked()).toEqual(['/api/v1/me/cards?tab=published', '/api/v1/me/cardbox?shelves=draft,private']);
  });

  // B5: wide, a labelled tonal button with the profile's lines; a phone keeps a bare glyph at the
  // row's end (CSS shows one) — the person, not the pen, which means writing.
  it('leads to the profile settings from a labelled button and, on a phone, a bare glyph', async () => {
    const { container } = renderPage();
    const button = await screen.findByRole('button', { name: 'Edit profile' });
    expect(button).toHaveAttribute('data-variant', 'tonal');
    await userEvent.setup().click(button);
    expect(nav.push).toHaveBeenCalledWith('/settings');

    const glyph = screen.getByRole('link', { name: 'Edit profile' });
    expect(glyph).toHaveAttribute('href', '/settings');
    expect(glyph).not.toHaveAttribute('data-variant');
    expect(glyph.querySelector('[data-variant]')).toBeNull();
    expect(container.querySelector('button[data-variant="ghost"]')).toBeNull();
  });
});
