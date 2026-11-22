'use client';

import type { Notification, User } from '@/lib/db/types';
import type { BellItemBody, BellPageBody } from '@/lib/api/v1/schemas';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { summaryAuthor } from '@/lib/data/summaries';
import { callApi, ownSignalsOf } from './api';
import { rememberUsers } from './reads';
import { heardCounters, pokeOwn, type Heard, type SignalTopic } from './signals';

/** The bell's newest rows and the people they name, as GET /api/v1/me/bell answers them. */
export interface BellRows {
  items: Notification[];
  /** The people the rows are from (a gone account is absent), by uid. */
  people: Record<string, User>;
}

function time(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The viewer's newest bell rows, newest first (GET /api/v1/me/bell: the rows
 * the apps list, with the anonymous flags the server sets), and the profiles
 * of the people they name. The bell pulls it again when its signal moves
 * (lib/data/hooks' useNotifications).
 */
export async function getBell(max = 20): Promise<BellRows> {
  const uid = getFirebaseClientAuth().currentUser?.uid ?? '';
  const body = await callApi<BellPageBody>(`/api/v1/me/bell?limit=${pageOf(max)}`);
  return { items: body.items.map(notificationOf(uid)), people: peopleOf(body) };
}

const pageOf = (max: number) => Math.min(Math.max(1, max), 50);

const notificationOf =
  (uid: string) =>
  (n: BellItemBody): Notification => ({
    id: n.id,
    userId: uid,
    type: n.type as Notification['type'],
    payload: n.payload as Record<string, unknown>,
    readAt: time(n.readAt),
    createdAt: time(n.createdAt) ?? new Date(0),
  });

/** An answer's people, into the page's profile cache: the rows' faces need no read of their own (useBellExtras asks the cache). */
function peopleOf(body: BellPageBody): Record<string, User> {
  const people: Record<string, User> = {};
  for (const a of body.people) people[a.id] = { ...summaryAuthor(a), avatarSeed: a.avatarSeed ?? '0' };
  rememberUsers(people);
  return people;
}

/** How long the bell goes on reading only what changed before it reads its newest page whole again (the server's early 304 trusts a list as long: signalTag EARLY_MAX_AGE_S). */
export const BELL_FULL_READ_MS = 10 * 60_000;

/** Newest first, as the server orders the bell: made (to the microsecond, as the API writes it), then id. */
const newestFirst = (a: BellItemBody, b: BellItemBody) =>
  a.createdAt === b.createdAt ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.createdAt < b.createdAt ? 1 : -1;

/**
 * The viewer's newest bell rows, as the bell's live pull reads them (lib/data/hooks useNotifications): the
 * newest page once (`changes=1`, its `updatedCursor` kept), then — when the viewer's `bell` counter moved — only
 * what changed since (`updatedAfter`: a row made, read, rung again; GET /me/bell `delta`), merged into the rows
 * held, not the page and its twenty people again. The server answers the page whole when it can't say only what
 * changed (a row went: the count of rows says so; too many changed; a cursor ten minutes old), and so does this
 * every {@link BELL_FULL_READ_MS}, and whenever no one can say what moved (no listener, one that failed). A pull
 * with nothing moved while the listener is live reads nothing: the counter it would be checked against stands.
 */
export function bellReader(uid: string, max = 20): () => Promise<Notification[]> {
  const limit = pageOf(max);
  let held: BellItemBody[] | null = null;
  let cursor: string | null = null;
  /** The counters as they stood when `held` was last read (null: unknown). */
  let heardAt: ReadonlyMap<SignalTopic, number> | null = null;
  /** `held` was read whole before the listener's first answer, which then stands for its counters. */
  let beforeFirst = false;
  let fullAt = 0;
  const shown = () => held!.map(notificationOf(uid));

  const whole = async (counters: ReturnType<typeof heardCounters>) => {
    const body = await callApi<BellPageBody>(`/api/v1/me/bell?limit=${limit}&changes=1`);
    peopleOf(body);
    held = body.items.slice(0, limit);
    cursor = body.updatedCursor ?? null;
    heardAt = counters && counters !== 'waiting' ? counters.now : null;
    beforeFirst = counters === 'waiting';
    fullAt = Date.now();
    return shown();
  };

  return async () => {
    if ((getFirebaseClientAuth().currentUser?.uid ?? '') !== uid) throw new Error('Signed in as someone else');
    // Taken before the read: a touch heard while it is on its way is compared again by the next pull.
    const counters = heardCounters(uid);
    const heard = counters && counters !== 'waiting' ? counters.now : null;
    // A read made before the listener first answered stands for that answer (as the watchers' first reads do, client/signals).
    const was = heardAt ?? (beforeFirst && heard ? (counters as Heard).first : null);
    if (!held || !cursor || !heard || !was || Date.now() - fullAt >= BELL_FULL_READ_MS) return whole(counters);
    beforeFirst = false;
    if ((heard.get('bell') ?? 0) <= (was.get('bell') ?? 0)) {
      heardAt = heard;
      return shown();
    }
    const body = await callApi<BellPageBody>(`/api/v1/me/bell?limit=${limit}&updatedAfter=${encodeURIComponent(cursor)}`);
    peopleOf(body);
    if (body.delta) {
      const came = new Map(body.items.map((n) => [n.id, n]));
      held = [...held.filter((n) => !came.has(n.id)), ...came.values()].sort(newestFirst).slice(0, limit);
    } else {
      held = body.items.slice(0, limit);
      fullAt = Date.now();
    }
    cursor = body.updatedCursor ?? null;
    heardAt = heard;
    return shown();
  };
}

/**
 * One row read (POST /api/v1/notifications/read `{ ids }`); the bell pulls itself again at once — once: the
 * answer's own `bell` counter says the listener's copy of this touch needs no second pull (pokeOwn).
 */
export async function markNotificationRead(id: string): Promise<void> {
  let signals: Record<string, number> | null = null;
  await callApi('/api/v1/notifications/read', { method: 'POST', body: { ids: [id] }, onHeaders: (h) => (signals = ownSignalsOf(h)) });
  pokeOwn(['bell'], signals);
}
