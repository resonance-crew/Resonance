import type { Metadata } from 'next';
import Page from '@/components/lab/landing/answer/Page';
import { renderLab } from '@/components/lab/landing/labRoute';

export const revalidate = 300;
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Landing prototype `answer` (branch landing-lab only): its own route, so it compiles apart from the others. */
export default function Lab({ params }: { params: Promise<{ locale: string }> }) {
  return renderLab(Page, params);
}
