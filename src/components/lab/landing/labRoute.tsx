import type { ComponentType } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { serverCtx } from '@/server/ctx';
import type { LabLandingProps } from './types';

/** Renders one prototype with the real landing page's data (each prototype's own route calls this). */
export async function renderLab(Page: ComponentType<LabLandingProps>, params: Promise<{ locale: string }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { cards, authors } = await serverCtx().data.cards.latestForLanding(6);
  return <Page cards={cards} authors={authors} locale={locale} />;
}
