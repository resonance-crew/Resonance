import {
  getNotificationSettingsIn,
  optedInIn,
  updateNotificationSettingsIn,
  wantsMessagePushes as wantsMessagePushesIn,
  wantsTapPushes as wantsTapPushesIn,
} from '@/server/app/pushSettings';
import type { NotificationSettings, NotificationSettingsPatch } from '@/server/domain/push/settings';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

/**
 * `notificationSettings/{uid}`: which pushes the person wants. Two go beyond
 * the ones answering them and are off until turned on (explicit opt-in: App
 * Store 4.5.4), each turn-on recording when (`picksConsentAt`,
 * `connectionCardsConsentAt` — the last time consent was given; turning a
 * switch off keeps it, the switch says it's off). The other two answer them
 * and are on unless turned off (stored only as `false`; no consent to
 * record): `messages` — messages and notes —, and `resonanceTaps` — someone
 * resonated with one of their cards (共振, the tap: lib/push/tapBell; the
 * installed app builds have no switch for it, the web has). A card answering
 * theirs always rings.
 *
 * Server-only (firestore.rules deny every client access): read and written
 * through GET/PATCH /api/v1/me/notifications, read by the senders
 * (lib/push/picks, lib/push/connectionCards, lib/push/chat and a note's bell
 * in lib/push/send). Purged with the account.
 *
 * The services are src/server/app/pushSettings (the record through the
 * pushState repos); these keep the old signatures.
 */
export { NOTIFICATION_SETTINGS } from '@/server/infra/firestore/repos/pushState';
export {
  NOTIFICATION_SWITCHES,
  dailyWalkStart,
  readNotificationSettings,
  type NotificationSettings,
  type NotificationSettingsPatch,
  type NotificationSwitch,
} from '@/server/domain/push/settings';

/** Whether `uid` wants messages and notes pushed to them (a missing document, or a failed read, says yes). */
export function wantsMessagePushes(db: AdminDb, uid: string): Promise<boolean> {
  return wantsMessagePushesIn(ctxFor(db), uid);
}

/** Whether `uid` wants a push when someone resonates with their card (a missing document, or a failed read, says yes). */
export function wantsTapPushes(db: AdminDb, uid: string): Promise<boolean> {
  return wantsTapPushesIn(ctxFor(db), uid);
}

export function getNotificationSettings(db: AdminDb, uid: string): Promise<NotificationSettings> {
  return getNotificationSettingsIn(ctxFor(db), uid);
}

/**
 * Change the switches sent, in a transaction: a switch turned on (off before)
 * stamps its consent time; one sent as it already is changes nothing (and
 * nothing at all is written then). Answers the settings as they are now.
 */
export function updateNotificationSettings(db: AdminDb, uid: string, patch: NotificationSettingsPatch): Promise<NotificationSettings> {
  return updateNotificationSettingsIn(ctxFor(db), uid, patch);
}

/**
 * Everyone who turned `key` on, a page of user ids at a time, in document id
 * order (an equality filter and the id order need no composite index) — from
 * just after `from` to the end, then from the start up to it, so each reader
 * comes once wherever the walk starts.
 */
export function optedIn(db: AdminDb, key: 'picks' | 'connectionCards', opts: { from?: string; pageSize?: number } = {}): AsyncGenerator<string[]> {
  return optedInIn(ctxFor(db), key, opts);
}
