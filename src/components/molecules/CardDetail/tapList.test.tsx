// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import { act, renderWithIntl, screen, userEvent, within } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import type { AuthorBody, CardTapBody, TapListBody, TapPersonBody } from '@/lib/api/v1/schemas';
import { AuthorTaps } from './AuthorTaps';
import { PickedPeople } from './PickedPeople';
import { TapFaces } from './TapFaces';
import { TapPassages } from './TapPassages';
import { TAP_DIALOG_PADDING, TAP_LIST_HOLD_MS, tapRowsKnown } from './tapList';

/**
 * Round 33 — the tap dialogs' family (who resonated, the reader's and the author's; who picked one sentence; the
 * passages' dialog), as one: §Q1 each list opens at its final height (the hold, then as many stand-ins as the faces
 * already on the page — the owner: 「谁共振了」弹窗仍有高度闪动), §Q2 its rows to the paper's edges on a 24 inset, the
 * faces on the title's edge, §Q3 its way out the tonal pill floating over the region's foot, no footer under it.
 */

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, onClick }: { href: string; children: ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={(e) => (e.preventDefault(), onClick?.())}>
      {children}
    </a>
  ),
}));
const listTaps = vi.fn((..._a: unknown[]): Promise<TapListBody> => Promise.resolve({ people: [], nextPageToken: null }));
vi.mock('@/lib/db/firestore/client/taps', () => ({ listTaps: (...a: unknown[]) => listTaps(...a) }));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'alice' } }) }));

const face = (id: string): AuthorBody => ({ id, handle: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: null });
const person = (id: string, note?: string): TapPersonBody => ({ author: face(id), note: note ? { excerpt: note } : null, passage: { text: '雨停的時候，巷口的燈先亮了。' } });
const tapOf = (ids: string[], more = false): CardTapBody => ({ mine: false, faces: ids.map(face), more, mayNote: true });
const NAMES = ['gus', 'bob', 'carol'];

const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
const wrap = (node: ReactNode) => <SWRConfig value={{ provider: () => new Map() }}>{node}</SWRConfig>;

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});
afterEach(() => vi.clearAllMocks());

/** Each list of the family, opened as a reader or the author opens it, over `n` people's faces. */
const LISTS: [string, (n: number) => Promise<void>][] = [
  [
    'who resonated (the reader’s)',
    async (n) => {
      renderWithIntl(wrap(<TapFaces cardId="c1" tap={tapOf(NAMES.slice(0, n))} viewerId="alice" />), { locale: 'zh-TW', messages: zhMessages });
      await user().click(screen.getByRole('button'));
    },
  ],
  [
    'who resonated (the author’s)',
    async (n) => {
      renderWithIntl(wrap(<AuthorTaps cardId="c1" tap={tapOf(NAMES.slice(0, n))} />), { locale: 'zh-TW', messages: zhMessages });
      await user().click(screen.getByRole('button'));
    },
  ],
  [
    'who picked this sentence',
    async (n) => {
      renderWithIntl(
        wrap(<PickedPeople cardId="c1" passage={{ id: 'p1', text: '雨停的時候。', people: NAMES.slice(0, n).map(face), more: false }} script="cjk" onClose={vi.fn()} />),
        { locale: 'zh-TW', messages: zhMessages },
      );
    },
  ],
];

/** Records whether a stand-in row (the lists' `role="status"`) was ever put in the page. */
function watchStandIns() {
  let seen = false;
  const mo = new MutationObserver(() => {
    if (document.querySelector('[role="dialog"] [role="status"]')) seen = true;
  });
  mo.observe(document.body, { childList: true, subtree: true });
  return { seen: () => seen, stop: () => mo.disconnect() };
}

