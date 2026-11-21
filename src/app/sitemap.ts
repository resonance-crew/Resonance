import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { POLICY_PAGES, SITE_PAGES, SITEMAP_MAX_CARDS } from '@/lib/seo';
import { siteUrl } from '@/lib/site';
import { serverCtx } from '@/server/ctx';
import type { SitemapCard } from '@/server/ports/repos/cards';

// Built with the deployment, then again at most once an hour (on the next
// request after that, ISR). Paths that take a listable card out of public
// view drop it sooner (revalidateLocalized).
export const revalidate = 3600;

type Listed = SitemapCard;

/** A logical path in every locale, each naming the others (hreflang). */
function inEveryLocale(base: string, path: string, lastModified?: Date): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}${path}`]));
  return routing.locales.map((l) => ({ url: languages[l], ...(lastModified && { lastModified }), alternates: { languages } }));
}

/**
 * /sitemap.xml: the landing, About and policy pages, and the newest public cards
 * (SITEMAP_MAX_CARDS), by slug. Profiles aren't listed; crawlers find them
 * from the cards. If the cards can't be read, the pages go out alone (a
 * build isn't failed for it; the next regeneration tries again).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages = ['', ...SITE_PAGES, ...POLICY_PAGES].flatMap((path) => inEveryLocale(base, path));
  let cards: Listed[] = [];
  try {
    // The newest public, published cards that name no one as anonymous (the cards repository's sitemapCards: a
    // private, connections-only, anonymous, draft, hand-stamped, slugless or blank card never is listed).
    cards = await serverCtx().data.cards.sitemapCards(SITEMAP_MAX_CARDS, Date.now());
  } catch (e) {
    console.error('sitemap: card read failed', e);
  }
  return [...pages, ...cards.flatMap((c) => inEveryLocale(base, `/card/${encodeURIComponent(c.slug)}`, c.lastModified))];
}
