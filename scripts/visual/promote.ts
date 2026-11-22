/**
 * `promote --from <branch>`: a branch's (a round's) accepted pictures into main's baseline, once its work is on
 * main — the way a round's look becomes main's, now that each round has its own (baselines.ts). It is an accept
 * into main's, and held as one: refused without `--reason "<the owner's words>"` (and the guard hook checks the
 * words are the owner's), one row per run in docs/visual-accept-log.md.
 *
 * What moves is only what the branch ACCEPTED: a picture whose commit in the branch's meta.json (each capture's,
 * baselineMeta.ts) was accepted after the branch's baseline was cloned from main's (`branch.json`). The rest of
 * its folder is main's own pictures as they were then, never copied back over main's newer ones. `--only` narrows
 * it to screens or keys.
 *
 * And only once the change is on main: every commit those pictures were taken at must be in main's history
 * (`git merge-base --is-ancestor`). One that isn't — a round not yet merged, or merged by a squash or a
 * cherry-pick under another hash — stops the promote, naming them, unless `--allow-unmerged` says the owner
 * knows; then they are said again as it goes.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appendAcceptLog, ACCEPT_LOG } from './acceptLog';
import { named } from './accept';
import { nextMeta, type BaselineMeta, type Provenance } from './baselineMeta';
import { MAIN, baselineFolder, branchInfoPath, type BranchInfo } from './baselines';
import { ignorePath, listPngs, readJson, writeJson } from './util';

export type Pick = { key: string; from: Provenance };
export type PromotePlan = { branch: string; folder: string; picks: Pick[]; unmerged: string[] };

/** What promoting `branch` would move into main's, and which of its commits main doesn't have; or why nothing can move. */
export function planPromote(
  branch: string,
  { root, only = [], onMain }: { root: string; only?: string[]; onMain: (commit: string) => boolean },
): PromotePlan | { error: string } {
  if (!branch || branch === MAIN) return { error: 'promote needs --from <branch>: a branch or round baseline (main’s is where it goes)' };
  const folder = baselineFolder(branch, root);
  const info = readJson<BranchInfo>(branchInfoPath(folder));
  if (!existsSync(folder) || !info) return { error: `No baseline for ${branch} (${folder}): nothing was promoted.` };
  const clonedAt = new Date(info.clonedAt).getTime();
  const picks: Pick[] = [];
  for (const platform of readdirSync(folder).filter((p) => existsSync(join(folder, p, 'meta.json'))).sort()) {
    const meta = readJson<BaselineMeta>(join(folder, platform, 'meta.json'));
    for (const [key, from] of Object.entries(meta?.captures ?? {})) {
      // Accepted on the branch, after its baseline was made from main's; and still there.
      if (new Date(from.acceptedAt).getTime() > clonedAt && named(key, only) && existsSync(join(folder, key))) picks.push({ key, from });
    }
  }
  if (!picks.length) {
    return { error: `${branch} accepted nothing${only.length ? ` matching --only ${only.join(',')}` : ''} since its baseline was made from main's (${info.clonedAt}): nothing was promoted.` };
  }
  const unmerged = [...new Set(picks.map((p) => p.from.commit))].filter((c) => !onMain(c));
  return { branch, folder, picks: picks.sort((a, b) => a.key.localeCompare(b.key)), unmerged };
}

/**
 * Copies the picks (with their ignore lists, or a stale list taken away) into main's baseline, each run's at once
 * in the order they were accepted: main's meta.json gives each picture its branch commit, and the log one row per run.
 * Answers how many pictures each run gave.
 */
export function applyPromote(
  plan: PromotePlan,
  {
    root,
    reason,
    only = [],
    logFile = ACCEPT_LOG,
    now = () => new Date(),
    age,
  }: {
    root: string;
    reason: string;
    only?: string[];
    logFile?: string;
    now?: () => Date;
    /** A commit's time in seconds, or null when unknown (default: this checkout's git, baselineMeta `commitTime`). */
    age?: (commit: string) => number | null;
  },
): { run: string; commit: string; count: number }[] {
  const main = baselineFolder(MAIN, root);
  const runs = new Map<string, Pick[]>();
  for (const p of [...plan.picks].sort((a, b) => a.from.acceptedAt.localeCompare(b.from.acceptedAt))) {
    const id = `${p.from.run}\0${p.from.commit}`;
    runs.set(id, [...(runs.get(id) ?? []), p]);
  }
  const done: { run: string; commit: string; count: number }[] = [];
  for (const picks of runs.values()) {
    const { run, commit } = picks[0].from;
    const keys = picks.map((p) => p.key);
    for (const key of keys) {
      const to = join(main, key);
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, readFileSync(join(plan.folder, key)));
      const ignore = ignorePath(join(plan.folder, key));
      if (existsSync(ignore)) writeFileSync(ignorePath(to), readFileSync(ignore));
      else rmSync(ignorePath(to), { force: true });
    }
    const acceptedAt = now().toISOString();
    const inMain = listPngs(main);
    for (const platform of new Set(keys.map((k) => k.split('/')[0]))) {
      const file = join(main, platform, 'meta.json');
      const mine = (k: string) => k.startsWith(`${platform}/`);
      writeJson(file, nextMeta(readJson<BaselineMeta>(file), keys.filter(mine), inMain.filter(mine), { commit, run, acceptedAt, reason }, age));
    }
    appendAcceptLog({ at: now(), run, commit, dirty: false, keys, only, reason: `${reason} (promoted from ${plan.branch})` }, logFile);
    done.push({ run, commit, count: keys.length });
  }
  return done;
}
