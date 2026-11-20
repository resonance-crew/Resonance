import { carries, summaryHash } from '@/lib/api/v1/summaryTranslations';
import { translationTargets, type TranslationTarget } from '@/lib/text/translation';
import type { ServerCtx } from '@/server/ctx';
import { summarize, type StorySummary } from '@/server/domain/summary';
import type { SummarySource, SummaryText } from '@/server/ports/repos/translations';

/**
 * A card's list summary and its translated title and excerpt, as services:
 * making (or removing) the translations after a publish or an applied edit,
 * and the summary backfill. What they are, and why, is told in
 * src/lib/api/v1/{summary,summaryTranslations,summaryTranslationsMake,
 * summaryBackfill}.ts, whose exports are facades over these.
 *
 * The model is never reached from here (src/server/README.md): the caller
 * hands it over as `translate`, so the routes that import OpenAI stay the
 * ones pinned to hnd1.
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

export interface MakeSummaryTranslationsDeps {
  /** The model call: the title and excerpt in each language asked for. */
  translate: (text: SummaryText, targets: TranslationTarget[]) => Promise<Partial<Record<TranslationTarget, SummaryText>>>;
  /** No model may be asked (the emulators), unless the caller handed its own: answer `offline` before the call. */
  offline?: boolean;
  /** Asked just before the model call (an applied edit spends the author's reindex budget); false skips it. */
  mayCall?: () => Promise<boolean>;
}

/** The title and excerpt a list shows of the card: its stored summary while current, else its story's. */
function summaryText(s: SummarySource): SummaryText {
  return { title: s.title, excerpt: s.storedExcerpt ?? summarize(s.story).excerpt };
}

const carriesSource = (s: SummarySource) => carries({ publishedAt: s.published ? true : null, visibility: s.visibility, trashedAt: s.trashed ? true : null });

/**
 * Make (or remove) card `id`'s translated title and excerpt as it is now.
 * Nothing for a card whose `of` already matches; removes them from a card
 * that may not carry any; writes what the model made only while the card
 * still has the title and excerpt it was made from (a newer save's run wins).
 */
export async function makeSummaryTranslations(ctx: ServerCtx, id: string, deps: MakeSummaryTranslationsDeps): Promise<SummaryTranslationsResult> {
  const source = await ctx.data.translations.getSummarySource(id);
  if (!source) return 'not-found';
  if (!carriesSource(source)) {
    if (source.translations === undefined) return 'none';
    await ctx.data.translations.removeSummaryTranslations(id);
    return 'removed';
  }
  const text = summaryText(source);
  const of = summaryHash(text.title, text.excerpt);
  const stored = source.translations as Record<string, unknown> | undefined;
  if (stored && stored.of === of) return 'unchanged';
  const targets = translationTargets(text.title, source.story);
  if (!targets.length || !text.title.trim()) {
    if (stored === undefined) return 'none';
    await ctx.data.translations.removeSummaryTranslations(id);
    return 'removed';
  }
  if (deps.offline) return 'offline';
  if (deps.mayCall && !(await deps.mayCall())) return 'over-budget';
  let made: Partial<Record<TranslationTarget, SummaryText>>;
  try {
    made = await deps.translate(text, targets);
  } catch (e) {
    console.error('[summaryTranslations]', id, e);
    return 'failed';
  }
  return ctx.uow.run(
    async (tx) => {
      const now = await tx.translations.getSummarySource(id);
      if (!now) return 'not-found';
      const t = summaryText(now);
      if (!carriesSource(now) || summaryHash(t.title, t.excerpt) !== of) return 'moved';
      tx.translations.putSummaryTranslations(id, { of, ...made });
      return 'made';
    },
    { label: 'summaryTranslations' },
  );
}

export interface SummaryBackfillOptions {
  /** Actually write; without it nothing changes (a dry run). */
  write?: boolean;
  /** Restate every published card's summary, even a current one (after changing how summaries are made). */
  all?: boolean;
  /** Cards read per query page. */
  pageSize?: number;
  log?: (line: string) => void;
}

export interface SummaryBackfillReport {
  /** Card documents read. */
  scanned: number;
  /** Of those, published. */
  published: number;
  /** Published cards whose stored summary is current (left alone). */
  current: number;
  /** Published cards that need one (missing, behind their story, or `all`). */
  due: number;
  /** Summaries written (0 on a dry run). */
  written: number;
  /** Writes refused because the card changed after it was read; the next run picks them up. */
  changed: number;
  /** Writes that failed otherwise. */
  failed: number;
  /** The first due card ids, for a dry run's report. */
  sample: string[];
}

const same = (a: StorySummary, b: StorySummary) => a.excerpt === b.excerpt && a.readMinutes === b.readMinutes;

/**
 * Give published cards the list summary publishing now stores: each write
 * conditional on the card being unchanged since it was read, writing only
 * the summary (src/lib/api/v1/summaryBackfill.ts).
 */
export async function backfillCardSummaries(ctx: ServerCtx, opts: SummaryBackfillOptions = {}): Promise<SummaryBackfillReport> {
  const { write = false, all = false, pageSize = 300, log = () => {} } = opts;
  const report: SummaryBackfillReport = { scanned: 0, published: 0, current: 0, due: 0, written: 0, changed: 0, failed: 0, sample: [] };
  const writer = write ? ctx.data.translations.summaryWriter() : null;
  const writes: Promise<void>[] = [];

  let last: string | null = null;
  for (;;) {
    const page = await ctx.data.translations.summaryPage(last, pageSize);
    if (!page.length) break;
    last = page[page.length - 1].id;
    report.scanned += page.length;

    for (const row of page) {
      if (!row.published) continue;
      report.published++;
      const summary = summarize(row.story);
      if (!all && row.stored && same(row.stored, summary)) {
        report.current++;
        continue;
      }
      report.due++;
      if (report.sample.length < 20) report.sample.push(row.id);
      if (!writer) continue;
      writes.push(
        writer.keep(row.id, summary, row.version).then((r) => {
          report[r]++;
        }),
      );
    }
    log(`… ${report.scanned} read, ${report.due} due`);
    if (page.length < pageSize) break;
  }

  if (writer) {
    await writer.close();
    await Promise.all(writes);
  }
  return report;
}
