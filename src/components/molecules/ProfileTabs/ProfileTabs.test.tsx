// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));
// next-intl's Link / useRouter need routing config we don't stand up here.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ push: vi.fn() }),
}));
// The owner's「⋯」menu talks to Firestore; it isn't what's under test.
// The card a stand-in toast's 復原 brings back (its own ⋯ left the shelf with it).
const undone = vi.hoisted(() => ({ id: '' }));
vi.mock('@/components/molecules/CardActionsMenu/CardActionsMenu', () => ({
  // Stands in for the ⋯: its 刪除 says the card went to the trash, a toast's 復原 that one came back.
  CardActionsMenu: (props: { card: { id: string }; onTrashed?: (id: string) => void; onRestored?: (c: { id: string }) => void }) => (
    <>
      <button type="button" onClick={() => props.onTrashed?.(props.card.id)}>{`trash ${props.card.id}`}</button>
      <button type="button" onClick={() => props.onRestored?.({ id: undone.id })}>{`undo from ${props.card.id}`}</button>
    </>
  ),
}));
// The trash's ⋯ and its emptying talk to the server: the boundary here.
const trashMenus = vi.fn();
vi.mock('@/components/molecules/TrashActionsMenu/TrashActionsMenu', () => ({
  TrashActionsMenu: (props: { card: { id: string } }) => (trashMenus(props), null),
}));
const mockEmptyTrash = vi.fn(async () => ({ deleted: 2, remaining: 0 }));
vi.mock('@/lib/db/firestore/client/cards', () => ({
  emptyTrash: () => mockEmptyTrash(),
  trashCard: vi.fn(),
  restoreCard: vi.fn(),
  deleteCardForever: vi.fn(),
}));

import { ProfileTabs } from './ProfileTabs';

// jsdom has no layout, and the hand-drawn shapes only draw once their box has
// a size — give every element one so the svgs render.
const proto = HTMLElement.prototype;
const offW = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
const offH = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
beforeEach(() => {
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => 90 });
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => 24 });
});
afterEach(() => {
  if (offW) Object.defineProperty(proto, 'offsetWidth', offW);
  if (offH) Object.defineProperty(proto, 'offsetHeight', offH);
});

function card(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    authorId: 'me',
    slug: id,
    thoughtCore: `Thought ${id}`,
    story: 'a story body',
    tags: [],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    ...overrides,
  };
}

const me = {
  id: 'me',
  handle: '@me',
  initials: 'ME',
  avatarSeed: '1',
  accentColor: 'var(--accent)',
} as unknown as User;

/** Pen-stroked paths among the hand-drawn shapes drawn directly beside `el`'s content. */
function strokedShapePaths(wrapper: Element) {
  return Array.from(wrapper.children)
    .filter((c) => c.tagName.toLowerCase() === 'svg')
    .flatMap((svg) => Array.from(svg.querySelectorAll('path[stroke]')));
}

