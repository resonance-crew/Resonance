/**
 * The `pushState` aggregate's repositories: `devices` (one app install's push
 * token), `notificationSettings` (which pushes a person wants), `pickPushes`
 * (tonight's-card log) and `connectionCardPushes` (the day's new-card claims).
 *
 * Besides its own collections, a push reads a few facts of other aggregates
 * at send time — a block either way, the sender's pen name, a note, a tap's
 * ring, a chat message, a connection's mute — named here as the push needs
 * them (`get…For push`-style reads). They move to their aggregates' repos
 * when those lanes have them; the Firestore code is today's, moved.
 *
 * Methods take and answer domain types (`Date`, `Instant`, epoch ms, plain
 * objects), never a Firestore `DocumentData`, `Timestamp`, `DocumentReference`,
 * snapshot, `Transaction` or `FieldValue`.
 */
import type { Card } from '@/lib/db/types';
import type { StoredRecommendations } from '@/lib/recommend/stored';
import type { DeviceLocale } from '@/server/domain/push/devices';
import type { NotificationSettings, NotificationSwitch, PickLog } from '@/server/domain/push/settings';
import type { Instant } from '../time';

/** One registered install a push can reach (a device record with a token). */
export interface PushDevice {
  /** The installation id (the record's key). */
  id: string;
  token: string;
  locale: DeviceLocale;
  platform: string;
  /** What the build says it can do with a push (`registerDevice`'s `capabilities`), strings only. */
  capabilities: string[];
}

/** What `registerDevice` stores (the record's `updatedAt` is the server's time of the write). */
export interface DeviceRecord {
  userId: string;
  token: string;
  platform: string;
  locale: DeviceLocale;
  appVersion: string | null;
  capabilities: string[];
  timeZone: string | null;
}

/** A person as a push names them: their profile's fields, `''` where absent (or not a string). */
export interface PushProfile {
  exists: boolean;
  handle: string;
  avatarUrl: string;
  initials: string;
  accentColor: string;
}

/** A note, for the words its bell may put on a lock screen. */
export interface PushNote {
  fromUserId: string | null;
  toUserId: string | null;
  text: string;
}

/** A tap (共振) as its ring sees it. */
export interface PushTap {
  on: boolean;
  /** Whether `rangAt` is set at all. */
  rang: boolean;
  /** When it rang (ms), when that is a time. */
  rangAtMs: number | null;
}

/** A chat message as its push reads it. `album` / `sticker` are the stored values, for messageParts to read. */
export interface PushChatMessage {
  senderId: string | null;
  text: string;
  kind: string | null;
  unsent: boolean;
  album: unknown;
  sticker: unknown;
  hasImage: boolean;
  cardRef: string;
  /** When it was sent, when that is a time. */
  sentAt: Instant | null;
}

/** The conversation's `lastMessage` preview, as an unsend's push compares it. */
export interface PushConversationLast {
  senderId: string | null;
  unsent: boolean;
  sentAt: Instant | null;
}

/** A message of the window before a sticker (newest first). */
export interface PushWindowMessage {
  id: string;
  senderId: string | null;
  sticker: unknown;
  sentAtMs: number | null;
}

/** `connections/{pair}` as a push needs it. */
export interface PushConnection {
  exists: boolean;
  /** The pair as stored (a non-array reads as none). */
  userIds: unknown[];
  /** Who muted it (`muted[].by`, strings only). */
  mutedBy: string[];
}

/** A candidate for tonight's card: the card, and whether it is blank or kept from listings (lib/cards/blank). */
export interface PickCandidate {
  card: Card;
  blank: boolean;
  unlisted: boolean;
}

/** A just-published card as its announcement reads it (never its story). */
export interface AnnounceCard {
  exists: boolean;
  published: boolean;
  visibility: unknown;
  anonymous: unknown;
  /** Blank by its stored summary, or kept from listings (lib/cards/blank). */
  blank: boolean;
  unlisted: boolean;
  authorId: string | null;
  referenceCardId: string;
  thoughtCore: string;
  slug: unknown;
}

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
export interface PushStateTxRepo {
  /** Who the install is registered to, or null when there is no record. */
  getDeviceOwner(installationId: string): Promise<string | null>;
  deleteDevice(installationId: string): void;

