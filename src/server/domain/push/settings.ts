import { createHash } from 'node:crypto';

/** Pure rules of `notificationSettings` and the pick log (lib/push/settings and lib/push/picks re-export them). */

export interface NotificationSettings {
  /** "Tonight's card": up to three evenings a week, one of their picks (lib/push/picks). */
  picks: boolean;
  /** A new public, named card from someone they're connected with (lib/push/connectionCards). */
  connectionCards: boolean;
  /** Messages and notes sent to them (lib/push/chat, a note's bell): on until turned off. */
  messages: boolean;
  /** Someone resonated with one of their cards (共振, the tap; lib/push/tapBell): on until turned off. */
  resonanceTaps: boolean;
}

export type NotificationSwitch = keyof NotificationSettings;
export const NOTIFICATION_SWITCHES: readonly NotificationSwitch[] = ['picks', 'connectionCards', 'messages', 'resonanceTaps'];

/** The switches sent; null or absent leaves one as it is (Kotlin clients send null). */
export type NotificationSettingsPatch = { [K in NotificationSwitch]?: boolean | null };

/** The opt-in switches, whose turning on is consent given (`messages` and `resonanceTaps` are on from the start: they record none). */
export const CONSENT_AT: Partial<Record<NotificationSwitch, string>> = {
  picks: 'picksConsentAt',
  connectionCards: 'connectionCardsConsentAt',
};

/**
 * A stored record as the switches it holds: the opt-in ones are on only as
 * `true`, `messages` and `resonanceTaps` are off only as `false` (a missing
 * record is the two opt-in ones off and the other two on).
 */
export function readNotificationSettings(data: Record<string, unknown> | undefined | null): NotificationSettings {
  return {
    picks: data?.picks === true,
    connectionCards: data?.connectionCards === true,
    messages: data?.messages !== false,
    resonanceTaps: data?.resonanceTaps !== false,
  };
}

/**
 * A patch applied to the switches: what they become, and the opt-in ones
 * turned on now (whose consent time is stamped). `changed` false: nothing to write.
 */
export function applySettingsPatch(
  before: NotificationSettings,
  patch: NotificationSettingsPatch,
): { after: NotificationSettings; consent: NotificationSwitch[]; changed: boolean } {
  const after = { ...before };
  const consent: NotificationSwitch[] = [];
  for (const key of NOTIFICATION_SWITCHES) {
    const want = patch[key];
    if (typeof want !== 'boolean' || want === before[key]) continue;
    after[key] = want;
    if (want && CONSENT_AT[key]) consent.push(key);
  }
  return { after, consent, changed: NOTIFICATION_SWITCHES.some((k) => after[k] !== before[k]) };
}

/** Readers fetched per page when a cron walks everyone who turned a switch on. */
export const OPTED_IN_PAGE = 500;

/** The characters of a Firebase uid, in the byte order Firestore sorts document ids by. */
const UID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Where a cron's walk over the opted-in readers starts on the UTC day of
 * `now`: a point among the user ids that moves from day to day (a hash of
 * the day), so a run that runs out of time leaves a different stretch of
 * readers each day rather than the same last ones every day. Both of the
 * evening's crons start at the same point, so the readers the warm-up
 * reaches first are the ones the push reaches first.
 */
export function dailyWalkStart(now: number): string {
  const day = new Date(now).toISOString().slice(0, 10);
  const digest = createHash('sha256').update(`opted-in walk ${day}`).digest();
  return Array.from(digest.subarray(0, 8), (b) => UID_CHARS[b % UID_CHARS.length]).join('');
}

/** `pickPushes/{uid}`: the cards pushed to a reader, and when each pick push went. */
export interface PickLog {
  recent: { cardId: string; at: number }[];
  /** When each pick push went (ms). */
  sentAt: number[];
}
