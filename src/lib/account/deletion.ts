import { restoreCard, trashCard } from '@/lib/api/v1/trash';
import {
  purgeAccountDataIn,
  purgeAccountIn,
  purgeDueAccountsIn,
  scheduleAccountDeletionIn,
  UPLOAD_DELETE_BATCH,
  type PurgeInOptions,
  type PurgeReport,
  type PurgeRun,
  type PurgeRunOptions,
} from '@/server/app/account';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';
import { DELETIONS_COLLECTION, firestorePurgeSession, type BulkWriter } from '@/server/infra/firestore/repos/account';
import type { AccountDeletion } from '@/server/ports/repos/account';
import { DELETION_GRACE_DAYS } from './constants';

export { DELETION_GRACE_DAYS, DELETIONS_COLLECTION, UPLOAD_DELETE_BATCH };
export type { AccountDeletion, PurgeReport, PurgeRun, PurgeRunOptions };

type Firestore = AdminDb;

/**
 * Account deletion (App Store 5.1.1(v) / Google Play account-deletion policy).
 *
 * Deletion is scheduled, not immediate: the request is recorded in
 * `accountDeletions/{uid}` and the account is purged once `purgeAfter` has
 * passed ({@link DELETION_GRACE_DAYS} days). Signing back in during the grace
 * period shows a banner that cancels it. The daily cron
 * (`/api/cron/purge-accounts`) runs {@link purgeDueAccounts}.
 *
 * `accountDeletions` is admin-only (rules deny all client access) — the
 * request itself must not be forgeable or visible to other users.
 *
 * These are the legacy facades (任務 #3 Phase 1): the services are
 * `src/server/app/account.ts` over `ctx.data.account`, and what the purge
 * deletes is the registry's (`src/server/domain/schema/registry.ts`).
 */

export function scheduleAccountDeletion(db: Firestore, uid: string, now: Date = new Date()): Promise<AccountDeletion> {
  return scheduleAccountDeletionIn(ctxFor(db), uid, DELETION_GRACE_DAYS, now);
}

/**
 * Out of sight from the moment the deletion is scheduled: the account's
 * published anonymous cards go to its trash (marked `trashedFor: 'deletion'`),
 * as if their author had put them there — so, private to everyone and
 * answering every probe as a deleted card does, their notes, taps and
 * readers' reading records deleted (lib/api/v1/trash), their pages never
 * revalidated beside the profile's. Left until the purge, an anonymous card
 * would turn from "there" to "gone" in the same run as its author's profile
 * and say whose it was; this way it goes days before, as any
 * card its author trashed. Cancelling brings back these alone
 * (releaseHeldCards). Returns the card pages to revalidate. Best effort, a
 * card at a time: the deletion stands whatever this does.
 */
export async function holdAnonymousCards(db: Firestore, uid: string): Promise<string[]> {
  const cards = await db.collection('cards').where('authorId', '==', uid).where('anonymous', '==', true).select('publishedAt', 'trashedAt').get();
  const stale: string[] = [];
  for (const d of cards.docs) {
    if (d.get('publishedAt') == null || d.get('trashedAt') != null) continue;
    try {
      stale.push(...(await trashCard(db, uid, d.id, { forDeletion: true })).stale);
    } catch (err) {
      console.error(`Account deletion: could not hold card ${d.id}`, err);
    }
  }
  return stale;
}

/** A cancelled deletion's held cards back from the trash, as they were (restoreCard). Returns the pages to revalidate. */
export async function releaseHeldCards(db: Firestore, uid: string): Promise<string[]> {
  const held = await db.collection('cards').where('authorId', '==', uid).where('trashedFor', '==', 'deletion').select().get();
  const stale: string[] = [];
  for (const d of held.docs) {
    try {
      stale.push(...(await restoreCard(db, uid, d.id)).stale);
    } catch (err) {
      console.error(`Account deletion: could not bring back card ${d.id}`, err);
    }
  }
  return stale;
}

export function cancelAccountDeletion(db: Firestore, uid: string): Promise<void> {
  return ctxFor(db).data.account.deleteDeletion(uid);
}

export function getAccountDeletion(db: Firestore, uid: string): Promise<AccountDeletion | null> {
  return ctxFor(db).data.account.getDeletion(uid);
}

