import type { Card, User } from '@/lib/db/types';

/**
 * What every landing prototype is handed by the lab route: the same 6 latest public cards the real landing page reads
 * (latestForLanding — no author for an anonymous card), their authors' bylines, and the locale.
 */
export interface LabLandingProps {
  cards: Card[];
  authors: Record<string, User>;
  locale: string;
}
