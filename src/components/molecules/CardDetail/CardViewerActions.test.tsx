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
import { CardBookmark } from './CardBookmark';
import { ReadAfterArea } from './ReadAfterArea';

/**
 * Round 26 §U1: the end of a story for a reader — the capsule's three answers (共振 · 寄小紙條 · 用卡片回應), all
 * tonal at rest, its row ended by the card's passive actions (收藏, as the page hands them over wherever the capsule
 * stands at its own width — the owner, 2026-11-21), the faces' line right above it and the note in place right under
 * it (round 30 — the owner, 2026-11-22: 「把共振…使用者头像，把它移到共振按钮的上方」). Rendered
 * through ReadAfterArea (the card page's host) with the card page's one signed-in answer in SWR, as the page has it.
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
/** The reader's own profile as useMyProfile has it: undefined while it is read. */
let profile: unknown = me;
vi.mock('@/lib/data/hooks', async (original) => ({
  ...(await original<typeof import('@/lib/data/hooks')>()),
  useMyProfile: () => ({ data: profile }),
  useMyResonance: () => ({ data: mine.value }),
  useMyCardBox: (shelf: string | null) => ({
    data: shelf ? { cards: [{ id: 'mine-1', thoughtCore: 'A card of mine', visibility: 'public', publishedAt: new Date() }], authors: {} } : undefined,
    mutate: vi.fn(),
  }),
}));
vi.mock('@/lib/data/cardPrefill', async (original) => ({ ...(await original<typeof import('@/lib/data/cardPrefill')>()), usePrefillCard: () => vi.fn() }));
const setTap = vi.fn((..._a: unknown[]) => Promise.resolve({ on: true, changed: true }));
const setTapPassage = vi.fn((..._a: unknown[]): Promise<{ passage: string | null }> => Promise.resolve({ passage: null }));
const listTaps = vi.fn((..._a: unknown[]): Promise<unknown> => new Promise(() => {}));
vi.mock('@/lib/db/firestore/client/taps', () => ({
  setTap: (...a: unknown[]) => setTap(...a),
  setTapPassage: (...a: unknown[]) => setTapPassage(...a),
  listTaps: (...a: unknown[]) => listTaps(...a),
}));
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
function Page({ tap, translated }: { tap: CardTapBody; translated?: boolean }) {
  const { data } = useSWR(cardPageKey('c1', 'viewer'), () => Promise.resolve({ resonances: { cards: [], authors: {} }, related: { cards: [], authors: {} }, links: { cards: [], authors: {} }, embeds: { cards: [], authors: {} }, tap }));
  return <ReadAfterArea cardId="c1" cardTitle="Title" author={author} tap={data?.tap} translated={translated} trailing={<CardBookmark cardId="c1" />} />;
}

const pageTree = (tap: CardTapBody, cache = new Map(), translated?: boolean) => (
  <SWRConfig value={{ provider: () => cache, dedupingInterval: 60_000, revalidateOnFocus: false }}>
    <Page tap={tap} translated={translated} />
  </SWRConfig>
);

