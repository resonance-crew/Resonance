// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, renderWithIntl, screen, userEvent, within } from '@/../test/render';
import type { Notification } from '@/lib/db/types';
import type { BellExtras } from '@/lib/data/hooks';
import { forgetBellReadHere } from '@/components/sections/AppHeader/BellList';
import { NotificationsPage } from './NotificationsPage';
import NotificationsRoute from '@/app/[locale]/(app)/notifications/page';

// 通知 as a page of its own (round 23 §4): what a phone's bell opens — the bell's list as the apps draw it, on the
// same live list and read marks as the bell's dialog.

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => '/notifications',
}));

const live = vi.hoisted(() => ({ rows: undefined as Notification[] | undefined, extras: undefined as BellExtras | undefined }));
vi.mock('@/lib/data/hooks', () => ({
  useNotifications: () => ({ data: live.rows, error: null }),
  useBellExtras: (items: unknown) => (items ? live.extras : undefined),
}));
const markNotificationRead = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/db/firestore/client/notifications', () => ({ markNotificationRead }));

const bell = (id: string, extra: Partial<Notification> = {}): Notification => ({
  id,
  userId: 'me',
  type: 'resonance',
  payload: { fromUserId: 'carol', fromHandle: 'carol', cardId: 'walk' },
  readAt: null,
  createdAt: new Date(Date.now() - 60_000),
  ...extra,
});

const scrollTo = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  live.rows = undefined;
  live.extras = { people: {}, cards: {} };
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});
afterEach(() => {
  forgetBellReadHere();
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});

describe('the bell’s page', () => {
  it('is the route /notifications draws', () => {
    live.rows = [];
    renderWithIntl(<NotificationsRoute />);
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
  });

  it('draws the rows’ shapes while the list is read, then the parts and their rows — no dialog', () => {
    const view = renderWithIntl(<NotificationsPage />);
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();

    live.rows = [bell('n1'), bell('n2', { readAt: new Date(), createdAt: new Date(Date.now() - 3 * 86_400_000) })];
    view.rerender(<NotificationsPage />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Today', 'This week']);
    const rows = screen.getAllByRole('link');
    expect(rows.map((a) => a.getAttribute('href'))).toEqual(['/messages/carol?u=carol', '/messages/carol?u=carol']);
    for (const row of rows) expect(row.querySelector('[data-band]')).not.toBeNull();
  });

  it('says there is nothing yet with the shared empty state', () => {
    live.rows = [];
    renderWithIntl(<NotificationsPage />);
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('marks a row read when it is opened', async () => {
    live.rows = [bell('n1')];
    renderWithIntl(<NotificationsPage />);
    const row = screen.getByRole('link');
    expect(within(row).getByText(', Unread')).toBeInTheDocument();
    await userEvent.setup().click(row);
    expect(markNotificationRead).toHaveBeenCalledWith('n1');
    expect(within(screen.getByRole('link')).queryByText(', Unread')).toBeNull();
  });

  it('comes back from a row where it was scrolled to, and only through the history', () => {
    live.rows = [bell('n1'), bell('n2'), bell('n3')];
    const first = renderWithIntl(<NotificationsPage />);
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true });
    fireEvent.scroll(window);
    first.unmount();

    // Back: the page is back where it was once its rows are there.
    window.dispatchEvent(new PopStateEvent('popstate'));
    const back = renderWithIntl(<NotificationsPage />);
    expect(scrollTo).toHaveBeenCalledWith(0, 420);
    back.unmount();

    // Opened afresh (the bell, a link): from the top, as any page.
    scrollTo.mockClear();
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 60_000);
    renderWithIntl(<NotificationsPage />);
    expect(scrollTo).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('the bell’s page’s layout', () => {
  const css = readFileSync(join(process.cwd(), 'src/components/sections/NotificationsPage/NotificationsPage.module.css'), 'utf8');
  const bellCss = readFileSync(join(process.cwd(), 'src/components/sections/AppHeader/NotificationBell.module.css'), 'utf8');

  it('starts its first title 16 under the header’s pen line, the bands running the window’s width', () => {
    // The pen line at ~73 of the header's 82 (HEADER_STROKE_Y): 82 + 7 = 89.
    expect(css).toMatch(/padding: calc\(var\(--app-header-h\) \+ 7px\) 0 var\(--page-pad-bottom\);/);
    expect(bellCss).toMatch(/\.pageList \{[^}]*--bell-inset: var\(--page-pad-x\);[^}]*--bell-column: 680px;/);
  });

  it('touches its rows, 12 above and below their content, a title 12 over and 6 under', () => {
    expect(bellCss).toMatch(/\.row \{[^}]*padding: 12px var\(--bell-inset-end\) 12px var\(--bell-inset\);/);
    expect(bellCss).toMatch(/\.list \{[^}]*flex-direction: column;\s*\}/);
    expect(bellCss).not.toMatch(/\.list \{[^}]*gap:/);
    expect(bellCss).toMatch(/\.groupTitle \{\s*margin: 12px 0 6px;/);
  });
});
