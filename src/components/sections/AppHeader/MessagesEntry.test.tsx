// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderWithIntl, screen } from '@/../test/render';
import { MessagesEntry } from './MessagesEntry';

const nav = vi.hoisted(() => ({ pathname: '/home' }));

vi.mock('@/i18n/navigation', async () => {
  const actual = await vi.importActual<typeof import('@/i18n/navigation')>('@/i18n/navigation');
  return { ...actual, usePathname: () => nav.pathname };
});

vi.mock('@/lib/data/hooks', () => ({ useUnreadMessages: () => 2 }));

/** The solid twin's path: the bubble with its lines knocked out (even-odd). */
const solid = (el: Element) => el.querySelector('path[fill-rule="evenodd"]') !== null;

// Round 23: on /notifications the bell wears its solid twin and says it is the current page; 私訊 did neither.
describe('MessagesEntry on its own page', () => {
  afterEach(() => {
    nav.pathname = '/home';
  });

  it.each(['/messages', '/messages/bob'])('is the current page on %s, its solid twin in the phone’s header', (pathname) => {
    nav.pathname = pathname;
    renderWithIntl(<MessagesEntry />);
    const link = screen.getByRole('link', { name: 'Messages' });
    expect(link).toHaveAttribute('aria-current', 'page');
    const phone = link.querySelector('[class*="glyphPhone"]')!;
    const wide = link.querySelector('[class*="glyphWide"]')!;
    expect(solid(phone)).toBe(true);
    // Wider, the header keeps the outline it has always had.
    expect(solid(wide)).toBe(false);
    // The badge stays.
    expect(link).toHaveTextContent('2');
  });

  it('is an outline and not the current page elsewhere', () => {
    renderWithIntl(<MessagesEntry />);
    const link = screen.getByRole('link', { name: 'Messages' });
    expect(link).not.toHaveAttribute('aria-current');
    expect(solid(link)).toBe(false);
    expect(link.querySelector('[class*="glyphPhone"]')).toBeNull();
  });

  it('shows the solid twin only where the header is a phone’s (720 and under)', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/sections/AppHeader/AppHeader.module.css'), 'utf8');
    const top = css.slice(0, css.indexOf('@media (max-width: 720px) {'));
    expect(top).toMatch(/\.glyphPhone \{\s*display: none;/);
    expect(top).toMatch(/\.glyphWide \{\s*display: flex;/);
    const phone = css.slice(css.indexOf('@media (max-width: 720px) {'), css.indexOf('@media (max-width: 900px) {'));
    expect(phone).toMatch(/\.glyphPhone \{\s*display: flex;/);
    expect(phone).toMatch(/\.glyphWide \{\s*display: none;/);
  });
});
