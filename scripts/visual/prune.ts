/**
 * `npm run visual -- prune [--keep N] [--dry-run]`: old runs out of `visual/runs/` (a full run is some 700 MB; 73 runs
 * were 2.9 GB on 2026-11-23, nothing ever removed). A run stays when any of these holds:
 *
 * - it is one of the newest `--keep` (default 20);
 * - a baseline names it — main's `visual/baseline/` or any branch's `visual/baselines/*`: each picture's provenance
 *   (`meta.json`), so `promote` and the trailer ranges keep working;
 * - an accept log names it (`docs/visual-accept-log.md` in this checkout and in every worktree of the repository);
 * - `visual/latest` names it;
 * - it may still be running: started less than 6 hours ago (the watchdog ends a run at 5, `VISUAL_RUN_TIMEOUT_MIN`),
 *   or its `run.json` can't be read;
 * - its folder isn't a run's name (`YYYYMMDD-HHMMSS`): nothing else in `visual/runs/` is ever touched.
 *
 * `--dry-run` says what would go and what it frees, and removes nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, RUNS_DIR, VISUAL_DIR, readJson } from './util';

export const RUN_ID = /^\d{8}-\d{6}$/;
const MENTION = /\b\d{8}-\d{6}\b/g;
/** How recent a run's start keeps it as perhaps still running. */
export const RUNNING_MS = 6 * 3600_000;
export const DEFAULT_KEEP = 20;

/** Every run id written in these files (missing ones skipped). */
export function mentionedIn(files: readonly string[]): Set<string> {
  const ids = new Set<string>();
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(MENTION)) ids.add(m[0]);
  }
  return ids;
}

/** Every baseline's `meta.json` (main's and each branch's, every platform) and `branch.json`. */
export function baselineFiles(visualDir = VISUAL_DIR): string[] {
  const out: string[] = [];
  const platformsOf = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const meta = join(dir, name, 'meta.json');
      if (existsSync(meta)) out.push(meta);
    }
    if (existsSync(join(dir, 'branch.json'))) out.push(join(dir, 'branch.json'));
  };
  platformsOf(join(visualDir, 'baseline'));
  const branches = join(visualDir, 'baselines');
  if (existsSync(branches)) for (const name of readdirSync(branches)) platformsOf(join(branches, name));
  return out;
}

/** The accept log of this checkout and of every worktree of the repository (each branch keeps its own rows). */
export function acceptLogs(root = ROOT): string[] {
  const roots = new Set([root]);
  try {
    const listed = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
    for (const line of listed.split('\n')) if (line.startsWith('worktree ')) roots.add(line.slice('worktree '.length));
  } catch {
    // not a repository: this checkout's alone
  }
  return [...roots].map((r) => join(r, 'docs/visual-accept-log.md'));
}

export type RunEntry = { id: string; startedAt: number | null };
export type PrunePlan = { keep: { id: string; why: string }[]; remove: string[] };

/** Which runs go and which stay (and why), from the runs, what names them and the time. */
export function planPrune(runs: readonly RunEntry[], { keep = DEFAULT_KEEP, named, latest, now = Date.now() }: { keep?: number; named: ReadonlySet<string>; latest: string | null; now?: number }): PrunePlan {
  const newest = new Set([...runs].map((r) => r.id).sort().reverse().slice(0, keep));
  const plan: PrunePlan = { keep: [], remove: [] };
  for (const run of [...runs].sort((a, b) => a.id.localeCompare(b.id))) {
    const why =
      newest.has(run.id) ? `one of the newest ${keep}`
      : run.id === latest ? 'visual/latest'
      : named.has(run.id) ? 'named by a baseline or an accept log'
      : run.startedAt == null ? 'its run.json unread: maybe running'
      : now - run.startedAt < RUNNING_MS ? 'started under 6 h ago: maybe running'
      : null;
    if (why) plan.keep.push({ id: run.id, why });
    else plan.remove.push(run.id);
  }
  return plan;
}

/** The runs in `visual/runs/`: only folders named as runs are, with their start (run.json). */
export function listRuns(runsDir = RUNS_DIR): RunEntry[] {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir)
    .filter((name) => RUN_ID.test(name) && statSync(join(runsDir, name)).isDirectory())
    .map((id) => {
      const started = readJson<{ startedAt?: string }>(join(runsDir, id, 'run.json'))?.startedAt;
      const at = started ? Date.parse(started) : NaN;
      return { id, startedAt: Number.isFinite(at) ? at : null };
    });
}

/** What the folders take on disk, in KB (`du -sk`; 0 for none). */
function sizeKb(dirs: string[]): number {
  if (!dirs.length) return 0;
  try {
    return execFileSync('du', ['-sk', ...dirs], { encoding: 'utf8', maxBuffer: 16 << 20 })
      .split('\n')
      .reduce((sum, line) => sum + (Number(line.split('\t')[0]) || 0), 0);
  } catch {
    return 0;
  }
}

/** The command: plans, says, and (unless `dryRun`) removes. Answers the plan. */
export function prune({ keep = DEFAULT_KEEP, dryRun = false, log, visualDir = VISUAL_DIR, root = ROOT, now = Date.now() }: { keep?: number; dryRun?: boolean; log: (line: string) => void; visualDir?: string; root?: string; now?: number }): PrunePlan {
  const runsDir = join(visualDir, 'runs');
  const runs = listRuns(runsDir);
  const named = mentionedIn([...baselineFiles(visualDir), ...acceptLogs(root)]);
  const latestFile = join(visualDir, 'latest');
  const latest = existsSync(latestFile) ? readFileSync(latestFile, 'utf8').trim() : null;
  const plan = planPrune(runs, { keep, named, latest, now });
  const gone = plan.remove.map((id) => join(runsDir, id));
  const kb = sizeKb(gone);
  for (const k of plan.keep.filter((k) => !k.why.startsWith('one of the newest'))) log(`  keeps ${k.id}: ${k.why}`);
  for (const id of plan.remove) log(`  ${dryRun ? 'would remove' : 'removes'} ${id}`);
  if (!dryRun) for (const dir of gone) rmSync(dir, { recursive: true, force: true });
  log(`${dryRun ? 'Would remove' : 'Removed'} ${plan.remove.length} of ${runs.length} runs (${(kb / 1048576).toFixed(1)} GB); kept ${plan.keep.length}${dryRun ? ' — nothing removed (--dry-run)' : ''}`);
  return plan;
}