describe('the tap dialogs’ family (round 33)', () => {
  describe.each(LISTS)('%s', (_, open) => {
    // §Q1: an answer inside the hold opens the dialog whole — no stand-in ever drawn, so its first frame is its last.
    it.each([1, 2, 3])('opens whole for %i people when the page comes inside the hold: never a stand-in', async (n) => {
      listTaps.mockResolvedValue({ people: NAMES.slice(0, n).map((id, i) => person(id, i === 1 ? '讀到這裡停了很久。' : undefined)), nextPageToken: null });
      const watch = watchStandIns();
      await open(n);
      const dialog = await screen.findByRole('dialog');
      expect(await within(dialog).findAllByRole('link')).toHaveLength(n);
      expect(watch.seen()).toBe(false);
      watch.stop();
    });

    // §Q1: slower, it waits the hold (nothing drawn), then opens on exactly the faces' count of stand-ins — in the
    // rows' own region, the rows' own list — and the people take their places.
    it.each([1, 2, 3])('past the hold, opens on %i stand-ins — the faces already known — in the rows’ region', async (n) => {
      let answer: (b: TapListBody) => void = () => {};
      listTaps.mockReturnValue(new Promise((r) => (answer = r)));
      await open(n);
      expect(screen.queryByRole('dialog')).toBeNull();
      const dialog = await screen.findByRole('dialog', {}, { timeout: TAP_LIST_HOLD_MS + 500 });
      const stand = within(dialog).getByRole('status');
      expect(stand.querySelectorAll(':scope > li')).toHaveLength(n);
      expect(stand.closest('[class*="scrollBody"]')).not.toBeNull();
      await act(async () => answer({ people: NAMES.slice(0, n).map((id) => person(id)), nextPageToken: null }));
      const links = await within(dialog).findAllByRole('link');
      expect(links).toHaveLength(n);
      expect(links[0].closest('ul')!.className).toBe(stand.className);
    });

    // §Q2 + §Q3: the family's paper, and its 關閉 the tonal pill floating over the region's foot — beside what
    // scrolls, in the region's own box, so it never moves with the rows — with no foot row under the region.
    it('stands on the family’s paper, 關閉 the tonal pill floating over the region’s foot', async () => {
      listTaps.mockResolvedValue({ people: [person('gus')], nextPageToken: null });
      await open(1);
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findAllByRole('link');
      expect(dialog.style.padding).toBe('24px 24px 0px');
      const close = within(dialog).getByRole('button', { name: '關閉' });
      expect(close).toHaveAttribute('data-variant', 'tonal');
      const area = close.closest('[data-float-close]')!;
      expect(area).not.toBeNull();
      const body = area.querySelector('[class*="scrollBody"]')!;
      expect(body.contains(close)).toBe(false);
      expect(body.querySelectorAll('a')).toHaveLength(1);
      // Nothing after the region: no footer (the old ModalCloseRow), no hidden second close.
      expect(dialog.querySelector('[class*="closeRow"]')).toBeNull();
      expect(within(dialog).getAllByRole('button', { name: '關閉' })).toHaveLength(1);
    });
  });

  it('略過 is the same floating pill as 關閉 (the passages’ dialog)', async () => {
    renderWithIntl(<TapPassages passages={[{ id: 'a', text: '一句。' }, { id: 'b', text: '兩句。' }]} picked={null} onPick={vi.fn()} onClose={vi.fn()} />, {
      locale: 'zh-TW',
      messages: zhMessages,
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.style.padding).toBe('24px 24px 0px');
    const skip = within(dialog).getByRole('button', { name: '略過' });
    expect(skip).toHaveAttribute('data-variant', 'tonal');
    expect(skip.parentElement).toHaveAttribute('data-float-close-button');
    expect(dialog.querySelector('[class*="closeRow"]')).toBeNull();
  });

  it('knows its rows from the faces on the page: at most 3, at least 1, 3 when there are others, never a default', () => {
    expect(tapRowsKnown({ people: [1], more: false })).toBe(1);
    expect(tapRowsKnown({ people: [1, 2], more: false })).toBe(2);
    expect(tapRowsKnown({ people: [1, 2, 3, 4], more: true })).toBe(3);
    expect(tapRowsKnown({ people: [], more: true })).toBe(3);
    expect(tapRowsKnown({ people: null, more: false })).toBe(1);
  });

  it('pins the measures (§Q2, §Q3): 24 a side, no row indent, the pill 44 tall 16 over the paper’s edge on the words’ end, its room and the fade under it', () => {
    expect(TAP_DIALOG_PADDING).toBe('24px 24px 0');
    for (const [f, sel] of [
      ['TapFaces', '.list'],
      ['AuthorTaps', '.dialog'],
      ['PickedPeople', '.picked'],
      ['TapPassages', '.body'],
    ] as const) {
      const css = read(`src/components/molecules/CardDetail/${f}.module.css`);
      const block = css.match(new RegExp(`\\${sel} \\{([^}]*)\\}`))?.[1] ?? '';
      expect(block, f).toMatch(/--dialog-pad-x: 24px;/);
      expect(block, f).toMatch(/--dialog-row-indent: 0px;/);
    }
    const bell = read('src/components/sections/AppHeader/NotificationBell.module.css');
    // The rows' indent past the paper's padding: 8 for the bell (unchanged), 0 in the family.
    expect(bell).toMatch(/--bell-inset: calc\(var\(--bell-bleed\) \+ var\(--dialog-row-indent, 8px\)\);/);
    expect(bell).toMatch(/\.scrollArea\[data-float-close\] \{[^}]*--float-close-h: 44px;[^}]*--float-close-room: calc\(var\(--float-close-h\) \+ 16px\);/);
    expect(bell).toMatch(/\.scrollArea\[data-float-close\] > \.scrollBody \{[^}]*padding-bottom: var\(--float-close-room\);[^}]*--edge-fade-clear: 16px;[^}]*--edge-fade-len: calc\(var\(--float-close-room\) \+ 16px\);/);
    expect(bell).toMatch(/\.floatClose \{[^}]*position: absolute;[^}]*right: calc\(var\(--bell-inset-end\) - var\(--bell-bleed\)\);[^}]*bottom: 16px;/);
    expect(bell).toMatch(/\.floatClose > button \{[^}]*min-height: var\(--float-close-h\);/);
    // The fade's passage reads the list's own lengths (16 elsewhere, as before).
    const globals = read('src/styles/globals.css');
    expect(globals).toMatch(/\[data-edge-fade-bottom\] \{[^}]*linear-gradient\(to top, transparent var\(--edge-fade-clear, 0px\), #000 var\(--edge-fade-len, 16px\)\)/);
  });
});
