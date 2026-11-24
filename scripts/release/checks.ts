/**
 * What preflight.ts judges, as pure functions over facts the adapters gathered (adapters.ts), so
 * each rule is tested with fixtures and no command runs in a test. A check is PASS, FAIL (stops
 * the release: exit code 1) or WARN (said, never failing — a reminder or something only a person
 * can confirm). Each result names what it looked at and, when it isn't a PASS, what to do.
 */
import { readVersions, type Versions } from './versions';

export type Status = 'PASS' | 'FAIL' | 'WARN';
export type CheckResult = { id: string; status: Status; detail: string; fix?: string };

const pass = (id: string, detail: string): CheckResult => ({ id, status: 'PASS', detail });
const fail = (id: string, detail: string, fix?: string): CheckResult => ({ id, status: 'FAIL', detail, fix });
const warn = (id: string, detail: string, fix?: string): CheckResult => ({ id, status: 'WARN', detail, fix });
const short = (sha: string) => sha.slice(0, 8);

// --- CI -------------------------------------------------------------------------------------

export type CiRun = { status: string; conclusion: string | null; url: string; headSha?: string };

/** Green is a completed, successful run of the CI workflow on that very commit. None is not green. */
export function checkCi(head: string, runs: CiRun[]): CheckResult {
  const id = 'ci';
  if (!runs.length) {
    return fail(id, `no CI run on ${short(head)} (not pushed yet, or CI hasn't started)`, 'push only on the owner\'s word, then `gh run watch <id> --exit-status`');
  }
  const done = runs.filter((r) => r.status === 'completed');
  const green = done.find((r) => r.conclusion === 'success');
  if (green) return pass(id, `CI green on ${short(head)} (${green.url})`);
  const running = runs.find((r) => r.status !== 'completed');
  if (running) return fail(id, `CI still running on ${short(head)} (${running.url})`, `gh run watch ${running.url.split('/').pop()} --exit-status`);
  return fail(id, `CI ${done[0].conclusion} on ${short(head)} (${done[0].url})`, 'fix it and push the fix before anything ships');
}

// --- Working tree ---------------------------------------------------------------------------

/** `git status --porcelain` lines. Tracked changes fail (a build comes from the commit); untracked files only warn. */
export function checkTree(porcelain: string[]): CheckResult {
  const id = 'tree';
  const lines = porcelain.filter(Boolean);
  const tracked = lines.filter((l) => !l.startsWith('??'));
  if (tracked.length) {
    return fail(id, `${tracked.length} tracked file(s) changed: ${tracked.slice(0, 5).map((l) => l.slice(3)).join(', ')}${tracked.length > 5 ? ', …' : ''}`, 'commit or stash them: the release is the commit, not this tree');
  }
  if (lines.length) return warn(id, `clean, but ${lines.length} untracked file(s) (left out of a git archive export)`);
  return pass(id, 'working tree clean');
}

// --- Versions -------------------------------------------------------------------------------

/** iOS/Mac and Android carry the same marketing version, each file setting it once. */
export function checkVersions(projectYml: string, gradle: string): { result: CheckResult; versions: Versions | null } {
  const id = 'versions';
  let v: Versions;
  try {
    v = readVersions(projectYml, gradle);
  } catch (e) {
    return { result: fail(id, (e as Error).message), versions: null };
  }
  const line = `iOS + Mac ${v.ios.marketing} (${v.ios.build}), Android ${v.android.name} (versionCode ${v.android.code})`;
  if (v.ios.marketing !== v.android.name) {
    return { result: fail(id, line, 'npx tsx scripts/release/bump-version.ts <version> --write (after making the two agree by hand)'), versions: v };
  }
  return { result: pass(id, line), versions: v };
}

// --- Web deployment -------------------------------------------------------------------------

/**
 * Paths whose change makes Vercel build (scripts/vercel/ignore-build.sh): everything but `apps/`
 * and `docs/`, and `docs/legal` again. A path outside them can't make the live site older.
 */
export function shipsWeb(path: string): boolean {
  if (path.startsWith('docs/legal/')) return true;
  return !(path.startsWith('apps/') || path.startsWith('docs/'));
}

