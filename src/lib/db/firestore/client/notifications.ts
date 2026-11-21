'use client';

import type { Notification, User } from '@/lib/db/types';
import type { BellPageBody } from '@/lib/api/v1/schemas';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { summaryAuthor } from '@/lib/data/summaries';
import { callApi } from './api';
import { rememberUsers } from './reads';
import { pokeSignal } from './signals';

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
  const body = await callApi<BellPageBody>(`/api/v1/me/bell?limit=${Math.min(Math.max(1, max), 50)}`);
  const items = body.items.map(
    (n): Notification => ({
      id: n.id,
      userId: uid,
      type: n.type as Notification['type'],
      payload: n.payload as Record<string, unknown>,
      readAt: time(n.readAt),
      createdAt: time(n.createdAt) ?? new Date(0),
    }),
  );
  const people: Record<string, User> = {};
  for (const a of body.people) people[a.id] = { ...summaryAuthor(a), avatarSeed: a.avatarSeed ?? '0' };
  // The rows' faces need no read of their own (useBellExtras asks the cache).
  rememberUsers(people);
  return { items, people };
}

/** One row read (POST /api/v1/notifications/read `{ ids }`); the bell pulls itself again at once. */
export async function markNotificationRead(id: string): Promise<void> {
  await callApi('/api/v1/notifications/read', { method: 'POST', body: { ids: [id] } });
  pokeSignal('bell');
}
