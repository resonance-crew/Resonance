import type { CardReading, InsightSignature, RecommendationItem } from '@/lib/db/types';
import type { PickLog } from '@/lib/push/picks';
import type { PoolStats } from '@/lib/recommend/match';
import type { ShownCounts, StoredRecommendations } from '@/lib/recommend/stored';

/**
 * The `recommend` aggregate's repositories: `recommendations/{uid}` (a
 * reader's stored picks, their build lease, their shown counts),
 * `userProfiles/{uid}`, `cardSignatures/{cardId}` (a card's reading),
 * `config/recommendPool` (the pool's kept numbers), and the reads of the
 * reader's acts and of the cards' index fields the recommender makes
 * (src/lib/recommend, src/server/app/recommend*.ts).
 *
 * Methods take and answer domain types (`Date`, ms numbers, plain objects),
 * never a Firestore `DocumentData`, `Timestamp`, `DocumentReference`,
 * snapshot, `Transaction` or `FieldValue`. "Stamped by the store" means the
 * database's own clock (Firestore's server timestamp) — the memory adapter
 * stamps the wall clock's.
 */

/** What a build's result writes on `recommendations/{uid}` (with `generatedAt` stamped by the store, the lease and the failure cleared). */
export interface PicksWrite {
  date: string;
  items: RecommendationItem[];
  partial: boolean;
  coldStart: boolean;
  /** The warm-up cron's build: marked `warm`, `askedOn` left as it was. Otherwise `warm` cleared and `askedOn = date`. */
  warm: boolean;
}

/** The pool's numbers as kept (`config/recommendPool`). */
export interface StoredPoolStats extends PoolStats {
  /** How many listed public cards the pool held. */
  cards: number;
  embedModel: string;
  /** When they were worked out (ms; 0 when unknown). */
  at: number;
}

/** What the reader did, as stored — times in ms (null when absent or not a time), the rest as found (validated by the caller). */
export interface ReaderActivity {
  /** Their own cards (up to the read limit): published when, trashed or not, which card it answers. */
  own: { id: string; publishedAt: number | null; trashed: boolean; referenceCardId: unknown }[];
  notes: { cardId: unknown; createdAt: number | null }[];
  taps: { cardId: unknown; on: boolean; at: number | null }[];
  /** `users/{uid}/bookmarks`: the doc id stands in when `cardId` is absent. */
  saved: { id: string; cardId: unknown; createdAt: number | null }[];
  reading: {
    cardId: unknown;
    lastAt: number | null;
    reachedEndAt: number | null;
    rereads: unknown;
    rereadAt: number | null;
    shared: boolean;
    activeSeconds: unknown;
    maxProgress: unknown;
    expectedSeconds: unknown;
  }[];
  /** `recommendations/{uid}.shown`, read defensively. */
  shown: ShownCounts;
}

/** A connection's named public card that may be shown (published, not trashed, not thin, not a placeholder). */
export interface ConnectionCard {
  cardId: string;
  authorId: string;
  publishedAt: number;
}

/** The card's fields indexing reads first (`cards/{id}`), as found. */
export interface CardIndexFields {
  publishedAt: unknown;
  thoughtCore: unknown;
  story: unknown;
  authorId: unknown;
  visibility: unknown;
  trashed: boolean;
  thin: boolean;
  contentHash: string | undefined;
  indexPending: boolean;
}

/** The card's visibility fields, as found (vectorVisibility decides from them). */
export interface CardVisibilityFields {
  visibility: unknown;
  trashed: boolean;
}

/** What a card's reading row holds (`cardSignatures/{cardId}`), `updatedAt` stamped by the store. */
export type ReadingRow = CardReading & {
  authorId: string;
  version: number;
  model: string;
  embedModel: string;
  listedForStrangers: boolean;
  templated: boolean;
  rewritten: boolean;
  error: string | null;
  usage: { input: number; output: number; reasoning: number; embed: number };
};

/** A failed reading, merged beside the last good one (`failedAt` stamped by the store). */
export interface ReadingFailure {
  authorId: string;
  error: string;
  usage: { input: number; output: number; reasoning: number };
}

