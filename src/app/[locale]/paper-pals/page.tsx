import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/sections/SiteHeader/SiteHeader';
import { SiteFooter } from '@/components/sections/SiteFooter/SiteFooter';
import { PaperPalsPage } from '@/components/sections/PaperPalsPage/PaperPalsPage';
import { smartAppBanner } from '@/lib/appStores';
import { siteUrl } from '@/lib/site';

// Nothing on it is read per request: the copy is the message files', the five are the cast's.
export const dynamic = 'force-static';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pals' });
  return {
    title: `${t('metaTitle')} · Resonance`,
    description: t('metaDescription'),
    itunes: smartAppBanner(`${siteUrl()}/${locale}/paper-pals`),
  };
}

export default async function PaperPals({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <PaperPalsPage />
      <SiteFooter />
    </>
  );
}
