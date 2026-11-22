/**
 * `accept`: runs' captures copied into the baseline — all of them, or the keys / screen ids `--only`
 * names — on the owner's word (`--reason`, acceptLog.ts). One run (`--run <id>`, or the latest) or
 * several (`--runs a,b,c`): a slice taken platform by platform, or a platform taken again after a
 * fix, becomes the baseline in one go.
 *
 * Several runs are accepted as one: everything is checked before anything is copied — every run
 * exists, and each gives at least one capture — so a typo accepts nothing. A capture more than one of
 * them took comes from the one named LAST (a retake named after the run it retakes), and the run it
 * replaced is said. Each run then gets its own row in docs/visual-accept-log.md (its commit is its
 * own) and each capture the commit of the run it came from in meta.json (baselineMeta.ts).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appendAcceptLog, ACCEPT_LOG } from './acceptLog';
import { nextMeta, type BaselineMeta } from './baselineMeta';
import type { RunInfo } from './compare';
import { ignorePath, listPngs, readJson, writeJson } from './util';

/** Whether `key` is one `--only` names: a key itself, or a screen id (every variant and device of it). */
export const named = (key: string, only: readonly string[]) => !only.length || only.some((o) => key === o || key.split('/').pop()!.startsWith(`${o}@`));

export type AcceptPlan = { runDir: string; info: RunInfo; keys: string[] };

/** What each run gives, a later run's capture winning over an earlier one's; or why nothing can be accepted. */
export function planAccept(runDirs: readonly string[], only: readonly string[]): { plans: AcceptPlan[]; replaced: string[] } | { error: string } {
  if (!runDirs.length) return { error: 'No run to accept: name one with --run <id> or several with --runs a,b' };
  const seen = new Set<string>();
  for (const dir of runDirs) {
    if (seen.has(dir)) return { error: `${dir.split('/').pop()} is named twice` };
    seen.add(dir);
    if (!existsSync(join(dir, 'run.json'))) return { error: `No run ${dir.split('/').pop()} in ${dirname(dir)}: nothing was accepted.` };
  }
  const plans = runDirs.map((runDir) => ({ runDir, info: readJson<RunInfo>(join(runDir, 'run.json'))!, keys: listPngs(runDir).filter((k) => named(k, only)) }));
  for (const p of plans) {
    if (!p.keys.length) return { error: `Nothing in ${p.info.id} matches ${only.length ? `--only ${only.join(',')}` : 'the run'}: nothing was accepted.` };
  }
  // The last run naming a capture gives it.
  const from = new Map<string, number>();
  plans.forEach((p, i) => p.keys.forEach((k) => from.set(k, i)));
  const replaced: string[] = [];
  plans.forEach((p, i) => {
    for (const k of p.keys) if (from.get(k) !== i) replaced.push(`${k} from ${p.info.id} (taken again in ${plans[from.get(k)!].info.id})`);
    p.keys = p.keys.filter((k) => from.get(k) === i);
  });
  return { plans: plans.filter((p) => p.keys.length), replaced };
}

/**
 * Copies each plan's captures (and their ignore lists, or takes a stale list away), writes each platform's
 * meta.json and one accept-log row per run. Answers how many captures each run gave.
 */
export function applyAccept(
  plans: AcceptPlan[],
  { reason, only, baselineDir, logFile = ACCEPT_LOG, now = () => new Date() }: { reason: string; only: string[]; baselineDir: string; logFile?: string; now?: () => Date },
): { run: string; count: number }[] {
  const done: { run: string; count: number }[] = [];
  for (const { runDir, info, keys } of plans) {
    for (const key of keys) {
      const to = join(baselineDir, key);
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, readFileSync(join(runDir, key)));
      // The regions it asked the comparison to skip go with it (or a stale list goes).
      const ignore = ignorePath(join(runDir, key));
      if (existsSync(ignore)) writeFileSync(ignorePath(to), readFileSync(ignore));
      else rmSync(ignorePath(to), { force: true });
    }
    // Each capture keeps the commit it was accepted at, and the platform's commit is the oldest of them (baselineMeta.ts).
    const acceptedAt = now().toISOString();
    const inBaseline = listPngs(baselineDir);
    for (const platform of new Set(keys.map((k) => k.split('/')[0]))) {
      const file = join(baselineDir, platform, 'meta.json');
      const mine = (k: string) => k.startsWith(`${platform}/`);
      writeJson(file, nextMeta(readJson<BaselineMeta>(file), keys.filter(mine), inBaseline.filter(mine), { commit: info.commit, run: info.id, acceptedAt, reason }));
    }
    appendAcceptLog({ at: now(), run: info.id, commit: info.commit, dirty: info.dirty, keys, only, reason }, logFile);
    done.push({ run: info.id, count: keys.length });
  }
  return done;
}