describe('ProfileTabs — the card box shelves', () => {
  it('washes the selected shelf tab without an outline, and moves the wash as the viewer switches', async () => {
    renderWithIntl(
      <ProfileTabs
        manageable
        loading
        tabs={['published', 'draft']}
      />,
    );

    const published = screen.getByRole('tab', { name: 'Published' });
    expect(published).toHaveAttribute('aria-selected', 'true');
    const washWrapper = published.parentElement!.parentElement!;
    expect(washWrapper.querySelectorAll(':scope > svg path[fill]')).toHaveLength(1);
    expect(strokedShapePaths(washWrapper)).toHaveLength(0);

    await userEvent.click(screen.getByRole('tab', { name: 'Private' }));
    expect(screen.getByRole('tab', { name: 'Private' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Published' }).parentElement).toBe(
      screen.getByRole('tablist'),
    );
    const moved = screen.getByRole('tab', { name: 'Private' }).parentElement!.parentElement!;
    expect(strokedShapePaths(moved)).toHaveLength(0);
  });

  // Round 9 §1: a 私人卡 — never published, or published and kept private — opens its card page like every
  // other card, the owner's reader of it; the writer is its ⋯'s 編輯 (and the page's pen).
  it('opens every 私人卡 on its card page, never the writer', () => {
    renderWithIntl(
      <ProfileTabs
        manageable
        tabs={['draft']}
        authors={{ me }}
        data={{ draft: [card('never', { publishedAt: null, slug: undefined }), card('kept', { visibility: 'private', slug: 'kept-slug' })] }}
      />,
    );
    expect(screen.getAllByText('Thought never')[0].closest('a')).toHaveAttribute('href', '/card/never');
    expect(screen.getAllByText('Thought kept')[0].closest('a')).toHaveAttribute('href', '/card/kept-slug');
  });

  it('draws the tags on a shelf card as bare fills, and the owner\'s anonymous card with the anonymous byline, no badge', () => {
    renderWithIntl(
      <ProfileTabs
        manageable
        tabs={['published']}
        authors={{ me }}
        data={{
          published: [
            card('a', { tags: ['tea', 'rest'] }),
            card('b', { anonymous: true, tags: ['quiet'] }),
          ],
        }}
      />,
    );

    const pillOf = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    for (const label of ['tea', 'rest', 'quiet']) {
      // Every pill has its own shape (a fill), and tags are data inside a framed card: nothing stroked round them.
      expect(pillOf(label).querySelectorAll(':scope > svg path[fill]').length).toBeGreaterThan(0);
      expect(strokedShapePaths(pillOf(label))).toHaveLength(0);
    }
    // The anonymous card reads as everyone sees it: the anonymous byline once (no pill under it), the
    // owner's pen name only on the named card.
    expect(screen.getAllByText('Anonymous')).toHaveLength(1);
    expect(screen.getAllByText('@me')).toHaveLength(1);
  });

  it('says an empty shelf with the shared empty state: a mark, the shelf\'s line as its title, and the way to write on Published', () => {
    renderWithIntl(<ProfileTabs manageable tabs={['published', 'bookmarks']} data={{ published: [], bookmarks: [] }} />);
    const title = screen.getByRole('heading', { level: 2 });
    expect(title.textContent).toMatch(/first card/i);
    expect(screen.getByRole('link', { name: /story/i })).toHaveAttribute('href', '/write');
  });
});

describe('ProfileTabs — focus as a card leaves the shelf', () => {
  const shelf = (cards: Card[]) => <ProfileTabs manageable tabs={['published', 'draft']} authors={{ me }} data={{ published: cards }} />;

  it('moves on to the next card, else the one before it, else the shelf control — never left on nothing', async () => {
    const { rerender } = renderWithIntl(shelf([card('a'), card('b'), card('c')]));
    await userEvent.click(screen.getByRole('button', { name: 'trash b' }));
    // The shelf is read again without it.
    rerender(shelf([card('a'), card('c')]));
    expect(document.activeElement).toBe(screen.getAllByText('Thought c')[0].closest('a'));

    await userEvent.click(screen.getByRole('button', { name: 'trash c' }));
    rerender(shelf([card('a')]));
    expect(document.activeElement).toBe(screen.getAllByText('Thought a')[0].closest('a'));

    await userEvent.click(screen.getByRole('button', { name: 'trash a' }));
    rerender(shelf([]));
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Published' }));
  });

  it("lands on a card the toast's Undo brought back, once it is on the shelf again", async () => {
    // b went to the trash; its toast's 復原 brings it back.
    undone.id = 'b';
    const { rerender } = renderWithIntl(shelf([card('a'), card('c')]));
    await userEvent.click(screen.getByRole('button', { name: 'undo from a' }));
    // The toast that held focus is gone; the shelf, read again, has the card back.
    (document.activeElement as HTMLElement).blur();
    rerender(shelf([card('a'), card('b'), card('c')]));
    expect(document.activeElement).toBe(screen.getAllByText('Thought b')[0].closest('a'));
  });
});

describe('ProfileTabs — the trash', () => {
  const DAY = 86_400_000;
  const inTrash = (id: string, extra: Partial<Card> = {}, daysIn = 7) =>
    card(id, {
      visibility: 'private',
      trashedAt: new Date(Date.now() - daysIn * DAY),
      trashedFrom: { visibility: 'public', referenceCardId: null },
      ...extra,
    });
  const TABS = ['published', 'draft', 'resonated', 'linked', 'bookmarks', 'trash', 'thoughtMap'] as const;

  it('is a shelf of its own, always there, last before the thought map', () => {
    renderWithIntl(<ProfileTabs manageable loading tabs={[...TABS]} thoughtMapHref="/me/thought-map" />);
    const names = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(names.slice(-2)).toEqual(['Trash', 'Thought map']);
  });

  it('says what the trash keeps and for how long over the shelf, and nothing under its cards', async () => {
    renderWithIntl(
      <ProfileTabs
        manageable
        tabs={['trash']}
        authors={{ me }}
        data={{
          trash: [
            inTrash('public-one'),
            inTrash('draft-one', { publishedAt: null }, 1),
            inTrash('private-one', { trashedFrom: { visibility: 'private', referenceCardId: null } }, 29.5),
            inTrash('circle-one', { trashedFrom: { visibility: 'connections', referenceCardId: null } }),
          ],
        }}
      />,
    );
    expect(screen.getByText("Cards stay in the trash for 30 days, then they're deleted forever")).toBeInTheDocument();
    // No anonymous card here: no word of notes.
    expect(screen.queryByText('When an anonymous card goes to the trash, the notes left on it are deleted')).toBeNull();
    // Round 11 §7: no line under the cards — neither what a card was nor when it goes (restoring says where it went).
    expect(screen.queryByText(/Deleted forever (in|within)/)).toBeNull();
    expect(screen.queryByText(/when restored|Private card/)).toBeNull();
    // Every card opens its page (its trash banner) — a 私人卡 never published too (round 9 §1).
    expect(screen.getAllByText('Thought public-one')[0].closest('a')).toHaveAttribute('href', '/card/public-one');
    expect(screen.getAllByText('Thought draft-one')[0].closest('a')).toHaveAttribute('href', '/card/draft-one');
    // Each card's ⋯ is the trash's own.
    expect(trashMenus.mock.calls.map(([p]) => p.card.id)).toEqual(expect.arrayContaining(['public-one', 'draft-one', 'private-one', 'circle-one']));

    // 🗑 清空 (round 9 §5): words in the danger ink at the hint's end — named 清空垃圾桶 — which open a question in red.
    const empty = screen.getByRole('button', { name: 'Empty trash' });
    expect(empty).toHaveAttribute('data-variant', 'dangerText');
    expect(empty).toHaveTextContent('Empty');
    expect(empty.closest('div')!.parentElement).toContainElement(screen.getByText("Cards stay in the trash for 30 days, then they're deleted forever"));
    await userEvent.click(empty);
    expect(screen.getByText('Empty the trash?')).toBeInTheDocument();
    expect(screen.getByText("Every card in the trash will be deleted forever. This can't be undone.")).toBeInTheDocument();
    const verb = Array.from(screen.getByRole('dialog').querySelectorAll('button')).find((b) => b.textContent === 'Empty trash')!;
    expect(verb).toHaveAttribute('data-variant', 'danger');
    await userEvent.click(verb);
    expect(mockEmptyTrash).toHaveBeenCalledTimes(1);
  });

  // The server deleted everything, then the answer was lost (a 500 after the deletes, a timeout): the trash read
  // again is empty, so the question goes as if it had worked — never stuck saying it didn't (round 8 §6.2).
  it('lets an emptying that failed go once the trash read again is empty, and keeps the question while cards are left', async () => {
    mockEmptyTrash.mockRejectedValueOnce(new Error('timeout'));
    const data = { trash: [inTrash('public-one', { publishedAt: new Date('2026-09-01') })] };
    const view = renderWithIntl(<ProfileTabs manageable tabs={['trash']} authors={{ me }} data={data} />);
    await userEvent.click(screen.getByRole('button', { name: 'Empty trash' }));
    await userEvent.click(Array.from(screen.getByRole('dialog').querySelectorAll('button')).find((b) => b.textContent === 'Empty trash')!);
    // Still holding a card: the question stays, saying it didn't go through.
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't work — try again");
    // Read again, empty: the question is gone and the empty state shows.
    view.rerender(<ProfileTabs manageable tabs={['trash']} authors={{ me }} data={{ trash: [] }} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 2, name: 'The trash is empty' })).toBeInTheDocument();
  });

  it('says the notes on an anonymous card went with it, while one is there', () => {
    renderWithIntl(<ProfileTabs manageable tabs={['trash']} authors={{ me }} data={{ trash: [inTrash('masked', { anonymous: true })] }} />);
    expect(screen.getByText('When an anonymous card goes to the trash, the notes left on it are deleted')).toBeInTheDocument();
  });

  it('says an empty trash with the shared empty state, and offers nothing to empty', () => {
    renderWithIntl(<ProfileTabs manageable tabs={['trash']} data={{ trash: [] }} />);
    expect(screen.getByRole('heading', { level: 2, name: 'The trash is empty' })).toBeInTheDocument();
    expect(screen.getByText('Cards you delete wait here for 30 days')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Empty trash' })).toBeNull();
  });
});
