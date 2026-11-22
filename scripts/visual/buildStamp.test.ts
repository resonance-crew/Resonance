import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildIfChanged, inputsHash, stampFile, type BuildInputs } from './buildStamp';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A checkout with an app, a shared folder, something else, and an ignored generated island. */
function checkout(): string {
  const root = mkdtempSync(join(tmpdir(), 'visual-stamp-'));
  dirs.push(root);
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write('.gitignore', 'native/dist/\napps/app/build/\n');
  write('apps/app/Main.swift', 'print("hi")\n');
  write('apps/shared/fonts/a.ttf', 'font');
  write('src/web.ts', 'export {}\n');
  write('native/dist/island.html', '<html>1</html>');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.gitignore', 'apps', 'src');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  return root;
}

const INPUTS: BuildInputs = { roots: ['apps/app', 'apps/shared'], extras: ['native/dist'], salt: ['xcodebuild 27.2'] };

describe('inputsHash', () => {
  it('changes with every input the build reads — edited, added, removed, ignored-but-named, the toolchain — and nothing else', () => {
    const root = checkout();
    const h0 = inputsHash(INPUTS, root);
    expect(inputsHash(INPUTS, root)).toBe(h0);
    // The web changing doesn't rebuild the app, nor does a build output.
    writeFileSync(join(root, 'src/web.ts'), 'export const x = 1\n');
    mkdirSync(join(root, 'apps/app/build'), { recursive: true });
    writeFileSync(join(root, 'apps/app/build/out.o'), 'obj');
    expect(inputsHash(INPUTS, root)).toBe(h0);

    const seen = new Set([h0]);
    const changed = (why: string) => {
      const h = inputsHash(INPUTS, root);
      expect(seen.has(h), why).toBe(false);
      seen.add(h);
    };
    writeFileSync(join(root, 'apps/app/Main.swift'), 'print("hello")\n');
    changed('a tracked file edited (not committed)');
    writeFileSync(join(root, 'apps/app/New.swift'), 'struct New {}\n');
    changed('an untracked file added');
    rmSync(join(root, 'apps/shared/fonts/a.ttf'));
    changed('a tracked file deleted');
    writeFileSync(join(root, 'native/dist/island.html'), '<html>2</html>');
    changed('an ignored island the build bundles');
    expect(inputsHash({ ...INPUTS, salt: ['xcodebuild 27.3'] }, root)).not.toBe(inputsHash(INPUTS, root));
  });
});

describe('buildIfChanged', () => {
  it('builds the first time, reuses while nothing changed, builds again on a change, a lost product or --force-build', async () => {
    const root = checkout();
    const product = join(root, 'apps/app/build/App.bin');
    const stamp = stampFile(dirname(product));
    let builds = 0;
    const said: string[] = [];
    const go = (force = false) =>
      buildIfChanged({
        name: 'the app',
        stamp,
        product,
        inputs: INPUTS,
        root,
        force,
        log: (l) => said.push(l),
        build: async () => {
          builds++;
          mkdirSync(dirname(product), { recursive: true });
          writeFileSync(product, `build ${builds}`);
        },
      });
    expect(await go()).toBe(true);
    expect(await go()).toBe(false);
    expect(said.at(-1)).toMatch(/the app: its inputs are as at its last build .*reused \(--force-build builds anyway\)/);
    writeFileSync(join(root, 'apps/app/Main.swift'), 'print("changed")\n');
    expect(await go()).toBe(true);
    expect(await go(true)).toBe(true);
    rmSync(product);
    expect(await go()).toBe(true);
    // Rebuilt by something else since (Xcode, Android Studio): its own mtime no longer matches.
    utimesSync(product, 1_600_000_000, 1_600_000_000);
    expect(await go()).toBe(true);
    expect(builds).toBe(5);
  });

  it('leaves no fingerprint behind a build that failed, so the next run builds', async () => {
    const root = checkout();
    const product = join(root, 'apps/app/build/App.bin');
    const stamp = stampFile(dirname(product));
    const args = { name: 'the app', stamp, product, inputs: INPUTS, root, log: () => {} };
    await buildIfChanged({ ...args, build: async () => (mkdirSync(dirname(product), { recursive: true }), writeFileSync(product, 'ok')) });
    expect(existsSync(stamp)).toBe(true);
    writeFileSync(join(root, 'apps/app/Main.swift'), 'syntax error\n');
    await expect(buildIfChanged({ ...args, build: async () => Promise.reject(new Error('xcodebuild failed')) })).rejects.toThrow('xcodebuild failed');
    expect(existsSync(stamp)).toBe(false);
    // Put back as it was at the good build: still built again, since the failed one may have half-written the product.
    writeFileSync(join(root, 'apps/app/Main.swift'), 'print("hi")\n');
    let built = false;
    await buildIfChanged({ ...args, build: async () => void (built = true) });
    expect(built).toBe(true);
  });
});
