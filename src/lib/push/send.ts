import { pushNotificationIn, type PushResult } from '@/server/app/pushSend';
import { fromPushSender, type PushSender } from '@/server/infra/fcm/push';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

/**
 * A bell row's push. The service is `pushNotificationIn` (src/server/app/pushSend,
 * vendor-free, over ServerCtx); this module keeps the old entry points — the
 * emulator suites and ring.ts call `pushNotification(db, id, sender)` — and
 * re-exports the pure copy and routes from src/server/domain/push/text.
 */

export type { PushSender } from '@/server/infra/fcm/push';
export { MULTICAST_MAX } from '@/server/infra/fcm/push';
export type { PushResult } from '@/server/app/pushSend';
export { ANDROID_CHANNEL, MESSAGES_CHANNEL, pushRoute, pushText } from '@/server/domain/push/text';

/**
 * Push `notifications/{id}` to its recipient's devices, once (see pushNotificationIn):
 * claimed with `pushedAt` in a transaction before anything is sent, silenced
 * by a block standing between the two at send time, never throwing into a writer.
 */
export function pushNotification(db: AdminDb, id: string, sender: PushSender): Promise<PushResult | null> {
  return pushNotificationIn(ctxFor(db, { push: fromPushSender(sender) }), id);
}
