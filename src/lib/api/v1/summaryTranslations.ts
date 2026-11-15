import { createHash } from 'node:crypto';
import type { Card } from '@/lib/db/types';
import type { TranslationTarget } from '@/lib/text/translation';
import type { SummaryTranslationsBody } from './schemas';

/**
 * A feed card's title and excerpt, translated by AI when the card is
 * published or an edit to it is applied (round 25 §F7) — so a list never asks
 * for a translation and never swaps one in under the reader's thumb: it
 * arrives with the card, and the reader's 自動翻譯 switch decides whether it
 * is shown.
 *
 * Stored on the card, server-only (the rules take it from no client):
 *
 *   summaryTranslations = { of, en?: { title, excerpt }, "zh-TW"?: { title, excerpt } }
 *
 * `of` is the hash of the title and excerpt they were made from
 * (summaryHash); a FeedCard carries them only while it still matches the
 * card (presentSummaryTranslations), so an edit made from a build that
 * doesn't make them never shows a stale one. Only a published, public card
 * not in the trash carries any; making them for any other card removes
 * them. A failure never fails the save: the card simply has none until its
 * next edit (or the backfill, scripts/backfill.ts summary-translations).
 *
 * This half only reads them and imports no model (lists are drawn by routes
 * that run beside Firestore); making them is ./summaryTranslationsMake.
 */

/** What summaryTranslations were made from: the card's title and list excerpt. */
export function summaryHash(title: string, excerpt: string): string {
  return createHash('sha256').update(JSON.stringify([title, excerpt])).digest('base64url').slice(0, 22);
}

const LANGS: readonly TranslationTarget[] = ['en', 'zh-TW'];

/** Whether a card may carry translated summaries: published, public and not in the trash. */
export function carries(card: { publishedAt?: unknown; visibility?: unknown; trashedAt?: unknown }): boolean {
  return card.publishedAt != null && card.visibility === 'public' && card.trashedAt == null;
}

function entryOf(v: unknown): { title: string; excerpt: string } | null {
  if (!v || typeof v !== 'object') return null;
  const { title, excerpt } = v as Record<string, unknown>;
  return typeof title === 'string' && title && typeof excerpt === 'string' ? { title, excerpt } : null;
}

/**
 * A card's stored translations as a FeedCard carries them — only a public,
 * published card's, only while `of` still matches its title and the excerpt
 * shown beside them — else null.
 */
export function presentSummaryTranslations(
  card: Pick<Card, 'publishedAt' | 'visibility' | 'trashedAt'> & { summaryTranslations?: unknown },
  title: string,
  excerpt: string,
): SummaryTranslationsBody | null {
  const stored = card.summaryTranslations;
  if (!stored || typeof stored !== 'object' || !carries(card)) return null;
  const s = stored as Record<string, unknown>;
  if (s.of !== summaryHash(title, excerpt)) return null;
  const out: SummaryTranslationsBody = {};
  for (const lang of LANGS) {
    const e = entryOf(s[lang]);
    if (e) out[lang] = e;
  }
  return Object.keys(out).length ? out : null;
}