function renderPage(tap: CardTapBody = NO_TAPS, opts: { locale?: 'en' | 'zh-TW'; translated?: boolean } = {}) {
  return renderWithIntl(pageTree(tap, new Map(), opts.translated), opts.locale === 'zh-TW' ? { locale: 'zh-TW', messages: zhMessages } : {});
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const capsule = () => screen.getAllByRole('group')[0];

beforeEach(() => {
  auth.value = { user: { id: 'viewer' }, loading: false };
  profile = me;
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

  it('shortens its words before what ends its row would wrap: the room is the row less 收藏 and the 12 before it', async () => {
    // Full words need 40×3 + 16×11 = 296, the short ones 264; the row is 341 wide, 收藏 36: 341 − 48 = 293 of room.
    const offset = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-segment')) return [...(this.textContent ?? '')].length * 16 + 40;
      return this.className?.toString().includes('ends') ? 36 : 0;
    });
    const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-end-row') ? 341 : 0;
    });
    renderPage(NO_TAPS, { locale: 'zh-TW' });
    expect(within(capsule()).getAllByRole('button').map((b) => b.textContent)).toEqual(['共振', '寄小紙條', '寫卡片']);
    expect(screen.getAllByRole('group')).toHaveLength(1);
    await act(async () => {});
    offset.mockRestore();
    client.mockRestore();
  });

  it('says the short words (寫卡片) on a narrow row — 340 of content or less — even when the full ones would fit', async () => {
    // Every segment measures nothing here, so only the row's own width can choose: a 375 phone's 335, then 341.
    let room = 335;
    const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-end-row') ? room : 0;
    });
    const first = renderPage(NO_TAPS, { locale: 'zh-TW' });
    expect(within(capsule()).getAllByRole('button').map((b) => b.textContent)).toEqual(['共振', '寄小紙條', '寫卡片']);
    await act(async () => {});
    first.unmount();

    room = 341;
    renderPage(NO_TAPS, { locale: 'zh-TW' });
    expect(within(capsule()).getAllByRole('button').map((b) => b.textContent)).toEqual(['共振', '寄小紙條', '用卡片回應']);
    await act(async () => {});
    client.mockRestore();
  });

  it('tapping 共振 opens nothing: the segment fills (two waves, its words unchanged) and the viewer’s face slides in first', async () => {
    const { container } = renderPage({ ...NO_TAPS, faces: [face('dora')] });
    await screen.findByRole('button', { name: /Resonated with this card: dora/ });
    await user().click(within(capsule()).getByRole('button', { name: 'Resonate' }));

    // Its words stay (the owner, 2026-11-20: 已共振 moved the wave beside it): on is told by aria-pressed and the face.
    const on = within(capsule()).getByRole('button', { name: 'Resonate' });
    expect(on).toHaveAttribute('aria-pressed', 'true');
    expect(within(capsule()).queryByRole('button', { name: 'Resonated' })).toBeNull();
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

  it('asks a reader with no pen name for one before a note is written — never a field, never 紙條寄出了', async () => {
    profile = { ...me, handle: '' };
    renderPage();
    await act(async () => {});
    await user().click(within(capsule()).getByRole('button', { name: 'Note' }));
    expect(push).toHaveBeenCalledWith('/signup');
    expect(document.querySelector('[data-note-field]')).toBeNull();
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('waits for the reader’s own profile before the tap: one still being read is not "no pen name"', async () => {
    profile = undefined;
    renderPage();
    await act(async () => {});
    await user().click(within(capsule()).getByRole('button', { name: 'Resonate' }));
    expect(push).not.toHaveBeenCalled();
    expect(setTap).not.toHaveBeenCalled();
    // The note opens meanwhile (its send asks for a pen name if the server says there is none).
    await user().click(within(capsule()).getByRole('button', { name: 'Note' }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Send the author a little note' })).toBeInTheDocument();
  });

  it('gives another account signed in from another tab an end row of its own — never the last one’s unsent words', async () => {
    const cache = new Map();
    const page = renderWithIntl(pageTree(NO_TAPS, cache));
    await user().click(within(capsule()).getByRole('button', { name: 'Note' }));
    await user().type(screen.getByRole('textbox', { name: 'Send the author a little note' }), 'secret');
    // Signed out in the other tab (its drafts leave with it), then someone else signed in there: this tab follows.
    auth.value = { user: null, loading: false };
    page.rerender(pageTree(NO_TAPS, cache));
    localStorage.clear();
    auth.value = { user: { id: 'other' }, loading: false };
    page.rerender(pageTree(NO_TAPS, cache));
    expect(screen.queryByDisplayValue('secret')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    await user().click(within(capsule()).getByRole('button', { name: 'Note' }));
    expect(screen.getByRole('textbox', { name: 'Send the author a little note' })).toHaveValue('');
    expect(localStorage.getItem('resonance:note-drafts:other') ?? '').not.toContain('secret');
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

  it('keeps the order faces → 共振 → 寄小紙條 → 用卡片回應 → 收藏 for the keyboard: the faces’ line, then the capsule’s row under it', async () => {
    renderPage({ ...NO_TAPS, faces: [face('dora'), face('eli')] });
    const faces = await screen.findByRole('button', { name: /Resonated with this card/ });
    const order = [...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(order.slice(0, 5)).toEqual([faces.getAttribute('aria-label'), 'Resonate', 'Note', 'Card', 'Bookmark']);
  });

  it('stands the faces’ line right above the capsule’s row, and the note right under the capsule: nothing between a button and what it opens', async () => {
    renderPage({ ...NO_TAPS, faces: [face('dora')] });
    const faces = await screen.findByRole('button', { name: /Resonated with this card/ });
    const line = faces.closest('[class*="facesLine"]') as HTMLElement;
    // The line, then the capsule's row, in one end row…
    expect(line.nextElementSibling).toContainElement(capsule());
    expect(line.nextElementSibling?.nextElementSibling).toBeNull();
    // …which starts 24 closer to what stands above it than the capsule alone does (CSS: `.container[data-faces-line]`).
    const endRow = document.querySelector('[data-end-row]') as HTMLElement;
    expect(endRow).toHaveAttribute('data-faces-line');
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/CardViewerActions.module.css'), 'utf8');
    expect(css).toMatch(/\.container\[data-faces-line\]\s*\{\s*margin-top: -24px;\s*\}/);
    // The open note is the very next thing after the end row's two lines.
    await user().click(within(capsule()).getByRole('button', { name: 'Note' }));
    const field = await screen.findByRole('textbox', { name: 'Send the author a little note' });
    expect(line.parentElement?.nextElementSibling).toContainElement(field);
  });

  it('ends the capsule’s row with what the page hands it, and keeps the faces’ line for the faces alone', async () => {
    renderPage({ ...NO_TAPS, faces: [face('dora')] });
    const save = await screen.findByRole('button', { name: 'Bookmark' });
    // In the capsule's own row, after it — never on the line under it.
    expect(save.closest('[class*="ends"]')?.previousElementSibling).toContainElement(capsule());
    const faces = await screen.findByRole('button', { name: /Resonated with this card/ });
    expect(faces.closest('[class*="facesLine"]')?.querySelectorAll('button')).toHaveLength(1);
  });

  it('keeps the faces’ line for a signed-in reader with no face on it, so theirs slides in without moving the capsule', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Bookmark' });
    expect(document.querySelector('[class*="facesLine"]')).not.toBeNull();
  });

  it('saves to the box from the capsule row’s end: a glyph alone, pressed while saved, and says so', async () => {
    renderPage();
    const save = await screen.findByRole('button', { name: 'Bookmark' });
    expect(save).toHaveAttribute('aria-pressed', 'false');
    expect(save.textContent).toBe('');
    await user().click(save);
    expect(toast.show).toHaveBeenCalledWith({ message: 'Saved to your box' });
    expect(await screen.findByRole('button', { name: 'Remove bookmark' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('signed out: the three go to sign-in, with no 收藏 and no faces’ line', async () => {
    auth.value = { user: null, loading: false };
    renderPage();
    for (const name of ['Resonate', 'Note', 'Card']) {
      await user().click(within(capsule()).getByRole('button', { name }));
      expect(push).toHaveBeenLastCalledWith('/signin');
    }
    expect(screen.queryByRole('button', { name: 'Bookmark' })).toBeNull();
    expect(document.querySelector('[class*="facesLine"]')).toBeNull();
    // …so the capsule stays where it stood: the end row is not pulled up.
    expect(document.querySelector('[data-end-row]')).not.toHaveAttribute('data-faces-line');
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

describe('the faces over 共振 (round 29 §S11; the owner, 2026-11-22: centred on its segment — above the capsule since round 30)', () => {
  const css = (f: string) => readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail', f), 'utf8');
  it.each([1, 2, 3])('stand with their centre on the 共振 segment’s centre, not at the line’s start — %i face(s)', async (n) => {
    const original = Element.prototype.getBoundingClientRect;
    const box = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 44, height: 44, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      // The row starts at 16; the 共振 segment runs from 16 to 136 — its centre 60 from the line's start.
      if (this.hasAttribute('data-end-faces-line')) return box(16, 560);
      if (this.tagName === 'BUTTON' && this.parentElement?.getAttribute('role') === 'group' && this.textContent?.includes('Resonate')) return box(16, 120);
      return original.call(this);
    };
    try {
      const { container } = renderPage({ ...NO_TAPS, faces: ['dora', 'eli', 'fay'].slice(0, n).map(face) });
      await screen.findByRole('button', { name: /Resonated with this card/ });
      const slot = container.querySelector<HTMLElement>('[data-tap-centred]');
      expect(slot).not.toBeNull();
      expect(slot!.style.getPropertyValue('--tap-centre')).toBe('60px');
      expect(slot!.querySelectorAll('[data-face]')).toHaveLength(n);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
    // The slot is twice the centre wide with the group centred in it (wider, it starts at the content's edge); the
    // group is centred in its own button too, whatever its count.
    expect(css('CardViewerActions.module.css')).toMatch(/\.faces\[data-tap-centred\] \{[^}]*justify-content: center;[^}]*min-width: calc\(var\(--tap-centre\) \* 2\);[^}]*padding-inline-start: 0;/);
    expect(css('TapFaces.module.css')).toMatch(/\.faces \{[^}]*justify-content: center;/);
  });
});

describe('which part (round 27 §U1): the passages’ dialog after a press that turns 共振 on', () => {
  const PASSAGES = [
    { id: '14fecaaf', text: 'The rain stopped and the lamp at the corner came on first.' },
    { id: '8b3a1c4d', text: 'I gave the old keys back and wiped every window anyway.' },
    { id: '85007cbf', text: 'I wanted to walk this part of the road more slowly.' },
  ];
  const WITH: CardTapBody = { ...NO_TAPS, passages: PASSAGES, passage: null };
  const dialog = () => screen.findByRole('dialog', { name: 'Which part stayed with you' });
  const press = async () => {
    await act(async () => {});
    await user().click(within(capsule()).getByRole('button', { name: 'Resonate' }));
  };
  const row = (d: HTMLElement, id: string) => d.querySelector<HTMLButtonElement>(`[data-passage="${id}"]`)!;

  it('opens a moment after the press that turns it on — the tap on from the press — and not when it is taken back', async () => {
    renderPage(WITH);
    await press();
    // The tap is on at once; the dialog waits for the segment to fill.
    expect(within(capsule()).getByRole('button', { name: 'Resonate' })).toHaveAttribute('aria-pressed', 'true');
    expect(setTap).toHaveBeenCalledWith('c1', true);
    expect(screen.queryByRole('dialog')).toBeNull();
    const d = await dialog();
    expect([...d.querySelectorAll('[data-passage]')].map((r) => r.textContent)).toEqual(PASSAGES.map((p) => p.text));

    // 略過: the tap stays on, no passage sent.
    await user().click(within(d).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(capsule()).getByRole('button', { name: 'Resonate' })).toHaveAttribute('aria-pressed', 'true');
    expect(setTapPassage).not.toHaveBeenCalled();

    // Taken back: nothing opens.
    setTap.mockResolvedValueOnce({ on: false, changed: true });
    await user().click(within(capsule()).getByRole('button', { name: 'Resonate' }));
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole('dialog')).toBeNull();
    // On again: it asks again (every press that turns it on, SETTLED 2).
    await user().click(within(capsule()).getByRole('button', { name: 'Resonate' }));
    await dialog();
  });

  it('never opens with fewer than two passages, nor while the story is shown in translation', async () => {
    const one = renderPage({ ...NO_TAPS, passages: [PASSAGES[0]] });
    await press();
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole('dialog')).toBeNull();
    one.unmount();

    const none = renderPage(NO_TAPS);
    await press();
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole('dialog')).toBeNull();
    none.unmount();

    renderPage(WITH, { translated: true });
    await press();
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(setTap).toHaveBeenLastCalledWith('c1', true);
  });

  it('loads the dialog only on its first open: nothing of TapPassages is imported up front (its dynamic split kept)', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/CardViewerActions.tsx'), 'utf8');
    expect(source).not.toMatch(/^import[^;]*from '\.\/TapPassages';/m);
    expect(source).toMatch(/dynamic\(\(\) => import\('\.\/TapPassages'\)/);
  });

  it('a translation arriving while it is open closes it for good: the original on screen again opens nothing unpressed', async () => {
    // The auto-translation lands after the press (TranslateLine starts it on mount): the dialog leaves, and going back
    // to the original must not bring it back (§U1.1: only a press that turns 共振 on, or the reader's own row).
    const cache = new Map();
    const page = renderWithIntl(pageTree(WITH, cache));
    await press();
    await dialog();
    page.rerender(pageTree(WITH, cache, true));
    await waitFor(() => expect(document.querySelector('[data-tap-passages]')).toBeNull());
    page.rerender(pageTree(WITH, cache, false));
    await new Promise((r) => setTimeout(r, 400));
    expect(document.querySelector('[data-tap-passages]')).toBeNull();
    expect(within(capsule()).getByRole('button', { name: 'Resonate' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a translation arriving inside the 240 ms after the press stops its timer: nothing opens once the original is back', async () => {
    const cache = new Map();
    const page = renderWithIntl(pageTree(WITH, cache));
    await press();
    page.rerender(pageTree(WITH, cache, true));
    await new Promise((r) => setTimeout(r, 400));
    page.rerender(pageTree(WITH, cache, false));
    await new Promise((r) => setTimeout(r, 400));
    expect(document.querySelector('[data-tap-passages]')).toBeNull();
  });

  it('sends the pick only after the tap’s own PUT has answered, the row chosen at once', async () => {
    let answer: (v: { on: boolean; changed: boolean }) => void = () => {};
    setTap.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    renderPage(WITH);
    await press();
    const d = await dialog();
    await user().click(row(d, '8b3a1c4d'));
    expect(row(d, '8b3a1c4d')).toHaveAttribute('aria-pressed', 'true');
    expect(setTapPassage).not.toHaveBeenCalled();
    await act(async () => answer({ on: true, changed: true }));
    await waitFor(() => expect(setTapPassage).toHaveBeenCalledWith('c1', '8b3a1c4d'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('a 400 or 409 on the pick closes quietly — no toast; anything else says so and the tap stays on', async () => {
    setTapPassage.mockRejectedValueOnce(Object.assign(new Error('400'), { status: 400, code: 'invalid_request' }));
    const first = renderPage(WITH);
    await press();
    await user().click(row(await dialog(), '14fecaaf'));
    await waitFor(() => expect(setTapPassage).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toast.show).not.toHaveBeenCalled();
    first.unmount();

    setTapPassage.mockRejectedValueOnce(Object.assign(new Error('500'), { status: 500, code: 'internal' }));
    renderPage(WITH);
    await press();
    await user().click(row(await dialog(), '14fecaaf'));
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith({ message: "Didn't go through, try again" }));
    expect(within(capsule()).getByRole('button', { name: 'Resonate' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the tap’s PUT failing closes the dialog and puts the tap back, as today', async () => {
    let fail: (e: unknown) => void = () => {};
    setTap.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    renderPage(WITH);
    await press();
    await dialog();
    await act(async () => fail(Object.assign(new Error('500'), { status: 500, code: 'internal' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toast.show).toHaveBeenCalledWith({ message: "Didn't go through, try again" });
    expect(within(capsule()).getByRole('button', { name: 'Resonate' })).toHaveAttribute('aria-pressed', 'false');
    expect(setTapPassage).not.toHaveBeenCalled();
  });

  it('reopens from the reader’s own row with their pick marked; the faces are a button even when theirs is alone', async () => {
    listTaps.mockResolvedValue({ people: [{ author: face('viewer'), note: null, passage: { text: PASSAGES[1].text } }], nextPageToken: null });
    renderPage({ ...WITH, mine: true, faces: [face('viewer')], passage: '8b3a1c4d' });
    await act(async () => {});
    await user().click(screen.getByRole('button', { name: 'You resonated' }));
    const list = await screen.findByRole('dialog');
    const own = await within(list).findByText(`“${PASSAGES[1].text}”`);
    await user().click(own.closest('button')!);
    const d = await dialog();
    expect(row(d, '8b3a1c4d')).toHaveAttribute('aria-pressed', 'true');
    // Pressing it again clears the pick.
    await user().click(row(d, '8b3a1c4d'));
    await waitFor(() => expect(setTapPassage).toHaveBeenCalledWith('c1', null));
    listTaps.mockReset();
    listTaps.mockImplementation(() => new Promise(() => {}));
  });
});
