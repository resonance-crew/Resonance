import type { AuthorBody } from '@/lib/api/v1/schemas';
import type { Card } from '@/lib/db/types';
import type { SignalState } from '@/server/domain/reading';
import type { PageCursor } from '../time';

/**
 * The `taps` aggregate's repositories: the resonance tap (`resonanceTaps`),
 * reading records (`readerSignals`) and the read count's day markers
 * (`cardReads`, `cards.readCount`). The services are src/server/app/{taps,
 * reading,cardReads}.ts; what each collection holds, and why, the module
 * comments of src/lib/api/v1/{taps,reading,cardReads}.ts.
 *
 * Some reads here are of other aggregates' documents (a card's visibility,
 * profiles, blocks, connections, notes, letters): the reads these services
 * make today, in the same round trips, so nothing they wait on changes.
 * Methods take and answer domain types (`Date`, ms, plain objects), never a
 * Firestore `DocumentData`, `Timestamp`, reference, snapshot, `Transaction`
 * or `FieldValue`.
 */

/** A tap that is on: who, and when it last turned on (epoch ms; 0 when unknown). */
export interface Tapper {
  uid: string;
  at: number;
  /** Their pick among the card's tap passages, as stored (round 27); null or absent when none. */
  passage?: TapPick | null;
}

/** A reader's pick among a card's tap passages as the tap document keeps it (round 27): the words themselves. */
export interface TapPick {
  id: string;
  text: string;
}

/** A reader's tap on a card as stored. */
export interface TapState {
  on: boolean;
  /** When it rang the card's author (lib/push/tapBell); null before it did. */
  rangAt: Date | null;
}

/** A page of a card's taps that are on, newest first. */
export interface TapPage {
  /** The page's taps, those whose uid names no profile id left out. */
  tappers: Tapper[];
  /** Resumes after the page's last tap (an opaque page token); null when there is no last tap to resume after. */
  next: PageCursor | null;
  /** The page came back full: a next one may follow. */
  full: boolean;
}

/** What a tap on a named card asks of the reader and its author, in one read. */
export interface TapGate {
  /** The tapper chose a pen name (conversations `hasPenName`). */
  penName: boolean;
  /** A block stands between the two, either way. */
  blocked: boolean;
}

/** Where a reader stands with a named card's author, in one read (the tap's `mayNote`). */
export interface ReaderStanding {
  /** A block stands between the two, either way. */
  blocked: boolean;
  connected: boolean;
  /** The reader's unanswered notes to the author (letters/*; conversations `lettersLeft`). */
  lettersLeft: number;
  /** Who wrote the letter their conversation holds, if any (conversations `openRequest`). */
  requestFrom: string | null;
}

/** What a reading report is checked against before anything is spent: the card (with its story) and the record's day. */
export interface ReadingGate {
  card: Card | null;
  /** The reader's record of the card: its UTC day of reports and how many it kept that day; null when there is none. */
  kept: { reportDay: unknown; reportsToday: number } | null;
}

/** What marking a reader's day on a card did. */
export type ReadDayMark = 'inserted' | 'exists' | 'gone';

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
export interface TapsTxRepo {
  /** The reader's tap on the card; null when there is none. */
  getTap(cardId: string, uid: string): Promise<TapState | null>;
  /** The card, its visibility fields only; null when it is gone. */
  getTapCard(cardId: string): Promise<Card | null>;
  /** Whether the two are connected (connections/{pair}). */
  connected(a: string, b: string): Promise<boolean>;
  /** Turn the tap on at `at`, keeping when it rang (the whole document written). */
  putTapOn(cardId: string, uid: string, at: Date, rangAt: Date | null): void;
  /** Take the tap back: `on: false` and its pick cleared (`passage: null`, round 27), the document kept (its `rangAt` is the one ring ever). */
  turnTapOff(cardId: string, uid: string): void;
  /** The card, its visibility fields with its `story` and `tapPassages` (a pick's check, round 27); null when it is gone. */
  getPassageCard(cardId: string): Promise<Card | null>;
  /** Write the reader's pick on their tap (`passage`), and nothing else: no `at`, no `rangAt` (round 27). */
  setTapPassage(cardId: string, uid: string, passage: TapPick | null): void;

