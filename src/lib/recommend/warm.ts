import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { PICK_PUSHES, pickGate, readPickLog } from '@/lib/push/picks';
import { dailyWalkStart, optedIn } from '@/lib/push/settings';
import { planServe, warmRecommendations, type BuildFeed, type WarmOutcome } from './daily';
import { RECOMMENDATIONS, readStored, recommendationDay } from './stored';

/**
 * The warm-up before the evening's pick push (`/api/cron/warm-picks`, an hour
 * ahead of it): today's picks built for the readers who will be pushed one,
 * so tonight's card comes from today's picks rather than whatever they last
 * asked for. Builds reach the LLM, so only for a reader who
 *
 * - turned "a card for tonight" on,
 * - is active: one of their app installs registered for push in the last
 *   ACTIVE_DAYS days (`devices/*.updatedAt` — the apps register on launch,
 *   at most once a day, so it is when they last opened the app; a reader
 *   without one gets no push anyway),
 * - may be pushed tonight (none yet today, fewer than three this week), and
 * - didn't open their picks today (then they asked for the build themselves),
 *
 * and only when a build is due (planServe: not today's picks already, no
 * build under way, none failed within the hour). Each goes through the
 * reader's own lease (warmRecommendations), stored as `warm`, and must be
 * done by the run's `buildDeadline`.
 *
 * The walk starts at the day's point in the user ids (dailyWalkStart) and
 * goes round, so the readers a run has no time for aren't the same ones
 * every day.
 */

/** A reader counts as active for this long after their app last registered. */
export const ACTIVE_DAYS = 14;
/** Builds at once (each is two LLM calls, up to ~45 s). */
const CONCURRENCY = 4;

const DAY_MS = 24 * 60 * 60 * 1000;
const millis = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : 0);

export type WarmReaderOutcome = WarmOutcome | 'inactive' | 'opened-today' | 'not-tonight' | 'fresh';

/** Warm one reader's picks if they need it (see the top of this file); a build must be done by `buildDeadline` (ms on `clock`). */
export async function warmReader(
  db: Firestore,
  uid: string,
  opts: { now: number; build?: BuildFeed; clock?: () => number; buildDeadline?: number },
): Promise<WarmReaderOutcome> {
  const { now } = opts;
  const [devices, stored, log] = await Promise.all([
    db.collection('devices').where('userId', '==', uid).select('token', 'updatedAt').get(),
    db.doc(`${RECOMMENDATIONS}/${uid}`).get(),
    db.doc(`${PICK_PUSHES}/${uid}`).get(),
  ]);
  const lastSeen = Math.max(0, ...devices.docs.filter((d) => typeof d.get('token') === 'string' && d.get('token')).map((d) => millis(d.get('updatedAt'))));
  if (now - lastSeen > ACTIVE_DAYS * DAY_MS) return 'inactive';
  const picks = readStored(stored.data());
  if (picks?.askedOn === recommendationDay(new Date(now))) return 'opened-today';
  if (pickGate(readPickLog(log.data()), now) !== 'ok') return 'not-tonight';
  if (planServe(picks, now).kind === 'fresh') return 'fresh';
  return warmRecommendations(db, uid, { build: opts.build, now: opts.clock, deadline: opts.buildDeadline });
}

export interface WarmRun {
  readers: number;
  outcomes: Partial<Record<WarmReaderOutcome | 'error', number>>;
  /** Readers left for lack of time. */
  deferred: number;
}

/**
 * Warm every opted-in reader who needs it, a few builds at a time, starting
 * none past `deadline` and finishing each by `buildDeadline` (both ms on
 * `clock`), from the day's point in the walk round to it. One pool over the
 * whole walk: the next page of readers is read when the pool runs short,
 * never waiting for a page's slowest build before the next page starts.
 */
export async function warmPicks(
  db: Firestore,
  opts: { deadline?: number; buildDeadline?: number; clock?: () => number; build?: BuildFeed; concurrency?: number; pageSize?: number } = {},
): Promise<WarmRun> {
  const clock = opts.clock ?? Date.now;
  const stop = () => opts.deadline !== undefined && clock() >= opts.deadline;
  const run: WarmRun = { readers: 0, outcomes: {}, deferred: 0 };
  const tally = (o: WarmReaderOutcome | 'error') => (run.outcomes[o] = (run.outcomes[o] ?? 0) + 1);
  const reader = { build: opts.build, clock, buildDeadline: opts.buildDeadline };
  const pages = optedIn(db, 'picks', { from: dailyWalkStart(clock()), pageSize: opts.pageSize });

  const queue: string[] = [];
  let walked = false;
  let failure: { error: unknown } | null = null;
  let reading: Promise<void> | null = null;
  /** The next reader of the walk (reading its next page, once for all the workers, when the queue is empty). */
  const next = async (): Promise<string | undefined> => {
    while (!queue.length && !walked) {
      reading ??= pages
        .next()
        .then(
          (page) => (page.done ? void (walked = true) : void queue.push(...page.value)),
          (error: unknown) => void ((failure = { error }), (walked = true)),
        )
        .finally(() => (reading = null));
      await reading;
    }
    return queue.shift();
  };
  const worker = async () => {
    while (!stop()) {
      const uid = await next();
      if (uid === undefined) return;
      // Reading a page took time: past the deadline, the reader waits for the next run.
      if (stop()) {
        queue.unshift(uid);
        return;
      }
      run.readers++;
      try {
        tally(await warmReader(db, uid, { ...reader, now: clock() }));
      } catch (e) {
        tally('error');
        console.error('[warm-picks]', e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? CONCURRENCY) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
  // Left for lack of time: what was read and not started, and the rest of the walk.
  run.deferred += queue.length;
  if (!walked) for await (const uids of pages) run.deferred += uids.length;
  if (run.deferred) console.warn(`[warm-picks] out of time: ${run.deferred} readers left unwarmed`);
  return run;
}
