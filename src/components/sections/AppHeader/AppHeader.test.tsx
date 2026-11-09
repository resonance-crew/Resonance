// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useEffect } from 'react';
import { renderWithIntl, screen, userEvent, within } from '@/../test/render';
import { AppChromeProvider, useAppChrome } from '@/components/providers/AppChrome';
import { AppHeader } from './AppHeader';
import zhMessages from '@/messages/zh-TW.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Navigation + auth boundaries the account controls reach into. The signed-out
// path renders none of the firestore-backed children, but the modules still
// import, so stub them to keep the render hermetic.
const nav = vi.hoisted(() => ({ pathname: '/home' }));

vi.mock('@/i18n/navigation', async () => {
  const actual = await vi.importActual<typeof import('@/i18n/navigation')>('@/i18n/navigation');
  return {
    ...actual,
    usePathname: () => nav.pathname,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  };
});

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

vi.mock('./NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

vi.mock('./MessagesEntry', () => ({
  MessagesEntry: () => <div data-testid="messages-entry" />,
}));

const user = { initials: 'NC', handle: 'ncchen', accentColor: 'var(--color-terracotta)' };

// The row keeps to the content's column, except on the pages that spread across
// the whole window, where it stays at the window's edges.
describe('AppHeader row width', () => {
  afterEach(() => {
    nav.pathname = '/home';
  });

  it.each([
    ['/home', false],
    ['/card/what-is-money', false],
    ['/me', false],
    ['/settings', false],
    ['/messages', true],
    ['/messages/abc', true],
    ['/write', true],
    ['/write/abc', true],
    ['/me/thought-map', true],
  ])('%s full bleed: %s', (pathname, fullBleed) => {
    nav.pathname = pathname;
    renderWithIntl(<AppHeader user={user} signedIn authReady />);
    const row = screen.getByRole('link', { name: /Resonance|Messages/ }).parentElement!;
    expect(row.hasAttribute('data-full-bleed')).toBe(fullBleed);
  });
});

// Settings names itself in the brand slot on a phone, as Messages does at every
// width; both words are in the HTML and the module CSS shows one (720px).
describe('AppHeader brand slot', () => {
  afterEach(() => {
    nav.pathname = '/home';
  });

  it('says Settings on the settings page for a phone, and keeps the brand for wider screens', () => {
    nav.pathname = '/settings';
    renderWithIntl(<AppHeader user={user} signedIn authReady />);
    const brand = screen.getByRole('link', { name: /Settings/ });
    expect(within(brand).getByText('Settings')).toBeInTheDocument();
    expect(within(brand).getByText('Resonance')).toBeInTheDocument();
  });

  // Round 23 §4: the bell's own page names itself as Messages does, at every width.
  it('says Notifications on the bell’s page', () => {
    nav.pathname = '/notifications';
    renderWithIntl(<AppHeader user={user} signedIn authReady />);
    const brand = screen.getByRole('link', { name: 'Notifications' });
    expect(brand).toHaveAttribute('href', expect.stringMatching(/\/home$/));
    expect(within(brand).queryByText('Resonance')).toBeNull();
  });

  it('says only Resonance elsewhere', () => {
    renderWithIntl(<AppHeader user={user} signedIn authReady />);
    expect(screen.queryByRole('link', { name: /Settings/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Resonance' })).toBeInTheDocument();
  });

  // Round 23: English "Notifications" pushed the pen, the messages, the bell and the menu 15 into the row's
  // padding at 390 (off the screen at 375). The glyphs keep their place; a long name steps its size down.
  it.each([
    ['/notifications', 'en', true],
    ['/notifications', 'zh-TW', false],
    ['/messages', 'en', false],
    ['/messages/abc', 'zh-TW', false],
    ['/settings', 'en', false],
    ['/home', 'en', false],
  ])('%s in %s marks its name long: %s', (pathname, locale, long) => {
    nav.pathname = pathname;
    renderWithIntl(<AppHeader user={user} signedIn authReady />, locale === 'zh-TW' ? { locale, messages: zhMessages } : undefined);
    const logo = screen.getAllByRole('link').find((a) => a.getAttribute('href')?.endsWith('/home'))!;
    expect(logo.hasAttribute('data-long-title')).toBe(long);
  });

  it('keeps the glyphs at the row’s padding and fits a long name by its size, cut only as a last resort', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/sections/AppHeader/AppHeader.module.css'), 'utf8');
    const block = (selector: string, from = css) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return [...from.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
    };
    expect(block('.account')).toMatch(/flex-shrink:\s*0/);
    expect(block('.logo[data-long-title]')).toMatch(/min-width:\s*0/);
    const long = block('.logo[data-long-title] .brand');
    expect(long).toMatch(/overflow:\s*hidden/);
    expect(long).toMatch(/text-overflow:\s*ellipsis/);
    expect(long).toMatch(/white-space:\s*nowrap/);
    const phone = css.slice(css.lastIndexOf('@media (max-width: 720px) {'));
    expect(phone).toMatch(/\.logo\[data-long-title\] \.brand \{\s*font-size: clamp\(14px, calc\(\(100vw - 280px\) \/ 5\.8\), 22px\);/);
    const narrow = css.slice(css.lastIndexOf('@media (max-width: 360px) {'));
    expect(narrow).toMatch(/\.logo\[data-long-title\] \.brand \{\s*font-size: clamp\(14px, calc\(\(100vw - 230px\) \/ 5\.8\), 18px\);/);
    // Every other name in the slot stands as it was: 22, and 18 at 360 and under.
    expect(block('.brand')).toMatch(/font-size:\s*22px/);
    const tight = css.slice(css.indexOf('@media (max-width: 360px) {'), css.lastIndexOf('@media (max-width: 360px) {'));
    expect(tight).toMatch(/\.brand \{\s*font-size: 18px;/);
    // At 390 (row 350 inside its padding), the long name's size times its width in ems leaves the glyphs their 280.
    const at = (vw: number, less: number, max: number) => Math.min(max, Math.max(14, (vw - less) / 5.8));
    expect(at(390, 280, 22) * 5.664).toBeLessThanOrEqual(390 - 280);
    expect(at(375, 280, 22) * 5.664).toBeLessThanOrEqual(375 - 280);
    expect(at(320, 230, 18) * 5.664).toBeLessThanOrEqual(320 - 230);
    expect(at(430, 280, 22)).toBe(22);
  });
});

describe('AppHeader account slot', () => {
  it('shows the sign-in button and no notification bell when signed out', () => {
    renderWithIntl(<AppHeader user={user} signedIn={false} authReady />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByTestId('notification-bell')).toBeNull();
    expect(screen.queryByTestId('messages-entry')).toBeNull();
    // The placeholder avatar (combobox trigger) must not appear either.
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  // The bar is the frame, so its one verb is a solid fill, not a second
  // outline (the mobile menu's sign-in is solid too).
  it('draws the sign-in button solid, without a pen outline of its own', () => {
    renderWithIntl(<AppHeader user={user} signedIn={false} authReady />);

    const button = screen.getByRole('link', { name: 'Sign in' }).querySelector('button');
    expect(button).toHaveAttribute('data-variant', 'solid');
  });

  it('shows the account controls when signed in', () => {
    renderWithIntl(<AppHeader user={user} signedIn authReady />);

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });

  // The pen is the signed-in reader's way to start a card at every width: the feed's end and the card pages
  // carry no write button of their own.
  it('leads the signed-in account row with the pen to the writer', () => {
    renderWithIntl(<AppHeader user={user} signedIn authReady />);
    const write = screen.getByRole('link', { name: 'Write' });
    expect(write.getAttribute('href')).toMatch(/^(\/en)?\/write$/);
    expect(write.compareDocumentPosition(screen.getByTestId('messages-entry')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers no pen to a signed-out visitor', () => {
    renderWithIntl(<AppHeader user={user} signedIn={false} authReady />);
    expect(screen.queryByRole('link', { name: 'Write' })).toBeNull();
  });

  it('renders no account controls until auth resolves', () => {
    renderWithIntl(<AppHeader user={user} signedIn={false} authReady={false} />);

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByTestId('notification-bell')).toBeNull();
  });
});

describe('AppHeader taken over by a page', () => {
  // A phone's settings detail: the bar the writer stands over its workspace
  // too — the back arrow and that screen's title, nothing else.
  it('shows only the back arrow and the screen’s title', async () => {
    const onBack = vi.fn();
    function Claim() {
      const { setMobileHeader } = useAppChrome();
      useEffect(() => setMobileHeader({ title: 'Profile', onBack }), [setMobileHeader]);
      return null;
    }
    renderWithIntl(
      <AppChromeProvider>
        <AppHeader user={user} signedIn authReady />
        <Claim />
      </AppChromeProvider>,
    );

    expect(await screen.findByText('Profile')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-bell')).toBeNull();
    expect(screen.queryByText('Resonance')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
