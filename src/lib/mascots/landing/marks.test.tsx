// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';
import { SiteHeader } from '@/components/sections/SiteHeader/SiteHeader';
import { HeroSection } from '@/components/sections/HeroSection/HeroSection';
import { CardFeedSection } from '@/components/sections/CardFeedSection/CardFeedSection';
import { CTASection } from '@/components/sections/CTASection/CTASection';
import { SiteFooter } from '@/components/sections/SiteFooter/SiteFooter';
import { CARD_ITEM, HEADER, LANDING_MARKS, WAVE_PATH } from './measure';
import { flattenPath } from './svgPath';

// The landing page's own sections, rendered for real: the stage finds its places through their marks, and a mark
// renamed or moved would take places away while every test over the hand-built fixture stayed green.

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('@/components/sections/SiteHeader/SiteHeaderAccount', () => ({
  SiteHeaderAccountMenu: () => null,
  SiteHeaderSignedInNav: () => null,
}));
// the hero's live blobs draw on a canvas jsdom lacks; their still stand-ins are the children
vi.mock('@/components/atoms/DriftingBlobs/DriftingBlobs', () => ({
  DriftingBlobs: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function card(i: number): Card {
  return {
    id: `c${i}`, authorId: 'a', thoughtCore: `Card ${i}`, story: 'A story of a few words.', tags: [], originalLocale: 'en',
    translations: {}, visibility: 'public', publishedAt: new Date('2026-01-01'), readCount: 0, resonanceCount: 0,
    inviteCount: 0, anonymous: i % 2 === 0,
  };
}
const author: User = {
  id: 'a', handle: 'neo', region: 'TW', primaryLocale: 'en', autoTranslateTo: [], verified: false, phoneHash: '', avatarSeed: '7',
  initials: 'N', accentColor: 'var(--color-sage)', joinedAt: new Date('2026-01-01'), handleChangedAt: new Date('2026-01-01'),
};

function landing() {
  const cards = Array.from({ length: 6 }, (_, i) => card(i + 1));
  const view = renderWithIntl(
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <CardFeedSection cards={cards} authors={{ a: author }} />
        <CTASection />
      </main>
      <SiteFooter />
    </>,
  );
  return { ...view, cards };
}

const one = (root: ParentNode, sel: string) => {
  const all = root.querySelectorAll(sel);
  expect(all.length, sel).toBeGreaterThan(0);
  return all[0];
};
const mark = (root: ParentNode, name: string) => one(root, `[data-mascot="${name}"]`);

describe('the landing page’s marks, on its real sections', () => {
  it('has every zone and every mark measure.ts reads, where it reads it', () => {
    landing();
    const zone = (z: string) => {
      expect(document.querySelectorAll(`[data-mascot-zone="${z}"]`), z).toHaveLength(1);
      return one(document, `[data-mascot-zone="${z}"]`);
    };
    for (const z of LANDING_MARKS.zones) zone(z);
    const hero = zone('hero');
    for (const name of [...LANDING_MARKS.hero, ...LANDING_MARKS.heroComputer]) mark(hero, name);
    expect(mark(hero, 'pill').firstElementChild).not.toBeNull();   // the pill itself, inside its wrapper
    expect(mark(hero, 'headline').textContent?.trim()).not.toBe('');
    const feed = zone('feed');
    for (const name of LANDING_MARKS.feed) mark(feed, name);
    // the TagPill over the title is the heading's first child, the title after it
    expect(mark(feed, 'feed-heading').firstElementChild).not.toBe(mark(feed, 'feed-title'));
    expect(mark(feed, 'browse').querySelector('button, a')).not.toBeNull();
    const cta = zone('cta');
    for (const name of LANDING_MARKS.cta) mark(cta, name);
    expect(mark(cta, 'cta-buttons').querySelectorAll('button').length).toBeGreaterThan(0);
    const footer = zone('footer');
    for (const name of LANDING_MARKS.footer) mark(footer, name);
  });

  it('draws each wave as a path the stage can read, right under its section', () => {
    landing();
    for (const z of ['feed', 'cta']) {
      const path = one(document, `[data-mascot-zone="${z}"]`).querySelector(WAVE_PATH);
      expect(path, z).not.toBeNull();
      expect(flattenPath(path?.getAttribute('d') ?? '', 4), z).not.toBeNull();
    }
  });

  it('gives every card of the feed its article, title, both chromes and author row', () => {
    const { cards } = landing();
    const items = document.querySelectorAll(`[data-mascot-zone="feed"] ${CARD_ITEM}`);
    expect(items).toHaveLength(cards.length);
    for (const item of items) {
      const article = item.querySelector('article');
      expect(article).not.toBeNull();
      expect(article?.querySelector('h3')).not.toBeNull();
      expect(article?.querySelectorAll('[data-mascot="card-edge"]')).toHaveLength(2);   // a computer's outline, a phone's rule
      expect(article?.querySelector('[data-mascot="card-foot"]')).not.toBeNull();
      // the phone's rule is drawn at once (a computer's outline once measured): a stroked path the stage can read
      const drawn = [...(article?.querySelectorAll('[data-mascot="card-edge"] path[stroke]') ?? [])]
        .filter(p => !['none', 'transparent'].includes(p.getAttribute('stroke') ?? 'none'));
      expect(drawn.length).toBeGreaterThan(0);
      for (const p of drawn) expect(flattenPath(p.getAttribute('d') ?? '', 4)).not.toBeNull();
    }
  });

  it('starts the view under the page’s first header, the fixed site header', () => {
    landing();
    const first = document.querySelector(HEADER);
    expect(first?.querySelector('a[href="/signin"]')).not.toBeNull();   // the site header, not a section's
    const css = readFileSync(join(__dirname, '../../../components/sections/SiteHeader/SiteHeader.module.css'), 'utf8');
    expect(css).toMatch(/\.header\s*\{[^}]*position:\s*fixed/);
  });
});