  /** The stored switches, and whether a settings record exists. */
  getSettingsRecord(uid: string): Promise<{ exists: boolean; settings: NotificationSettings }>;
  /**
   * Store the switches (merged into the record), stamping `consent`'s consent
   * times; a record made now says "never consented" out loud for the others.
   */
  putSettings(uid: string, settings: NotificationSettings, write: { consent: NotificationSwitch[]; created: boolean }): void;

  getPickLog(uid: string): Promise<PickLog>;
  putPickLog(uid: string, log: PickLog): void;

  /** The day's new-card claims (`cards` only as stored for that `day`). */
  getCardClaims(uid: string): Promise<{ day: string | null; cards: string[] }>;
  putCardClaims(uid: string, day: string, cards: string[]): void;

  // What a tap's ring reads beside the bell row.
  getTap(cardId: string, uid: string): Promise<PushTap | null>;
  /** The card as its visibility rule needs it (CARD_VISIBILITY_FIELDS), or null. */
  getRingCard(cardId: string): Promise<Card | null>;
  getProfile(uid: string): Promise<PushProfile>;
  isBlocked(by: string, whom: string): Promise<boolean>;
  connectionExists(pair: string): Promise<boolean>;
  markTapRang(cardId: string, uid: string, atMs: number): void;
}

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
export interface PushStateData {
  putDevice(installationId: string, record: DeviceRecord): Promise<void>;
  /** Every record of the user's, with when it was last registered (ms; 0 when unknown). */
  listDeviceAges(uid: string): Promise<{ id: string; updatedAtMs: number }[]>;
  /** The user's installs a push can reach (records with a token). */
  listDevices(uid: string): Promise<PushDevice[]>;
  /** Every record's `capabilities` (null where it isn't a list), tokenless ones too. */
  listDeviceCapabilities(uid: string): Promise<(string[] | null)[]>;
  /** Delete these records, 500 to a batch. */
  deleteDevices(installationIds: string[]): Promise<void>;

  getSettings(uid: string): Promise<NotificationSettings>;
  getManySettings(uids: string[]): Promise<NotificationSettings[]>;
  /** A page of the ids who turned `key` on, in id order: after `after`, up to and including `upTo`. */
  listOptedIn(key: 'picks' | 'connectionCards', page: { after: string | null; upTo: string | null; limit: number }): Promise<string[]>;

  getPickLog(uid: string): Promise<PickLog>;
  getStoredPicks(uid: string): Promise<StoredRecommendations | null>;
  /** The existing cards among `ids` (in their order), as tonight's card weighs them. */
  getPickCandidates(ids: string[]): Promise<PickCandidate[]>;
  /** Everyone `uid` blocked. */
  listBlocked(uid: string): Promise<Set<string>>;
  /** The cards among `ids` their reading keeps from strangers (lib/recommend/collections). */
  unlistedForStrangers(ids: string[]): Promise<Set<string>>;
  /** Whether `uid` published a resonance naming `cardId`. */
  answeredWithPublished(uid: string, cardId: string): Promise<boolean>;
  connected(a: string, b: string): Promise<boolean>;

  getAnnounceCard(cardId: string): Promise<AnnounceCard>;
  /** The card's author, or `''`. */
  getCardAuthor(cardId: string): Promise<string>;
  listConnectionsOf(uid: string): Promise<PushConnection[]>;

  isBlocked(by: string, whom: string): Promise<boolean>;
  getProfile(uid: string): Promise<PushProfile>;
  getNote(noteId: string): Promise<PushNote | null>;
  /** When `uid`'s tap on `cardId` rang (ms), when it did. */
  getTapRangAtMs(cardId: string, uid: string): Promise<number | null>;
  /** When each of `from`'s notes on `cardId` was left (ms; null when not a time). */
  listNoteTimes(cardId: string, from: string): Promise<(number | null)[]>;
  getChatMessage(conversationId: string, messageId: string): Promise<PushChatMessage | null>;
  getConversationLast(conversationId: string): Promise<PushConversationLast | null>;
  /** The conversation's messages sent after `afterMs` and before `before` (both exclusive), newest first. */
  listMessagesBetween(conversationId: string, window: { afterMs: number; before: Instant; limit: number }): Promise<PushWindowMessage[]>;
  getConnection(pair: string): Promise<PushConnection>;
}
