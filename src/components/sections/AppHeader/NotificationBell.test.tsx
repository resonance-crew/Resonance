// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MouseEvent, ReactNode } from 'react';
import { fireEvent, renderWithIntl, screen, userEvent, within } from '@/../test/render';
import type { Card, Notification, User } from '@/lib/db/types';
import type { BellExtras } from '@/lib/data/hooks';
import { bellHref, onAnonymousCard } from './bellLink';
import { BELL_PAGE_QUERY, bellParts, forgetBellReadHere } from './BellList';
import { NotificationBell } from './NotificationBell';
import zhTW from '@/messages/zh-TW.json';

// The header's bell, on its live list (useNotifications) and the read mark it writes: where each row leads.

const nav = vi.hoisted(() => ({ path: '/home', followed: [] as string[] }));
vi.mock('@/i18n/navigation', () => ({
  // Where it would go is the href; jsdom goes nowhere — a click the page didn't take for itself is noted as followed.
  Link: ({ href, children, onClick, ...rest }: { href: string; children: ReactNode; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void }) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) nav.followed.push(href);
        e.preventDefault();
      }}
    >
      {children}
    </a>
  ),
  usePathname: () => nav.path,
}));

/** A window where `query` matches (the phone's, for the bell's page) — or none. */
function windowWhere(matching: string | null) {
  window.matchMedia = ((query: string) => ({
    matches: query === matching,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  nav.path = '/home';
  nav.followed = [];
  forgetBellReadHere();
});

const live = vi.hoisted(() => ({ rows: [] as Notification[], extras: undefined as BellExtras | undefined }));
vi.mock('@/lib/data/hooks', () => ({
  useNotifications: () => ({ data: live.rows, error: null }),
  useBellExtras: (items: unknown) => (items ? live.extras : undefined),
}));
const markNotificationRead = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/db/firestore/client/notifications', () => ({ markNotificationRead }));
// Opening a thread is what marks a conversation read; nothing here may.
const markConversationRead = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/db/firestore/client/messages', () => ({ markConversationRead }));

const at = new Date('2026-10-01T08:00:00Z');
const bell = (id: string, type: Notification['type'], payload: Record<string, unknown>): Notification => ({
  id,
  userId: 'me',
  type,
  payload,
  readAt: null,
  createdAt: at,
});

const anonymousNote = bell('n1', 'note', {
  noteId: 'note1', cardId: 'masked', fromUserId: 'bob', fromHandle: 'bob', preview: 'Your letter stayed with me.', anonymous: true,
});
const anonymousResonance = bell('n2', 'resonance', { fromUserId: 'bob', fromHandle: 'bob', cardId: 'masked', anonymous: true });
const namedNote = bell('n3', 'note', {
  noteId: 'note2', cardId: 'walk', fromUserId: 'carol', fromHandle: 'carol', preview: 'Thank you for the walk.',
});
const namedResonance = bell('n4', 'resonance', { fromUserId: 'carol', fromHandle: 'carol', cardId: 'walk' });

async function openBell() {
  const user = userEvent.setup();
  renderWithIntl(<NotificationBell />);
  await user.click(screen.getByRole('link', { name: 'Notifications' }));
  return { user, list: screen.getByRole('dialog') };
}

describe('the bell’s rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    live.rows = [anonymousNote, anonymousResonance, namedNote, namedResonance];
    live.extras = { people: {}, cards: {} };
  });

  it('open the card for a note or resonance on an anonymous card, never its writer’s thread', async () => {
    const { list } = await openBell();
    const links = within(list).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/card/masked',
      '/card/masked',
      '/messages/carol?note=note2&card=walk&u=carol',
      '/messages/carol?u=carol',
    ]);
    expect(links.filter((a) => a.getAttribute('href')?.startsWith('/messages/bob'))).toEqual([]);
  });

  it('show the note’s own words in the row, on an anonymous card too', async () => {
    const { list } = await openBell();
    const [anonymous] = within(list).getAllByRole('link');
    expect(anonymous).toHaveTextContent('bob sent you a little note');
    expect(anonymous).toHaveTextContent('Your letter stayed with me.');
    expect(within(list).getByText('Thank you for the walk.')).toBeInTheDocument();
  });

  // The dot ends the line that says who it is from; under a note's words it read as a mark on the note.
  it('put the unread dot of a note row on its first line, before the note’s words', async () => {
    const { list } = await openBell();
    const row = within(list).getAllByRole('link')[2];
    const dot = row.querySelector('[data-unread-dot]')!;
    const words = within(row).getByText('Thank you for the walk.');
    expect(dot).not.toBeNull();
    expect(dot.compareDocumentPosition(words) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(words.contains(dot)).toBe(false);
  });

  // In the reader's language, the bell and its list as every row: never English words in zh-TW.
  it('name the bell and its list, and an expired invite, in the reader’s language', async () => {
    live.rows = [bell('n5', 'invite_expired', {})];
    const user = userEvent.setup();
    renderWithIntl(<NotificationBell />, { locale: 'zh-TW', messages: zhTW });
    await user.click(screen.getByRole('link', { name: zhTW.app.nav.notifications }));
    const list = screen.getByRole('dialog', { name: zhTW.app.nav.notifications });
    expect(within(list).getByText(zhTW.app.notifications.inviteExpired)).toBeInTheDocument();
    expect(screen.queryByText('Invite expired')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Notifications' })).toBeNull();
  });

  it('mark only the bell row read when one on an anonymous card is opened — no conversation, and offer no reply', async () => {
    const { user, list } = await openBell();
    await user.click(within(list).getAllByRole('link')[0]);
    expect(markNotificationRead).toHaveBeenCalledWith('n1');
    expect(markConversationRead).not.toHaveBeenCalled();
    // The row is the only way on: nothing in the list answers the writer.
    expect(screen.queryByRole('button', { name: /reply/i })).toBeNull();
  });
});

