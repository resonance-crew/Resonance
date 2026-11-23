import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildIfChanged, cacheKey, inputsHash, pruneCache, restoreFromCache, stampFile, storeInCache, type BuildInputs } from './buildStamp';

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

describe('the shared build cache', () => {
  /** A cache folder of a test's own (never the machine's). */
  const cacheFolder = () => {
    const dir = mkdtempSync(join(tmpdir(), 'visual-cache-'));
    dirs.push(dir);
    return dir;
  };
  /** One checkout's build of an .app folder whose binary is the product; the salt names the checkout's path, as the Xcode builds' do. */
  const builder = (root: string, cacheDir: string, said: string[] = []) => {
    const app = join(root, 'apps/app/build/App.app');
    const product = join(app, 'App.bin');
    let builds = 0;
    const go = (force = false) =>
      buildIfChanged({
        name: 'the app',
        stamp: stampFile(join(root, 'apps/app/build')),
        product,
        artifact: app,
        cacheDir,
        inputs: { ...INPUTS, salt: [...INPUTS.salt!, `-derivedDataPath ${root}/apps/app/build`] },
        root,
        force,
        log: (l) => said.push(l),
        build: async () => {
          builds++;
          mkdirSync(app, { recursive: true });
          writeFileSync(product, `built in ${root}`);
          writeFileSync(join(app, 'Info.plist'), 'plist');
        },
      });
    return { go, app, product, builds: () => builds };
  };

  it('gives another checkout with the same inputs the app built in the first, without a build, and builds once the inputs differ', async () => {
    const cache = cacheFolder();
    const a = builder(checkout(), cache);
    const said: string[] = [];
    const b = builder(checkout(), cache, said);
    expect(await a.go()).toBe(true);
    expect(await b.go()).toBe(false);
    expect(b.builds()).toBe(0);
    expect(said.at(-1)).toMatch(/taken from the shared build cache/);
    // The whole folder came back, as built.
    expect(readFileSync(b.product, 'utf8')).toMatch(/^built in .*visual-stamp-/);
    expect(existsSync(join(b.app, 'Info.plist'))).toBe(true);
    // Its own fingerprint is written: the next run reuses it in place.
    expect(await b.go()).toBe(false);
    expect(said.at(-1)).toMatch(/reused/);
    // --force-build builds whatever the cache holds.
    expect(await b.go(true)).toBe(true);
    expect(b.builds()).toBe(1);
  });

  it('never gives back an entry left half-written (no `complete` note), and a store left behind as a temporary folder is never an entry', async () => {
    const cache = cacheFolder();
    const root = checkout();
    const a = builder(root, cache);
    await a.go();
    const [entry] = readdirSync(cache).filter((n) => !n.startsWith('.'));
    rmSync(join(cache, entry, 'complete'));
    mkdirSync(join(cache, `.tmp-${entry}-1-abc`), { recursive: true });
    const b = builder(checkout(), cache);
    expect(await b.go()).toBe(true);
    expect(b.builds()).toBe(1);
    // That build replaced the broken entry with a whole one.
    expect(existsSync(join(cache, entry, 'complete'))).toBe(true);
    expect(cacheKey('the app', INPUTS, root)).toMatch(/^the-app-[0-9a-f]{32}$/);
  });

  it('a store that finds the entry already there (another checkout, at the same moment) keeps the one there', () => {
    const cache = cacheFolder();
    const root = checkout();
    const art = (text: string) => {
      const dir = join(mkdtempSync(join(tmpdir(), 'visual-art-')), 'App.app');
      dirs.push(dirname(dir));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'App.bin'), text);
      return dir;
    };
    storeInCache(cache, 'the-app-1', art('first'), 'the-app');
    storeInCache(cache, 'the-app-1', art('second'), 'the-app');
    expect(readFileSync(join(cache, 'the-app-1', 'App.app', 'App.bin'), 'utf8')).toBe('first');
    expect(readdirSync(cache)).toEqual(['the-app-1']);
    const out = join(root, 'out/App.app');
    expect(restoreFromCache(cache, 'the-app-1', out)).toBe(true);
    expect(readFileSync(join(out, 'App.bin'), 'utf8')).toBe('first');
    expect(restoreFromCache(cache, 'the-app-2', out)).toBe(false);
  });

  it('keeps a product’s three most recently used entries, never one used in the last half hour, and no other product’s', () => {
    const cache = cacheFolder();
    const old = Date.now() / 1000 - 3600;
    for (const [i, name] of ['the-app-a', 'the-app-b', 'the-app-c', 'the-app-d', 'the-app-e', 'other-x'].entries()) {
      mkdirSync(join(cache, name));
      // a, b: an hour old and older; c: just now; the rest older still — d and e past the three kept.
      const at = name === 'the-app-c' ? Date.now() / 1000 : name === 'the-app-e' ? Date.now() / 1000 - 60 : old - i * 60;
      utimesSync(join(cache, name), at, at);
    }
    pruneCache(cache, 'the-app');
    // By use: c, e, a, b, d — the first three stay, b and d (an hour and more unused) go.
    expect(readdirSync(cache).sort()).toEqual(['other-x', 'the-app-a', 'the-app-c', 'the-app-e']);
  });
});
