/**
 * Which app build a request comes from, read from its User-Agent — for the
 * few answers the store builds made before letters still need (./preLetter).
 *
 * Both apps send `Resonance/<version> (<iOS|Android> <OS version>; build <n>)`
 * on every request (iOS AppHTTP, Android AppHttp — the same at 7136d72, the
 * store builds): `Resonance/2.0.0 (iOS 18.5; build 6)`,
 * `Resonance/2.0.0 (Android 15; build 7)`. Anything else — the web, a script,
 * a browser — is no app build at all (null), and never an old one.
 *
 * A User-Agent is the caller's to choose, so nothing that depends on it may
 * give anyone more than they could see or do anyway (see ./preLetter).
 */

export type AppPlatform = 'ios' | 'android';

export interface ClientBuild {
  platform: AppPlatform;
  /** The marketing version (`2.0.0`). */
  version: string;
  /** iOS CFBundleVersion, Android versionCode. */
  build: number;
}

const APP_AGENT = /^Resonance\/([^\s()]+) \((iOS|Android) [^;()]*; build (\d{1,9})\)/;

/** The app build a User-Agent names, or null when it names none. */
export function clientBuild(userAgent: string | null | undefined): ClientBuild | null {
  const m = APP_AGENT.exec(userAgent?.trim() ?? '');
  if (!m) return null;
  return { platform: m[2] === 'iOS' ? 'ios' : 'android', version: m[1], build: Number(m[3]) };
}

/**
 * The marketing version of every build made before letters: TestFlight 2.0.0
 * (1)–(6), Play versionCodes 3–7 named 2.0.0. A build number is unique only
 * within its version (App Store Connect lets a new version start again at 1),
 * so the version is part of what makes a build old.
 */
export const PRE_LETTER_VERSION = '2.0.0';

/**
 * The last builds made before letters (a note connects no one until its
 * card's author answers it; a writer may leave 3 unanswered): iOS 2.0.0 (6)
 * and Android 2.0.0 versionCode 7, both from 7136d72 — the store builds, and
 * the tester builds before them. Every 2.0.0 build after them is iOS ≥ 7,
 * Android ≥ 8; any other version is never old, whatever its build number.
 */
export const LAST_PRE_LETTER_BUILD: Readonly<Record<AppPlatform, number>> = { ios: 6, android: 7 };

/** Whether a request (or a User-Agent) comes from an app build made before letters. */
export function isPreLetterBuild(from: Request | string | null | undefined): boolean {
  const agent = typeof from === 'string' || from == null ? from : from.headers.get('user-agent');
  const build = clientBuild(agent);
  return build !== null && build.version === PRE_LETTER_VERSION && build.build <= LAST_PRE_LETTER_BUILD[build.platform];
}

/**
 * The last store builds that don't know someone else's 私人卡 shared with them
 * in a thread (api/v1/sharedCards): iOS 2.2.0 (12) and Android 2.2.0
 * versionCode 14, and every build before them. Shown such a card, they would
 * offer a note, a resonance and a bookmark the server refuses — so the pass
 * isn't read for them, and the card stays hidden from them as any private
 * card is (their bubble's "not visible to you"). Every later 2.2.0 build is
 * iOS ≥ 13, Android ≥ 15 — keep it so.
 */
export const LAST_BUILD_WITHOUT_SHARED_CARDS = { version: '2.2.0', build: { ios: 12, android: 14 } as const };

/** `a` against `b`, dotted numeric versions (`2.10.0` after `2.9.1`); a part that isn't a number counts as 0. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/**
 * Whether a request comes from a client that draws someone else's 私人卡
 * read-only: the web (and anything that names no app build), or an app build
 * after {@link LAST_BUILD_WITHOUT_SHARED_CARDS}. A User-Agent claiming a newer
 * build gets nothing the web wouldn't give the same account.
 */
export function knowsSharedCards(from: Request | string | null | undefined): boolean {
  const agent = typeof from === 'string' || from == null ? from : from.headers.get('user-agent');
  const build = clientBuild(agent);
  if (!build) return true;
  const last = LAST_BUILD_WITHOUT_SHARED_CARDS;
  const order = compareVersions(build.version, last.version);
  return order > 0 || (order === 0 && build.build > last.build[build.platform]);
}

/**
 * The language an Accept-Language header asks for first (its highest `q`,
 * the earlier on a tie), or null when it names none. iOS's URLSession sends
 * the system's languages as the app supports them; OkHttp sends none.
 */
export function preferredLanguage(header: string | null | undefined): string | null {
  let best: { tag: string; q: number } | null = null;
  for (const part of (header ?? '').split(',')) {
    const [tag = '', ...params] = part.split(';').map((p) => p.trim());
    if (!/^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/.test(tag)) continue;
    const weight = params.find((p) => /^q=/i.test(p));
    const q = weight === undefined ? 1 : Number(weight.slice(2));
    if (!(q > 0 && q <= 1)) continue;
    if (!best || q > best.q) best = { tag, q };
  }
  return best?.tag ?? null;
}
