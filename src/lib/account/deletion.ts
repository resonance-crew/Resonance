import { Timestamp, type BulkWriter, type DocumentReference, type Firestore, type Query } from 'firebase-admin/firestore';
import { cardPagePaths, landingPagePaths, profilePagePaths } from '@/lib/api/revalidate';
import { CHAT_IMAGES, chatImageFiles } from '@/lib/api/v1/chatImages';
import { HANDLES } from '@/lib/db/firestore/handles';
import { TOMBSTONE, tombstoneRef } from '@/lib/db/firestore/tombstones';
import { UPLOADS, uploadedKeys } from '@/lib/storage/uploads';
import { DELETION_GRACE_DAYS } from './constants';

export { DELETION_GRACE_DAYS };

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
 */
export const DELETIONS_COLLECTION = 'accountDeletions';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Firestore `in` queries accept at most 30 values. */
const IN_CHUNK = 30;
/** Document trees (a card, a conversation) deleted at once within one account. */
const TREE_CONCURRENCY = 16;
/** Accounts purged at once in one run. */
const ACCOUNT_CONCURRENCY = 2;
/** No account takes more than this share of a purge run's budget (its cut-short rest waits for the next run). */
const ACCOUNT_SHARE = 4;

export interface AccountDeletion {
  uid: string;
  requestedAt: Date;
  purgeAfter: Date;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(0);
}

