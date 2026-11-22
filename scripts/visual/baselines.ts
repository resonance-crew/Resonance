/**
 * Which baseline a checkout compares with and accepts into. There was one for the whole machine (every
 * worktree's `visual/` links to the main checkout's), so a round's accept became every other branch's
 * baseline: on 2026-11-22 the baseline was r29/r30's look (b4169a57), a branch main doesn't contain, and
 * every capture taken on main or another round came out changed, unexplained, and taken again.
 *
 * Now each line of work has its own, beside main's:
 *
 *   visual/baseline/                      main's — the old single baseline, left where it was (nothing moved)
 *   visual/baselines/<encoded name>/      a branch's, cloned from main's the first time it is used (APFS `cp -c`:
 *                                         no copy of the pictures, only of the folder's entries)
 *
 * Which one (`baselineName`): `VISUAL_BASELINE` when set (`main`, or any name); else the checkout's branch —
 * `main` (or `master`) is main's; a round's every lane (`r30/base`, `r30/web`, `r30/ios`, …) shares its round's
 * (`r30/base`), so the lanes and round-verify compare with the same pictures; any other branch has its own,
 * under its own name; a detached checkout has `detached-<commit>`. Only main itself (or `VISUAL_BASELINE=main`)
 * ever accepts into main's: a branch's accept can't reach it, and its pictures go there only by `promote`.
 *
 * A name becomes a folder by `encodeName`: every byte but ASCII letters, digits, `-` and `_` as `%XX`, so `/` and
 * `.` never make a path of it (`r30/base` → `r30%2Fbase`, `..` → `%2E%2E`).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { VISUAL_DIR, git, readJson, writeJson } from './util';

/** main's baseline: where the one baseline always was. */
export const MAIN_BASELINE = join(VISUAL_DIR, 'baseline');
/** Every other line of work's, by encoded name. */
export const BRANCH_BASELINES = join(VISUAL_DIR, 'baselines');
export const MAIN = 'main';

/** A name as a folder name: nothing but letters, digits, `-` and `_` stay; every other byte is `%XX`. */
export function encodeName(name: string): string {
  return [...Buffer.from(name, 'utf8')].map((b) => (/[A-Za-z0-9_-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, '0')}`)).join('');
}

export function decodeName(folder: string): string {
  return decodeURIComponent(folder);
}

/**
 * The baseline a checkout on `branch` uses (see above): `main`, its round's base, or its own name. `override` is
 * `VISUAL_BASELINE`; `head` names a detached checkout.
 */
export function baselineName(branch: string, { override, head }: { override?: string; head?: string } = {}): string {
  if (override?.trim()) return override.trim();
  if (branch === 'main' || branch === 'master') return MAIN;
  if (!branch || branch === 'HEAD') return `detached-${(head ?? 'unknown').slice(0, 8)}`;
  const round = /^(r\d+)\/[^/]+$/.exec(branch);
  if (round) return `${round[1]}/base`;
  return branch;
}

/** The folder of baseline `name` (main's, or one under `baselines/`). */
export function baselineFolder(name: string, root = VISUAL_DIR): string {
  return name === MAIN ? join(root, 'baseline') : join(root, 'baselines', encodeName(name));
}

/** What a branch's baseline keeps about itself: its name and when it was cloned from main's. */
export type BranchInfo = { name: string; clonedFrom: string; clonedAt: string };
export const branchInfoPath = (folder: string) => join(folder, 'branch.json');

/**
 * Makes baseline `name` from main's when it doesn't exist yet: cloned into a folder of its own and moved into
 * place in one rename, so two runs making it at once leave one whole baseline (the second finds it made).
 * Answers its folder, and whether it was made now.
 */
export function ensureBaseline(name: string, { root = VISUAL_DIR, now = () => new Date(), log = () => {} }: { root?: string; now?: () => Date; log?: (line: string) => void } = {}): { folder: string; made: boolean } {
  const folder = baselineFolder(name, root);
  if (name === MAIN || existsSync(folder)) return { folder, made: false };
  const main = baselineFolder(MAIN, root);
  mkdirSync(dirname(folder), { recursive: true });
  const making = `${folder}.making-${process.pid}-${Date.now()}`;
  rmSync(making, { recursive: true, force: true });
  if (existsSync(main)) {
    try {
      // APFS: a clone of every file, no bytes copied (the baseline is ~400 MB).
      execFileSync('cp', ['-c', '-R', main, making], { stdio: 'ignore' });
    } catch {
      rmSync(making, { recursive: true, force: true });
      cpSync(main, making, { recursive: true });
    }
  } else mkdirSync(making, { recursive: true });
  const info: BranchInfo = { name, clonedFrom: MAIN, clonedAt: now().toISOString() };
  writeJson(branchInfoPath(making), info);
  try {
    renameSync(making, folder);
  } catch (error) {
    rmSync(making, { recursive: true, force: true });
    if (!existsSync(folder)) throw error;
    return { folder, made: false };
  }
  log(`Baseline ${name}: made from main's (${folder})`);
  return { folder, made: true };
}

/** The baselines there are: main's and every branch's, by name. */
export function listBaselines(root = VISUAL_DIR): { name: string; folder: string; info: BranchInfo | null }[] {
  const out = [{ name: MAIN, folder: baselineFolder(MAIN, root), info: null as BranchInfo | null }];
  const dir = join(root, 'baselines');
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir).sort()) {
      if (entry.includes('.making-')) continue;
      const folder = join(dir, entry);
      out.push({ name: decodeName(entry), folder, info: readJson<BranchInfo>(branchInfoPath(folder)) });
    }
  }
  return out;
}

/**
 * The baseline a run was taken against (`run.json` `baseline`), whichever checkout looks at it later — `compare`,
 * `review` and `accept` of a run use the pictures it was compared with; a run from before baselines had names
 * used the one baseline there was, main's.
 */
export function runBaselineName(runDir: string): string {
  const info = readJson<{ baseline?: string }>(join(runDir, 'run.json'));
  return info ? (info.baseline ?? MAIN) : currentBaselineName();
}

export function runBaseline(runDir: string): string {
  return ensureBaseline(runBaselineName(runDir)).folder;
}

/** This checkout's baseline name (cached: a run doesn't change branch under itself). */
let current: string | null = null;
export function currentBaselineName(): string {
  current ??= baselineName(git('rev-parse', '--abbrev-ref', 'HEAD'), { override: process.env.VISUAL_BASELINE, head: git('rev-parse', 'HEAD') });
  return current;
}

/** This checkout's baseline folder, made from main's the first time (see above). */
let folder: string | null = null;
export function baselineDir(log?: (line: string) => void): string {
  folder ??= ensureBaseline(currentBaselineName(), { log }).folder;
  return folder;
}
