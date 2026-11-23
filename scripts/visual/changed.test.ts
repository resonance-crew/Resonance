import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { androidInputs } from './android';
import { affects, changedFiles, changedPlan, planChanged, planLines, refusesChanged } from './changed';
import { xcodeInputs } from './ios';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const ALL = ['web', 'android', 'ios', 'mac'];

describe('what a changed path can move', () => {
  it('takes only the web for its own pages, styles and assets', () => {
    for (const path of ['src/components/molecules/StoryCard/StoryCard.tsx', 'src/app/[locale]/(app)/home/page.tsx', 'src/styles/tokens.css', 'src/i18n/routing.ts', 'public/og-cover.jpg', 'src/app/sitemap.ts']) {
      expect(affects(path).platforms, path).toEqual(['web']);
    }
  });

  it('takes one app for its own sources, both apps for what they share', () => {
    expect(affects('apps/android/app/src/main/kotlin/com/resonance/app/MainActivity.kt').platforms).toEqual(['android']);
    expect(affects('apps/ios/Resonance/Session/SessionStore.swift').platforms).toEqual(['ios', 'mac']);
    expect(affects('apps/ios/Packages/DesignSystem/Sources/DesignSystem/Resources/Tokens.json').platforms).toEqual(['android', 'ios', 'mac']);
    for (const path of ['apps/shared/tokens.json', 'native/editor/src/editor.ts', 'native/geometry/kotlin/Wob.kt']) expect(affects(path).platforms, path).toEqual(['android', 'ios', 'mac']);
  });

  it('takes every platform for the server, what all of them share, the harness, and anything it doesn’t know', () => {
    for (const path of [
      'src/app/api/v1/cards/[id]/route.ts', 'src/server/app/feed.ts', 'src/lib/cards/tapPassages.ts', 'src/messages/zh-TW.json', 'src/middleware.ts',
      'scripts/visual/android.ts', 'scripts/seed-emulator.ts', 'scripts/seed/pinned.ts', 'firebase/firestore.rules', 'public/stickers/twine/thanks.webp',
      // what this file doesn't know: every platform
      'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', '.env.example', 'openapi/v1/openapi.json', 'src/new-folder/thing.ts', 'scripts/ops/x.ts', 'vercel.json',
    ]) {
      expect(affects(path).platforms, path).toEqual(ALL);
    }
    expect(affects('package.json').why).toMatch(/to be safe/);
  });

  it('takes none for what no screen draws: docs, designs, tests, notes, the CI', () => {
    for (const path of ['docs/visual-accept-log.md', 'README.md', 'designs/DESIGN.md', 'test/setup.ts', 'src/lib/cards/tapPassages.test.ts', 'apps/ios/../../scripts/visual/changed.test.ts', '.github/workflows/ci.yml', '.claude/rules/apps.md', 'maestro/flows/tap.yaml']) {
      expect(affects(path).platforms, path).toEqual([]);
    }
  });

  it('takes each app for every input its build reads (android.ts, ios.ts), so --changed never skips a build that changed', () => {
    const android = androidInputs();
    for (const root of [...android.roots, ...(android.extras ?? [])]) expect(affects(`${root}/x`).platforms, root).toContain('android');
    const xcode = xcodeInputs([]);
    for (const root of [...xcode.roots, ...(xcode.extras ?? [])]) {
      const path = root.includes('.') ? root : `${root}/x`;
      expect(affects(path).platforms, root).toEqual(expect.arrayContaining(['ios', 'mac']));
    }
  });
});