// Round 21: who did it on the left, the card it is about on the right, parts by time, no rules between rows.
describe('the bell’s faces, cards and parts', () => {
  const person = (id: string, extra: Partial<User> = {}): User => ({
    id, handle: id, region: 'TW', primaryLocale: 'en', autoTranslateTo: [], verified: false, phoneHash: '', avatarSeed: '3',
    initials: id.slice(0, 2).toUpperCase(), accentColor: 'oklch(85% 0.07 140)',
    joinedAt: new Date('2025-01-01'), handleChangedAt: new Date('2025-01-01'), ...extra,
  });
  const card = (id: string, extra: Partial<Card> = {}): Card => ({
    id, authorId: 'me', thoughtCore: 'Walk slower in the rain', story: '', tags: [], originalLocale: 'en', translations: {},
    visibility: 'public', publishedAt: new Date('2026-01-01'), readCount: 0, resonanceCount: 0, inviteCount: 0, ...extra,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('draw the sender’s photo, the card’s cover without a frame, and a coverless card’s first word', async () => {
    live.rows = [namedNote, bell('n6', 'resonance', { fromUserId: 'dan', fromHandle: 'dan', cardId: 'plain' })];
    live.extras = {
      people: { carol: person('carol', { avatarUrl: 'https://img.example/carol.webp' }) },
      cards: { walk: card('walk', { media: { type: 'image', url: 'https://img.example/walk.webp' } }), plain: card('plain', { thoughtCore: '雨天走慢一點' }) },
    };
    const { list } = await openBell();
    const [note, resonance] = within(list).getAllByRole('link');
    const pictures = [...note.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(pictures).toEqual(['https://img.example/carol.webp', 'https://img.example/walk.webp']);
    // The cover has no pen line round it: no drawn path in its tile.
    expect(note.querySelector('img[src$="walk.webp"]')!.parentElement!.querySelector('path')).toBeNull();
    // Dan's profile is gone: his initials; the card has no cover: its first character.
    expect(resonance).toHaveTextContent('DA');
    expect(resonance).toHaveTextContent('雨');
    expect(resonance.querySelectorAll('img')).toHaveLength(0);
  });

  it('leave out the card of a row whose card the viewer can no longer read, once the extras are in', async () => {
    live.rows = [namedResonance];
    live.extras = undefined;
    const user = userEvent.setup();
    const view = renderWithIntl(<NotificationBell />);
    await user.click(screen.getByRole('link', { name: 'Notifications' }));
    // Still reading: a quiet tile holds the card's place.
    expect(within(screen.getByRole('dialog')).getByRole('link').querySelector('[class*="thumbPending"]')).not.toBeNull();
    live.extras = { people: {}, cards: {} };
    view.rerender(<NotificationBell />);
    const row = within(screen.getByRole('dialog')).getByRole('link');
    expect(row.querySelector('[class*="thumbPending"]')).toBeNull();
    expect(row.querySelector('[class*="thumb"]')).toBeNull();
  });

  it('set the rows under today, this week and earlier, with no rules between them, and say unread with the dot alone', async () => {
    const now = Date.now();
    const ago = (days: number) => new Date(now - days * 86_400_000);
    live.rows = [
      { ...namedResonance, id: 'today', createdAt: new Date(now - 60_000) },
      { ...namedResonance, id: 'week', createdAt: ago(3), readAt: ago(2) },
      { ...namedResonance, id: 'old', createdAt: ago(30), readAt: ago(29) },
    ];
    live.extras = { people: {}, cards: {} };
    const { list } = await openBell();
    expect(within(list).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Today', 'This week', 'Earlier']);
    const [fresh, read] = within(list).getAllByRole('link');
    expect(fresh.querySelector('[data-unread-dot]')).not.toBeNull();
    expect(fresh).toHaveTextContent('1 min. ago');
    expect(within(fresh).getByText(', Unread')).toBeInTheDocument();
    expect(read.querySelector('[data-unread-dot]')).toBeNull();
    expect(read).toHaveTextContent('3 days ago');
    // No wavy rules between the rows any more.
    expect(list.querySelector('ul svg path[d^="M"][stroke-width="1.2"]')).toBeNull();
  });
});

// Round 23 §4: a phone's bell opens a page of its own (the apps' 通知 tab), wider a dialog over the page; and the rows
// are bands — touching, parted by curves seen only under a pointer or a press.
describe('the bell on a phone and wider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    live.rows = [namedNote, namedResonance];
    live.extras = { people: {}, cards: {} };
  });

  it('is a link to the bell’s page, which a phone follows — no dialog', async () => {
    windowWhere(BELL_PAGE_QUERY);
    const user = userEvent.setup();
    renderWithIntl(<NotificationBell />);
    const bellLink = screen.getByRole('link', { name: 'Notifications' });
    expect(bellLink).toHaveAttribute('href', '/notifications');
    await user.click(bellLink);
    expect(nav.followed).toEqual(['/notifications']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the dialog over the page wider, and leaves a click for a new tab to the link', () => {
    windowWhere(null);
    renderWithIntl(<NotificationBell />);
    const bellLink = screen.getByRole('link', { name: 'Notifications' });
    fireEvent.click(bellLink, { metaKey: true });
    expect(nav.followed).toEqual(['/notifications']);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(bellLink);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    expect(nav.followed).toEqual(['/notifications']);
  });

  it('says it is the page on its own page — its solid twin — and opens no dialog over it', () => {
    nav.path = '/notifications';
    windowWhere(null);
    renderWithIntl(<NotificationBell />);
    const bellLink = screen.getByRole('link', { name: 'Notifications' });
    expect(bellLink).toHaveAttribute('aria-current', 'page');
    fireEvent.click(bellLink);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('draws each row of the dialog as a band, nothing at rest', async () => {
    const { list } = await openBell();
    const rows = within(list).getAllByRole('link');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.querySelector('[data-band]')).not.toBeNull();
    // jsdom measures nothing, so no curve is drawn; and the band's fill is the row's `--band-fill`, transparent at rest.
    expect(list.querySelector('[data-band] path')).toBeNull();
    expect(list.querySelector('[data-band-pressed]')).toBeNull();
  });

  it('counts a row tapped in the dialog as read on the badge at once, before the listener hears it', async () => {
    const { user, list } = await openBell();
    expect(screen.getByRole('link', { name: 'Notifications' })).toHaveTextContent('2');
    await user.click(within(list).getAllByRole('link')[0]);
    expect(markNotificationRead).toHaveBeenCalledWith('n3');
    expect(screen.getByRole('link', { name: 'Notifications' })).toHaveTextContent('1');
  });
});

describe('bellParts', () => {
  const now = new Date('2026-10-10T12:00:00');
  const hoursAgo = (id: string, h: number): Notification => ({ ...bell(id, 'resonance', {}), createdAt: new Date(now.getTime() - h * 3_600_000) });

  it('gives each row the key of the curve under it: the next row’s, the next part’s title, the list’s end', () => {
    const parts = bellParts([hoursAgo('a', 1), hoursAgo('b', 2), hoursAgo('c', 72)], now);
    expect(parts.map((p) => p.group)).toEqual(['today', 'thisWeek']);
    expect(parts[0].rows.map((r) => [r.n.id, r.below])).toEqual([
      ['a', 'b'],
      ['b', 'part:thisWeek'],
    ]);
    expect(parts[1].rows.map((r) => [r.n.id, r.below])).toEqual([['c', 'bands:end']]);
  });

  it('moves no curve under the others when a notification arrives on top (keys, never places)', () => {
    const before = bellParts([hoursAgo('a', 1), hoursAgo('b', 2), hoursAgo('c', 3)], now)[0].rows;
    const after = bellParts([hoursAgo('z', 0.5), hoursAgo('a', 1), hoursAgo('b', 2), hoursAgo('c', 3)], now)[0].rows;
    expect(after.slice(1)).toEqual(before);
    expect(after[0].below).toBe('a');
  });
});

describe('bellHref', () => {
  it('leads a flagged row to its card, and a row without the flag where it always went', () => {
    expect(onAnonymousCard(anonymousNote)).toBe(true);
    expect(onAnonymousCard(namedNote)).toBe(false);
    // Only notes and resonances answer for a card's author: the flag on any other row changes nothing.
    expect(onAnonymousCard(bell('x', 'message', { fromHandle: 'bob', anonymous: true }))).toBe(false);
    expect(bellHref(bell('x', 'message', { fromHandle: 'bob', anonymous: true }))).toBe('/messages/bob');
    // Only `true` is the flag.
    expect(bellHref(bell('x', 'resonance', { fromHandle: 'bob', cardId: 'c', anonymous: 'true' }))).toBe('/messages/bob');
    // A flagged row whose card it can't name goes nowhere rather than to the thread.
    expect(bellHref(bell('x', 'note', { fromHandle: 'bob', anonymous: true }))).toBeNull();
  });

  it('keeps the other kinds where they led', () => {
    expect(bellHref(bell('x', 'invite', { fromHandle: 'bob' }))).toBe('/me');
    expect(bellHref(bell('x', 'invite_accepted', { fromHandle: 'bob' }))).toBe('/messages/bob');
    expect(bellHref(bell('x', 'card_link', { fromHandle: 'bob', cardId: 'c' }))).toBe('/card/c');
    expect(bellHref(bell('x', 'translation_done', { cardId: 'c' }))).toBe('/card/c');
    expect(bellHref(bell('x', 'resonance_summary', { count: 3 }))).toBeNull();
    // An older note bell, without the note's id: the thread, unquoted.
    expect(bellHref(bell('x', 'note', { fromHandle: 'bob', cardId: 'c' }))).toBe('/messages/bob');
    // No pen name to open a thread by: nowhere, never /messages/undefined.
    expect(bellHref(bell('x', 'message', {}))).toBeNull();
  });
});
