import type { ServerCtx } from '@/server/ctx';
import { purgePlan, type EntityName } from '@/server/domain/schema/registry';
import type { AccountDeletion, PurgeSession } from '@/server/ports/repos/account';
import { otherInPair } from '@/server/domain/conversations';
import { signal } from './realtime';
import { restoreCardIn, trashCardIn } from './trash';

/**
 * Account deletion (App Store 5.1.1(v) / Google Play account-deletion policy),
 * as application services over `ctx.data.account`. What is deleted is the
 * registry's (`src/server/domain/schema/registry.ts`, `purgePlan()`); the
 * order and the explicit steps are here. `src/lib/account/deletion.ts` keeps
 * the old exports as facades over these.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Document trees (a card, a conversation) deleted at once within one account. */
const TREE_CONCURRENCY = 16;
/** Accounts purged at once in one run. */
const ACCOUNT_CONCURRENCY = 2;
/** No account takes more than this share of a purge run's budget (its cut-short rest waits for the next run). */
const ACCOUNT_SHARE = 4;
/** How many chat pictures a page of the account purge takes. */
const CHAT_PAGE = 200;
/** How many uploaded files the purge hands the store at once (R2's DeleteObjects takes a thousand). */
export const UPLOAD_DELETE_BATCH = 1000;

export async function scheduleAccountDeletionIn(ctx: ServerCtx, uid: string, graceDays: number, now: Date = new Date()): Promise<AccountDeletion> {
  const deletion = { uid, requestedAt: now, purgeAfter: new Date(now.getTime() + graceDays * DAY_MS) };
  await ctx.data.account.putDeletion(deletion);
  // Scheduling revokes every session (each device is signed out within the
  // hour, see revokeSessions), and a signed-out app can't unregister itself:
  // its phone stops buzzing now (signing back in to cancel registers again).
  await ctx.data.account.removeDevices(uid);
  return deletion;
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
   * False when the run's time ran out part way (see {@link PurgeInOptions}):
   * what was started is gone, the rest — the profile always among it — is
   * left with the request in place for the next run, which collects it anew.
   */
  complete: boolean;
}

