import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import Page from '@/components/sections/LandingFilm/Page';
import { loadFilm } from '@/components/sections/LandingFilm/data';

export const revalidate = 300;
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Landing prototype `film` (the lab): the film reads its own cards (data.ts), not the lab's six. */
export default async function Lab({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const model = await loadFilm(locale);
  return <Page model={model} locale={locale} />;
}
