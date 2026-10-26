import type { Metadata, Viewport } from 'next';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { NextIntlProvider } from '@/components/providers/NextIntlProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { SWRProvider } from '@/components/providers/SWRProvider';
import TweaksPanel from '@/components/providers/TweaksPanel';
import { OG_COVER_SIZE, ogCoverPath } from '@/lib/og';
import { siteUrl } from '@/lib/site';
import type { Locale } from '@/lib/db/types';
import { fontVariables } from '@/styles/fonts';
import { APPEARANCE_SCRIPT, THEME_COLOR_METAS } from '@/lib/design/appearance';
import '@/styles/globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// The paper: what a phone browser tints its bars with, one per scheme (a saved
// theme or scheme repoints them — lib/design/appearance).
export const viewport: Viewport = {
  themeColor: THEME_COLOR_METAS,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const base = siteUrl();
  const title = t('title');
  const description = t('description');

  return {
    metadataBase: new URL(base),
    title,
    description,
    applicationName: 'Resonance',
    // No web-app manifest and no Apple standalone mode: the site isn't offered as an
    // installable app — the iOS and Android apps are (GetTheApp, the Smart App Banner).
    icons: {
      icon: [
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/icon.png', type: 'image/png', sizes: '512x512' },
      ],
      apple: '/apple-icon.png',
    },
    // No Smart App Banner here: only the public pages offer the app
    // (smartAppBanner — the landing page, a card, a profile).
    // Default share card (platform cover) — card pages override this per-card.
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${base}/${locale}`,
      siteName: 'Resonance',
      locale,
      images: [{ url: ogCoverPath(locale as Locale), width: OG_COVER_SIZE.width, height: OG_COVER_SIZE.height, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogCoverPath(locale as Locale)],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as typeof routing.locales[number])) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    // The saved theme and scheme go onto <html> before the first paint, so its
    // attributes differ from the server's by design (suppressHydrationWarning).
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <NextIntlProvider messages={messages} locale={locale}>
          <AuthProvider>
            <SWRProvider>{children}</SWRProvider>
          </AuthProvider>
          <TweaksPanel />
        </NextIntlProvider>
      </body>
    </html>
  );
}
