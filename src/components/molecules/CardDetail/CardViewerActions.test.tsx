// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useSWR, { SWRConfig } from 'swr';
import { act, renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import type { AuthorBody, CardTapBody } from '@/lib/api/v1/schemas';
import { cardPageKey } from '@/lib/data/hooks';
import { ReadAfterArea } from './ReadAfterArea';

/**
 * Round 26 §U1: the end of a story for a reader — the capsule's three answers (共振 · 寄小紙條 · 用卡片回應), all
 * tonal at rest, then its second line (the faces, 收藏), the note in place under it. Rendered through ReadAfterArea
 * (the card page's host) with the card page's one signed-in answer in SWR, as the page has it.
 */

const auth = vi.hoisted(() => ({ value: { user: { id: 'viewer' } as { id: string } | null, loading: false } }));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => auth.value }));
const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const toast = vi.hoisted(() => ({ show: vi.fn(), dismiss: vi.fn() }));
vi.mock('@/components/providers/ToastProvider', () => ({ useToast: () => toast }));
const mine = vi.hoisted(() => ({ value: null as unknown }));
const me = {
  id: 'viewer', handle: 'viewer-handle', initials: 'VI', accentColor: 'var(--accent)', avatarSeed: '4', verified: false, region: 'TW',
};
vi.mock('@/lib/data/hooks', async (original) => ({
  ...(await original<typeof import('@/lib/data/hooks')>()),
  useMyProfile: () => ({ data: me }),
  useMyResonance: () => ({ data: mine.value }),
  useMyCardBox: (shelf: string | null) => ({
    data: shelf ? { cards: [{ id: 'mine-1', thoughtCore: 'A card of mine', visibility: 'public', publishedAt: new Date() }], authors: {} } : undefined,
    mutate: vi.fn(),
  }),
}));
vi.mock('@/lib/data/cardPrefill', async (original) => ({ ...(await original<typeof import('@/lib/data/cardPrefill')>()), usePrefillCard: () => vi.fn() }));
const setTap = vi.fn((..._a: unknown[]) => Promise.resolve({ on: true, changed: true }));
vi.mock('@/lib/db/firestore/client/taps', () => ({ setTap: (...a: unknown[]) => setTap(...a), listTaps: vi.fn(() => new Promise(() => {})) }));
vi.mock('@/lib/db/firestore/client/notes', () => ({ sendNote: vi.fn(), NOTE_MAX_LENGTH: 2000 }));
const bookmarks = vi.hoisted(() => ({ saved: false }));
vi.mock('@/lib/db/firestore/client/bookmarks', () => ({
  isBookmarked: vi.fn(() => Promise.resolve(bookmarks.saved)),
  toggleBookmark: vi.fn(() => Promise.resolve(!bookmarks.saved)),
}));
vi.mock('@/lib/hints', () => ({ useHint: () => ({ visible: true, dismiss: vi.fn() }) }));

const author = { id: 'author-1', handle: 'bob', initials: 'BO', accentColor: 'var(--accent)' };
const face = (id: string): AuthorBody => ({ id, handle: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'var(--accent)', avatarUrl: null, avatarSeed: '3', verified: false, region: null });
const NO_TAPS: CardTapBody = { mine: false, faces: [], more: false, mayNote: true };

/** The card page as it holds the tap: its one signed-in answer in SWR, ReadAfterArea reading `tap` from it. */
function Page({ tap }: { tap: CardTapBody }) {
  const { data } = useSWR(cardPageKey('c1', 'viewer'), () => Promise.resolve({ resonances: { cards: [], authors: {} }, related: { cards: [], authors: {} }, links: { cards: [], authors: {} }, embeds: { cards: [], authors: {} }, tap }));
  return <ReadAfterArea cardId="c1" cardTitle="Title" author={author} tap={data?.tap} />;
}

function renderPage(tap: CardTapBody = NO_TAPS, opts: { locale?: 'en' | 'zh-TW' } = {}) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 60_000, revalidateOnFocus: false }}>
      <Page tap={tap} />
    </SWRConfig>,
    opts.locale === 'zh-TW' ? { locale: 'zh-TW', messages: zhMessages } : {},
  );
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const capsule = () => screen.getAllByRole('group')[0];

