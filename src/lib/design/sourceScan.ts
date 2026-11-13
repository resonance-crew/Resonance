import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * The plumbing the design rules' source tests share (noShadows, onePen, noFlatBorders, placeholders,
 * wobbleLiterals, inlineStyles): which files they read, the code without its comments, and the
 * ratchet — a list of files allowed a number of hits, each with why, that can only shrink.
 * Test-only: nothing in the app imports it.
 */
export const ROOT = resolve(__dirname, '../../..');

/** Folders no rule reads: builds, generated code, tests, the apps' projects. */
const SKIP = new Set([
  'node_modules', 'build', '.build', 'DerivedData', 'Generated', 'generated', 'dist',
  'ResonanceTests', 'Tests', 'test', 'androidTest', 'Resonance.xcodeproj',
]);

const isTestFile = (name: string) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);

/** Every file under `dir` (relative to the repo) whose name `want` takes — tests and builds left out. */
export function sourceFiles(dir: string, want: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      if (SKIP.has(name) || name.startsWith('.')) continue;
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (want(name) && !isTestFile(name)) out.push(path);
    }
  };
  walk(resolve(ROOT, dir));
  return out;
}

export const web = (name: string) => /\.(tsx?|css)$/.test(name);
export const swift = (name: string) => name.endsWith('.swift');
export const kotlin = (name: string) => name.endsWith('.kt');

/** The web's sources, the iOS and Mac app's, the Android app's. */
export const WEB_FILES = () => sourceFiles('src', web);
export const SWIFT_FILES = () => [...sourceFiles('apps/ios/Resonance', swift), ...sourceFiles('apps/ios/Packages', swift)];
export const KOTLIN_FILES = () => [...sourceFiles('apps/android/app', kotlin), ...sourceFiles('apps/android/core', kotlin)];

export const relPath = (path: string) => relative(ROOT, path);

/**
 * The code with its comments blanked, every line kept (so line numbers hold). CSS has only block
 * comments; TS, Swift and Kotlin also `//` ones — but not after `:` (an address) or inside a string's
 * opening quote.
 */
export function withoutComments(text: string, css: boolean): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (!css) out = out.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)));
  return out;
}

export function readCode(path: string): string {
  return withoutComments(readFileSync(path, 'utf8'), path.endsWith('.css'));
}

/** Each line of a file's code that any of the patterns matches (a line counts once), as `line: text`. */
export function hitsIn(path: string, patterns: RegExp[]): string[] {
  return readCode(path)
    .split('\n')
    .flatMap((line, i) => (patterns.some((re) => re.test(line)) ? [`${i + 1}: ${line.trim().slice(0, 140)}`] : []));
}

/** file → how many hits it may keep, and why. A file not listed may keep none. */
export type Ratchet = Record<string, { count: number; why: string }>;

/**
 * What a ratchet says of what was found (file → its hits): files over their number (a new hit), and
 * files under it (a hit gone — lower the number, or drop the entry, so the list only shrinks).
 */
export function ratchet(found: Record<string, string[]>, allowed: Ratchet): { over: string[]; under: string[] } {
  const over: string[] = [];
  const under: string[] = [];
  for (const [file, hits] of Object.entries(found)) {
    const may = allowed[file]?.count ?? 0;
    if (hits.length > may) over.push(`${file} (${hits.length}, allowed ${may}):\n    ${hits.join('\n    ')}`);
  }
  for (const [file, { count }] of Object.entries(allowed)) {
    const has = found[file]?.length ?? 0;
    if (has < count) under.push(`${file}: ${has} now, listed as ${count}`);
  }
  return { over, under };
}

/** Each file's hits (only files with any), keyed by its path from the repo's root. */
export function scan(files: string[], find: (path: string) => string[]): Record<string, string[]> {
  return Object.fromEntries(files.map((f) => [relPath(f), find(f)] as const).filter(([, hits]) => hits.length > 0));
}
