import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// scripts/lane.sh, run for real in a throwaway repository laid out like the house's:
// <tmp>/Resonance (the main checkout) with the git-ignored files a lane needs.
const LANE = resolve(__dirname, '..', 'lane.sh');

let root: string;
let main: string;

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function lane(cwd: string, ...args: string[]) {
  const r = spawnSync('bash', [LANE, ...args], { cwd, encoding: 'utf8' });
  const vars: Record<string, string> = {};
  for (const line of r.stdout.split('\n')) {
    const m = /^([A-Z_]+)='(.*)'$/.exec(line);
    if (m) vars[m[1]] = m[2];
  }
  return { code: r.status, vars, stdout: r.stdout, stderr: r.stderr };
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'lane-test-')));
  main = join(root, 'Resonance');
  mkdirSync(main);
  git(main, 'init', '-q', '-b', 'main');
  git(main, 'config', 'user.email', 'test@example.com');
  git(main, 'config', 'user.name', 'Test');
  git(main, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(main, '.gitignore'), 'node_modules\n.env\n.env.local\napps/android/local.properties\nnative/editor/dist\n/visual/\n');
  writeFileSync(join(main, '.env.example'), 'TRACKED=1\n');
  writeFileSync(join(main, 'README.md'), 'hello\n');
  git(main, 'add', '.');
  git(main, 'commit', '-q', '-m', 'init');
  // What a real main checkout has beside its tracked files.
  mkdirSync(join(main, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(main, '.env'), 'SECRET=main\n');
  writeFileSync(join(main, '.env.local'), 'LOCAL=1\n');
  mkdirSync(join(main, 'apps', 'android'), { recursive: true });
  writeFileSync(join(main, 'apps', 'android', 'local.properties'), 'sdk.dir=/sdk\n');
  mkdirSync(join(main, 'native', 'editor', 'dist'), { recursive: true });
  writeFileSync(join(main, 'native', 'editor', 'dist', 'editor.html'), '<html></html>\n');
  mkdirSync(join(main, 'visual', 'baseline'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('scripts/lane.sh', () => {
  it('makes the sibling worktree on its branch, set up, with ports from the round and lane', () => {
    const r = lane(main, '25', 'web');
    expect(r.code, r.stderr).toBe(0);
    const wt = join(root, 'Resonance-r25-web');
    expect(r.vars).toMatchObject({
      LANE_ROUND: '25',
      LANE: 'web',
      LANE_BRANCH: 'r25/web',
      LANE_BASE: 'main',
      LANE_WORKTREE: wt,
      LANE_MAIN: main,
      LANE_STATE: 'created',
      // slot = (25 % 16) * 6 + 0 = 54
      LANE_AUTH_PORT: '9454',
      LANE_FIRESTORE_PORT: '8454',
      LANE_DEV_PORT: '3454',
      LANE_VISUAL_ENV: 'VISUAL_AUTH_PORT=9454 VISUAL_FIRESTORE_PORT=8454 VISUAL_DEV_PORT=3454',
    });
    expect(git(wt, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('r25/web');
    expect(lstatSync(join(wt, 'node_modules')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(wt, 'node_modules'))).toBe('../Resonance/node_modules');
    expect(readFileSync(join(wt, '.env'), 'utf8')).toBe('SECRET=main\n');
    expect(readFileSync(join(wt, '.env.local'), 'utf8')).toBe('LOCAL=1\n');
    expect(readFileSync(join(wt, 'apps/android/local.properties'), 'utf8')).toBe('sdk.dir=/sdk\n');
    expect(existsSync(join(wt, 'native/editor/dist/editor.html'))).toBe(true);
    expect(readlinkSync(join(wt, 'visual'))).toBe('../Resonance/visual');
    expect(existsSync(join(wt, 'visual', 'baseline'))).toBe(true);
    // Nothing the setup made shows as a change in the lane (the test repo ignores `/visual/`, as the house's does).
    expect(git(wt, 'status', '--porcelain')).toBe('');
    // The main checkout is untouched: same branch, nothing staged or changed.
    expect(git(main, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    expect(git(main, 'status', '--porcelain')).toBe('');
  });

  it('is idempotent: a second run finds the worktree and keeps its own files', () => {
    expect(lane(main, 'r25', 'ios').code).toBe(0);
    const wt = join(root, 'Resonance-r25-ios');
    writeFileSync(join(wt, '.env'), 'SECRET=lane-edited\n');
    const again = lane(main, 'round25', 'ios');
    expect(again.code, again.stderr).toBe(0);
    expect(again.vars.LANE_STATE).toBe('existing');
    expect(again.vars.LANE_AUTH_PORT).toBe('9455');
    expect(again.vars.LANE_SIMULATOR).toBe('r25 ios iPhone 17 Pro');
    expect(readFileSync(join(wt, '.env'), 'utf8')).toBe('SECRET=lane-edited\n');
  });

  it('works from inside another worktree and starts lanes from the round base once it exists', () => {
    const base = lane(main, '25', 'base');
    expect(base.code, base.stderr).toBe(0);
    expect(base.vars.LANE_WORKTREE).toBe(join(root, 'Resonance-r25'));
    expect(base.vars.LANE_BRANCH).toBe('r25/base');
    const fromBase = lane(base.vars.LANE_WORKTREE, '25', 'android');
    expect(fromBase.code, fromBase.stderr).toBe(0);
    expect(fromBase.vars.LANE_BASE).toBe('r25/base');
    expect(fromBase.vars.LANE_MAIN).toBe(main);
    expect(fromBase.vars.LANE_AVD_PORT).toBe(String(5620 + 2 * 9));
  });

  it('gives every lane of a round its own ports', () => {
    const ports = ['web', 'ios', 'android', 'server', 'mac', 'base'].map((l) => lane(main, '7', l).vars.LANE_AUTH_PORT);
    expect(new Set(ports).size).toBe(6);
  });

  it('refuses what it should', () => {
    expect(lane(main, '25', 'desktop').code).toBe(2);
    expect(lane(main, 'abc', 'web').code).toBe(2);
    expect(lane(main, '25').code).toBe(2);
    expect(lane(main, '25', 'web', 'no-such-branch').code).toBe(2);
    // A directory in the lane's place that is not its worktree is left alone.
    mkdirSync(join(root, 'Resonance-r26-web'));
    const r = lane(main, '26', 'web');
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/not a worktree/);
    // A lane branch checked out in the main checkout would mean working there.
    git(main, 'checkout', '-q', '-b', 'r27/web');
    const inMain = lane(main, '27', 'web');
    expect(inMain.code).toBe(2);
    expect(inMain.stderr).toMatch(/main checkout/);
  });
});
