import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';

/**
 * A bell type older app builds don't know is drawn there as its raw string
 * (`NotificationsScreen`'s `default: type`, `BellTime`'s `else -> item.type`),
 * so a new type's row is written only for someone every one of whose app
 * installs says it draws it — a `capabilities` value of `PUT /me/devices`
 * (lib/push/devices), named by the build that draws the row. Someone with no
 * app install (the web alone) gets the row. Used by the resonance tap's row
 * (`bell-tap`, ./tapBell) and the weekly read summary's (`bell-read-summary`,
 * ./readSummary).
 */
export function everyAppDraws(devices: Pick<QueryDocumentSnapshot, 'get'>[], capability: string): boolean {
  return devices.every((d) => {
    const caps = d.get('capabilities');
    return Array.isArray(caps) && caps.includes(capability);
  });
}

/** Whether `uid`'s app installs all draw `capability`'s row (see everyAppDraws). */
export async function appsDraw(db: Firestore, uid: string, capability: string): Promise<boolean> {
  const devices = await db.collection('devices').where('userId', '==', uid).select('capabilities').get();
  return everyAppDraws(devices.docs, capability);
}