/** The `applinks:` hosts an entitlements plist claims. */
export function associatedDomains(plist: string): string[] {
  const key = /<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist);
  if (!key) return [];
  return [...key[1].matchAll(/<string>\s*(applinks:[^<\s]+)\s*<\/string>/g)].map((m) => m[1]);
}

export type ProductionDeployment ={ url: string; state: string; sha: string | null; createdAt: number };

/**
 * Before an iOS / Mac build whose entitlements claim associated domains, the site must already
 * serve that commit's web: Apple's CDN refreshes apple-app-site-association within a day and
 * can't be flushed. The latest production deployment passes when it is READY and either is HEAD
 * or is an ancestor of HEAD with only app/docs changes since — the commits Vercel skips building.
 */
export function checkWeb(args: {
  head: string;
  associatedDomains: string[];
  deployment: ProductionDeployment | null;
  /** Whether the deployment's commit is an ancestor of HEAD (null: unknown to this clone). */
  isAncestor: boolean | null;
  /** Files changed between the deployment's commit and HEAD. */
  changedSince: string[];
}): CheckResult {
  const id = 'web';
  const { head, associatedDomains, deployment, isAncestor, changedSince } = args;
  if (!associatedDomains.length) return pass(id, 'the apps claim no associated domains: no web needed first');
  const claim = associatedDomains.join(', ');
  if (!deployment) return fail(id, `no production deployment found (the builds claim ${claim})`, 'vercel ls resonance --prod');
  const at = `${deployment.url} (${deployment.sha ? short(deployment.sha) : 'no commit'}, ${deployment.state})`;
  if (deployment.state !== 'READY') return fail(id, `latest production deployment is not Ready: ${at}`, `vercel inspect ${deployment.url} --wait --timeout 10m`);
  if (!deployment.sha) return fail(id, `production deployment ${deployment.url} names no commit (a CLI deploy?)`, 'push main (the owner\'s word), or check it carries HEAD by hand');
  if (deployment.sha === head) return pass(id, `production is HEAD: ${at}`);
  if (isAncestor === false || isAncestor === null) {
    return fail(id, `production ${at} is not an ancestor of HEAD ${short(head)}`, 'pull, or push main on the owner\'s word, and wait for Ready');
  }
  const web = changedSince.filter(shipsWeb);
  if (!web.length) return pass(id, `production ${at} holds HEAD's web: only apps/ or docs/ changed since`);
  return fail(id, `production ${at} predates ${web.length} web change(s) in ${short(head)}: ${web.slice(0, 4).join(', ')}${web.length > 4 ? ', …' : ''}`, 'push main on the owner\'s word, wait for Ready (vercel inspect <url> --wait), then build');
}

// --- Firestore rules ------------------------------------------------------------------------

