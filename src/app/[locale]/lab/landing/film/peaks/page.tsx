import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import Page from '@/components/lab/landing/film/Page';
import { loadFilm } from '@/components/lab/landing/film/data';

export const revalidate = 300;
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The lab's comparison, on a development server only: the film as rounds 1–5 left it, before the waves
 * (script/look.ts `peaks`: folded peaks, the lone tree, the lighthouse, the corner grass, the sky lanterns). The owner
 * found that look too close to Alto's Adventure, so no deployment serves it.
 */
export default async function LabPeaks({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { locale } = await params;
  setRequestLocale(locale);
  const model = await loadFilm(locale);
  return <Page model={model} locale={locale} look="peaks" />;
}
