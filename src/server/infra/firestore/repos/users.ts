import type { Transaction } from 'firebase-admin/firestore';
import { uidForHandle } from '@/lib/db/firestore/handles';
import { mapUser } from '@/lib/db/firestore/mapper';
import type { User } from '@/lib/db/types';
import type { UsersData, UsersTxRepo } from '@/server/ports/repos/users';
import type { AdminDb } from '../db';

/** `users` inside a Firestore transaction: filled by the lane that owns ports/repos/users.ts. */
export function usersTx(_db: AdminDb, _tx: Transaction): UsersTxRepo {
  return {};
}

/** The person who goes by a pen name, through its reservation (`handles/{lower}`), as src/lib/db/firestore/user.ts did. */
export async function findUserByHandle(db: AdminDb, handle: string): Promise<User | null> {
  const uid = await uidForHandle(db, handle.trim().toLowerCase());
  if (!uid) return null;
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? mapUser(snap.id, snap.data() ?? {}) : null;
}

/** `users` outside a transaction. */
export function usersData(db: AdminDb): UsersData {
  return {
    findByHandle: (handle) => findUserByHandle(db, handle),
  };
}
