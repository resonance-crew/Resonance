import type { Card } from '@/lib/db/types';
import type { Invite, KeyedReason, Origins, Profile, ResonanceCard, TakeBackPlan } from '@/server/domain/graph';

/**
 * The `graph` aggregate's repositories: who is connected to whom
 * (`connections`), why (`connectionOrigins`: `reasons{}`, `resonanceCards[]`),
 * the resonances that make it (a card's `referenceCardId`) and the bell they
 * ring once, legacy invites (`invites`), and the letters an accepted invite
 * answers. The services are src/server/app/{resonate,invites,preLetter}.ts;
 * why each collection holds what it does, the module comments of
 * src/lib/api/v1/{origins,resonate,invites,preLetter}.ts.
 *
 * Some reads and writes here are of other aggregates' documents (a card's
 * `referenceCardId`, profiles, blocks, the resonance bell, a conversation's
 * `request`, devices): the ones these services make today, in the same
 * transactions, so nothing they wait on changes. Methods take and answer
 * domain types (`Date`, plain objects), never a Firestore `DocumentData`,
 * `Timestamp`, reference, snapshot, `Transaction` or `FieldValue`.
 */

/** A card as the resonance services read it. */
export interface GraphCard {
  /** The card mapped (lib/db/firestore/mapper `mapCard`). */
  card: Card;
  /** What its reach reads (publishedAt only when stored as a timestamp). */
  resonance: ResonanceCard;
  /** `trashedAt` is set. */
  trashed: boolean;
  slug: string | null;
}

/** All a resonance's reach depends on, read in its transaction (readReach). */
export interface Reach {
  /** The resonator, and the card their resonance answers. */
  from: string;
  originalId: string;
  /** The original as it is now; null when it is gone. */
  original: Card | null;
  /** The resonator's profile (the bell carries their pen name); null when there is none. */
  me: Profile | null;
  blockOut: boolean;
  blockIn: boolean;
  connected: boolean;
  /** Why the two are connected; null when absent, or when there is no one to reach (not read). */
  origins: Origins | null;
  /** This reader's one bell for that card (resonanceBellId). */
  bellId: string;
  /** They have reached that card's author before: that bell exists, or a legacy one of theirs for that card (random id). */
  rang: boolean;
}

/** What accepting an invite reads of the two, in its transaction. */
export interface PairReads {
  me: Profile | null;
  blockOut: boolean;
  blockIn: boolean;
  connected: boolean;
  origins: Origins | null;
  /** Their conversation holds a `request` field (a letter waiting: conversations `holdsRequest`). */
  requestHeld: boolean;
}

/** The resonance bell's payload. */
export interface ResonanceBell {
  /** The original's author, whose bell it is. */
  to: string;
  from: string;
  fromHandle: string;
  cardId: string;
  /** On an anonymous card: its push opens the card, never a thread. */
  anonymous: boolean;
}

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
export interface GraphTxRepo {
  /** cards/{id}; null when absent. */
  getCard(cardId: string): Promise<GraphCard | null>;
  /** Ids of up to `limit` cards by `uid` whose referenceCardId is `targetId` (equality query, in the transaction). */
  findAnswers(uid: string, targetId: string, limit: number): Promise<string[]>;
  /**
   * What a resonance from `from` to `originalId` depends on: the original, the
   * resonator's profile and their bell for it, then — the author known and
   * someone else — the blocks both ways, the connection and its origins and,
   * while the bell isn't there, a legacy bell (an equality query on the
   * notifications, `limit(1)`) standing for it.
   */
  readReach(from: string, originalId: string): Promise<Reach>;
  /**
   * The origins holding `uid`'s resonance `cardId` (found by the card, an
   * `array-contains` query in the transaction, whatever it answers), and
   * whether taking it back ends each connection.
   */
  readTakeBack(uid: string, cardId: string): Promise<TakeBackPlan[]>;
  getInvite(inviteId: string): Promise<Invite | null>;
  /** What accepting an invite between `uid` and `other` reads. */
  readPair(uid: string, other: string): Promise<PairReads>;

  /** Point a card at the card it answers (only `referenceCardId`: not `updatedAt`). */
  pointCard(cardId: string, targetId: string): void;
  /** Stop a card answering anything (`referenceCardId` removed). */
  unpointCard(cardId: string): void;
  /** Connect two people found not connected: the connection (`extra` beside its fields) and its origins, afresh — the one reason. */
  connect(pair: [string, string], reason: KeyedReason, opts?: { extra?: Record<string, unknown> }): void;
  /**
   * More reasons two people already connected are (`origins` as read in this
   * transaction), merged beside the others; none writes nothing. Origins
   * older than reasons get `legacy` with the first. Resonance cards join
   * `resonanceCards` once (a set union).
   */
  addReason(pair: [string, string], origins: Origins | null, ...added: (KeyedReason | null)[]): void;
  /** Write what readTakeBack read: the reason goes (and its card from resonanceCards), or the connection and its origins. */
  takeBack(plans: TakeBackPlan[]): void;
  /** The resonance bell, under its fixed id (resonanceBellId), unread. */
  ringResonance(bellId: string, bell: ResonanceBell): void;
  setInviteStatus(inviteId: string, status: 'accepted' | 'expired'): void;
  /** "Invite accepted" on `to`'s bell (a new id, answered). */
  ringInviteAccepted(to: string, payload: { inviteId: string; fromUserId: string; fromHandle: string }): string;
  /** A letter between the two answered: the conversation's `request` (when `requestHeld`) and both letters/* counts go. */
  answerLetters(a: string, b: string, requestHeld: boolean): void;
}

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
export interface GraphData {
  /** A card the viewer may read, by id (reads `visibleCardById`); not_found otherwise. */
  visibleCard(viewerId: string, cardId: string): Promise<Card>;
  /** `a` has blocked `b` (users/{a}/blocks/{b}). */
  hasBlocked(a: string, b: string): Promise<boolean>;
  /** The locale of `uid`'s latest registered device on `platform` (by `updatedAt`), or null. */
  deviceLocale(uid: string, platform: string | undefined): Promise<string | null>;
  /** The profile's `primaryLocale`, as stored. */
  primaryLocale(uid: string): Promise<unknown>;
}
