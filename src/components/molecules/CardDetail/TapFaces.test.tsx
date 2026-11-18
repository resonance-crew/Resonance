// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent, within } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import type { AuthorBody, CardTapBody, TapListBody } from '@/lib/api/v1/schemas';
import { TapFaces } from './TapFaces';

/**
 * Round 26 §U2: who resonated, as faces — the viewer first, then the people they are connected with; no words on
 * screen; one button opening who they are (a dialog on a phone, a popover wider), except the viewer's face alone.
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
const person = (id: string) => ({ author: face(id), note: null });

function renderFaces(tap: CardTapBody, opts: { zh?: boolean } = {}) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map() }}>
      <TapFaces cardId="c1" tap={tap} viewerId="alice" />
    </SWRConfig>,
    opts.zh ? { locale: 'zh-TW', messages: zhMessages } : {},
  );
}

/** A phone (layout.md: the web ≤ 720), or not. */
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

const user = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => phone(false));
afterEach(() => vi.clearAllMocks());

describe('TapFaces', () => {
  it('is nothing when no one the reader knows resonated', () => {
    const { container } = renderFaces({ mine: false, faces: [], more: false, mayNote: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the viewer’s own face alone as a picture, not a button, out of the tab order', () => {
    renderFaces({ mine: true, faces: [face('alice')], more: false, mayNote: true }, { zh: true });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: '你共振了' })).toBeInTheDocument();
  });

  it('is one button, its faces spoken and never written, then the blank disc for more', () => {
    const { container } = renderFaces({ mine: true, faces: [face('alice'), face('dora'), face('eli')], more: true, mayNote: true }, { zh: true });
    const button = screen.getByRole('button', { name: '你連結的人裡，與這張卡片共振的：dora、eli，還有其他人' });
    // On screen: only faces (their initials) — no sentence, no number.
    expect(button.textContent).toBe('ALDOEL');
    expect(container.querySelector('[data-more]')).not.toBeNull();
    expect([...container.querySelectorAll('[data-face]')].map((f) => f.getAttribute('data-face'))).toEqual(['alice', 'dora', 'eli']);
  });

  it('opens a popover under the faces on a wide screen, on the menu sheet, and Escape gives the focus back', async () => {
    listTaps.mockResolvedValueOnce({ people: [person('alice'), person('dora'), person('eli'), person('fay')], nextPageToken: null });
    renderFaces({ mine: true, faces: [face('alice'), face('dora'), face('eli')], more: true, mayNote: true });
    const button = screen.getByRole('button', { name: /who resonated/ });
    await user().click(button);
    const pop = screen.getByRole('dialog');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', pop.id);
    const rows = await within(pop).findAllByRole('link');
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/u/alice', '/u/dora', '/u/eli', '/u/fay']);
    expect(listTaps).toHaveBeenCalledWith('c1');
    await user().keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('opens a centred dialog with no title on a phone: banded rows of face and name, each to their page', async () => {
    phone(true);
    listTaps.mockResolvedValueOnce({ people: [person('dora'), person('eli')], nextPageToken: null });
    renderFaces({ mine: false, faces: [face('dora'), face('eli')], more: false, mayNote: true });
    await user().click(screen.getByRole('button', { name: /who resonated: dora, eli$/ }));
    const dialog = await screen.findByRole('dialog');
    // A reader sees only their connections: a title would claim everyone (S2).
    expect(within(dialog).queryByRole('heading')).toBeNull();
    const rows = await within(dialog).findAllByRole('link');
    expect(rows.map((r) => r.textContent)).toEqual(['DOdora', 'ELeli']);
    expect(dialog.querySelectorAll('[data-band]')).toHaveLength(2);
    await user().click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
