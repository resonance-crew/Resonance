/**
 * An app built only when what goes into it changed. Every capture of an app built it first — xcodegen
 * (about 12 s) and xcodebuild (23–156 s for the simulator, 30–200 s for the Mac, the two taking turns;
 * Gradle's own up-to-date pass ten or more) — even for one screen, after a commit that touched only
 * the web. Now each build writes a fingerprint of its inputs beside its product (`.visual-inputs`),
 * and a later run whose inputs give the same fingerprint, with the product still there, reuses it.
 *
 * The fingerprint is the content of every file under the build's roots that git tracks or would track
 * (untracked files included, deleted ones counted as gone), every `extras` file or folder whatever git
 * ignores (the islands' dist, local.properties), and a `salt`: the build's own arguments and the
 * toolchain (Xcode's version). It errs on the side of building: a file the build never reads, changed,
 * builds again. `--force-build` (VISUAL_FORCE_BUILD=1) builds whatever the fingerprint says, and
 * VISUAL_SKIP_BUILD=1 still reuses any product without looking.
 *
 * The fingerprint is written only after a build succeeds and removed before one starts, so a build that
 * failed or was cut off is never taken for a good one. It keeps the product's own mtime beside it too: a
 * product rebuilt by something else since (Xcode, Android Studio, from other sources) builds again.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './util';

export type BuildInputs = {
  /** Folders and files, relative to the checkout, whose tracked and untracked (not ignored) files go in. */
  roots: string[];
  /** Files or folders taken whatever git ignores (generated inputs); a missing one counts as missing. */
  extras?: string[];
  /** Anything else the product depends on: the build's arguments, the toolchain's version. */
  salt?: string[];
};

function walk(file: string, out: string[]) {
  if (!existsSync(file)) return;
  if (statSync(file).isDirectory()) {
    for (const name of readdirSync(file).sort()) if (name !== '.DS_Store') walk(join(file, name), out);
  } else out.push(file);
}

/** The fingerprint of `inputs` in the checkout at `root`. */
export function inputsHash(inputs: BuildInputs, root = ROOT): string {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...inputs.roots], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 << 20,
  })
    .split('\0')
    .filter(Boolean);
  const extras: string[] = [];
  for (const extra of inputs.extras ?? []) {
    const before = extras.length;
    walk(join(root, extra), extras);
    if (extras.length === before) extras.push(join(root, extra));
  }
  const files = [...new Set([...listed.map((f) => join(root, f)), ...extras])].sort();
  const hash = createHash('sha256');
  for (const line of inputs.salt ?? []) hash.update(`salt\0${line}\0`);
  for (const file of files) {
    hash.update(`${relative(root, file)}\0`);
    hash.update(existsSync(file) && statSync(file).isFile() ? createHash('sha1').update(readFileSync(file)).digest('hex') : 'missing');
    hash.update('\0');
  }
  return hash.digest('hex');
}

export const stampFile = (productDir: string) => join(productDir, '.visual-inputs');

/**
 * The machine's shared build cache (`VISUAL_BUILD_CACHE`, else ~/Library/Caches/resonance-visual/builds): every
 * checkout's products by the fingerprint of their inputs, so a worktree whose app is as another checkout's built it
 * (a web lane, a round's base, a fresh worktree of main) takes that app instead of a build of its own — 2–6 min of
 * xcodebuild and Gradle and 7 GB of DerivedData per worktree. `VISUAL_BUILD_CACHE=0` turns it off.
 *
 * An entry is a folder named `<name>-<fingerprint>` holding the product and a `complete` note. It is written beside
 * the others under a name of its own and renamed into place once whole (a rename is atomic on one volume), so a
 * reader finds a whole entry or none; when two checkouts store the same one at once, the second's rename finds it
 * there and drops its own. Copies are APFS clones (`cp -c`): no bytes copied while both stay alike.
 */
export function buildCacheDir(): string | null {
  const set = process.env.VISUAL_BUILD_CACHE;
  if (set === '0') return null;
  return set || join(homedir(), 'Library/Caches/resonance-visual/builds');
}

/** How many entries of one product the cache keeps (the newest used), and how young an entry is never removed. */
export const CACHE_KEEP = 3;
const CACHE_SPARE_MS = 30 * 60_000;

/**
 * The fingerprint the cache knows a product by: the checkout's own, with the checkout's path taken out of the salt (the
 * builds name their derived-data folder and entitlements by absolute path), so the same inputs in another worktree
 * give the same key.
 */
