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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
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
}): Promise<boolean> {
  const hash = inputsHash(inputs, root);
  const kept = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : null;
  const made = () => (existsSync(product) ? String(statSync(product).mtimeMs) : 'none');
  if (!force && existsSync(product) && kept === `${hash} ${made()}`) {
    log(`  ${name}: its inputs are as at its last build (${hash.slice(0, 10)}): reused (--force-build builds anyway)`);
    return false;
  }
  rmSync(stamp, { force: true });
  await build();
  mkdirSync(dirname(stamp), { recursive: true });
  writeFileSync(stamp, `${hash} ${made()}\n`);
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
