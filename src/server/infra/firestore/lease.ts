import type { LeaseStore } from '@/server/ports/lease';
import { notWired } from '../wiring';
import type { AdminDb } from './db';

/**
 * Not wired yet: today's only lease (src/lib/recommend/daily.ts `takeLease`)
 * is a field on the reader's recommendations row, taken only when a build is
 * due. The lane that moves it decides between this port and a recommend repo
 * method, and builds the adapter here if it is this port.
 */
export function firestoreLeaseStore(_db: AdminDb): LeaseStore {
  return notWired<LeaseStore>('leases');
}
