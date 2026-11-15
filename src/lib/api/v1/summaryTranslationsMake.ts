import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { translateSummary, type SummaryText } from '@/lib/ai/translate';
import { modelsOffline, translationTargets, type TranslationTarget } from '@/lib/text/translation';
import { storedSummary, summarize } from './summary';
import { carries, summaryHash } from './summaryTranslations';

/**
 * Making a card's translated title and excerpt (./summaryTranslations says
 * what they are): after a publish or an applied edit's response, beside
 * indexCard, from the routes pinned to hnd1 — and the backfill.
 */

export type SummaryTranslationsResult =
  | 'made'
  | 'unchanged'
  | 'removed'
  | 'none'
  | 'not-found'
  | 'over-budget'
  | 'offline'
  | 'moved'
  | 'failed';

export interface SummaryTranslationsOptions {
  /** Asked just before the model call (an applied edit spends the author's reindex budget); false skips it. */
  mayCall?: () => Promise<boolean>;
  /** The model call (tests; the backfill paces its own). */
  translate?: typeof translateSummary;
}

const FIELDS = ['thoughtCore', 'story', 'excerpt', 'readMinutes', 'excerptAt', 'updatedAt', 'publishedAt', 'visibility', 'trashedAt', 'summaryTranslations'];

/** The title and excerpt a list shows of a card read with FIELDS: its stored summary while current, else its story's. */
function summaryText(data: DocumentData): SummaryText {
  const title = typeof data.thoughtCore === 'string' ? data.thoughtCore : '';
  const excerpt = (storedSummary(data) ?? summarize(data.story)).excerpt;
  return { title, excerpt };
}

/**
 * Make (or remove) card `id`'s translated title and excerpt as it is now —
 * after a publish or an applied edit's response, beside indexCard. Nothing
 * for a card whose `of` already matches; removes them from a card that may
 * not carry any; writes what the model made only while the card still has
 * the title and excerpt it was made from (a newer save's run wins).
 */
export async function makeSummaryTranslations(db: Firestore, id: string, opts: SummaryTranslationsOptions = {}): Promise<SummaryTranslationsResult> {
  const ref = db.doc(`cards/${id}`);
  const [snap] = await db.getAll(ref, { fieldMask: FIELDS });
  if (!snap?.exists) return 'not-found';
  const data = snap.data()!;
  if (!carries(data)) {
    if (data.summaryTranslations === undefined) return 'none';
    await ref.update({ summaryTranslations: FieldValue.delete() });
    return 'removed';
  }
  const text = summaryText(data);
  const of = summaryHash(text.title, text.excerpt);
  const stored = data.summaryTranslations as Record<string, unknown> | undefined;
  if (stored && stored.of === of) return 'unchanged';
  const targets = translationTargets(text.title, typeof data.story === 'string' ? data.story : '');
  if (!targets.length || !text.title.trim()) {
    if (stored === undefined) return 'none';
    await ref.update({ summaryTranslations: FieldValue.delete() });
    return 'removed';
  }
  if (!opts.translate && modelsOffline()) return 'offline';
  if (opts.mayCall && !(await opts.mayCall())) return 'over-budget';
  let made: Partial<Record<TranslationTarget, SummaryText>>;
  try {
    made = await (opts.translate ?? translateSummary)(text, targets);
  } catch (e) {
    console.error('[summaryTranslations]', id, e);
    return 'failed';
  }
  return db.runTransaction(async (tx) => {
    const [now] = await tx.getAll(ref, { fieldMask: FIELDS });
    if (!now.exists) return 'not-found';
    const d = now.data()!;
    const t = summaryText(d);
    if (!carries(d) || summaryHash(t.title, t.excerpt) !== of) return 'moved';
    // Never `updatedAt`: nothing the author wrote changed (and the stored summary stays current).
    tx.update(ref, { summaryTranslations: { of, ...made } });
    return 'made';
  });
}
