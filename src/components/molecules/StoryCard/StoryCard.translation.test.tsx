// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhMessages from '@/messages/zh-TW.json';
import { renderWithIntl, screen } from '@/../test/render';
import { summaryHash } from '@/lib/api/v1/summaryTranslations';
import { summaryList } from '@/lib/data/summaries';
import { TWEAKS_KEY } from '@/lib/design/appearance';
import type { Card } from '@/lib/db/types';
import { summaryHashOf } from '@/lib/text/summaryHash';
import { forgetTweaksRead } from '@/components/providers/TweaksPanel';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';

/**
 * §F7 (round 25): with 自動翻譯 on, a feed card that carries its title and excerpt translated into the interface
 * language shows them, set in that language, and wears the small globe named 「AI 翻譯」 — made at publish, they
 * arrive with the card: nothing is fetched. Off (the default), and for the viewer's own card, every list shows what
 * was written; a stale translation (made from another title or excerpt) is never shown.
 */

const viewer = vi.hoisted(() => ({ id: null as string | null }));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: viewer.id ? { id: viewer.id } : null, loading: false }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const TITLE = '雨中的散步';
const STORY = '那天下著雨，我們沿著河走了很久。';
const EN = { title: 'A walk in the rain', excerpt: 'It rained that day; we walked the river a long time.' };

function card(extra: Partial<Card> = {}): Card {
  return {
    id: 'c-rain',
    slug: 'rain-walk',
    authorId: 'bob',
    thoughtCore: TITLE,
    story: STORY,
    tags: [],
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-10-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    anonymous: false,
    // as the server stores it: `of` over the title and the list's excerpt
    summaryTranslations: { of: summaryHash(TITLE, STORY), en: EN },
    ...extra,
  };
}
const authors = { bob: { id: 'bob', handle: 'bob', initials: 'B' } as never };

const fetchMock = vi.fn();
beforeEach(() => {
  viewer.id = null;
  window.localStorage.clear();
  forgetTweaksRead();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const autoOn = () => {
  window.localStorage.setItem(TWEAKS_KEY, JSON.stringify({ autoTranslate: true }));
  forgetTweaksRead();
};
const draw = (cards: Card[], locale = 'en') =>
  renderWithIntl(<CardLinkGrid cards={cards} authors={authors} />, locale === 'zh-TW' ? { locale, messages: zhMessages } : { locale });

describe('a feed card under 自動翻譯', () => {
  it('the browser’s hash is the server’s', () => {
    for (const [t, e] of [[TITLE, STORY], ['Bridge in the rain', 'We met on the bridge…'], ['', ''], ['😀 emoji', 'a\nb "quoted"']]) {
      expect(summaryHashOf(t, e)).toBe(summaryHash(t, e));
    }
  });

  it('off (the default): the card shows what was written, no mark', () => {
    draw([card()]);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(TITLE);
    expect(screen.queryByRole('img', { name: 'AI translation' })).toBeNull();
  });

  it('on: the translated title and excerpt, in their language, and the globe named AI translation — nothing fetched', () => {
    autoOn();
    draw([card()]);
    const h3 = screen.getByRole('heading', { level: 3 });
    expect(h3).toHaveTextContent(EN.title);
    expect(h3).toHaveAttribute('lang', 'en');
    expect(h3).toHaveAttribute('data-script', 'latin');
    const excerpt = screen.getByText(EN.excerpt);
    expect(excerpt).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('img', { name: 'AI translation' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on, under 繁體中文: a card with no zh-TW translation stays as written (the mark is named AI 翻譯 when there is one)', () => {
    autoOn();
    draw([card()], 'zh-TW');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(TITLE);
    const latin = card({ id: 'c2', thoughtCore: 'Bridge', story: 'We met.', summaryTranslations: { of: summaryHash('Bridge', 'We met.'), 'zh-TW': { title: '橋', excerpt: '我們相遇。' } } });
    draw([latin], 'zh-TW');
    expect(screen.getByRole('img', { name: 'AI 翻譯' })).toBeInTheDocument();
    expect(screen.getByText('橋')).toHaveAttribute('lang', 'zh-TW');
  });

  it('never the viewer’s own card, a stale translation, or a private one', () => {
    autoOn();
    viewer.id = 'bob';
    const { unmount } = draw([card()]);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(TITLE);
    unmount();
    viewer.id = 'someone';
    draw([
      card({ id: 'stale', thoughtCore: '雨中的散步（改）' }),
      card({ id: 'private', visibility: 'private' }),
    ]);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['雨中的散步（改）', TITLE]);
    expect(screen.queryByRole('img', { name: 'AI translation' })).toBeNull();
  });

  it('a summary from /api/v1 (already checked by the server) shows its translation', () => {
    autoOn();
    const { cards } = summaryList([
      {
        id: 'c-rain', slug: 'rain-walk', title: TITLE, excerpt: STORY, tags: [], publishedAt: '2026-10-01T00:00:00.000Z',
        author: { id: 'bob', handle: 'bob', initials: 'B', accentColor: 'x', verified: false }, anonymous: false, visibility: 'public',
        imageUrl: null, imageLabel: null, imageFrame: null, summaryTranslations: { en: EN }, accentHue: null, readMinutes: 1, referenceCardId: null, reason: null,
      } as never,
    ]);
    draw(cards);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(EN.title);
  });

  it('a title-only card (the mini cards) stays as written', () => {
    autoOn();
    renderWithIntl(<MiniCardGrid cards={[card()]} authors={authors} />);
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.queryByText(EN.title)).toBeNull();
  });
});
