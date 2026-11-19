import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { mirrorModel } from '../../src/lib/ai/openai';
import { costOf, dollars } from '../../src/lib/ai/prices';
import { translateStory, type TranslatedStory } from '../../src/lib/ai/translate';
import { translationHash } from '../../src/lib/api/v1/translationHash';
import { modelsOffline, TRANSLATE_MAX_CHARS, translationTargets, type TranslationTarget } from '../../src/lib/text/translation';

/** About how many tokens a character of a story is, each way (Chinese is about one; English less): an estimate's. */
const TOKENS_PER_CHAR = 0.9;
/** A piece's prompt and a reasoning model's thinking, about (an estimate's). */
const OVERHEAD = { input: 600, output: 800 };

export interface StoryTranslationsOptions {
  apply: boolean;
  log?: (line: string) => void;
  concurrency?: number;
  pauseMs?: number;
  /** The model call (translateStory); a test stands in for it. */
  translate?: (input: { title: string; story: string }, to: TranslationTarget) => Promise<TranslatedStory>;
}

export interface StoryTranslationsReport {
  /** Published, public, not in the trash. */
  publicCards: number;
  /** A card and a language it may go into, without a kept translation of its words as they are. */
  candidates: number;
  tooLong: number;
  estimate: { input: number; output: number; cost: number | null };
  made: number;
  failed: number;
}

/**
 * The card page's translate line (round 25 §F5) makes a story's translation for its first reader and keeps it
 * (`cards/{id}/translations/{to}`, POST /api/v1/cards/{key}/translation): that reader waits for the model, every
 * later one is answered at once. This makes them now for every story a reader may translate — published, public
 * (named or anonymous), not in the trash, at most TRANSLATE_MAX_CHARS, in a script we translate — into each
 * language it may go into, whose kept translation is missing or no longer of its words (the `hash` over title and
 * story). Kept exactly as the route keeps it, so the route answers them; `concurrency` at a time with a pause
 * between, so the model's rate limit is never met. Nobody's budget is charged (the owner runs it); the card itself
 * is not written. Idempotent: a story done is no candidate again until its title or story changes. Without
 * `apply` it only counts and estimates.
 */
export async function backfillStoryTranslations(db: Firestore, opts: StoryTranslationsOptions): Promise<StoryTranslationsReport> {
  const log = opts.log ?? console.log;
  const snap = await db
    .collection('cards')
    // The published cards, their visibility asked below (no composite index for this one-off read).
    .where('publishedAt', '!=', null)
    .select('thoughtCore', 'story', 'visibility', 'trashedAt')
    .get();
  const cards = snap.docs.filter((doc) => doc.get('visibility') === 'public' && doc.get('trashedAt') == null);
  const report: StoryTranslationsReport = {
    publicCards: cards.length,
    candidates: 0,
    tooLong: 0,
    estimate: { input: 0, output: 0, cost: null },
    made: 0,
    failed: 0,
  };

  const asked: { id: string; title: string; story: string; hash: string; to: TranslationTarget }[] = [];
  for (const doc of cards) {
    const title = typeof doc.get('thoughtCore') === 'string' ? (doc.get('thoughtCore') as string) : '';
    const story = typeof doc.get('story') === 'string' ? (doc.get('story') as string) : '';
    const targets = translationTargets(title, story);
    if (!targets.length) continue;
    if (story.length > TRANSLATE_MAX_CHARS) {
      report.tooLong++;
      continue;
    }
    const hash = translationHash(title, story);
    const kept = await db.getAll(...targets.map((to) => db.doc(`cards/${doc.id}/translations/${to}`)));
    targets.forEach((to, i) => {
      const k = kept[i];
      // As the route reads a kept one: of these words, and whole.
      if (k.exists && k.get('hash') === hash && typeof k.get('title') === 'string' && typeof k.get('story') === 'string') return;
      asked.push({ id: doc.id, title, story, hash, to });
    });
  }
  report.candidates = asked.length;
  const chars = asked.reduce((n, a) => n + a.title.length + a.story.length, 0);
  report.estimate.input = Math.round(chars * TOKENS_PER_CHAR) + asked.length * OVERHEAD.input;
  report.estimate.output = Math.round(chars * TOKENS_PER_CHAR) + asked.length * OVERHEAD.output;
  report.estimate.cost = costOf(mirrorModel(), report.estimate);
  log(`published public cards: ${cards.length}; stories to translate: ${asked.length} (${chars.toLocaleString('en')} characters), over the length limit: ${report.tooLong}`);
  log(`  model ${mirrorModel()}; estimate: ~${report.estimate.input.toLocaleString('en')} input + ~${report.estimate.output.toLocaleString('en')} output tokens, ${dollars(report.estimate.cost)}`);
  if (!opts.apply || !asked.length) return report;

  // Against the emulators no model is asked (modelsOffline), as the route does: there a test brings its own.
  const translate = opts.translate ?? (modelsOffline() ? null : translateStory);
  if (!translate) {
    log('  no model to ask (the emulators): nothing made');
    report.failed = asked.length;
    return report;
  }
  const concurrency = opts.concurrency ?? 2;
  const pause = opts.pauseMs ?? 500;
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < asked.length) {
        const a = asked[next++];
        try {
          const made = await translate({ title: a.title, story: a.story }, a.to);
          await db
            .doc(`cards/${a.id}/translations/${a.to}`)
            .set({ title: made.title, story: made.story, hash: a.hash, model: mirrorModel(), createdAt: FieldValue.serverTimestamp() });
          report.made++;
        } catch (e) {
          report.failed++;
          log(`  ${a.id} → ${a.to}: failed (${e instanceof Error ? e.message : String(e)})`);
        }
        if (pause) await new Promise((r) => setTimeout(r, pause));
      }
    }),
  );
  log(`made ${report.made}, failed ${report.failed}`);
  return report;
}