/** Rules text compared without comments' and whitespace's differences. */
export function normalizeRules(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type DeployedRules = { source: string; name?: string; createTime?: string } | { error: string };

export function checkRules(local: string, deployed: DeployedRules): CheckResult {
  const id = 'rules';
  if ('error' in deployed) {
    return warn(id, `couldn't read the deployed Firestore rules (${deployed.error}): check by hand`, 'Firebase console → Firestore → Rules: the published ruleset matches firebase/firestore.rules; if not, cd firebase && firebase deploy --only firestore:rules,firestore:indexes (the owner\'s go)');
  }
  const when = deployed.createTime ? ` (released ${deployed.createTime})` : '';
  if (normalizeRules(local) === normalizeRules(deployed.source)) return pass(id, `deployed Firestore rules match firebase/firestore.rules${when}`);
  return fail(id, `deployed Firestore rules differ from firebase/firestore.rules${when}`, 'cd firebase && firebase deploy --only firestore:rules,firestore:indexes — on the owner\'s go, before the web that needs them');
}

// --- Owed -----------------------------------------------------------------------------------

export type OwedItem = { line: number; text: string };

/** The open items of docs/release/owed.md: `- [ ] …` lines (a `- [x]` is done). */
export function openOwed(markdown: string): OwedItem[] {
  return markdown
    .split('\n')
    .map((text, i) => ({ line: i + 1, text: text.trim() }))
    .filter((l) => /^[-*] \[ \]/.test(l.text))
    .map((l) => ({ line: l.line, text: l.text.replace(/^[-*] \[ \]\s*/, '') }));
}

export function checkOwed(markdown: string | null): CheckResult {
  const id = 'owed';
  if (markdown === null) return fail(id, 'docs/release/owed.md is missing', 'restore it: it is where owed rule deploys and backfills are written down');
  const open = openOwed(markdown);
  if (!open.length) return pass(id, 'nothing owed (docs/release/owed.md)');
  return fail(id, `${open.length} owed: ${open.map((o) => `${o.text} (line ${o.line})`).join('; ')}`, 'do each (the owner\'s go) or name it to the owner, then tick it in docs/release/owed.md');
}

// --- Visual run -----------------------------------------------------------------------------

export const ALL_PLATFORMS = ['web', 'ios', 'mac', 'android'] as const;

export type RunJson = {
  id: string;
  commit: string;
  dirty: boolean;
  startedAt: string;
  platforms: string[];
  only: string[];
  devices: string[];
  flowsFailed?: string[];
};

export type SummaryJson = { run: string; pass: boolean; counts?: Record<string, number>; problems?: { kind: string; key: string }[] };

/** A release run: every platform, every screen and device, the Maestro flows too (`capture --flows --review`). */
export function isFullRun(run: RunJson): boolean {
  return (
    ALL_PLATFORMS.every((p) => run.platforms.includes(p)) &&
    run.only.length === 0 &&
    run.devices.length === 0 &&
    Array.isArray(run.flowsFailed) &&
    /^[0-9a-f]{40}$/.test(run.commit)
  );
}

/** The latest full run, by start time. */
export function latestFullRun(runs: RunJson[]): RunJson | null {
  const full = runs.filter(isFullRun).sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  return full[0] ?? null;
}

/** Changes after a run that leave its pictures standing: docs and the version bump. */
export function leavesRunStanding(path: string): boolean {
  return path.startsWith('docs/') || path === 'apps/ios/project.yml' || path === 'apps/android/app/build.gradle.kts';
}

export function checkVisual(args: {
  head: string;
  run: RunJson | null;
  summary: SummaryJson | null;
  /** Files changed between the run's commit and HEAD (null: the run's commit isn't an ancestor). */
  changedSince: string[] | null;
}): CheckResult {
  const id = 'visual';
  const { head, run, summary, changedSince } = args;
  const how = 'npm run visual -- capture --flows --review (36–50 min, on the owner\'s Mac, never while they use a simulator)';
  if (!run) return fail(id, 'no full visual run found (every platform, screen and device, with --flows)', how);
  if (!summary) return fail(id, `run ${run.id} has no summary.json (taken before runs had a verdict, or it was cut short)`, how);
  if (!summary.pass) {
    const kinds = [...new Set((summary.problems ?? []).map((p) => p.kind))].join(', ');
    return fail(id, `run ${run.id} is a FAIL${kinds ? ` (${kinds})` : ''}`, `fix it, then ${how}`);
  }
  if (run.commit !== head) {
    if (changedSince === null) return fail(id, `run ${run.id} was taken at ${short(run.commit)}, not an ancestor of HEAD ${short(head)}`, how);
    const moved = changedSince.filter((p) => !leavesRunStanding(p));
    if (moved.length) return fail(id, `run ${run.id} was taken at ${short(run.commit)}; ${moved.length} file(s) changed since: ${moved.slice(0, 4).join(', ')}${moved.length > 4 ? ', …' : ''}`, how);
  }
  const where = run.commit === head ? 'at HEAD' : `at ${short(run.commit)} (only docs or versions changed since)`;
  if (run.dirty) return warn(id, `run ${run.id} PASS ${where}, but taken from a tree with uncommitted changes`, 'confirm the change wasn\'t in what the screens show, or run it again from a clean export');
  return pass(id, `run ${run.id} PASS ${where}`);
}

// --- Accept log vs baseline meta -------------------------------------------------------------

export type BaselineMeta = {
  platform: string;
  commit: string;
  run: string;
  acceptedAt: string;
  reason?: string;
  /**
   * Each picture's own provenance (scripts/visual/baselineMeta): `commit` above is the OLDEST of them (where the review
   * starts reading trailers), so after an accept that moved only some pictures it is an older accept's commit, while
   * `run` is the latest's. The latest run's own commit is read from these.
   */
  captures?: Record<string, { commit: string; run: string; acceptedAt?: string }>;
};
export type AcceptRow = { acceptedAt: string; run: string; commit: string; platforms: string[]; only: string; captures: string; reason: string };

/** The rows of docs/visual-accept-log.md's table (the header and its rule left out). */
export function parseAcceptLog(markdown: string): AcceptRow[] {
  const rows: AcceptRow[] = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .slice(1, line.trimEnd().endsWith('|') ? line.trimEnd().length - 1 : undefined)
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, '|'));
    if (cells.length < 7 || cells[0] === 'Accepted (UTC)' || /^-+$/.test(cells[0])) continue;
    rows.push({
      acceptedAt: cells[0],
      run: cells[1],
      commit: cells[2].replace(/\s*\(dirty\)$/, ''),
      platforms: cells[3].split(',').map((p) => p.trim()).filter(Boolean),
      only: cells[4],
      captures: cells[5],
      reason: cells[6],
    });
  }
  return rows;
}

