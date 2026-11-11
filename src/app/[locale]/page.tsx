import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import Page from '@/components/sections/LandingFilm/Page';
import { loadFilm } from '@/components/sections/LandingFilm/data';
import { smartAppBanner } from '@/lib/appStores';
import { siteUrl } from '@/lib/site';

/**
 * Its stories are the landing film's own (data.ts): published, public cards. A card made private, anonymous or gone
 * drops the page at once (`landingPagePaths` → revalidateLocalized); this bounds the rest — today's picks — to five
 * minutes.
 */
export const revalidate = 300;

/** The rest of the head is the locale layout's; this public page also offers the iOS app. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { itunes: smartAppBanner(`${siteUrl()}/${locale}`) };
}

/**
 * The landing page: the film of paper (sections/LandingFilm — 一張卡片，一整天; the owner chose it 2026-11-09 and made it
 * the landing page 2026-11-12). Its header, its stories after the film, the closing band (#download) and the footer
 * are all its own page; everything it hands the client is only what a card surface shows (data.ts).
 */
export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const model = await loadFilm(locale);
  return <Page model={model} locale={locale} />;
}
