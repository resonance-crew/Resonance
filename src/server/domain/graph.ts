/**
 * The graph aggregate's pure policy and names: why two people are connected
 * (`connectionOrigins`), and when a resonance — a card answering another
 * (`referenceCardId`) — may reach its original's author. Why each is as it
 * is: the module comments of src/lib/api/v1/{origins,resonate,invites}.ts;
 * the services are src/server/app/{resonate,invites,preLetter}.ts.
 */

/** `connectionOrigins/{pair}` = `{ userIds, reasons: { [key]: reason }, resonanceCards: string[] }`. */
export const ORIGINS = 'connectionOrigins';

/** The id two people's connection, conversation and origins share: the two uids, sorted, joined by "_" (conversations `pairOf`). */
export const pairKey = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);

/**
 * A reason two people are connected, as a service names it. The stores add
 * when it was given (`at`: Firestore's server time) as they write it.
 */
export type ConnectionReason =
  | { kind: 'resonance'; by: string; cardId: string; originalId: string }
  /** `by`, the original's author, wrote to `to`, whose resonance with their card stood. */
  | { kind: 'answered'; by: string; to: string }
  | { kind: 'letter'; by: string }
  | { kind: 'invite'; inviteId: string }
  | { kind: 'legacy' };

/** A reason and its key among the reasons. */
export interface KeyedReason {
  key: string;
  reason: ConnectionReason;
}

/**
 * Two people's origins as read: `reasons` when the document keeps them, null
 * for one written beside a connection older than reasons. An absent document
 * is `null` itself, wherever an `Origins | null` is taken.
 */
export interface Origins {
  reasons: Record<string, unknown> | null;
}

/** A resonance's key among the reasons: its writer and its card. */
export const resonanceKey = (by: string, cardId: string) => `resonance_${by}_${cardId}`;

export const resonanceReason = (by: string, cardId: string, originalId: string): KeyedReason => ({
  key: resonanceKey(by, cardId),
  reason: { kind: 'resonance', by, cardId, originalId },
});
export const letterReason = (by: string): KeyedReason => ({ key: 'letter', reason: { kind: 'letter', by } });
export const inviteReason = (inviteId: string): KeyedReason => ({ key: `invite_${inviteId}`, reason: { kind: 'invite', inviteId } });

export const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whether origins keep reasons: absent ones, and ones older than reasons, don't. */
export const keepsReasons = (origins: Origins | null | undefined): origins is Origins & { reasons: Record<string, unknown> } =>
  !!origins && isMap(origins.reasons);

/**
 * What `uid` writing to `other` answers (see src/lib/api/v1/origins.ts
 * `answeredBy`): a resonance of `other`'s standing on a card of `uid`'s,
 * kept as `answered_{other}` for good; null when it answers none or the
 * answer is kept already.
 */
export function answeredByReasons(origins: Origins | null | undefined, uid: string, other: string): KeyedReason | null {
  if (!keepsReasons(origins)) return null;
  const reasons = origins.reasons;
  const key = `answered_${other}`;
  if (reasons[key] !== undefined) return null;
  // A reason of this pair's by `other` answers a card of the other one's: `uid`'s.
  const stands = Object.values(reasons).some((r) => isMap(r) && r.kind === 'resonance' && r.by === other);
  return stands ? { key, reason: { kind: 'answered', by: uid, to: other } } : null;
}

/** The resonance cards among reasons (what a take-back finds origins by). */
export const resonanceCardsOf = (list: KeyedReason[]) => list.flatMap(({ reason }) => (reason.kind === 'resonance' ? [reason.cardId] : []));

/** What taking one resonance back does to one pair (readTakeBack → takeBack). */
export interface TakeBackPlan {
  /** connections/{pair} and connectionOrigins/{pair}. */
  pair: string;
  key: string;
  cardId: string;
  /** No other reason keeps the two connected: the connection goes. */
  ends: boolean;
}

/** What taking back `uid`'s resonance `cardId` leaves of one pair's origins (a takeBackCandidate): the connection ends exactly when no other reason is left. */
export function takeBackPlan(uid: string, cardId: string, pair: string, origins: Origins, connected: boolean): TakeBackPlan {
  const key = resonanceKey(uid, cardId);
  const left = Object.keys(origins.reasons ?? {}).filter((k) => k !== key);
  return { pair, key, cardId, ends: connected && !left.length };
}

/** Whether origins found by a resonance card are a candidate for `uid`'s take-back (read before its connection is). */
export function takeBackCandidate(uid: string, cardId: string, origins: Origins, userIds: unknown): boolean {
  return keepsReasons(origins) && origins.reasons[resonanceKey(uid, cardId)] !== undefined && Array.isArray(userIds) && userIds.includes(uid);
}

// --- resonances ----------------------------------------------------------------------------------------------------

/**
 * The one bell row a reader's resonances with a card ring, whichever of
 * their cards answers it and whichever path reaches it: the original author
 * is rung once.
 */
export const resonanceBellId = (uid: string, targetId: string) => `resonance_${uid}_${targetId}`;

/** A document id that can be put in a path (a stored field could hold anything). */
export const docId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.includes('/');

/** A card's stored fields, as these checks read them. */
type Fields = { visibility?: unknown; anonymous?: unknown } | undefined;

/** Whether a resonance may reach the original's author at all: only one shown publicly under its writer's name. */
export function reachable(card: Fields): boolean {
  return card?.visibility === 'public' && card.anonymous !== true;
}

/** Whether a change to a card (`before` → `after`) made a published resonance reachable where it wasn't. */
export function becameReachable(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  return before.publishedAt != null && docId(after.referenceCardId) && !reachable(before) && reachable(after);
}

/** Whether a card is a published resonance its original's list doesn't show under its writer's name. */
export function hiddenResonance(card: Record<string, unknown>): boolean {
  return card.publishedAt != null && docId(card.referenceCardId) && !reachable(card);
}

/**
 * A card's fields a resonance's reach reads. `publishedAt` is the stored
 * publish time when it is a stored timestamp, else null (service
 * `properlyPublished`: anything else was never published by the server).
 */
export interface ResonanceCard {
  authorId?: unknown;
  referenceCardId?: unknown;
  visibility?: unknown;
  anonymous?: unknown;
  publishedAt: Date | null;
}

/** A publish time the server could have written: a timestamp no more than an hour ahead (service `properlyPublished`). */
export const properlyPublishedAt = (at: Date | null, now: number) => at != null && at.getTime() <= now + 60 * 60 * 1000;

/** A profile's stored fields (users/{uid}); null when there is none. */
export type Profile = Record<string, unknown>;

/** Whether a profile has a pen name (conversations `hasPenName`). */
export function penName(me: Profile | null | undefined): boolean {
  const handle = me ? me.handle : null;
  return typeof handle === 'string' && handle.trim().length > 0;
}

// --- invites -------------------------------------------------------------------------------------------------------

/** `invites/{id}` as acceptInvite reads it; `expiresAt` null when missing or not a timestamp. */
export interface Invite {
  fromUserId: unknown;
  toUserId: unknown;
  status: unknown;
  expiresAt: Date | null;
}

/** Whether an invite's `expiresAt` is still ahead (a missing or malformed one never is). */
export const inviteOpen = (expiresAt: Date | null, now: number) => expiresAt != null && expiresAt.getTime() > now;