/** What the warm-up reads of a reader before deciding to build their picks. */
export interface WarmInputs {
  /** The latest `devices/*.updatedAt` (ms) of their installs that have a push token; 0 when none. */
  lastSeen: number;
  picks: StoredRecommendations | null;
  pickLog: PickLog;
}

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
export interface RecommendTxRepo {
  /** `recommendations/{uid}`, or null. */
  getPicks(uid: string): Promise<StoredRecommendations | null>;
  /** `recommendations/{uid}.shown` ({} when none). */
  getShown(uid: string): Promise<ShownCounts>;
  /** The reader's build lease until `until` (ms), merged. */
  putLease(uid: string, until: number): void;
  /** A build's result the reader is answered with now, and the counts of what they were shown (merged). */
  putServedPicks(uid: string, picks: PicksWrite, shown: ShownCounts): void;
  /** The reader asked on `day` and was shown these counts (`askedOn` and `shown` replaced whole, nothing else touched). */
  putAsked(uid: string, day: string, shown: ShownCounts): void;

  /** The card's title, story, `thin` and `signature` — null when it is gone. */
  getCardText(cardId: string): Promise<{ thoughtCore: unknown; story: unknown; thin: boolean; signature: InsightSignature | undefined } | null>;
  /** Whether the card is there. */
  cardExists(cardId: string): Promise<boolean>;
  /** Mark the card's reading made from text of this hash, and its owed reading settled (an update). */
  patchCardIndexed(cardId: string, hash: string): void;
  /** Stamp `thin` on the card (true, or cleared) (an update). */
  patchCardThin(cardId: string, thin: boolean): void;
  /** Write the card's reading whole. */
  putReading(cardId: string, row: ReadingRow): void;
  /** Merge a failed reading beside the last good one. */
  mergeReadingFailure(cardId: string, failure: ReadingFailure): void;
}

/** Outside a transaction: reads, and writes that need none. */
export interface RecommendData {
  /** `recommendations/{uid}`, or null. */
  getPicks(uid: string): Promise<StoredRecommendations | null>;
  /** A build's result, merged (no shown counts). */
  putPicks(uid: string, picks: PicksWrite): Promise<void>;
  /** A failed build at `at` (ms), the lease cleared. */
  putFailure(uid: string, at: number): Promise<void>;
  /** `userProfiles/{uid}`: the taste's card ids and weights only (`updatedAt` stamped by the store). */
  putProfile(uid: string, taste: { cardId: string; w: number }[], against: { cardId: string; w: number }[]): Promise<void>;

  /** What the reader did (ReaderActivity), each kind up to `limit`. */
  readerActivity(uid: string, limit: number): Promise<ReaderActivity>;
  /** Whom the reader is connected with (their connections' uids, sorted). */
  connectionIds(uid: string): Promise<string[]>;
  /** Authors of the named originals the reader's published, public, named resonances answer (never the reader). */
  engagedAuthorIds(uid: string): Promise<Set<string>>;
  /** Which of these cards are under their author's name now (a card gone is left out). */
  namedCardIds(cardIds: string[]): Promise<Set<string>>;
  /** Which of these cards their reading keeps from strangers (`listedForStrangers: false`). */
  unlistedForStrangers(cardIds: string[]): Promise<Set<string>>;
  /** These authors' named public cards that may be shown (up to 200 read), unsorted. */
  connectionCards(authorIds: string[]): Promise<ConnectionCard[]>;

  /** The kept pool numbers, or null (none yet, another model's). */
  getPoolStats(embedModel: string): Promise<StoredPoolStats | null>;
  /** Keep the pool numbers (`at` stamped by the store). */
  putPoolStats(stats: Omit<StoredPoolStats, 'at'>): Promise<void>;

  /** The card's index fields, or null when it is gone. */
  getCardForIndex(cardId: string): Promise<CardIndexFields | null>;
  /** The card's visibility fields, or null when it is gone. */
  getCardVisibility(cardId: string): Promise<CardVisibilityFields | null>;
  /** Mark the card's reading owed (`indexPendingAt` stamped by the store): 'not-found' when the card is gone. */
  markIndexPending(cardId: string): Promise<'ok' | 'not-found'>;
  /** Clear the card's owed reading; a card gone is no error. */
  clearIndexPending(cardId: string): Promise<void>;
  /** Put the card's through line on it (`signature` whole, `indexedAt` stamped): 'not-found' when the card is gone. */
  putCardSignature(cardId: string, signature: InsightSignature): Promise<'ok' | 'not-found'>;
  /** Cards whose reading is owed, oldest mark first (ids). */
  listIndexPending(limit: number): Promise<string[]>;
  /** Readings in formula phrasings, whether they were asked again. */
  listTemplated(limit: number): Promise<{ cardId: string; rewritten: boolean }[]>;

  /** What the warm-up reads of a reader (WarmInputs). */
  warmInputs(uid: string): Promise<WarmInputs>;
  /** The readers who turned "a card for tonight" on, a page at a time, from the walk's point round to it. */
  pickReaders(opts: { from: string; pageSize?: number }): AsyncGenerator<string[]>;
}