/** A repository of a test's own, with a first commit. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'visual-changed-'));
  dirs.push(root);
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' }).trim();
  const write = (path: string, text = 'x') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git('init', '-q');
  write('.gitignore', 'ignored/\n');
  write('src/components/A.tsx', 'a');
  write('apps/android/Main.kt', 'k');
  write('apps/ios/App.swift', 's');
  write('docs/a.md', 'd');
  git('add', '.');
  git('commit', '-q', '-m', 'one');
  return { root, git, write, head: () => git('rev-parse', 'HEAD') };
}

describe('what changed since a commit', () => {
  it('counts commits since, staged and unstaged changes, untracked files and deletions — never what git ignores', () => {
    const r = repo();
    const base = r.head();
    r.write('apps/android/Main.kt', 'k2');
    r.git('commit', '-qam', 'two');
    r.write('src/components/A.tsx', 'staged');
    r.git('add', 'src/components/A.tsx');
    r.write('apps/ios/App.swift', 'unstaged');
    r.write('src/components/New.tsx', 'untracked');
    r.write('ignored/build.log', 'ignored');
    r.git('rm', '-q', 'docs/a.md');
    expect(changedFiles(base, r.root)).toEqual(['apps/android/Main.kt', 'apps/ios/App.swift', 'docs/a.md', 'src/components/A.tsx', 'src/components/New.tsx']);
  });

  it('plans each platform from its own baseline commit; one with none, or one git doesn’t know, is taken', () => {
    const r = repo();
    const first = r.head();
    r.write('src/components/A.tsx', 'web only');
    r.git('commit', '-qam', 'web');
    const second = r.head();
    r.write('docs/b.md', 'notes');
    // Outside the repository, as visual/ is ignored by it.
    const baselines = mkdtempSync(join(tmpdir(), 'visual-changed-baseline-'));
    dirs.push(baselines);
    const meta = (platform: string, commit: string) => {
      mkdirSync(join(baselines, platform), { recursive: true });
      writeFileSync(join(baselines, platform, 'meta.json'), JSON.stringify({ commit }));
    };
    meta('web', first);
    meta('android', first);
    meta('ios', second);
    meta('mac', 'f'.repeat(40));
    const plan = changedPlan(['web', 'android', 'ios', 'mac'], { baselineDir: baselines, root: r.root });
    expect(plan.map((p) => [p.platform, p.run])).toEqual([['web', true], ['android', false], ['ios', false], ['mac', true]]);
    expect(plan[0]).toMatchObject({ since: first, files: ['src/components/A.tsx'], why: "the web's own pages" });
    expect(plan[3].why).toMatch(/git doesn't know ffffffff: taken/);
    // An uncommitted change counts: the Android app edited in the working tree is taken.
    r.write('apps/android/Main.kt', 'edited, not committed');
    expect(changedPlan(['android'], { baselineDir: baselines, root: r.root })[0]).toMatchObject({ run: true, files: ['apps/android/Main.kt'] });
    // --since: every platform from that commit.
    expect(changedPlan(['ios'], { baselineDir: baselines, root: r.root, since: first })[0].run).toBe(false);
    rmSync(join(baselines, 'web'), { recursive: true });
    expect(changedPlan(['web'], { baselineDir: baselines, root: r.root })[0]).toMatchObject({ run: true, since: null, why: 'its baseline names no commit: taken' });
  });

  it('says the plan: each platform run or skipped, from where, and the first files that take it', () => {
    const plan = planChanged(['web', 'android'], {
      baseOf: () => ({ since: 'abcdef0123456789' }),
      files: () => ['src/components/A.tsx', 'src/components/B.tsx', 'src/styles/c.css'],
    });
    expect(planLines(plan, 2)).toEqual([
      "Changed since each platform's baseline (--changed):",
      "  run   web     since abcdef01 — the web's own pages (3 files)",
      '          src/components/A.tsx',
      '          src/components/B.tsx',
      '          … and 1 more',
      '  skip  android since abcdef01 — nothing changed since its baseline can move its screens',
    ]);
  });
});

describe('--changed and a release run', () => {
  it('is refused with --flows (a release takes everything), and allowed on a slice', () => {
    expect(refusesChanged(['web', '--changed', '--flows', '--review'])).toMatch(/release run/);
    expect(refusesChanged(['--changed', '--only', 'card', '--review'])).toBeNull();
  });
});
