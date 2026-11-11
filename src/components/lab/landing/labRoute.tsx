import type { ComponentType } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { latestForLanding } from '@/lib/db/firestore/landing';
import type { LabLandingProps } from './types';

/** Renders one prototype with the real landing page's data (each prototype's own route calls this). */
export async function renderLab(Page: ComponentType<LabLandingProps>, params: Promise<{ locale: string }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { cards, authors } = await latestForLanding(getAdminDb(), 6);
  return <Page cards={cards} authors={authors} locale={locale} />;
}
