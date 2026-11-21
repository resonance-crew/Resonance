import type { ServerCtx } from '@/server/ctx';
import { cleanCapabilities, deviceLocale, everyCapable, staleDevices, timeZoneOf } from '@/server/domain/push/devices';

/** What `PUT /me/devices/{installationId}` registers (lib/push/devices tells the record's story). */
export interface DeviceRegistration {
  token: string;
  platform: 'ios' | 'android';
  locale?: string | null;
  appVersion?: string | null;
  /** What the build does with a push beyond showing it (`chat-push`, see lib/push/chat); unknown values are kept. */
  capabilities?: string[] | null;
  /** The device's IANA time zone (`Asia/Taipei`); one this server doesn't know is stored as null. */
  timeZone?: string | null;
}

/** Register the install to `uid`, then forget their least recently registered past MAX_DEVICES. */
export async function registerDeviceIn(ctx: ServerCtx, uid: string, installationId: string, input: DeviceRegistration): Promise<void> {
  const state = ctx.data.pushState;
  await state.putDevice(installationId, {
    userId: uid,
    token: input.token,
    platform: input.platform,
    locale: deviceLocale(input.locale),
    appVersion: input.appVersion ?? null,
    capabilities: cleanCapabilities(input.capabilities),
    timeZone: timeZoneOf(input.timeZone),
  });
  const stale = staleDevices(await state.listDeviceAges(uid));
  if (stale.length) await state.deleteDevices(stale);
}

/** Sign-out: stop pushing to this install — only if it is still yours (someone else may have signed in since). */
export function unregisterDeviceIn(ctx: ServerCtx, uid: string, installationId: string): Promise<void> {
  return ctx.uow.run(
    async (tx) => {
      if ((await tx.pushState.getDeviceOwner(installationId)) === uid) tx.pushState.deleteDevice(installationId);
    },
    { label: 'unregister device' },
  );
}

/** Whether `uid`'s app installs all draw `capability`'s bell row (lib/push/bellCapability). */
export async function appsDrawIn(ctx: ServerCtx, uid: string, capability: string): Promise<boolean> {
  return everyCapable(await ctx.data.pushState.listDeviceCapabilities(uid), capability);
}
