// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import zhMessages from '@/messages/zh-TW.json';
import { renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import type { AuthorBody, TapListBody, TapPersonBody } from '@/lib/api/v1/schemas';
import { PickedPeople } from './PickedPeople';

/**
 * Round 29 §S4: who resonated with one sentence of the author's story — a centred dialog in the who-resonated
 * dialog's shell and widths: its title, the sentence once, then that sentence's people newest first (a face 36, the
 * pen name, the note's first lines), no quote under each name, 顯示更多 for the next page, 關閉 at its foot.
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

const face = (id: string): AuthorBody => ({ id, handle: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: null });
const SENTENCE = '箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。';
const person = (id: string, note?: string): TapPersonBody => ({ author: face(id), note: note ? { excerpt: note } : null, passage: { text: SENTENCE } });

function phone(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('max-width: 720px'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function open(onClose = vi.fn(), zh = true) {
  renderWithIntl(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PickedPeople cardId="rich-story" passage={{ id: 'a1b2c3d4', text: SENTENCE }} script="cjk" onClose={onClose} />
    </SWRConfig>,
    zh ? { locale: 'zh-TW', messages: zhMessages } : undefined,
  );
  return onClose;
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 });
afterEach(() => vi.clearAllMocks());

describe('PickedPeople', () => {
  it.each([
    ['a phone', true, 'min(400px, calc(100vw - 32px))'],
    ['a wide screen', false, '480px'],
  ])('is a centred dialog on %s: its title, the sentence once, its people newest first with no quote under each name', async (_, onPhone, width) => {
    phone(onPhone);
    listTaps.mockResolvedValueOnce({ people: [person('gus'), person('bob', '讀到這裡停了很久。')], nextPageToken: null });
    open();
    const dialog = await screen.findByRole('dialog', { name: '對這一段有共鳴的人' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.style.maxWidth).toBe(width);
    expect(dialog.querySelector('[data-tap-picked]')).not.toBeNull();
    expect(within(dialog).getByRole('heading', { name: '對這一段有共鳴的人' })).toBeInTheDocument();
    // The sentence once, in full, as the passages' quote — and never again under a name.
    expect(within(dialog).getAllByText(`「${SENTENCE}」`)).toHaveLength(1);
    const rows = await within(dialog).findAllByRole('link');
    expect(rows.map((r) => r.textContent)).toEqual(['GUgus', 'BObob讀到這裡停了很久。']);
    expect(dialog.querySelector('[data-tap-quote]')).toBeNull();
    // A row leads where the same person's row of the author's list leads: their note's conversation, else their page.
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/u/gus', '/messages/bob?u=bob']);
    for (const row of rows) expect(row.querySelector('svg')?.getAttribute('width')).toBe('36');
    // Only that sentence's people: the list asked by its id.
    expect(listTaps).toHaveBeenCalledWith('rich-story', null, 'a1b2c3d4');
  });

  it('stands on the apps’ measures (§S12): paper 32 · 28, the rows’ bands to its edges, the sentence at the story’s compact leading', async () => {
    phone(true);
    listTaps.mockResolvedValueOnce({ people: [person('gus')], nextPageToken: null });
    open();
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findAllByRole('link');
    // The paper's padding is the Modal's (the apps' ModalPaper): 32 above and below, 28 at each side.
    const padded = [dialog, ...dialog.querySelectorAll<HTMLElement>('*')].find((el) => el.style.padding);
    expect(padded?.style.padding).toBe('32px 28px');
    const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
    const css = read('src/components/molecules/CardDetail/PickedPeople.module.css');
    // The rows' bands bleed by the dialog's own side padding, so they still end on the paper's pen line.
    expect(css).toMatch(/\.picked \{[^}]*--dialog-pad-x: 28px;/);
    expect(read('src/components/sections/AppHeader/NotificationBell.module.css')).toMatch(/--bell-pad: var\(--dialog-pad-x, 22px\);/);
    // The sentence: 16, 1.8 for a CJK story and 1.6 for a Latin one (the story's compact leadings), 12 to the rows;
    // the title 10 above it.
    expect(css).toMatch(/\.sentence \{[^}]*margin: 0 0 12px;[^}]*font-size: 16px;[^}]*line-height: var\(--story-leading-compact\);/);
    expect(css).toMatch(/\.sentence\[data-script='latin'\] \{[^}]*line-height: var\(--story-leading-latin-compact\);/);
    expect(css).toMatch(/\.title \{[^}]*margin: 0 0 10px;/);
    const tokens = read('src/styles/tokens.css');
    expect(tokens).toMatch(/--story-leading-compact: 1\.8;/);
    expect(tokens).toMatch(/--story-leading-latin-compact: 1\.6;/);
  });

  it('shows the next page under 顯示更多, asking for the same sentence', async () => {
    phone(false);
    listTaps.mockResolvedValueOnce({ people: [person('gus')], nextPageToken: 'page-2' });
    listTaps.mockResolvedValueOnce({ people: [person('carol')], nextPageToken: null });
    open(vi.fn(), false);
    const dialog = await screen.findByRole('dialog', { name: 'People this part stayed with' });
    await within(dialog).findAllByRole('link');
    await user().click(within(dialog).getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(within(dialog).getAllByRole('link')).toHaveLength(2));
    expect(listTaps).toHaveBeenNthCalledWith(2, 'rich-story', 'page-2', 'a1b2c3d4');
    expect(within(dialog).queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('closes by its 關閉 and when a row is opened', async () => {
    phone(true);
    listTaps.mockResolvedValue({ people: [person('gus')], nextPageToken: null });
    const onClose = open();
    const dialog = await screen.findByRole('dialog');
    await user().click(within(dialog).getByRole('button', { name: '關閉' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user().click(await within(dialog).findByRole('link'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
