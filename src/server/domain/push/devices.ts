/** Pure rules of the device registry (lib/push/devices re-exports them). */

export type DeviceLocale = 'en' | 'zh-TW';

/** The app's UI language as the push speaks it (anything Chinese reads zh-TW; the rest English). */
export function deviceLocale(value: unknown): DeviceLocale {
  return typeof value === 'string' && value.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en';
}

/** An IANA zone name's shape: `UTC`, `Asia/Taipei`, `America/Argentina/Buenos_Aires`, `Etc/GMT+8` — never an offset. */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/**
 * A time zone as the server keeps it: an IANA name this runtime's time zone
 * data knows (Intl), in its own spelling — else null. Never a reason to
 * refuse a registration: a phone set to a zone we can't place still gets
 * its pushes, just not at its own local hour.
 */
export function timeZoneOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.length > 64 || !ZONE_NAME.test(name)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** A registration's capabilities as kept: distinct, lowercase words, at most eight. */
export function cleanCapabilities(capabilities: string[] | null | undefined): string[] {
  return [...new Set(capabilities ?? [])].filter((c) => /^[a-z0-9-]{1,32}$/.test(c)).slice(0, 8);
}

/**
 * How many installs one account keeps pushing to. A reinstall is a new
 * install (its old one lingers until FCM says its token is dead), so a
 * person collects a few; past this the least recently registered go, which
 * bounds what one account can make every push fan out to.
 */
export const MAX_DEVICES = 20;

/** The records past MAX_DEVICES, least recently registered (the newest MAX_DEVICES stay). */
export function staleDevices(mine: { id: string; updatedAtMs: number }[]): string[] {
  if (mine.length <= MAX_DEVICES) return [];
  return [...mine].sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(MAX_DEVICES).map((d) => d.id);
}

/**
 * One record per push token, the most recently registered kept (its language and capabilities are the build's
 * now): the same token under two records — an install whose id was made anew while its token stayed, as an iOS
 * install's is when the phone's vendor id changes between an Xcode build and a store build — would ring the
 * phone twice for one push (device-fixes #6).
 */
export function onePerToken<T extends { token: string; updatedAtMs: number }>(records: T[]): T[] {
  const kept = new Map<string, T>();
  for (const r of records) {
    const held = kept.get(r.token);
    if (!held || r.updatedAtMs > held.updatedAtMs) kept.set(r.token, r);
  }
  // In the records' own order.
  return records.filter((r) => kept.get(r.token) === r);
}

/** The targets split by the language their app speaks, in the order each language first appears. */
export function groupByLocale<T extends { locale: DeviceLocale }>(targets: T[]): Map<DeviceLocale, T[]> {
  const byLocale = new Map<DeviceLocale, T[]>();
  for (const t of targets) byLocale.set(t.locale, [...(byLocale.get(t.locale) ?? []), t]);
  return byLocale;
}

/**
 * Whether every install declares `capability` (lib/push/bellCapability): a
 * record whose capabilities aren't a list declares none; no install at all, yes.
 */
export function everyCapable(capabilities: (readonly unknown[] | null)[], capability: string): boolean {
  return capabilities.every((caps) => Array.isArray(caps) && caps.includes(capability));
}
