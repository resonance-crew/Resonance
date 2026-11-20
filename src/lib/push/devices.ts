import { registerDeviceIn, unregisterDeviceIn, type DeviceRegistration } from '@/server/app/pushDevices';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

export { MAX_DEVICES, deviceLocale, timeZoneOf, type DeviceLocale } from '@/server/domain/push/devices';
export type { DeviceRegistration } from '@/server/app/pushDevices';

/**
 * `devices/{installationId}`: one app install's push token, owned by whoever
 * is signed in on it. Keyed by the install (not the user) so signing in as
 * someone else on the same phone moves the device to them — the previous
 * account stops getting pushes there even if its sign-out never reached us.
 * Clients never touch the collection (no rule matches it); account deletion
 * removes a user's devices with the rest of their records. Past MAX_DEVICES
 * an account's least recently registered installs are forgotten.
 *
 * The services are src/server/app/pushDevices; these keep the old signatures.
 */
export function registerDevice(db: AdminDb, uid: string, installationId: string, input: DeviceRegistration): Promise<void> {
  return registerDeviceIn(ctxFor(db), uid, installationId, input);
}

/** Sign-out: stop pushing to this install — only if it is still yours (someone else may have signed in since). */
export function unregisterDevice(db: AdminDb, uid: string, installationId: string): Promise<void> {
  return unregisterDeviceIn(ctxFor(db), uid, installationId);
}
