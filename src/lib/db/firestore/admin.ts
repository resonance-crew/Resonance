/**
 * Legacy path of the admin SDK's Firestore and Messaging: the code moved to
 * src/server/infra/firestore/db.ts. Kept because ~60 modules import it, and
 * the emulator suites `vi.mock('@/lib/db/firestore/admin')` to hand those
 * modules (and serverCtx()) their emulator Firestore.
 */
export { getAdminDb, getAdminMessaging, prefersRest, type AdminDb } from '@/server/infra/firestore/db';