  /** The reader's record of the card (anything odd read as absent); null when there is none. */
  getSignal(uid: string, cardId: string): Promise<SignalState | null>;
  /** Whether the card is still there, published and out of the trash. */
  cardLive(cardId: string): Promise<boolean>;
  /** Write the reader's record of the card whole, with the story's reading time and its TTL time. */
  putSignal(uid: string, cardId: string, state: SignalState, expectedSeconds: number): void;

  /**
   * Mark the reader's `day` on the card (one marker per reader and card, an
   * older day's replaced): `exists` when that day is already marked, `gone`
   * when the card is gone or in the trash — nothing written for either —,
   * else `inserted`. Reads first, so it comes before the transaction's other
   * writes.
   */
  insertReadDayIfAbsent(uid: string, cardId: string, day: string, expireAt: Date): Promise<ReadDayMark>;
  /** Add to the card's `readCount` (never its `updatedAt`). */
  incrementReadCount(cardId: string, by?: number): void;
}

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
export interface TapsData {
  /** A card the viewer may read, by id, its visibility fields only — not_found (ApiFailure) otherwise (reads `visibleCardById`). */
  visibleCard(viewerId: string, cardId: string): Promise<Card>;
  /** Whether `viewerId` may read the card (present `canView`). */
  canView(card: Card, viewerId: string): Promise<boolean>;
  /** The tapper's pen name and the blocks between them and the author, in one read. */
  tapGate(uid: string, authorId: string): Promise<TapGate>;
  /** Whether a block stands between the two, either way. */
  blockedEitherWay(a: string, b: string): Promise<boolean>;
  /** Where the reader stands with the author, in one read. */
  readerStanding(viewerId: string, authorId: string): Promise<ReaderStanding>;
  /** Everyone `uid` blocked (users/{uid}/blocks; present `blockedByViewer`). */
  blockedBy(uid: string): Promise<Set<string>>;
  /** Who among `uids` blocked `of`. */
  blockersOf(uids: string[], of: string): Promise<Set<string>>;
  /** Whether the reader's tap on the card is on. */
  tapIsOn(cardId: string, uid: string): Promise<boolean>;
  /** Whether the reader's tap on the card is on, and their pick while it is (round 27), in one read. */
  ownTap(cardId: string, uid: string): Promise<{ on: boolean; passage: TapPick | null }>;
  /** Everyone `uid` is connected with (valid ids, once each, never `uid`). */
  connectionsOf(uid: string): Promise<string[]>;
  /**
   * Who among `uids` is connected with `uid` (connections/{pair} read by id, whose `userIds` hold both): the
   * reader's people on a card with few taps, without reading every connection they have (P0 #6).
   */
  connectedAmong(uid: string, uids: string[]): Promise<Set<string>>;
  /**
   * At most `limit` of the card's taps that are on, in no order — every one of them when `full` is false (the
   * reader's people on a card with few taps, checked against their connections by id; P0 #6).
   */
  tapsOn(cardId: string, limit: number): Promise<{ tappers: Tapper[]; full: boolean }>;
  /** The taps of `uids` on the card that are on, in no order (a query per 30 of them, side by side). */
  tapsOnBy(cardId: string, uids: string[]): Promise<Tapper[]>;
  /**
   * A page of `limit` of the card's taps that are on, newest first, after `after` (a page token; invalid_request when
   * it isn't one). With `passage`, only the taps whose pick has that id (round 29; the same order and tokens).
   */
  tapsOnPage(cardId: string, limit: number, after?: PageCursor, passage?: string): Promise<TapPage>;
  /** The profiles behind `uids` as the contract shows them; anyone without one left out. */
  profiles(uids: string[]): Promise<Map<string, AuthorBody>>;
  /** The latest note each of `uids` left `authorId` on the card (delivered to them), its whole text. */
  latestNotesTo(cardId: string, authorId: string, uids: string[]): Promise<Map<string, string>>;
  /** Every tap on the card, a batch at a time. */
  deleteTapsOn(cardId: string): Promise<void>;

  /** The card (visibility fields and story) and the reader's record's day, in one read. */
  readingGate(uid: string, cardId: string): Promise<ReadingGate>;
  /** Every reading record of the card, a batch at a time. */
  deleteSignalsOn(cardId: string): Promise<void>;

  /** The card, its visibility fields only; null when it is gone. */
  readCard(cardId: string): Promise<Card | null>;
  /** The UTC day the reader's read of the card was last counted; null when never (or the marker expired). */
  readMarkDay(uid: string, cardId: string): Promise<string | null>;
}
