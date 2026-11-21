import type { ServerCtx } from '@/server/ctx';
import { OPTED_IN_PAGE, applySettingsPatch, type NotificationSettings, type NotificationSettingsPatch } from '@/server/domain/push/settings';

/**
 * Which pushes a person wants (`notificationSettings/{uid}`; the story is in
 * lib/push/settings). Vendor-free: the record through ctx's pushState repos.
 */

/**
 * Whether `uid` wants messages and notes pushed to them (a missing record
 * says yes). A failed read says yes too: the push it guards answers someone
 * who wrote to them, and staying silent on a hiccup would lose it.
 */
export async function wantsMessagePushes(ctx: ServerCtx, uid: string): Promise<boolean> {
  try {
    return (await ctx.data.pushState.getSettings(uid)).messages;
  } catch (e) {
    ctx.log.error('[push] notification settings', uid, e);
    return true;
  }
}

/** Whether `uid` wants a push when someone resonates with their card (a missing record says yes; a failed read too). */
export async function wantsTapPushes(ctx: ServerCtx, uid: string): Promise<boolean> {
  try {
    return (await ctx.data.pushState.getSettings(uid)).resonanceTaps;
  } catch (e) {
    ctx.log.error('[push] notification settings', uid, e);
    return true;
  }
}

export function getNotificationSettingsIn(ctx: ServerCtx, uid: string): Promise<NotificationSettings> {
  return ctx.data.pushState.getSettings(uid);
}

/**
 * Change the switches sent, in a transaction: a switch turned on (off before)
 * stamps its consent time; one sent as it already is changes nothing (and
 * nothing at all is written then). Answers the settings as they are now.
 */
export function updateNotificationSettingsIn(ctx: ServerCtx, uid: string, patch: NotificationSettingsPatch): Promise<NotificationSettings> {
  return ctx.uow.run(
    async (tx) => {
      const { exists, settings: before } = await tx.pushState.getSettingsRecord(uid);
      const { after, consent, changed } = applySettingsPatch(before, patch);
      // Nothing to change (a missing record already reads as the defaults): nothing written.
      if (!changed) return after;
      tx.pushState.putSettings(uid, after, { consent, created: !exists });
      return after;
    },
    { label: 'notification settings' },
  );
}

/**
 * Everyone who turned `key` on, a page of user ids at a time, in id order —
 * from just after `from` to the end, then from the start up to it, so each
 * reader comes once wherever the walk starts.
 */
export async function* optedInIn(
  ctx: ServerCtx,
  key: 'picks' | 'connectionCards',
  opts: { from?: string; pageSize?: number } = {},
): AsyncGenerator<string[]> {
  const limit = opts.pageSize ?? OPTED_IN_PAGE;
  const legs: { after: string | null; upTo: string | null }[] =
    opts.from === undefined ? [{ after: null, upTo: null }] : [{ after: opts.from, upTo: null }, { after: null, upTo: opts.from }];
  for (const leg of legs) {
    let after = leg.after;
    for (;;) {
      const page = await ctx.data.pushState.listOptedIn(key, { after, upTo: leg.upTo, limit });
      if (!page.length) break;
      yield page;
      if (page.length < limit) break;
      after = page[page.length - 1];
    }
  }
}
