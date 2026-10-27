import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/sections/SiteHeader/SiteHeader';
import { HeroSection } from '@/components/sections/HeroSection/HeroSection';
import { CardFeedSection } from '@/components/sections/CardFeedSection/CardFeedSection';
import { CTASection } from '@/components/sections/CTASection/CTASection';
import { SiteFooter } from '@/components/sections/SiteFooter/SiteFooter';
import { LandingStage } from '@/components/sections/LandingStage/LandingStage';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { latestForLanding } from '@/lib/db/firestore/landing';
import { smartAppBanner } from '@/lib/appStores';
import { siteUrl } from '@/lib/site';

export const revalidate = 3600;

/** The rest of the head is the locale layout's; this public page also offers the iOS app. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { itunes: smartAppBanner(`${siteUrl()}/${locale}`) };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Everything passed to the client below is serialized into this cached,
  // public HTML — so only what a card surface shows (latestForLanding): no
  // author for an anonymous card (not even its uid), no recommendation
  // internals, and of each author only their byline.
  const { cards, authors } = await latestForLanding(getAdminDb(), 6);

  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <CardFeedSection cards={cards} authors={authors} />
        <CTASection />
      </main>
      <SiteFooter />
      {/* The paper puppets: client-only, loaded once the page is up (none of it is in this HTML). */}
      <LandingStage />
    </>
  );
}