export async function scheduleAccountDeletion(
  db: Firestore,
  uid: string,
  now: Date = new Date(),
): Promise<AccountDeletion> {
  const deletion = { uid, requestedAt: now, purgeAfter: new Date(now.getTime() + DELETION_GRACE_DAYS * DAY_MS) };
  await db.collection(DELETIONS_COLLECTION).doc(uid).set(deletion);
  // Scheduling revokes every session (each device is signed out within the
  // hour, see revokeSessions), and a signed-out app can't unregister itself:
  // its phone stops buzzing now (signing back in to cancel registers again).
  const devices = await db.collection('devices').where('userId', '==', uid).get();
  if (!devices.empty) {
    const batch = db.batch();
    devices.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return deletion;
}

export async function cancelAccountDeletion(db: Firestore, uid: string): Promise<void> {
  await db.collection(DELETIONS_COLLECTION).doc(uid).delete();
}

export async function getAccountDeletion(db: Firestore, uid: string): Promise<AccountDeletion | null> {
  const snap = await db.collection(DELETIONS_COLLECTION).doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return { uid, requestedAt: toDate(data.requestedAt), purgeAfter: toDate(data.purgeAfter) };
}

export interface PurgeReport {
  /** Documents removed together with all of their subcollections. */
  trees: number;
  /** Single documents removed (records that point at the user). */
  documents: number;
  /**
   * The cached pages that showed the account (logical paths): its published
   * cards (not those in its trash, whose pages went with the trash), by id
   * and slug, its profile, and the landing page when a public
   * card could be on it. They must be revalidated, or the site would keep
   * serving the deleted writing.
   */
  pages: string[];
  /**
   * False when the run's time ran out part way (see {@link PurgeOptions}):
   * what was started is gone, the rest — the profile always among it — is
   * left with the request in place for the next run, which collects it anew.
   */
  complete: boolean;
}

/**
 * Every place a user's data lives, as (a) document trees owned by the user and
 * (b) queries for records elsewhere that point at the user. Keep in step with
 * `firebase/firestore.rules` — a new collection that stores a uid belongs here.
 *
 * Deliberately kept: other people's cards that responded to this user's cards
 * (their `referenceCardId` dangles and readers resolve it to null, the same
 * as for a deleted card), other users' block lists (a uid is never reused),
 * and reports filed *against* the user (moderation history) — but not the
 * copy of what they wrote that a report kept (`reportEvidence`): that is
 * their writing, and goes with them, as it does with the reporter's account.
 *
 * The trees come in two groups: the many (cards, conversations), deleted
 * first, and the user's own roots — the profile among them — deleted last, so
 * a purge cut short still finds the pen name (its page to revalidate) next
 * time. Only ids and the fields the pages need are read.
 *
 * Some records are found through one of the user's cards: other readers'
 * legacy resonance records (which name only the card), and every note left on
 * it. Each goes just before its card (`byCard`), so a purge cut short never
 * leaves one behind whose card is gone. Notes left on a card deleted earlier
 * are found by whom they were for: `toUserId`, or `withheldFor` for one
 * withheld across a block (left on an anonymous card, delivered to no one) —
 * so the withheld ones go with the delivered: one outliving the card's author
 * would tell its writer that a block stood between them and whoever wrote it.
 */
async function collectAccountData(db: Firestore, uid: string) {
  const roots: DocumentReference[] = [
    db.collection('thoughtMaps').doc(uid),
    db.collection('userProfiles').doc(uid),
    db.collection('recommendations').doc(uid),
    // Push switches and what was pushed (lib/push/settings, picks, connectionCards).
    db.collection('notificationSettings').doc(uid),
    db.collection('pickPushes').doc(uid),
    db.collection('connectionCardPushes').doc(uid),
    db.collection('users').doc(uid), // profile + bookmarks + blocks
  ];

  const [cards, conversations, profile] = await Promise.all([
    db.collection('cards').where('authorId', '==', uid).select('slug', 'publishedAt', 'visibility', 'trashedAt').get(),
    db.collection('conversations').where('participants', 'array-contains', uid).select().get(),
    db.collection('users').doc(uid).get(),
  ]);
  // Only a published card ever had a page someone could have cached; a
  // public one may be on the landing page too. One in the trash has none
  // left: its pages were revalidated when it went in, and show nothing
  // since. Revalidating them now, beside the profile, would tie an
  // anonymous one to it — the moment its cache starts again would be the
  // account's (no outsider learns from its going: it was gone to them at
  // the trash, see cardByKeyForAnyone).
  const published = cards.docs.filter((d) => d.get('publishedAt') != null && d.get('trashedAt') == null);
  const pages = [
    ...published.flatMap((d) => cardPagePaths({ id: d.id, slug: typeof d.get('slug') === 'string' ? d.get('slug') : null })),
    ...profilePagePaths(profile.get('handle')),
    ...landingPagePaths(...published.map((d) => d.data())),
  ];
  const trees = [
    ...cards.docs.map((d) => d.ref), // card + its pending edits
    ...conversations.docs.map((d) => d.ref), // conversation + messages
  ];

  const queries: Query[] = [
    db.collection('connections').where('userIds', 'array-contains', uid),
    db.collection('invites').where('fromUserId', '==', uid),
    db.collection('invites').where('toUserId', '==', uid),
    db.collection('resonances').where('userId', '==', uid),
    db.collection('notes').where('fromUserId', '==', uid),
    db.collection('notes').where('toUserId', '==', uid),
    db.collection('notes').where('withheldFor', '==', uid),
    // How many unanswered notes one left the other, either way (lib/api/v1/conversations letterRef).
    db.collection('letters').where('from', '==', uid),
    db.collection('letters').where('to', '==', uid),
    // Why they are connected with someone (lib/api/v1/origins).
    db.collection('connectionOrigins').where('userIds', 'array-contains', uid),
    db.collection('cardLinks').where('sourceAuthorId', '==', uid),
    db.collection('cardLinks').where('targetAuthorId', '==', uid),
    db.collection('notifications').where('userId', '==', uid),
    db.collection('notifications').where('payload.fromUserId', '==', uid),
    db.collection('quotas').where('userId', '==', uid),
    db.collection('cardVectors').where('authorId', '==', uid),
    db.collection('reports').where('reporterId', '==', uid),
    db.collection('devices').where('userId', '==', uid), // push tokens
    db.collection('rateLimits').where('userId', '==', uid), // API budgets (lib/api/rateLimit)
    db.collection(HANDLES).where('uid', '==', uid), // the pen name's reservation (lib/db/firestore/handles)
    db.collection(UPLOADS).where('ownerId', '==', uid), // whose each stored picture is (lib/storage/uploads)
    // Pictures sent in chat, by them and to them (lib/api/v1/chatImages): purgeAccount takes them with their files
    // first; any left (a purge without the chat store) go here.
    db.collection(CHAT_IMAGES).where('senderId', '==', uid),
    db.collection(CHAT_IMAGES).where('to', '==', uid),
    db.collection('reportEvidence').where('reporterId', '==', uid),
    db.collection('reportEvidence').where('targetUserId', '==', uid),
    // A pending edit outlives its card when an older app deleted the card
    // straight from the client; the ones that carry their author are found here.
    db.collectionGroup('edits').where('authorId', '==', uid),
  ];
  // Records found through one of the cards (see above): other readers'
  // resonance records on them, and every note left on them.
  const cardIds = cards.docs.map((d) => d.id);
  const cardQueries: Query[] = [];
  for (let i = 0; i < cardIds.length; i += IN_CHUNK) {
    const chunk = cardIds.slice(i, i + IN_CHUNK);
    cardQueries.push(db.collection('resonances').where('cardId', 'in', chunk), db.collection('notes').where('cardId', 'in', chunk));
  }

  const [snaps, cardSnaps] = await Promise.all([
    Promise.all(queries.map((q) => q.select().get())),
    Promise.all(cardQueries.map((q) => q.select('cardId').get())),
  ]);
  const byCard = new Map<string, DocumentReference[]>();
  for (const d of cardSnaps.flatMap((s) => s.docs)) {
    const path = `cards/${d.get('cardId')}`;
    byCard.set(path, [...(byCard.get(path) ?? []), d.ref]);
  }
  const treePaths = new Set([...trees, ...roots].map((r) => r.path));
  // A record inside a tree (a card's pending edit) goes with the tree.
  const inTree = (path: string) => {
    const parts = path.split('/');
    for (let i = 2; i <= parts.length; i += 2) if (treePaths.has(parts.slice(0, i).join('/'))) return true;
    return false;
  };
  const first = new Set([...byCard.values()].flat().map((r) => r.path));
  const singles = new Map<string, DocumentReference>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (!inTree(d.ref.path) && !first.has(d.ref.path)) singles.set(d.ref.path, d.ref);
    }
  }
  return { trees, roots, singles: [...singles.values()], byCard, pages };
}