/**
 * Every platform's baseline (visual/baseline/<platform>/meta.json) was made by an accept the log
 * records: a row for the same run, naming that platform, at the same commit. A baseline accepted
 * before the log existed (`logSince`) can't have a row: said, not failed.
 */
export function checkAcceptLog(metas: BaselineMeta[], rows: AcceptRow[], logSince: string | null): CheckResult {
  const id = 'accept-log';
  if (!metas.length) return warn(id, 'no baseline meta.json found on this machine (visual/ is git-ignored)', 'run preflight in the checkout that holds visual/, or pass --visual-dir');
  const missing: string[] = [];
  const before: string[] = [];
  for (const m of metas) {
    // The row of the latest accept: its run, and the commit that run's pictures were taken at (meta's own `commit` is
    // the oldest picture's — another accept's — once an accept moved only some of them, 2026-11-25).
    const runCommits = new Set([m.commit, ...Object.values(m.captures ?? {}).filter((p) => p.run === m.run).map((p) => p.commit)]);
    const row = rows.find((r) => r.run === m.run && r.platforms.includes(m.platform) && [...runCommits].some((c) => c.startsWith(r.commit)));
    if (row) continue;
    if (logSince && m.acceptedAt < logSince) before.push(`${m.platform} (${m.run}, ${m.acceptedAt.slice(0, 10)})`);
    else missing.push(`${m.platform} (${m.run})`);
  }
  if (missing.length) {
    return fail(id, `baseline with no row in docs/visual-accept-log.md: ${missing.join(', ')}`, 'a baseline changes only by `npm run visual -- accept … --reason`, which writes the row: find out who accepted it, and commit the row or accept again on the owner\'s word');
  }
  if (before.length) return warn(id, `baselines accepted before the log existed, so no row: ${before.join(', ')}`);
  return pass(id, `${metas.length} baseline(s), each with its row in docs/visual-accept-log.md`);
}

// --- Summary --------------------------------------------------------------------------------

export function summarize(results: CheckResult[]): { line: string; exitCode: number } {
  const n = (s: Status) => results.filter((r) => r.status === s).length;
  const failed = results.filter((r) => r.status === 'FAIL').map((r) => r.id);
  const ok = failed.length === 0;
  const line = `Preflight ${ok ? 'PASS' : 'FAIL'}: ${n('PASS')} pass, ${n('FAIL')} fail, ${n('WARN')} warn${failed.length ? ` — ${failed.join(', ')}` : ''}`;
  return { line, exitCode: ok ? 0 : 1 };
}

export function formatResult(r: CheckResult): string[] {
  const lines = [`${r.status.padEnd(4)} ${r.id.padEnd(10)} ${r.detail}`];
  if (r.fix && r.status !== 'PASS') lines.push(`     ${''.padEnd(10)} → ${r.fix}`);
  return lines;
}
