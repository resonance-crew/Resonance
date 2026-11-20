import { appsDrawIn } from '@/server/app/pushDevices';
import { everyCapable } from '@/server/domain/push/devices';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

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
export function everyAppDraws(devices: { get(field: string): unknown }[], capability: string): boolean {
  return everyCapable(
    devices.map((d) => {
      const caps = d.get('capabilities');
      return Array.isArray(caps) ? caps : null;
    }),
    capability,
  );
}

/** Whether `uid`'s app installs all draw `capability`'s row (see everyAppDraws). */
export function appsDraw(db: AdminDb, uid: string, capability: string): Promise<boolean> {
  return appsDrawIn(ctxFor(db), uid, capability);
}