/** A batch's limit on writes. */
const BATCH_MAX = 500;

/** Delete `refs` in batches (a card's few records, before the card). */
async function deleteAll(db: Firestore, refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += BATCH_MAX) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + BATCH_MAX)) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * Run `work` over `items`, at most `n` at a time, starting none once
 * `stop()` says so. Answers the items never started and every failure.
 */
async function pool<T>(items: T[], n: number, work: (item: T) => Promise<unknown>, stop: () => boolean) {
  const queue = [...items];
  const errors: unknown[] = [];
  const worker = async () => {
    while (queue.length && !stop()) {
      const item = queue.shift()!;
      try {
        await work(item);
      } catch (e) {
        errors.push(e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return { notStarted: queue, errors };
}

export interface PurgeOptions {
  /** The run's writer, shared by the accounts it purges; one of its own otherwise. */
  writer?: BulkWriter;
  /** Start nothing new past this time (`clock()` ms); see {@link PurgeReport.complete}. */
  deadline?: number;
  clock?: () => number;
}

/**
 * Remove every Firestore record of `uid` (see {@link collectAccountData}):
 * the trees side by side through one BulkWriter, then the records pointing
 * at the user, then the user's own roots. Any delete that fails throws once
 * the rest are done — the request stays, and the next run tries again.
 */
export async function purgeAccountData(db: Firestore, uid: string, opts: PurgeOptions = {}): Promise<PurgeReport> {
  const clock = opts.clock ?? Date.now;
  const late = () => opts.deadline !== undefined && clock() >= opts.deadline;
  const { trees, roots, singles, byCard, pages } = await collectAccountData(db, uid);
  const writer = opts.writer ?? db.bulkWriter();
  let failed = 0;
  let complete = false;
  // A card's own records first (collectAccountData), then the card with what is under it.
  const deleteTree = async (ref: DocumentReference) => {
    const records = byCard.get(ref.path);
    if (records?.length) await deleteAll(db, records);
    // A card's id stays dead (tombstoneRef): written, on its own, before the card goes, so no moment lets another take it.
    if (ref.parent.id === 'cards') await tombstoneRef(db, ref.id).set(TOMBSTONE);
    await db.recursiveDelete(ref, writer);
  };
  try {
    const first = await pool(trees, TREE_CONCURRENCY, deleteTree, late);
    failed += first.errors.length;
    if (!first.notStarted.length && !late()) {
      const writes = singles.map((ref) => writer.delete(ref).catch(() => void failed++));
      await writer.flush();
      await Promise.all(writes);
      // The profile goes last, once nothing else of the account is left.
      if (!failed) {
        const last = await pool(roots, TREE_CONCURRENCY, (ref) => db.recursiveDelete(ref, writer), late);
        failed += last.errors.length;
        complete = !last.notStarted.length;
      }
    }
  } finally {
    if (opts.writer) await writer.flush();
    else await writer.close();
  }
  if (failed) throw new Error(`Account purge of ${uid}: ${failed} delete(s) failed`);
  const records = [...byCard.values()].reduce((n, refs) => n + refs.length, 0);
  return { trees: trees.length + roots.length, documents: singles.length + records, pages, complete };
}

/** How many chat pictures a page of the account purge takes. */
const CHAT_PAGE = 200;

/**
 * The pictures sent in chat that go with the account — the ones they sent
 * and the ones sent to them, in any conversation, deleted since or not — a
 * page at a time: the page's files (one request), then its records, so a
 * purge cut short never does the same work twice, and no record is left
 * naming files that are gone. Starts no page past the deadline; answers
 * whether every one went. Files are best effort, as the other uploads'.
 */
async function purgeChatPictures(
  db: Firestore,
  deleteFiles: (keys: string[]) => Promise<void>,
  uid: string,
  late: () => boolean,
): Promise<boolean> {
  for (const field of ['senderId', 'to'] as const) {
    for (;;) {
      if (late()) return false;
      const page = await db.collection(CHAT_IMAGES).where(field, '==', uid).select('key', 'thumbKey').limit(CHAT_PAGE).get();
      if (page.empty) break;
      try {
        await deleteFiles(chatImageFiles(page.docs));
      } catch (err) {
        console.error(`Account purge: chat picture files of ${uid} not deleted`, err);
      }
      const batch = db.batch();
      for (const d of page.docs) batch.delete(d.ref);
      await batch.commit();
    }
  }
  return true;
}

/** How many uploaded files the purge hands the store at once (R2's DeleteObjects takes a thousand). */
export const UPLOAD_DELETE_BATCH = 1000;

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
 * the deletion request itself. Storage is best-effort — orphaned images are
 * unreachable once the records pointing at them are gone, and must not block
 * the account from being deleted. A purge the deadline cut short
 * (`complete: false`) still drops the pages it collected, and leaves the
 * rest — storage, sign-in, the request — to the next run.
 */
export async function purgeAccount(deps: PurgeDeps, uid: string, opts: PurgeOptions = {}): Promise<PurgeReport> {
  const clock = opts.clock ?? Date.now;
  const late = () => opts.deadline !== undefined && clock() >= opts.deadline;
  // The pictures recorded as theirs go before the records that list them — a batch at a time, none started past
  // the deadline: cut short, the rest of the account waits for the next run (its records would otherwise go
  // before their files), which finds the same records and deletes what is left.
  if (deps.deleteStorageObjects || deps.deleteStorageObject) {
    const keys = await uploadedKeys(deps.db, uid);
    const batch = deps.deleteStorageObjects ? UPLOAD_DELETE_BATCH : 1;
    for (let i = 0; i < keys.length; i += batch) {
      if (late()) return { trees: 0, documents: 0, pages: [], complete: false };
      const some = keys.slice(i, i + batch);
      try {
        await (deps.deleteStorageObjects ? deps.deleteStorageObjects(some) : deps.deleteStorageObject!(some[0]));
      } catch (err) {
        console.error(`Account purge: storage cleanup failed for ${some.length === 1 ? some[0] : `${some.length} files`}`, err);
      }
    }
  }
  if (deps.deleteChatImageFiles) {
    // Cut short, the rest of the account waits: its records would otherwise go before their files.
    if (!(await purgeChatPictures(deps.db, deps.deleteChatImageFiles, uid, late))) {
      return { trees: 0, documents: 0, pages: [], complete: false };
    }
  }
  const report = await purgeAccountData(deps.db, uid, opts);
  if (deps.revalidate && report.pages.length) {
    try {
      deps.revalidate(report.pages);
    } catch (err) {
      console.error(`Account purge: revalidating ${uid}'s pages failed`, err);
    }
  }
  if (!report.complete) return report;
  if (deps.deleteStoragePrefix) {
    for (const prefix of [`image/${uid}/`, `video/${uid}/`]) {
      try {
        await deps.deleteStoragePrefix(prefix);
      } catch (err) {
        console.error(`Account purge: storage cleanup failed for ${prefix}`, err);
      }
    }
  }
  try {
    await deps.deleteAuthUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
  }
  await cancelAccountDeletion(deps.db, uid);
  return report;
}

export interface PurgeRunOptions {
  now?: Date;
  /**
   * How long the run may start work (ms). Past it no account — and no card or
   * conversation within one — is started; what is under way finishes. The
   * cron gives it its maxDuration less a margin.
   */
  budgetMs?: number;
  /** Accounts purged at once. */
  concurrency?: number;
  clock?: () => number;
}

export interface PurgeRun {
  purged: string[];
  /** Failed this time; their requests stay and the next run retries them. */
  failed: string[];
  /** Due, but the run's time ran out first (not started, or cut short); the next run takes them. */
  deferred: string[];
}

/**
 * Purge every account whose grace period has ended, longest overdue first, a
 * few at a time through one BulkWriter, within `budgetMs`. No account takes
 * more than 1/ACCOUNT_SHARE of the run, and one a run cut short (or that
 * failed) waits behind every account due before that run (`triedAt`), so two
 * accounts too big to finish in a run — thousands of drafts, say — make
 * progress each day without keeping everyone else's deletion from starting.
 */
export async function purgeDueAccounts(deps: PurgeDeps, opts: PurgeRunOptions = {}): Promise<PurgeRun> {
  const clock = opts.clock ?? Date.now;
  const deadline = opts.budgetMs === undefined ? undefined : clock() + opts.budgetMs;
  const late = () => deadline !== undefined && clock() >= deadline;
  const now = opts.now ?? new Date();
  const due = await deps.db
    .collection(DELETIONS_COLLECTION)
    .where('purgeAfter', '<=', now)
    .select('purgeAfter', 'triedAt')
    .get();
  const at = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : v instanceof Date ? v.getTime() : 0);
  const order = due.docs
    .map((d) => ({ uid: d.id, at: at(d.get('triedAt')) || at(d.get('purgeAfter')) }))
    .sort((a, b) => a.at - b.at || (a.uid < b.uid ? -1 : 1));
  const share = opts.budgetMs === undefined ? undefined : opts.budgetMs / ACCOUNT_SHARE;
  // Cut short or failed: behind every account already due, from the next run on. Its request stays either way.
  const tried = (uid: string) =>
    deps.db
      .collection(DELETIONS_COLLECTION)
      .doc(uid)
      .update({ triedAt: now })
      .catch((err) => console.error(`Account purge: could not note the try for ${uid}`, err));
  const run: PurgeRun = { purged: [], failed: [], deferred: [] };
  const writer = deps.db.bulkWriter();
  try {
    const { notStarted } = await pool(
      order.map((o) => o.uid),
      opts.concurrency ?? ACCOUNT_CONCURRENCY,
      async (uid) => {
        const own = deadline === undefined || share === undefined ? deadline : Math.min(deadline, clock() + share);
        try {
          const report = await purgeAccount(deps, uid, { writer, deadline: own, clock });
          if (report.complete) run.purged.push(uid);
          else {
            run.deferred.push(uid);
            await tried(uid);
          }
        } catch (err) {
          // One failure must not stall everyone else's deletion; the request
          // stays in place and tomorrow's run retries it.
          console.error(`Account purge failed for ${uid}`, err);
          run.failed.push(uid);
          await tried(uid);
        }
      },
      late,
    );
    run.deferred.push(...notStarted);
  } finally {
    await writer.close();
  }
  if (run.deferred.length) {
    console.warn(`Account purge: out of time with ${run.deferred.length} account(s) left for the next run`, run.deferred);
  }
  return run;
}
