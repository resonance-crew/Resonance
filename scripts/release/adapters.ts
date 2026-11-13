/**
 * The thin edge between the release scripts and the world: git, `gh`, `vercel`, the deployed
 * Firestore ruleset and the files. Everything here only reads — no push, deploy, upload or
 * write to production data — and every call is one function a test replaces (`Facts` in
 * preflight.ts takes an object of this shape).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { BaselineMeta, CiRun, DeployedRules, ProductionDeployment, RunJson, SummaryJson } from './checks';

export const ROOT = resolve(__dirname, '../..');

function run(cmd: string, args: string[], opts: { cwd?: string; timeout?: number } = {}): string {
  return execFileSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opts.timeout ?? 60_000,
    maxBuffer: 64 * 1024 * 1024,
  });
}

export const git = (...args: string[]) => run('git', args).trimEnd();

/** The checkout every lane shares (worktrees' common dir): where visual/ and .vercel live. */
export function mainCheckout(): string {
  try {
    return dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir'));
  } catch {
    return ROOT;
  }
}

export function readText(path: string): string | null {
  const file = path.startsWith('/') ? path : join(ROOT, path);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function readJsonFile<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export const adapters = {
  head: () => git('rev-parse', 'HEAD'),
  porcelain: () => git('status', '--porcelain').split('\n').filter(Boolean),
  isAncestor(ancestor: string, of: string): boolean | null {
    try {
      git('cat-file', '-e', `${ancestor}^{commit}`);
    } catch {
      return null;
    }
    try {
      git('merge-base', '--is-ancestor', ancestor, of);
      return true;
    } catch {
      return false;
    }
  },
  changedBetween: (from: string, to: string) => git('diff', '--name-only', from, to).split('\n').filter(Boolean),
  /** When docs/visual-accept-log.md first came into the history (ISO), or null. */
  acceptLogSince(): string | null {
    try {
      const dates = git('log', '--diff-filter=A', '--format=%cI', '--', 'docs/visual-accept-log.md').split('\n').filter(Boolean);
      return dates.length ? new Date(dates[dates.length - 1]).toISOString() : null;
    } catch {
      return null;
    }
  },

  /** CI runs on that commit (`gh run list --commit`). Throws when gh can't answer. */
  ciRuns(sha: string, workflow = 'CI'): CiRun[] {
    const out = run('gh', ['run', 'list', '--commit', sha, '--workflow', workflow, '--json', 'status,conclusion,url,headSha']);
    return JSON.parse(out) as CiRun[];
  },
  /** The latest CI runs on a branch, newest first. */
  branchRuns(branch: string, limit = 3, workflow = 'CI'): (CiRun & { createdAt: string; displayTitle?: string })[] {
    const out = run('gh', ['run', 'list', '--branch', branch, '--workflow', workflow, '--limit', String(limit), '--json', 'status,conclusion,url,headSha,createdAt,displayTitle']);
    return JSON.parse(out);
  },

  /** The directory the Vercel CLI finds the project link in (.vercel/ is git-ignored, so a lane has none). */
  vercelCwd(): string {
    return existsSync(join(ROOT, '.vercel')) ? ROOT : mainCheckout();
  },
  /** The newest production deployment (`vercel ls --prod --format json`). Throws when the CLI can't answer. */
  latestProduction(project = 'resonance'): ProductionDeployment | null {
    const out = run('vercel', ['ls', project, '--prod', '--format', 'json', '--cwd', adapters.vercelCwd()], { timeout: 90_000 });
    const list = (JSON.parse(out) as { deployments?: { url: string; state: string; createdAt: number; meta?: { githubCommitSha?: string } }[] }).deployments ?? [];
    const d = list.sort((a, b) => b.createdAt - a.createdAt)[0];
    return d ? { url: d.url, state: d.state, sha: d.meta?.githubCommitSha ?? null, createdAt: d.createdAt } : null;
  },
  /** Production request logs at error level since `since` (`vercel logs --json`), one object per line. */
  productionErrors(since = '24h', limit = 200): Record<string, unknown>[] {
    const out = run(
      'vercel',
      ['logs', '--environment', 'production', '--level', 'error', '--since', since, '--limit', String(limit), '--json', '--cwd', adapters.vercelCwd()],
      { timeout: 90_000 },
    );
    return out
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  },

  /**
   * The Firestore ruleset production serves, read with the Admin SDK's Security Rules API (a GET;
   * credentials from .env, as the moderation script's). Never throws: an error says why it couldn't.
   */
  async deployedRules(): Promise<DeployedRules> {
    try {
      await import('dotenv/config');
      const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: key } = process.env;
      if (!projectId || !clientEmail || !key) return { error: 'no Firebase service account in .env' };
      const { initializeApp, cert, getApps } = await import('firebase-admin/app');
      const { getSecurityRules } = await import('firebase-admin/security-rules');
      const app = getApps().find((a) => a.name === 'release-preflight') ??
        initializeApp({ projectId, credential: cert({ projectId, clientEmail, privateKey: key.replace(/\\n/g, '\n') }) }, 'release-preflight');
      const ruleset = await getSecurityRules(app).getFirestoreRuleset();
      return { source: ruleset.source.map((s) => s.content).join('\n'), name: ruleset.name, createTime: ruleset.createTime };
    } catch (e) {
      return { error: ((e as Error).message || String(e)).split('\n')[0].slice(0, 160) };
    }
  },

  /** The visual harness's folder on this machine: --visual-dir, this checkout's, else the shared checkout's. */
  visualDir(explicit?: string): string {
    if (explicit) return resolve(explicit);
    const here = join(ROOT, 'visual');
    return existsSync(here) ? here : join(mainCheckout(), 'visual');
  },
  /** Every run's run.json with its summary.json (null when it has none). */
  visualRuns(visualDir: string): { run: RunJson; summary: SummaryJson | null }[] {
    const runsDir = join(visualDir, 'runs');
    if (!existsSync(runsDir)) return [];
    return readdirSync(runsDir)
      .map((id) => ({ run: readJsonFile<RunJson>(join(runsDir, id, 'run.json')), summary: readJsonFile<SummaryJson>(join(runsDir, id, 'summary.json')) }))
      .filter((r): r is { run: RunJson; summary: SummaryJson | null } => r.run !== null);
  },
  baselineMetas(visualDir: string): BaselineMeta[] {
    const base = join(visualDir, 'baseline');
    if (!existsSync(base)) return [];
    return ['web', 'ios', 'mac', 'android'].flatMap((platform) => {
      const m = readJsonFile<Omit<BaselineMeta, 'platform'>>(join(base, platform, 'meta.json'));
      return m ? [{ platform, ...m }] : [];
    });
  },
};

export type Adapters = typeof adapters;