export interface PurgeInOptions {
  /** The run's deletes, shared by the accounts it purges; one of its own otherwise. */
  session?: PurgeSession;
  /** Start nothing new past this time (`clock()` ms); see {@link PurgeReport.complete}. */
  deadline?: number;
  clock?: () => number;
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

const collectionOf = (path: string) => path.split('/')[0];

/**
 * Remove every record of `uid` the registry's plan finds: the trees side by
 * side (each card's own records first, then its tombstone and retired slug,
 * then the card), then the pen name's hold, the records pointing at the
 * user, the tap rows naming them, and last the user's own roots — the profile
 * among them, so a purge cut short still finds the pen name next time. Any
 * delete that fails throws once the rest are done — the request stays, and
 * the next run tries again.
 */
export async function purgeAccountDataIn(ctx: ServerCtx, uid: string, opts: PurgeInOptions = {}): Promise<PurgeReport> {
  const repo = ctx.data.account;
  const clock = opts.clock ?? Date.now;
  const late = () => opts.deadline !== undefined && clock() >= opts.deadline;
  const plan = purgePlan();
  const retire = new Set<string>(plan.steps.get('retireCard') ?? []);
  const { trees, roots, singles, byCard, pages, handle } = await repo.collect(uid, plan);
  const session = opts.session ?? repo.openSession();
  let failed = 0;
  let complete = false;
  // A card's own records first (collect), then the card with what is under it.
  const deleteTree = async (path: string) => {
    const records = byCard.get(path);
    if (records?.length) await repo.deleteDocs(records);
    // A card's id stays dead and its slug retired: written, on their own, before the card goes, so no moment lets
    // another take either.
    if (retire.has(collectionOf(path))) await repo.retireCard(path);
    await session.deleteTree(path);
  };
  try {
    const first = await pool(trees, TREE_CONCURRENCY, deleteTree, late);
    failed += first.errors.length;
    if (!first.notStarted.length && !late()) {
      // The pen name is held — for no one, saying nothing of whose it was — before its reservation goes, so no
      // moment lets another take it and the links that named this account by it (handles.ts).
      if (plan.steps.has('holdHandle')) await repo.holdHandle(handle);
      const writes = singles.map((path) => session.deleteDoc(path).catch(() => void failed++));
      await session.flush();
      await Promise.all(writes);
      // Their connections went with them: each other person's connections list changed (`graph`) — never the
      // purged account's own signal, which would write a document of theirs back after its roots go.
      const others = singles.flatMap((path) => (path.startsWith('connections/') ? [otherInPair(path.slice('connections/'.length), uid)] : []));
      const touched = others.filter((o): o is string => !!o && o !== uid);
      if (touched.length) await signal(ctx, { kind: 'graph', uids: touched });
      // Others' bell rows of resonance taps naming them among several (lib/push/tapBell): out of each, and a row
      // left with no one goes (a row of their own went with the singles above).
      if (plan.steps.has('tapRows')) {
        await repo.removeFromTapRows(uid).catch((e) => {
          failed++;
          console.error(`Account purge: tap rows naming ${uid}`, e);
        });
      }
      // The profile goes last, once nothing else of the account is left.
      if (!failed) {
        const last = await pool(roots, TREE_CONCURRENCY, (path) => session.deleteTree(path), late);
        failed += last.errors.length;
        complete = !last.notStarted.length;
      }
    }
  } finally {
    if (opts.session) await session.flush();
    else await session.close();
  }
  if (failed) throw new Error(`Account purge of ${uid}: ${failed} delete(s) failed`);
  const records = [...byCard.values()].reduce((n, paths) => n + paths.length, 0);
  return { trees: trees.length + roots.length, documents: singles.length + records, pages, complete };
}

/** What the purge reaches beyond the database (lib/account/deletion PurgeDeps, without the database). */
export interface PurgeEffects {
  deleteAuthUser: (uid: string) => Promise<void>;
  deleteStoragePrefix?: (prefix: string) => Promise<number>;
  deleteStorageObject?: (key: string) => Promise<void>;
  deleteStorageObjects?: (keys: string[]) => Promise<void>;
  deleteChatImageFiles?: (keys: string[]) => Promise<void>;
  revalidate?: (paths: string[]) => unknown;
}

/**
 * The pictures sent in chat that go with the account — the ones they sent
 * and the ones sent to them, in any conversation, deleted since or not — a
 * page at a time: the page's files (one request), then its records, so a
 * purge cut short never does the same work twice, and no record is left
 * naming files that are gone. Starts no page past the deadline; answers
 * whether every one went. Files are best effort, as the other uploads'.
 */
async function purgeChatPictures(ctx: ServerCtx, deleteFiles: (keys: string[]) => Promise<void>, uid: string, late: () => boolean): Promise<boolean> {
  for (const field of ['senderId', 'to'] as const) {
    for (;;) {
      if (late()) return false;
      const page = await ctx.data.account.chatPicturePage(uid, field, CHAT_PAGE);
      if (!page.paths.length) break;
      try {
        await deleteFiles(page.files);
      } catch (err) {
        console.error(`Account purge: chat picture files of ${uid} not deleted`, err);
      }
      await ctx.data.account.deleteDocs(page.paths);
    }
  }
  return true;
}

/**
 * Full purge: the database's records, uploaded images, the auth account, and
 * finally the deletion request itself. Storage is best-effort — orphaned
 * images are unreachable once the records pointing at them are gone, and
 * must not block the account from being deleted. A purge the deadline cut
 * short (`complete: false`) still drops the pages it collected, and leaves
 * the rest — storage, sign-in, the request — to the next run.
 */
export async function purgeAccountIn(ctx: ServerCtx, fx: PurgeEffects, uid: string, opts: PurgeInOptions = {}): Promise<PurgeReport> {
  const clock = opts.clock ?? Date.now;
  const late = () => opts.deadline !== undefined && clock() >= opts.deadline;
  const steps = purgePlan().steps;
  // The pictures recorded as theirs go before the records that list them — a batch at a time, none started past
  // the deadline: cut short, the rest of the account waits for the next run (its records would otherwise go
  // before their files), which finds the same records and deletes what is left.
  if (steps.has('uploadFiles') && (fx.deleteStorageObjects || fx.deleteStorageObject)) {
    const keys = await ctx.data.account.uploadedKeys(uid);
    const batch = fx.deleteStorageObjects ? UPLOAD_DELETE_BATCH : 1;
    for (let i = 0; i < keys.length; i += batch) {
      if (late()) return { trees: 0, documents: 0, pages: [], complete: false };
      const some = keys.slice(i, i + batch);
      try {
        await (fx.deleteStorageObjects ? fx.deleteStorageObjects(some) : fx.deleteStorageObject!(some[0]));
      } catch (err) {
        console.error(`Account purge: storage cleanup failed for ${some.length === 1 ? some[0] : `${some.length} files`}`, err);
      }
    }
  }
  if (steps.has('chatPictureFiles') && fx.deleteChatImageFiles) {
    // Cut short, the rest of the account waits: its records would otherwise go before their files.
    if (!(await purgeChatPictures(ctx, fx.deleteChatImageFiles, uid, late))) {
      return { trees: 0, documents: 0, pages: [], complete: false };
    }
  }
  const report = await purgeAccountDataIn(ctx, uid, opts);
  if (fx.revalidate && report.pages.length) {
    try {
      fx.revalidate(report.pages);
    } catch (err) {
      console.error(`Account purge: revalidating ${uid}'s pages failed`, err);
    }
  }
  if (!report.complete) return report;
  if (steps.has('storagePrefixes') && fx.deleteStoragePrefix) {
    for (const prefix of [`image/${uid}/`, `video/${uid}/`]) {
      try {
        await fx.deleteStoragePrefix(prefix);
      } catch (err) {
        console.error(`Account purge: storage cleanup failed for ${prefix}`, err);
      }
    }
  }
  try {
    await fx.deleteAuthUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
  }
  // The request itself goes last (registry purge 'last').
  await ctx.data.account.deleteDeletion(uid);
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
 * few at a time through one session, within `budgetMs`. No account takes
 * more than 1/ACCOUNT_SHARE of the run, and one a run cut short (or that
 * failed) waits behind every account due before that run (`triedAt`), so two
 * accounts too big to finish in a run — thousands of drafts, say — make
 * progress each day without keeping everyone else's deletion from starting.
 */
export async function purgeDueAccountsIn(ctx: ServerCtx, fx: PurgeEffects, opts: PurgeRunOptions = {}): Promise<PurgeRun> {
  const clock = opts.clock ?? Date.now;
  const deadline = opts.budgetMs === undefined ? undefined : clock() + opts.budgetMs;
  const late = () => deadline !== undefined && clock() >= deadline;
  const now = opts.now ?? new Date();
  const due = await ctx.data.account.dueDeletions(now);
  const order = [...due].sort((a, b) => a.at - b.at || (a.uid < b.uid ? -1 : 1));
  const share = opts.budgetMs === undefined ? undefined : opts.budgetMs / ACCOUNT_SHARE;
  // Cut short or failed: behind every account already due, from the next run on. Its request stays either way.
  const tried = (uid: string) =>
    ctx.data.account.noteTried(uid, now).catch((err) => console.error(`Account purge: could not note the try for ${uid}`, err));
  const run: PurgeRun = { purged: [], failed: [], deferred: [] };
  const session = ctx.data.account.openSession();
  try {
    const { notStarted } = await pool(
      order.map((o) => o.uid),
      opts.concurrency ?? ACCOUNT_CONCURRENCY,
      async (uid) => {
        const own = deadline === undefined || share === undefined ? deadline : Math.min(deadline, clock() + share);
        try {
          const report = await purgeAccountIn(ctx, fx, uid, { session, deadline: own, clock });
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
    await session.close();
  }
  if (run.deferred.length) {
    console.warn(`Account purge: out of time with ${run.deferred.length} account(s) left for the next run`, run.deferred);
  }
  return run;
}

/** The entities whose records name the account and that the purge reaches (registry.test.ts holds every one to it). */
export function purgedEntities(): Set<EntityName> {
  const plan = purgePlan();
  return new Set<EntityName>([
    ...plan.roots,
    ...plan.last,
    ...plan.trees.map((q) => q.entity),
    ...plan.rows.map((q) => q.entity),
    ...plan.byCard.map((b) => b.entity),
  ]);
}

// --- routes lane

/**
 * Out of sight from the moment the deletion is scheduled: the account's
 * published anonymous cards go to its trash (`trashedFor: 'deletion'`), as
 * src/lib/account/deletion.ts holdAnonymousCards says. Best effort, a card at
 * a time; answers the card pages to revalidate.
 */
export async function holdAnonymousCardsIn(ctx: ServerCtx, uid: string): Promise<string[]> {
  const stale: string[] = [];
  for (const id of await ctx.data.cards.anonymousCardsToHold(uid)) {
    try {
      stale.push(...(await trashCardIn(ctx, uid, id, { forDeletion: true })).stale);
    } catch (err) {
      console.error(`Account deletion: could not hold card ${id}`, err);
    }
  }
  return stale;
}

/** A cancelled deletion's held cards back from the trash, as they were (restoreCardIn). Answers the pages to revalidate. */
export async function releaseHeldCardsIn(ctx: ServerCtx, uid: string): Promise<string[]> {
  const stale: string[] = [];
  for (const id of await ctx.data.cards.cardsHeldForDeletion(uid)) {
    try {
      stale.push(...(await restoreCardIn(ctx, uid, id)).stale);
    } catch (err) {
      console.error(`Account deletion: could not bring back card ${id}`, err);
    }
  }
  return stale;
}
