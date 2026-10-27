import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// vercel.json's ignoreCommand skips a deployment whose changes since the last
// one touch only apps/ or docs/ (not docs/legal). Skipping wrongly would leave
// a web change undeployed with nothing failing, so the script is run here
// against a scratch repository, the way Vercel runs it: in the checkout, with
// VERCEL_GIT_PREVIOUS_SHA set to the last successful deployment's commit.

const ROOT = join(__dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/vercel/ignore-build.sh');
const SKIP = 0;
const BUILD = 1;

let repo: string;
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: repo,
    encoding: 'utf8',
  }).trim();
const commit = (files: Record<string, string>) => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  git('add', '-A');
  git('commit', '-q', '-m', Object.keys(files).join(' '));
  return git('rev-parse', 'HEAD');
};
const run = (previous: string | undefined) =>
  spawnSync('sh', [SCRIPT], {
    cwd: repo,
    env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previous ?? '' },
  }).status;

let deployed: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'ignore-build-'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  deployed = commit({
    'src/page.tsx': 'page',
    'apps/ios/App.swift': 'app',
    'docs/TODO.md': 'todo',
    'docs/legal/privacy.zh-TW.md': 'privacy',
  });
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('the Ignored Build Step (scripts/vercel/ignore-build.sh)', () => {
  it('is what vercel.json runs', () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as { ignoreCommand?: string };
    expect(vercel.ignoreCommand).toBe('sh scripts/vercel/ignore-build.sh');
  });

  it('skips a deployment whose changes are only in apps/ or docs/', () => {
    commit({ 'apps/ios/App.swift': 'app 2' });
    commit({ 'docs/TODO.md': 'todo 2', 'apps/android/Main.kt': 'new' });
    expect(run(deployed)).toBe(SKIP);
  });

  it('builds for any change outside them, docs/legal included', () => {
    commit({ 'src/page.tsx': 'page 2' });
    expect(run(deployed)).toBe(BUILD);

    const next = git('rev-parse', 'HEAD');
    commit({ 'docs/legal/privacy.zh-TW.md': 'privacy 2' });
    expect(run(next)).toBe(BUILD);

    const again = git('rev-parse', 'HEAD');
    commit({ 'README.md': 'readme' });
    expect(run(again)).toBe(BUILD);
  });

  it('builds a push whose last commit is app-only but an earlier one changed the site', () => {
    commit({ 'src/page.tsx': 'page 2' });
    commit({ 'apps/ios/App.swift': 'app 2' });
    expect(run(deployed)).toBe(BUILD);
  });

  it('builds whenever it cannot tell: first deployment, a redeploy, a commit the clone lacks', () => {
    commit({ 'apps/ios/App.swift': 'app 2' });
    expect(run(undefined)).toBe(BUILD);
    expect(run(git('rev-parse', 'HEAD'))).toBe(BUILD);
    expect(run('0123456789abcdef0123456789abcdef01234567')).toBe(BUILD);
  });

  it('matches what the site reads from docs/ and apps/: only docs/legal', () => {
    const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8');
    const shipped = [...config.matchAll(/['"]\.\/(docs|apps)\/([^'"]*)['"]/g)].map((m) => `${m[1]}/${m[2]}`);
    expect(shipped.length).toBeGreaterThan(0);
    for (const path of shipped) expect(path, path).toMatch(/^docs\/legal\//);
  });
});
