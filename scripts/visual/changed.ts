/**
 * `capture --changed` (opt-in, slices only): the platforms whose screens can't have moved since their baseline are not
 * captured. A change only to the web's UI takes no app capture; one only to `apps/android`, no web, iOS or Mac.
 *
 * What can move a platform's screens is read from the paths a change touches (`affects`), and the rule is to take a
 * platform whenever in doubt: the server (`src/app/api`, `src/server`, `src/lib`), the strings, the seed, the rules,
 * the harness itself, the project's configuration and any path this file doesn't know take every platform. Only what
 * plainly draws no screen takes none (docs, designs, tests, notes, the CI's own files).
 *
 * What changed is counted from each platform's own baseline — the commit its `meta.json` names (the oldest of its
 * pictures'), through `git merge-base` with HEAD — to the working tree: commits since, what is staged, what is not,
 * and untracked files (`changedFiles`). A platform with no baseline commit, or one git can't find, is taken.
 * `--since <ref>` counts from that commit instead, for every platform.
 *
 * Never with `--flows` (a release run takes everything: refused), and nothing outside the repository is seen — after a
 * new Xcode, Android system image or macOS, capture without `--changed`.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { Platform } from './screens';
import { ROOT, readJson } from './util';

const ALL: Platform[] = ['web', 'android', 'ios', 'mac'];
const APPS: Platform[] = ['android', 'ios', 'mac'];
const APPLE: Platform[] = ['ios', 'mac'];

/** What a path's change can move, and why (said in the plan). */
export type Effect = { platforms: Platform[]; why: string };

const rule = (test: (path: string) => boolean, platforms: Platform[], why: string) => ({ test, effect: { platforms, why } });
const under = (...dirs: string[]) => (path: string) => dirs.some((d) => path === d || path.startsWith(`${d}/`));

/**
 * The rules, first match wins. The apps' rules follow what their builds read (android.ts `androidInputs`, ios.ts
 * `xcodeInputs`: changed.test.ts holds them to it); anything not matched takes every platform.
 */
const RULES = [
  // Nothing a screen shows.
  rule((p) => /\.(test|spec)\.(ts|tsx|mts|mjs|js)$/.test(p), [], 'a test'),
  rule((p) => /\.md$/.test(p) && !p.startsWith('src/'), [], 'a document'),
  rule(under('docs', 'designs', 'test', '.github', '.claude', 'maestro', 'infra'), [], 'not drawn by any screen'),
  rule((p) => ['LICENSE', 'THIRD_PARTY_NOTICES.md', '.gitignore', 'eslint.config.mjs', 'vitest.config.ts', 'vitest.emulator.config.ts'].includes(p), [], 'not drawn by any screen'),
  // Shared by every platform: the server the apps read, the strings, the seeded world, the rules, the harness.
  rule(under('src/app/api', 'src/server', 'src/lib', 'src/messages', 'src/middleware.ts'), ALL, 'the server, or what every platform shares'),
  rule(under('scripts/visual', 'scripts/seed', 'scripts/seed-emulator.ts', 'scripts/emulator-env.mjs', 'scripts/emulators-at.mjs', 'scripts/dev-emulator.mjs', 'firebase'), ALL, 'the harness, the seed or the emulators'),
  rule(under('public/stickers'), ALL, 'stickers: the web and both apps'),
  // One platform's own.
  rule(under('apps/android'), ['android'], 'the Android app'),
  rule(under('apps/ios/Packages/DesignSystem/Sources/DesignSystem/Resources'), APPS, "the design system's resources: both apps"),
  rule(under('apps/ios'), APPLE, 'the iOS and Mac app'),
  rule(under('apps/shared', 'native'), APPS, 'what both apps share'),
  rule(under('src/components', 'src/styles', 'src/i18n', 'src/app', 'public'), ['web'], "the web's own pages"),
];

/** What a change to `path` (relative to the repository) can move; anything unknown, every platform. */
export function affects(path: string): Effect {
  for (const r of RULES) if (r.test(path)) return r.effect;
  return { platforms: ALL, why: 'not a path this harness knows: every platform, to be safe' };
}

