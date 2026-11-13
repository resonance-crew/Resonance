/**
 * The apps' version numbers, read and rewritten as text: `apps/ios/project.yml`
 * (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` — one target, so one build number for iOS and
 * the Mac) and `apps/android/app/build.gradle.kts` (`versionName`, `versionCode`). Pure: the
 * callers read and write the files. preflight.ts checks the two agree; bump-version.ts moves them.
 */

export const IOS_PROJECT = 'apps/ios/project.yml';
export const ANDROID_GRADLE = 'apps/android/app/build.gradle.kts';

const IOS_MARKETING = /^(\s*MARKETING_VERSION:\s*)"?([^"\s]+)"?\s*$/gm;
const IOS_BUILD = /^(\s*CURRENT_PROJECT_VERSION:\s*)"?([^"\s]+)"?\s*$/gm;
const ANDROID_NAME = /^(\s*versionName\s*=\s*)"([^"]+)"\s*$/gm;
const ANDROID_CODE = /^(\s*versionCode\s*=\s*)(\d+)\s*$/gm;

export type Versions = {
  ios: { marketing: string; build: number };
  android: { name: string; code: number };
};

/** Every value a pattern finds (a file may set it more than once: each must agree). */
function all(text: string, re: RegExp): string[] {
  return [...text.matchAll(re)].map((m) => m[2]);
}

function single(text: string, re: RegExp, what: string, file: string): string {
  const found = [...new Set(all(text, re))];
  if (found.length === 0) throw new Error(`${file}: no ${what} found`);
  if (found.length > 1) throw new Error(`${file}: ${what} set to different values (${found.join(', ')})`);
  return found[0];
}

function integer(value: string, what: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${what} is not a whole number: ${value}`);
  return Number(value);
}

export function readVersions(projectYml: string, gradle: string): Versions {
  return {
    ios: {
      marketing: single(projectYml, IOS_MARKETING, 'MARKETING_VERSION', IOS_PROJECT),
      build: integer(single(projectYml, IOS_BUILD, 'CURRENT_PROJECT_VERSION', IOS_PROJECT), 'CURRENT_PROJECT_VERSION'),
    },
    android: {
      name: single(gradle, ANDROID_NAME, 'versionName', ANDROID_GRADLE),
      code: integer(single(gradle, ANDROID_CODE, 'versionCode', ANDROID_GRADLE), 'versionCode'),
    },
  };
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(v: string): [number, number, number] {
  const m = SEMVER.exec(v);
  if (!m) throw new Error(`not a version like 2.5.0: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareSemver(a: string, b: string): number {
  const [x, y] = [parseSemver(a), parseSemver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** `patch`, `minor`, `major` from the current version, or an explicit `x.y.z`. */
export function nextVersion(current: string, wanted: string): string {
  const [major, minor, patch] = parseSemver(current);
  if (wanted === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (wanted === 'minor') return `${major}.${minor + 1}.0`;
  if (wanted === 'major') return `${major + 1}.0.0`;
  parseSemver(wanted);
  return wanted;
}

export type BumpPlan = {
  from: Versions;
  to: Versions;
};

/**
 * What a release's bump moves to: the marketing version on both platforms, and each platform's
 * build number one past its own (they are counted apart: iOS/Mac 16 went with Android 17).
 * Refuses a version below today's, a build number that doesn't grow, and two platforms that
 * don't agree on today's version (fix that by hand first: it is what preflight checks).
 */
export function planBump(from: Versions, wanted: string, builds: { ios?: number; android?: number } = {}): BumpPlan {
  if (from.ios.marketing !== from.android.name) {
    throw new Error(`iOS/Mac is ${from.ios.marketing} and Android ${from.android.name}: make them agree before bumping`);
  }
  const version = nextVersion(from.ios.marketing, wanted);
  if (compareSemver(version, from.ios.marketing) < 0) throw new Error(`${version} is below the current ${from.ios.marketing}`);
  const iosBuild = builds.ios ?? from.ios.build + 1;
  const androidCode = builds.android ?? from.android.code + 1;
  if (iosBuild <= from.ios.build) throw new Error(`iOS/Mac build ${iosBuild} does not grow past ${from.ios.build}`);
  if (androidCode <= from.android.code) throw new Error(`Android versionCode ${androidCode} does not grow past ${from.android.code}`);
  return { from, to: { ios: { marketing: version, build: iosBuild }, android: { name: version, code: androidCode } } };
}

function replaceAll(text: string, re: RegExp, value: string, quote: boolean): string {
  return text.replace(re, (_m, head: string) => `${head}${quote ? `"${value}"` : value}`);
}

export function applyIos(projectYml: string, to: Versions['ios']): string {
  const a = replaceAll(projectYml, IOS_MARKETING, to.marketing, true);
  return replaceAll(a, IOS_BUILD, String(to.build), true);
}

export function applyAndroid(gradle: string, to: Versions['android']): string {
  const a = replaceAll(gradle, ANDROID_NAME, to.name, true);
  return replaceAll(a, ANDROID_CODE, String(to.code), false);
}

/** The lines that differ, as `-`/`+` pairs under the file's name with their line numbers. */
export function lineDiff(file: string, before: string, after: string): string[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    if (!out.length) out.push(`--- ${file}`, `+++ ${file}`);
    out.push(`@@ line ${i + 1}`);
    if (a[i] !== undefined) out.push(`-${a[i]}`);
    if (b[i] !== undefined) out.push(`+${b[i]}`);
  }
  return out;
}

/** The house's subject line for the bump commit (git log --grep 🔖). */
export function bumpSubject(to: Versions): string {
  return `build: 🔖 ${to.ios.marketing} — iOS + Mac ${to.ios.marketing} (${to.ios.build}), Android ${to.android.name} (versionCode ${to.android.code})`;
}
