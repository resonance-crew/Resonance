// Pen-name reservations and holds. Firestore code, so it lives in the users
// repository (src/server/infra/firestore/repos/users.ts); this path stays for
// its importers — profile.ts and the account purge compose reserveHandle and
// holdHandle into their own transactions.
export {
  HANDLE_HOLD_DAYS,
  HANDLE_HOLDS,
  HANDLES,
  handleKey,
  handleRef,
  handleTakenByOther,
  holdHandle,
  holdRef,
  reservable,
  reserveHandle,
  uidForHandle,
} from '@/server/infra/firestore/repos/users';
