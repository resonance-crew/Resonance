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
 * screen; one button opening who they are (a centred dialog on every screen), except the viewer's face alone.
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
    // The viewer's own face first is said first, as the apps say it (iOS TapState.spoken, Android facesLabel).
    const button = screen.getByRole('button', { name: '你共振了，你連結的人裡，與這張卡片共振的：dora、eli，還有其他人' });
    // On screen: only faces (their initials) — no sentence, no number.
    expect(button.textContent).toBe('ALDOEL');
    expect(container.querySelector('[data-more]')).not.toBeNull();
    expect([...container.querySelectorAll('[data-face]')].map((f) => f.getAttribute('data-face'))).toEqual(['alice', 'dora', 'eli']);
  });

  it('says what is seen when only the viewer’s face is drawn before the blank disc — never an empty list of names', () => {
    renderFaces({ mine: true, faces: [face('alice')], more: true, mayNote: true }, { zh: true });
    expect(screen.getByRole('button', { name: '你共振了，你連結的人裡，與這張卡片共振的：還有其他人' })).toBeInTheDocument();
  });

  // The owner, 2026-11-19: 「我在想这个直接做成这个 model 会不会好一点呢」 — a phone's list was a dialog already; tablets,
  // the Mac and the desktop opened a popover under the faces, and now open the same dialog.
  it.each([
    ['a phone', true, 'min(400px, calc(100vw - 32px))'],
    ['a wide screen', false, '480px'],
  ])('opens a centred dialog with no title on %s: banded rows of face and name, each to their page, 關閉 at its foot', async (_, onPhone, width) => {
    phone(onPhone);
    listTaps.mockResolvedValueOnce({ people: [person('dora'), person('eli')], nextPageToken: null });
    renderFaces({ mine: false, faces: [face('dora'), face('eli')], more: false, mayNote: true });
    const button = screen.getByRole('button', { name: /who resonated: dora, eli$/ });
    await user().click(button);
    const dialog = await screen.findByRole('dialog');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    // A modal, centred over the page — never a popover laid at the faces.
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(button.parentElement?.contains(dialog)).toBe(false);
    // On a phone the width it always had (400, or the column less 16 a side); wider, the author's list's 480.
    expect(dialog.style.maxWidth).toBe(width);
    // A reader sees only their connections: a title would claim everyone (S2).
    expect(within(dialog).queryByRole('heading')).toBeNull();
    const rows = await within(dialog).findAllByRole('link');
    expect(rows.map((r) => r.textContent)).toEqual(['DOdora', 'ELeli']);
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/u/dora', '/u/eli']);
    expect(listTaps).toHaveBeenCalledWith('c1');
    expect(dialog.querySelectorAll('[data-band]')).toHaveLength(2);
    // Each row's face 36, whatever the screen (the popover's 28 went with it).
    for (const row of rows) expect(row.querySelector('svg')?.getAttribute('width')).toBe('36');
    await user().click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('closes on Escape and gives the focus back to the faces', async () => {
    listTaps.mockResolvedValueOnce({ people: [person('alice'), person('dora')], nextPageToken: null });
    renderFaces({ mine: true, faces: [face('alice'), face('dora')], more: false, mayNote: true });
    const button = screen.getByRole('button', { name: /who resonated/ });
    await user().click(button);
    await within(await screen.findByRole('dialog')).findAllByRole('link');
    await user().keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('never shows one account’s people to the next one signed in this tab (the list is the viewer’s own)', async () => {
    // One cache for the tab, as the app has it: alice opens the list, then bob — signed in from another tab — does.
    const cache = new Map();
    const open = async (viewerId: string, tap: CardTapBody) => {
      const page = renderWithIntl(
        <SWRConfig value={{ provider: () => cache }}>
          <TapFaces cardId="c1" tap={tap} viewerId={viewerId} />
        </SWRConfig>,
      );
      await user().click(screen.getByRole('button', { name: /who resonated/ }));
      const rows = await within(screen.getByRole('dialog')).findAllByRole('link');
      const hrefs = rows.map((r) => r.getAttribute('href'));
      page.unmount();
      return hrefs;
    };
    listTaps.mockResolvedValueOnce({ people: [person('alice'), person('dora')], nextPageToken: null });
    expect(await open('alice', { mine: true, faces: [face('alice'), face('dora')], more: false, mayNote: true })).toEqual(['/u/alice', '/u/dora']);
    listTaps.mockResolvedValueOnce({ people: [person('gus')], nextPageToken: null });
    expect(await open('bob', { mine: false, faces: [face('gus')], more: false, mayNote: true })).toEqual(['/u/gus']);
    expect(listTaps).toHaveBeenCalledTimes(2);
  });
});