/*
 * Every place a user's data lives is the registry's
 * (`src/server/domain/schema/registry.ts`): the purge's queries are derived
 * from it (`purgePlan()`, the Firestore adapter in
 * `src/server/infra/firestore/repos/account.ts`, which keeps
 * `collectAccountData()`'s old queries), and `registry.test.ts` fails when a
 * collection in `firebase/firestore.rules` or in the code is not registered,
 * or names a person nobody deletes. A new collection that stores a uid
 * belongs there.
 *
 * Deliberately kept: other people's cards that responded to this user's cards
 * (their `referenceCardId` dangles and readers resolve it to null, the same
 * as for a deleted card), other users' bookmarks of this user's cards
 * (`users/{other}/bookmarks/{cardId}` stores only the card's id, no uid: the
 * card goes under a tombstone and the shelf drops what no longer resolves —
 * the bookmark is the other person's record, not this user's), and reports
 * filed *against* the user (moderation history) — but not the
 * copy of what they wrote that a report kept (`reportEvidence`): that is
 * their writing, and goes with them, as it does with the reporter's account.
 *
 * Some records are found through one of the user's cards: other readers'
 * legacy resonance records (which name only the card), every note left on
 * it, the taps (共振) on it and others' records of reading it. Each goes just
 * before its card (`byCard`), so a purge cut short never leaves one behind
 * whose card is gone. Notes left on a card deleted earlier are found by whom
 * they were for: `toUserId`, or `withheldFor` for one withheld across a block
 * (left on an anonymous card, delivered to no one) — so the withheld ones go
 * with the delivered: one outliving the card's author would tell its writer
 * that a block stood between them and whoever wrote it.
 */

export interface PurgeOptions {
  /** The run's writer, shared by the accounts it purges; one of its own otherwise. */
  writer?: BulkWriter;
  /** Start nothing new past this time (`clock()` ms); see {@link PurgeReport.complete}. */
  deadline?: number;
  clock?: () => number;
}

function inOptions(db: Firestore, opts: PurgeOptions): PurgeInOptions {
  return { session: opts.writer ? firestorePurgeSession(db, opts.writer) : undefined, deadline: opts.deadline, clock: opts.clock };
}

/**
 * Remove every Firestore record of `uid` (the registry's purge plan): the
 * trees side by side through one BulkWriter, then the records pointing at
 * the user, then the user's own roots. Any delete that fails throws once the
 * rest are done — the request stays, and the next run tries again.
 */
export function purgeAccountData(db: Firestore, uid: string, opts: PurgeOptions = {}): Promise<PurgeReport> {
  return purgeAccountDataIn(ctxFor(db), uid, inOptions(db, opts));
}

export interface PurgeDeps {
  db: Firestore;
  /** Removes the sign-in account (firebase-admin `auth.deleteUser`). */
  deleteAuthUser: (uid: string) => Promise<void>;
  /** Removes uploaded files under a key prefix (older keys carry the uid); failures are logged, not fatal. */
  deleteStoragePrefix?: (prefix: string) => Promise<number>;
  /** Removes one uploaded file (the ones `uploads/*` records as the user's); failures are logged, not fatal. */
  deleteStorageObject?: (key: string) => Promise<void>;
  /**
   * Removes many uploaded files at once (a store's batch delete, UPLOAD_DELETE_BATCH a call), in place of
   * deleteStorageObject; failures are logged, not fatal.
   */
  deleteStorageObjects?: (keys: string[]) => Promise<void>;
  /** Removes chat pictures' files (lib/storage/chatImages, a page's at once); failures are logged, not fatal. */
  deleteChatImageFiles?: (keys: string[]) => Promise<void>;
  /** Drops cached pages (logical paths, `revalidateLocalized` in the cron); failures are logged, not fatal. */
  revalidate?: (paths: string[]) => unknown;
}

/**
 * Full purge: Firestore data, uploaded images, the auth account, and finally
 * the deletion request itself. Storage is best-effort; a purge the deadline
 * cut short (`complete: false`) still drops the pages it collected, and
 * leaves the rest to the next run (server/app/account purgeAccountIn).
 */
export function purgeAccount(deps: PurgeDeps, uid: string, opts: PurgeOptions = {}): Promise<PurgeReport> {
  const { db, ...fx } = deps;
  return purgeAccountIn(ctxFor(db), fx, uid, inOptions(db, opts));
}

/**
 * Purge every account whose grace period has ended, longest overdue first, a
 * few at a time through one BulkWriter, within `budgetMs`
 * (server/app/account purgeDueAccountsIn).
 */
export function purgeDueAccounts(deps: PurgeDeps, opts: PurgeRunOptions = {}): Promise<PurgeRun> {
  const { db, ...fx } = deps;
  return purgeDueAccountsIn(ctxFor(db), fx, opts);
}
