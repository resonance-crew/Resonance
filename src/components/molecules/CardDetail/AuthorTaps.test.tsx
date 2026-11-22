// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import type { AuthorBody, CardTapBody, TapListBody } from '@/lib/api/v1/schemas';
import { AuthorTaps } from './AuthorTaps';

/**
 * Round 26 §U3: the author's own line where a reader's end row would be — the wave and the three newest faces, no
 * number, nothing when no one resonated — opening who they are in a centred dialog, their notes' first lines there.
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

function renderLine(tap: CardTapBody | null) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map() }}>
      <AuthorTaps cardId="rich-story" tap={tap} />
    </SWRConfig>,
  );
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 });
afterEach(() => vi.clearAllMocks());

describe('AuthorTaps', () => {
  it('is nothing at all when no one has resonated — no 「還沒有人共振」, no zero', () => {
    const { container } = renderLine({ mine: false, faces: [], more: false, mayNote: false });
    expect(container).toBeEmptyDOMElement();
    expect(renderLine(null).container).toBeEmptyDOMElement();
  });

  it('is the wave and the three newest faces, nothing after them when there are more — one button, no number', () => {
    // Round 29 §S5: no blank disc for the others; the label still says there are others (the dialog says who).
    const { container } = renderLine({ mine: false, faces: [face('gus'), face('carol'), face('hana')], more: true, mayNote: false });
    const button = screen.getByRole('button', { name: 'Resonated with this card: gus, carol, hana, and others' });
    expect([...button.querySelectorAll('[data-face]')].map((f) => f.getAttribute('data-face'))).toEqual(['gus', 'carol', 'hana']);
    expect(button.querySelector('[data-count]')?.getAttribute('data-count')).toBe('3');
    expect(container.querySelector('[data-more]')).toBeNull();
    expect(container.textContent).not.toMatch(/\d/);
  });

  it('opens who resonated in a centred dialog: a note’s first line opens its conversation, a tap alone the profile', async () => {
    listTaps.mockResolvedValueOnce({
      people: [
        { author: face('gus'), note: null },
        { author: face('carol'), note: { excerpt: '讀到搬家那段，好像看見自己。' } },
      ],
      nextPageToken: 'page-2',
    });
    listTaps.mockResolvedValueOnce({ people: [{ author: face('bob'), note: null }], nextPageToken: null });
    renderLine({ mine: false, faces: [face('gus'), face('carol'), face('hana')], more: true, mayNote: false });
    await user().click(screen.getByRole('button', { name: /Resonated with this card/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Resonated with this card' });
    expect(within(dialog).getByRole('heading', { name: 'Resonated with this card' })).toBeInTheDocument();
    const rows = await within(dialog).findAllByRole('link');
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/u/gus', '/messages/carol?u=carol']);
    expect(within(rows[1]).getByText('讀到搬家那段，好像看見自己。')).toBeInTheDocument();
    expect(listTaps).toHaveBeenNthCalledWith(1, 'rich-story', null);

    // 30 a page, then 顯示更多: the next page under the first.
    await user().click(within(dialog).getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(within(dialog).getAllByRole('link')).toHaveLength(3));
    expect(listTaps).toHaveBeenNthCalledWith(2, 'rich-story', 'page-2');
    expect(within(dialog).queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('on an anonymous card: faces and names only — nothing opens a thread', async () => {
    listTaps.mockResolvedValueOnce({ people: [{ author: face('gus'), note: null }, { author: face('hana'), note: null }], nextPageToken: null });
    renderLine({ mine: false, faces: [face('gus'), face('hana')], more: false, mayNote: false });
    await user().click(screen.getByRole('button', { name: /Resonated with this card/ }));
    const rows = await within(await screen.findByRole('dialog')).findAllByRole('link');
    expect(rows.every((r) => r.getAttribute('href')!.startsWith('/u/'))).toBe(true);
  });

  it('quotes each person’s pick under their name (round 27 §U2), the note’s first line under the quote', async () => {
    listTaps.mockResolvedValueOnce({
      people: [
        { author: face('gus'), note: null, passage: { text: 'The lamp at the corner came on first.' } },
        { author: face('carol'), note: { excerpt: 'The move, I saw myself.' }, passage: { text: 'I wiped every window anyway.' } },
        { author: face('hana'), note: null },
      ],
      nextPageToken: null,
    });
    renderLine({ mine: false, faces: [face('gus'), face('carol'), face('hana')], more: false, mayNote: false });
    await user().click(screen.getByRole('button', { name: /Resonated with this card/ }));
    const [gus, carol, hana] = await within(await screen.findByRole('dialog')).findAllByRole('link');
    expect(gus).toHaveTextContent('gus“The lamp at the corner came on first.”');
    expect(carol.textContent).toBe('CAcarol“I wiped every window anyway.”The move, I saw myself.');
    expect(hana.textContent).toBe('HAhana');
    expect(carol.getAttribute('href')).toBe('/messages/carol?u=carol');
  });
});
