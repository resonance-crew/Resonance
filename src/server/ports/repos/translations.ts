import type { TranslationTarget } from '@/lib/text/translation';
import type { StorySummary } from '@/server/domain/summary';

/**
 * The `translations` aggregate's repositories: what is kept on a card about
 * its words, not the words themselves — its list summary (`excerpt`,
 * `readMinutes`, `excerptAt`), its title and excerpt translated by AI
 * (`cards.summaryTranslations`), and its story translated
 * (`cards/{id}/translations/{to}`). The services are
 * src/server/app/{summary,translation}.ts; what each field holds, and why,
 * the module comments of src/lib/api/v1/{summary,summaryTranslations,
 * translation}.ts.
 *
 * Methods take and answer domain types (`Date`, plain objects), never a
 * Firestore `DocumentData`, `Timestamp`, reference, snapshot, `Transaction`
 * or `FieldValue`.
 */

/** A language a story or summary is translated into. */
export type TranslationLang = TranslationTarget;

/** A title and excerpt in one language. */
export interface SummaryText {
  title: string;
  excerpt: string;
}

/** `cards.summaryTranslations` as written: the hash it was made from, and each language made. */
export type SummaryTranslationsValue = { of: string } & Partial<Record<TranslationLang, SummaryText>>;

/** What making a card's translated summaries reads of it. */
export interface SummarySource {
  /** `thoughtCore` when a string, else ''. */
  title: string;
  /** `story` when a string, else ''. */
  story: string;
  /** The stored summary's excerpt while it still describes the story; else null. */
  storedExcerpt: string | null;
  /** `publishedAt` is set at all. */
  published: boolean;
  visibility: unknown;
  /** `trashedAt` is set at all. */
  trashed: boolean;
  /** `summaryTranslations` as stored, `undefined` when the field is absent. */
  translations: unknown;
}

/** What making a card's tap passages reads of it (round 27; lib/cards/tapPassages). */
export interface PassageSource {
  /** `thoughtCore` when a string, else ''. */
  title: string;
  /** `story` when a string, else ''. */
  story: string;
  /** The fields `offersPassages` reads (publishedAt, visibility, trashedAt, story…), as stored. */
  fields: Record<string, unknown>;
  /** `tapPassages` as stored, `undefined` when the field is absent. */
  tapPassages: unknown;
  /** The card's through line (`signature.coreInsight`, its reading's) when it has one: the pick's guide (Wave 2 #3a). */
  insight: string | null;
}

/** `cards.tapPassages` as made: the story's hash, the items (none: settled), the model; its `at` the write's time. */
export interface TapPassagesValue {
  of: string;
  items: { id: string; text: string }[];
  model: string;
  /** PASSAGES_VERSION when made (Wave 2 #3a). */
  v: number;
}

/** A story's kept translation (`cards/{id}/translations/{to}`), when its title and story are text. */
export interface KeptTranslation {
  /** The hash of the title and story it was made from (translationHash); null when it has none. */
  hash: string | null;
  title: string;
  story: string;
  /** Its passages as it says them (round 31), as stored — `{ of, items }` — or undefined (lib/cards/translatedPassages reads it). */
  passages?: unknown;
}

/** A story's translation to keep. */
export interface NewTranslation {
  title: string;
  story: string;
  hash: string;
  /** The model that made it. */
  model: string;
}

/** A card as the summary backfill reads it. */
export interface SummaryRow {
  id: string;
  /** `publishedAt` is set at all. */
  published: boolean;
  /** `story` when a string, else ''. */
  story: string;
  /** The stored summary while it still describes the story; else null. */
  stored: StorySummary | null;
  /** Opaque: the version of the card that was read (a write holds only while it is unchanged). */
  version: string;
}

/** What keeping one summary did: written, refused because the card changed since it was read, or failed otherwise. */
export type SummaryKeep = 'written' | 'changed' | 'failed';

/** Bulk summary writes: each conditional on the card's version, retried a few times unless the card changed. */
export interface SummaryWriter {
  /** Write the summary (`excerptAt` the write's own server time) if the card is still at `version`. */
  keep(id: string, summary: StorySummary, version: string): Promise<SummaryKeep>;
  /** Every write sent; resolves once they are done. */
  close(): Promise<void>;
}

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
export interface TranslationsTxRepo {
  /** The card as summary translations are made from it; null when it is gone. */
  getSummarySource(id: string): Promise<SummarySource | null>;
  /** Store the card's translated summaries (never its `updatedAt`). */
  putSummaryTranslations(id: string, value: SummaryTranslationsValue): void;
  /** The card as its tap passages are made from it; null when it is gone. */
  getPassageSource(id: string): Promise<PassageSource | null>;
  /** Store the card's tap passages whole, `at` the write's time (never its `updatedAt`; a failure count goes with it). */
  putTapPassages(id: string, value: TapPassagesValue): void;
}

/** Outside a transaction: reads, and writes that need none. */
export interface TranslationsData {
  /** The card as summary translations are made from it; null when it is gone. */
  getSummarySource(id: string): Promise<SummarySource | null>;
  /** Remove the card's translated summaries (the card must exist). */
  removeSummaryTranslations(id: string): Promise<void>;
  /** The card as its tap passages are made from it; null when it is gone. */
  getPassageSource(id: string): Promise<PassageSource | null>;
  /** Remove the card's tap passages (the card must exist). */
  removeTapPassages(id: string): Promise<void>;
  /** Count a failed pick for the story `of` (`tapPassages.failed`), the passages kept as they were. */
  putTapPassagesFailed(id: string, failed: { of: string; tries: number }): Promise<void>;

  /** The story's kept translation into `to`; null when there is none (or its title or story isn't text). */
  getKeptTranslation(cardId: string, to: TranslationLang): Promise<KeptTranslation | null>;
  /** Keep a translation of the story into `to` (whole, `createdAt` the server's time). */
  keepTranslation(cardId: string, to: TranslationLang, value: NewTranslation): Promise<void>;
  /** Keep where the kept translation into `to` says the card's passages (round 31), whole: `of` names the passages. */
  keepTranslationPassages(cardId: string, to: TranslationLang, value: { of: string; items: { id: string; text: string }[] }): Promise<void>;

  /** Up to `limit` cards in id order, after the id `after` (from the first when null or ''). */
  summaryPage(after: string | null, limit: number): Promise<SummaryRow[]>;
  /** A writer for the backfill's summaries. */
  summaryWriter(): SummaryWriter;

  /** Whether one of `uid`'s cards answers card `cardId` (`referenceCardId`). */
  hasAnswerTo(uid: string, cardId: string): Promise<boolean>;
}