/** Files changed between `base` and the working tree: commits since, staged, unstaged, and untracked (not ignored). */
export function changedFiles(base: string, root = ROOT): string[] {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  const tracked = git('diff', '--name-only', '--no-renames', base).split('\n');
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked].map((l) => l.trim()).filter(Boolean))].sort();
}

/** The commit a platform's baseline was taken at (its meta.json: the oldest of its pictures'), or null. */
export function baselineCommit(baselineDir: string, platform: Platform): string | null {
  return readJson<{ commit?: string }>(join(baselineDir, platform, 'meta.json'))?.commit ?? null;
}

/** Where to count from: the merge base of `commit` and HEAD, or null when git doesn't know `commit`. */
export function mergeBase(commit: string, root = ROOT): string | null {
  try {
    return execFileSync('git', ['merge-base', commit, 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

export type PlatformPlan = {
  platform: Platform;
  run: boolean;
  /** Why it runs or not: the change that takes it, or that none does. */
  why: string;
  /** Where its changes were counted from (null: nowhere to count from, so it runs). */
  since: string | null;
  /** The changed files that take it (a few are said). */
  files: string[];
};

/**
 * Each platform's plan: taken when any file changed since its own baseline takes it, or when there is nothing to
 * count from. `files(base)` answers the changed files since a commit (changedFiles, cached per base).
 */
export function planChanged(
  platforms: readonly Platform[],
  { baseOf, files }: { baseOf: (platform: Platform) => { since: string | null; why?: string }; files: (since: string) => string[] },
): PlatformPlan[] {
  return platforms.map((platform) => {
    const { since, why } = baseOf(platform);
    if (!since) return { platform, run: true, why: why ?? 'no baseline commit to count from: taken', since: null, files: [] };
    const taking = files(since).filter((f) => affects(f).platforms.includes(platform));
    return taking.length
      ? { platform, run: true, why: affects(taking[0]).why, since, files: taking }
      : { platform, run: false, why: 'nothing changed since its baseline can move its screens', since, files: [] };
  });
}

/** The plan in lines: each platform run or skipped, why, from where, and the first files that take it. */
export function planLines(plan: readonly PlatformPlan[], shown = 5): string[] {
  const lines = ['Changed since each platform\'s baseline (--changed):'];
  for (const p of plan) {
    const from = p.since ? ` since ${p.since.slice(0, 8)}` : '';
    lines.push(`  ${p.run ? 'run ' : 'skip'}  ${p.platform.padEnd(7)}${from} — ${p.why}${p.files.length ? ` (${p.files.length} file${p.files.length === 1 ? '' : 's'})` : ''}`);
    for (const f of p.files.slice(0, shown)) lines.push(`          ${f}`);
    if (p.files.length > shown) lines.push(`          … and ${p.files.length - shown} more`);
  }
  return lines;
}

/**
 * The whole step for a capture: the plan for `platforms` against `baselineDir` (or `since` for all), with the changed
 * files read from git once per base.
 */
export function changedPlan(platforms: readonly Platform[], { baselineDir, since, root = ROOT }: { baselineDir: string; since?: string; root?: string }): PlatformPlan[] {
  const cache = new Map<string, string[]>();
  const files = (base: string) => {
    if (!cache.has(base)) cache.set(base, changedFiles(base, root));
    return cache.get(base)!;
  };
  return planChanged(platforms, {
    files,
    baseOf: (platform) => {
      const commit = since ?? baselineCommit(baselineDir, platform);
      if (!commit) return { since: null, why: 'its baseline names no commit: taken' };
      const base = mergeBase(commit, root);
      return base ? { since: base } : { since: null, why: `git doesn't know ${commit.slice(0, 8)}: taken` };
    },
  });
}

/** Why `--changed` can't go with these arguments (a release run), or null. */
export function refusesChanged(args: readonly string[]): string | null {
  if (args.includes('--flows')) return '--changed is for slices: a release run (--flows) captures every platform, whatever changed. Nothing was captured.';
  return null;
}