beforeEach(() => {
  auth.value = { user: { id: 'viewer' }, loading: false };
  mine.value = null;
  bookmarks.saved = false;
  localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

describe('the end row: three answers in one capsule (§U1)', () => {
  it('holds 共振, 寄小紙條 and 用卡片回應 in that order, all tonal at rest, in its own words', async () => {
    renderPage(NO_TAPS, { locale: 'zh-TW' });
    const buttons = within(capsule()).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['共振', '寄小紙條', '用卡片回應']);
    // A switch, not a verb: nothing solid until the tap is on.
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    for (const b of buttons) expect(b.style.color).toBe('var(--button-on-tonal)');
    await act(async () => {});
  });

  it('speaks English in its short words (Resonate / Note / Card), never 連結 or the link glyph', async () => {
    renderPage();
    expect(within(capsule()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Resonate', 'Note', 'Card']);
    const source = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/CardViewerActions.tsx'), 'utf8');
    expect(source).not.toMatch(/name="link"|'link'/);
    await act(async () => {});
  });

  it('keeps every segment when the words are too wide: short words first (寫卡片), then 共振 alone on a first line', async () => {
    // A segment's natural width in this test: 16 a character and 40 of padding and glyph; the row's room 280, then 250.
    let room = 280;
    const scroll = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-segment') ? [...(this.textContent ?? '')].length * 16 + 40 : 0;
    });
    const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-end-row') ? room : 0;
    });
    const first = renderPage(NO_TAPS, { locale: 'zh-TW' });
    expect(within(capsule()).getAllByRole('button').map((b) => b.textContent)).toEqual(['共振', '寄小紙條', '寫卡片']);
    await act(async () => {});
    first.unmount();

    room = 250;
    renderPage(NO_TAPS, { locale: 'zh-TW' });
    const [line1, line2] = screen.getAllByRole('group');
    expect(within(line1).getAllByRole('button').map((b) => b.textContent)).toEqual(['共振']);
    expect(within(line2).getAllByRole('button').map((b) => b.textContent)).toEqual(['寄小紙條', '寫卡片']);
    await act(async () => {});
    scroll.mockRestore();
    client.mockRestore();
  });

  it('tapping 共振 opens nothing: the segment fills (已共振, two waves) and the viewer’s face slides in first', async () => {
    const { container } = renderPage({ ...NO_TAPS, faces: [face('dora')] });
    await screen.findByRole('button', { name: /People you're connected with who resonated: dora/ });
    await user().click(within(capsule()).getByRole('button', { name: 'Resonate' }));

    const on = within(capsule()).getByRole('button', { name: 'Resonated' });
    expect(on).toHaveAttribute('aria-pressed', 'true');
    expect(on.style.color).toBe('var(--color-cream)');
    expect(setTap).toHaveBeenCalledWith('c1', true);
    // Nothing opened: no field, no dialog.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    const faces = [...container.querySelectorAll('[data-face]')].map((f) => f.getAttribute('data-face'));
    expect(faces).toEqual(['viewer', 'dora']);
    expect(container.querySelector('[data-face="viewer"]')).toHaveAttribute('data-arriving');
    // Taken back: the face slides out, the segment rests again.
    setTap.mockResolvedValueOnce({ on: false, changed: true });
    await user().click(on);
    expect(setTap).toHaveBeenLastCalledWith('c1', false);
    expect(within(capsule()).getByRole('button', { name: 'Resonate' })).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('[data-face="viewer"]')).toHaveAttribute('data-leaving');
  });

  it('puts a tap the server refused back, and says so', async () => {
    setTap.mockRejectedValueOnce(Object.assign(new Error('500'), { status: 500, code: 'internal' }));
    renderPage();
    await act(async () => {});
    await user().click(within(capsule()).getByRole('button', { name: 'Resonate' }));
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith({ message: "Didn't go through, try again" }));
    expect(within(capsule()).getByRole('button', { name: 'Resonate' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('asks for a pen name first when the server says there is none', async () => {
    setTap.mockRejectedValueOnce(Object.assign(new Error('403'), { status: 403, code: 'forbidden' }));
    renderPage();
    await act(async () => {});
    await user().click(within(capsule()).getByRole('button', { name: 'Resonate' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/signup'));
  });

  it('用卡片回應: the picker to write or choose a card; 修改 takes a draft back; 已回應 opens the published one', async () => {
    const first = renderPage();
    await user().click(within(capsule()).getByRole('button', { name: 'Card' }));
    expect(await screen.findByRole('dialog', { name: 'Reply with a card' })).toBeInTheDocument();
    first.unmount();

    mine.value = { id: 'draft-9', publishedAt: null };
    const second = renderPage();
    await user().click(within(capsule()).getByRole('button', { name: 'Edit' }));
    expect(push).toHaveBeenCalledWith('/write/draft-9');
    second.unmount();

    mine.value = { id: 'mine-9', slug: 'my-answer', publishedAt: new Date(), anonymous: false, authorId: 'viewer' };
    renderPage();
    const done = within(capsule()).getByRole('button', { name: 'Replied' });
    expect(done.querySelector('svg')).not.toBeNull();
    await user().click(done);
    expect(push).toHaveBeenCalledWith('/card/my-answer');
  });

  it('keeps the order 共振 → 寄小紙條 → 用卡片回應 → faces → 收藏 for the keyboard', async () => {
    renderPage({ ...NO_TAPS, faces: [face('dora'), face('eli')] });
    const faces = await screen.findByRole('button', { name: /who resonated/ });
    const order = [...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(order.slice(0, 5)).toEqual(['Resonate', 'Note', 'Card', faces.getAttribute('aria-label'), 'Bookmark']);
  });

  it('saves to the box from the second line’s end: a glyph alone, pressed while saved, and says so', async () => {
    renderPage();
    const save = await screen.findByRole('button', { name: 'Bookmark' });
    expect(save).toHaveAttribute('aria-pressed', 'false');
    expect(save.textContent).toBe('');
    await user().click(save);
    expect(toast.show).toHaveBeenCalledWith({ message: 'Saved to your box' });
    expect(await screen.findByRole('button', { name: 'Remove bookmark' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('signed out: the three go to sign-in, and the second line keeps only what needs no account', async () => {
    auth.value = { user: null, loading: false };
    renderPage();
    for (const name of ['Resonate', 'Note', 'Card']) {
      await user().click(within(capsule()).getByRole('button', { name }));
      expect(push).toHaveBeenLastCalledWith('/signin');
    }
    expect(screen.queryByRole('button', { name: 'Bookmark' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('is nothing at all for the card’s author', async () => {
    auth.value = { user: { id: 'author-1' }, loading: false };
    renderPage();
    expect(screen.queryByRole('button')).toBeNull();
    await act(async () => {});
  });

  it('marks the capsule for the paper puppets, never the lines under it', async () => {
    renderPage();
    const mark = document.querySelector('[data-mascot="respond"]')!;
    // lib/mascots/reading measures the first group in the mark: the capsule.
    expect(mark.querySelector('[role="group"]')).toBe(capsule());
    await act(async () => {});
  });
});
