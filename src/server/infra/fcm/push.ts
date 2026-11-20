import type { PushGateway } from '@/server/ports/push';
import { notWired } from '../wiring';

/**
 * FCM through the admin SDK's messaging. Not wired yet: the push lane turns a
 * PushMessage into FCM's `MulticastMessage` here (and wraps an injected
 * legacy `PushSender` the same way, for `ctxFor(db, { push })`). Until then
 * src/lib/push sends through `getAdminMessaging()` itself, as before.
 */
export function fcmPushGateway(): PushGateway {
  return notWired<PushGateway>('push');
}