export function cacheKey(name: string, inputs: BuildInputs, root = ROOT): string {
  const salt = (inputs.salt ?? []).map((s) => s.split(root).join('<checkout>'));
  const slug = name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${slug}-${inputsHash({ ...inputs, salt }, root).slice(0, 32)}`;
}

/** A clone of `from` at `to` (a file or a folder), copied outright where cloning can't be done (another volume). */
function cloneInto(from: string, to: string) {
  mkdirSync(dirname(to), { recursive: true });
  try {
    execFileSync('cp', ['-cR', from, to], { stdio: 'ignore' });
  } catch {
    rmSync(to, { recursive: true, force: true });
    execFileSync('cp', ['-R', from, to], { stdio: 'ignore' });
  }
}

/** Brings `artifact` back from the cache's entry for `key`; answers whether there was a whole one. */
export function restoreFromCache(dir: string, key: string, artifact: string): boolean {
  const entry = join(dir, key);
  const kept = join(entry, basename(artifact));
  if (!existsSync(join(entry, 'complete')) || !existsSync(kept)) return false;
  // Marked used before the copy, so a prune meanwhile keeps it.
  const now = new Date();
  utimesSync(entry, now, now);
  rmSync(artifact, { recursive: true, force: true });
  cloneInto(kept, artifact);
  return true;
}

/** Keeps `artifact` in the cache as `key` (whole or not at all), then prunes that product's older entries. */
export function storeInCache(dir: string, key: string, artifact: string, prefix: string, keep = CACHE_KEEP): void {
  const entry = join(dir, key);
  if (existsSync(join(entry, 'complete'))) return;
  const tmp = join(dir, `.tmp-${key}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    cloneInto(artifact, join(tmp, basename(artifact)));
    writeFileSync(join(tmp, 'complete'), JSON.stringify({ key, from: ROOT, at: new Date().toISOString() }) + '\n');
    try {
      renameSync(tmp, entry);
    } catch {
      // Another checkout stored it meanwhile (or a broken entry stands there: replaced once).
      if (existsSync(join(entry, 'complete'))) return;
      rmSync(entry, { recursive: true, force: true });
      renameSync(tmp, entry);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  pruneCache(dir, prefix, keep);
}

/** A product's entries past the `keep` most recently used go, never one used in the last half hour. */
export function pruneCache(dir: string, prefix: string, keep = CACHE_KEEP, now = Date.now()): void {
  const entries = readdirSync(dir)
    .filter((n) => n.startsWith(`${prefix}-`))
    .map((n) => ({ path: join(dir, n), at: statSync(join(dir, n)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  for (const old of entries.slice(keep)) if (now - old.at > CACHE_SPARE_MS) rmSync(old.path, { recursive: true, force: true });
}

/**
 * Runs `build` unless the product is there and its fingerprint matches `inputs` (and no --force-build). Answers
 * whether it built.
 */
export async function buildIfChanged({
  name,
  stamp,
  product,
  inputs,
  build,
  log,
  root = ROOT,
  force = process.env.VISUAL_FORCE_BUILD === '1',
  artifact,
  cacheDir = buildCacheDir(),
}: {
  name: string;
  /** Where the fingerprint is kept (beside the product, [stampFile]). */
  stamp: string;
  /** The file the build makes (the APK, the app's binary): without it, or rewritten since by another build, it builds. */
  product: string;
  inputs: BuildInputs;
  build: () => Promise<void>;
  log: (line: string) => void;
  root?: string;
  force?: boolean;
  /** What the shared cache keeps and brings back (the .app folder, the APK): the product or what holds it. Without it, no cache. */
  artifact?: string;
  /** The shared build cache ([buildCacheDir]); null: none. */
  cacheDir?: string | null;
}): Promise<boolean> {
  const hash = inputsHash(inputs, root);
  const kept = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : null;
  const made = () => (existsSync(product) ? String(statSync(product).mtimeMs) : 'none');
  if (!force && existsSync(product) && kept === `${hash} ${made()}`) {
    log(`  ${name}: its inputs are as at its last build (${hash.slice(0, 10)}): reused (--force-build builds anyway)`);
    return false;
  }
  rmSync(stamp, { force: true });
  const key = artifact && cacheDir ? cacheKey(name, inputs, root) : null;
  const writeStamp = () => {
    mkdirSync(dirname(stamp), { recursive: true });
    writeFileSync(stamp, `${hash} ${made()}\n`);
  };
  if (key && !force) {
    try {
      if (restoreFromCache(cacheDir!, key, artifact!) && existsSync(product)) {
        writeStamp();
        log(`  ${name}: built before with these inputs (${key}): taken from the shared build cache (${cacheDir})`);
        return false;
      }
    } catch (error) {
      log(`  ${name}: the shared build cache couldn't give it back (${String((error as Error).message ?? error).slice(0, 120)}): building`);
    }
  }
  await build();
  writeStamp();
  if (key && existsSync(artifact!)) {
    try {
      mkdirSync(cacheDir!, { recursive: true });
      storeInCache(cacheDir!, key, artifact!, key.slice(0, key.lastIndexOf('-')));
    } catch (error) {
      // The cache only saves time: a store that fails leaves the build as it is.
      log(`  ${name}: not kept in the shared build cache (${String((error as Error).message ?? error).slice(0, 120)})`);
    }
  }
  return true;
}

/** A tool's version line(s), for a salt (empty when the tool isn't there: then the build itself says so). */
export function toolVersion(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 }).trim();
  } catch {
    return '';
  }
}
