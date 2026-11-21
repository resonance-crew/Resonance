import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import type { PushGateway, PushMessage, PushOutcome } from '@/server/ports/push';

/**
 * What sends FCM's multicasts: the admin SDK's `Messaging` in production, a
 * fake in the emulator suites (which assert on the `MulticastMessage` it is
 * handed). Kept as the legacy facades' parameter type (lib/push/send
 * re-exports it); services see a PushGateway (`fromPushSender`).
 */
export interface PushSender {
  sendEachForMulticast(message: MulticastMessage): Promise<BatchResponse>;
}

/** sendEachForMulticast's limit on tokens per call. */
export const MULTICAST_MAX = 500;

/** Tokens FCM will never deliver to again — the app was uninstalled or the token rotated. */
const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

/**
 * A PushMessage as FCM's multicast, field for field what src/lib/push built
 * by hand before the gateway (fcm/push.test.ts holds every kind to it):
 *
 * - `title` (and `body`) → `notification`; without a title the push is data-only.
 * - `android`: `priority`, and a `notification` block when a channel, tag or
 *   display priority is set — `channelId`, `tag`, `priority` (display),
 *   `defaultSound: false` when silent.
 * - `apns` when any Apple field is set (`threadId`, `collapseId`,
 *   `applePriority`, `interruptionLevel`, `badge`): headers
 *   `apns-collapse-id` / `apns-priority`, and `aps` with `sound: 'default'`
 *   unless silent, `threadId`, `interruption-level`, `badge`.
 */
export function toMulticast(tokens: string[], m: PushMessage): MulticastMessage {
  const out: MulticastMessage = { tokens };
  if (m.title !== undefined) {
    out.notification = { title: m.title, ...(m.body !== undefined ? { body: m.body } : {}), ...(m.image !== undefined ? { imageUrl: m.image } : {}) };
  }
  out.data = m.data;

  const androidNotification =
    m.channel !== undefined || m.tag !== undefined || m.display !== undefined
      ? {
          ...(m.channel !== undefined ? { channelId: m.channel } : {}),
          ...(m.tag !== undefined ? { tag: m.tag } : {}),
          ...(m.display !== undefined ? { priority: m.display } : {}),
          ...(m.silent ? { defaultSound: false } : {}),
        }
      : null;
  if (m.priority !== undefined || androidNotification) {
    out.android = { ...(m.priority !== undefined ? { priority: m.priority } : {}), ...(androidNotification ? { notification: androidNotification } : {}) };
  }

  const apple = m.threadId !== undefined || m.collapseId !== undefined || m.applePriority !== undefined || m.interruptionLevel !== undefined || m.badge !== undefined;
  if (apple) {
    const headers: Record<string, string> = {
      ...(m.collapseId !== undefined ? { 'apns-collapse-id': m.collapseId } : {}),
      ...(m.applePriority !== undefined ? { 'apns-priority': String(m.applePriority) } : {}),
    };
    out.apns = {
      ...(Object.keys(headers).length ? { headers } : {}),
      payload: {
        aps: {
          ...(m.silent ? {} : { sound: 'default' }),
          ...(m.threadId !== undefined ? { threadId: m.threadId } : {}),
          ...(m.interruptionLevel !== undefined ? { 'interruption-level': m.interruptionLevel } : {}),
          ...(m.badge !== undefined ? { badge: m.badge } : {}),
        },
      },
    };
  }
  return out;
}

/**
 * A PushGateway over a PushSender: the tokens MULTICAST_MAX to a call, one
 * call after another; `sent` FCM's success count, `dead` the tokens it
 * refused as unregistered or invalid. A call that throws throws here.
 */
export function fromPushSender(sender: PushSender): PushGateway {
  return {
    async send(tokens: string[], message: PushMessage): Promise<PushOutcome> {
      let sent = 0;
      const dead: string[] = [];
      for (let start = 0; start < tokens.length; start += MULTICAST_MAX) {
        const batch = tokens.slice(start, start + MULTICAST_MAX);
        const res = await sender.sendEachForMulticast(toMulticast(batch, message));
        sent += res.successCount;
        res.responses.forEach((r, i) => {
          if (!r.success && r.error && DEAD_TOKEN.has(r.error.code)) dead.push(batch[i]);
        });
      }
      return { sent, dead };
    },
  };
}

/**
 * FCM through the admin SDK's messaging, loaded on the first send (a context
 * built for a request that pushes nothing never loads it). Through
 * `@/lib/db/firestore/admin`, the path unit tests `vi.mock`.
 */
export function fcmPushGateway(): PushGateway {
  const sender: PushSender = {
    sendEachForMulticast: async (message) => (await (await import('@/lib/db/firestore/admin')).getAdminMessaging()).sendEachForMulticast(message),
  };
  return fromPushSender(sender);
}
