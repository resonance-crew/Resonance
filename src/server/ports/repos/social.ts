/**
 * The `social` aggregate's repositories (Phase 2, 2a-social): what the
 * clients wrote and listed straight from Firestore until now — bookmarks
 * (`users/{uid}/bookmarks/{cardId}`), blocks (`users/{uid}/blocks/{other}`),
 * the connections a person is in (`connections`, by `userIds`), the legacy
 * invites waiting for them (`invites`) — now behind /api/v1. The services are
 * src/server/app/social.ts. Domain types only: `Date`, plain objects.
 */

/** What blocking `other` reads first, in its transaction. */
export interface BlockReads {
  /** `uid` has blocked `other` already. */
  blocked: boolean;
  /** The two are connected (`connections/{pair}`). */
  connected: boolean;
  /** The pending invites between the two, either way. */
  pendingInvites: string[];
}

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
export interface SocialTxRepo {
  /** What blocking `other` changes: the block itself, the connection, the pending invites both ways. */
  readBlock(uid: string, other: string): Promise<BlockReads>;
  /**
   * Block `other` (`{ blockedUid, createdAt }`, kept as it was when already
   * there), end the connection when there is one, and withdraw every pending
   * invite between the two — what readBlock read.
   */
  block(uid: string, other: string, reads: BlockReads): void;
  /** Close a pending invite its recipient declines (`status: 'declined'`). */
  declineInvite(inviteId: string): void;
}

/** One of the people `uid` blocked. */
export interface BlockRow {
  uid: string;
  /** When; null for a block written without a time. */
  createdAt: Date | null;
}

/** One of `uid`'s connections. */
export interface ConnectionRow {
  /** The other person. */
  other: string;
  establishedAt: Date | null;
}

/** A legacy invite as its recipient lists it. */
export interface InviteRow {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  referenceCardId: string | null;
  status: string;
  createdAt: Date | null;
  expiresAt: Date | null;
}

/** Outside a transaction. */
export interface SocialData {
  /** Whether `uid` bookmarked `cardId`. */
  isBookmarked(uid: string, cardId: string): Promise<boolean>;
  /** Bookmark it (`{ cardId, createdAt }`); one already there keeps its time. */
  putBookmark(uid: string, cardId: string): Promise<void>;
  /** Take a bookmark away (none there: nothing happens). */
  deleteBookmark(uid: string, cardId: string): Promise<void>;
  /** Everyone `uid` blocked, the latest first (those without a time last). */
  listBlocks(uid: string): Promise<BlockRow[]>;
  /** Take a block away; answers whether there was one. */
  unblock(uid: string, other: string): Promise<boolean>;
  /** The people `uid` is connected with, the latest connection first. */
  listConnections(uid: string): Promise<ConnectionRow[]>;
  /** The invites sent to `uid` still `pending` (whatever their date), the latest first. */
  pendingInvitesTo(uid: string): Promise<InviteRow[]>;
}
