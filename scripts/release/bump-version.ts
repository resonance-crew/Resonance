/**
 * The release's version bump, both apps in one go: `MARKETING_VERSION` and
 * `CURRENT_PROJECT_VERSION` in apps/ios/project.yml (iOS and the Mac share the target, so one
 * build number), `versionName` and `versionCode` in apps/android/app/build.gradle.kts. Each
 * platform's build number goes one past its own unless given.
 *
 *   npx tsx scripts/release/bump-version.ts <x.y.z|patch|minor|major> [--ios-build N] [--android-code N] [--write]
 *
 * A dry run by default: it prints the diff and the commit subject, and writes nothing. With
 * --write it rewrites the two files; the commit (`build: 🔖 …`, one commit, nothing else in it)
 * is still yours to make.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ANDROID_GRADLE, IOS_PROJECT, applyAndroid, applyIos, bumpSubject, lineDiff, planBump, readVersions } from './versions';

const ROOT = resolve(__dirname, '../..');

export type BumpOutput = { lines: string[]; files: { path: string; after: string }[] };

/** The whole bump as text in, text out: what main() prints and, with --write, writes. */
export function bump(projectYml: string, gradle: string, args: string[]): BumpOutput {
  const wanted = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  if (!wanted) throw new Error('Usage: bump-version.ts <x.y.z|patch|minor|major> [--ios-build N] [--android-code N] [--write]');
  const num = (name: string) => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return undefined;
    const v = args[i + 1];
    if (!v || !/^\d+$/.test(v)) throw new Error(`--${name} needs a whole number`);
    return Number(v);
  };
  const plan = planBump(readVersions(projectYml, gradle), wanted, { ios: num('ios-build'), android: num('android-code') });
  const ios = applyIos(projectYml, plan.to.ios);
  const android = applyAndroid(gradle, plan.to.android);
  const lines = [
    `From iOS + Mac ${plan.from.ios.marketing} (${plan.from.ios.build}), Android ${plan.from.android.name} (versionCode ${plan.from.android.code})`,
    '',
    ...lineDiff(IOS_PROJECT, projectYml, ios),
    ...lineDiff(ANDROID_GRADLE, gradle, android),
    '',
    `Commit subject: ${bumpSubject(plan.to)}`,
  ];
  return { lines, files: [{ path: IOS_PROJECT, after: ios }, { path: ANDROID_GRADLE, after: android }] };
}

function main() {
  const args = process.argv.slice(2);
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
  const out = bump(read(IOS_PROJECT), read(ANDROID_GRADLE), args);
  for (const l of out.lines) console.log(l);
  if (!args.includes('--write')) {
    console.log('\nDry run: nothing written. Add --write to apply.');
    return;
  }
  for (const f of out.files) writeFileSync(join(ROOT, f.path), f.after);
  console.log(`\nWrote ${out.files.map((f) => f.path).join(' and ')}. Commit them alone: git commit -m "<subject above>" -- ${out.files.map((f) => f.path).join(' ')}`);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
