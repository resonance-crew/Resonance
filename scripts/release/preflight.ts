/**
 * Before a store release: is the commit ready to be built and sent? One PASS / FAIL / WARN line
 * per check, then one summary line (`Preflight PASS|FAIL: …`), exit code 1 on any FAIL, 2 when
 * preflight itself couldn't run. It only reads: git, `gh`, `vercel`, the deployed Firestore
 * ruleset, docs/release/owed.md and the visual harness's folder (visual/, this machine's).
 *
 *   npx tsx scripts/release/preflight.ts [--visual-dir <dir>] [--json]
 *   npm run release:preflight
 *
 * Checks, in the order a release meets them (docs/release-checklist.md):
 *   tree        no tracked change (untracked files only warn)
 *   ci          the CI workflow is green on HEAD — no run is not green
 *   versions    iOS/Mac MARKETING_VERSION = Android versionName, each set once
 *   web         the production deployment is HEAD, or an ancestor with only apps/docs changes
 *               since — when the iOS/Mac entitlements claim associated domains
 *   rules       the deployed Firestore rules match firebase/firestore.rules (a WARN with the way
 *               to check by hand when they can't be read)
 *   owed        no open `- [ ]` item in docs/release/owed.md
 *   visual      the latest full run (`capture --flows --review`) is a PASS at HEAD (or with only
 *               docs/versions changed since)
 *   accept-log  every platform's baseline meta.json has its row in docs/visual-accept-log.md
 */
import { adapters as realAdapters, readText, type Adapters } from './adapters';
import {
  associatedDomains,
  checkAcceptLog,
  checkCi,
  checkOwed,
  checkRules,
  checkTree,
  checkVersions,
  checkVisual,
  checkWeb,
  formatResult,
  latestFullRun,
  parseAcceptLog,
  summarize,
  type CheckResult,
} from './checks';
import { ANDROID_GRADLE, IOS_PROJECT } from './versions';

export const ENTITLEMENTS = ['apps/ios/Resonance/Resonance.entitlements', 'apps/ios/Resonance/Resonance-Mac.entitlements'];
export const OWED = 'docs/release/owed.md';
export const ACCEPT_LOG = 'docs/visual-accept-log.md';
export const RULES = 'firebase/firestore.rules';

type Read = (path: string) => string | null;
export type Options = { visualDir?: string };

/** A check whose command couldn't answer (gh offline, not logged in) fails, saying so. */
function guarded(id: string, f: () => CheckResult): CheckResult {
  try {
    return f();
  } catch (e) {
    const msg = ((e as { stderr?: string }).stderr || (e as Error).message || String(e)).toString().trim().split('\n')[0].slice(0, 200);
    return { id, status: 'FAIL', detail: `couldn't check: ${msg}`, fix: 'run it again once the command works (gh auth status / vercel whoami)' };
  }
}

export async function runPreflight(a: Adapters, read: Read, opts: Options = {}): Promise<CheckResult[]> {
  const head = a.head();
  const results: CheckResult[] = [];
  results.push(guarded('tree', () => checkTree(a.porcelain())));
  results.push(guarded('ci', () => checkCi(head, a.ciRuns(head))));
  results.push(checkVersions(read(IOS_PROJECT) ?? '', read(ANDROID_GRADLE) ?? '').result);
  results.push(
    guarded('web', () => {
      const domains = [...new Set(ENTITLEMENTS.flatMap((f) => associatedDomains(read(f) ?? '')))];
      const deployment = domains.length ? a.latestProduction() : null;
      const isAncestor = deployment?.sha && deployment.sha !== head ? a.isAncestor(deployment.sha, head) : null;
      const changedSince = deployment?.sha && isAncestor ? a.changedBetween(deployment.sha, head) : [];
      return checkWeb({ head, associatedDomains: domains, deployment, isAncestor, changedSince });
    }),
  );
  results.push(checkRules(read(RULES) ?? '', await a.deployedRules()));
  results.push(checkOwed(read(OWED)));
  results.push(
    guarded('visual', () => {
      const dir = a.visualDir(opts.visualDir);
      const runs = a.visualRuns(dir);
      const run = latestFullRun(runs.map((r) => r.run));
      const summary = run ? (runs.find((r) => r.run.id === run.id)?.summary ?? null) : null;
      const changedSince = run && run.commit !== head ? (a.isAncestor(run.commit, head) ? a.changedBetween(run.commit, head) : null) : [];
      return checkVisual({ head, run, summary, changedSince });
    }),
  );
  results.push(
    guarded('accept-log', () => {
      const dir = a.visualDir(opts.visualDir);
      return checkAcceptLog(a.baselineMetas(dir), parseAcceptLog(read(ACCEPT_LOG) ?? ''), a.acceptLogSince());
    }),
  );
  return results;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const head = realAdapters.head();
  console.log(`Release preflight at ${head.slice(0, 8)} (${realAdapters.porcelain().length ? 'tree has changes' : 'clean tree'})`);
  const results = await runPreflight(realAdapters, readText, { visualDir: flag(args, 'visual-dir') });
  const { line, exitCode } = summarize(results);
  if (args.includes('--json')) console.log(JSON.stringify({ head, results, line, exitCode }, null, 2));
  else for (const r of results) for (const l of formatResult(r)) console.log(l);
  console.log(line);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`Preflight could not run: ${(e as Error).message}`);
    process.exit(2);
  });
}
