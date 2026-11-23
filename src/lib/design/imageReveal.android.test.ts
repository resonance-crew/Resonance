/**
 * The Android app's remote pictures come in through one component (Wave 2 #7): `RevealImage` in
 * core/design's ImageReveal.kt — blurred to sharp as a picture arrives after its frame is on screen, at
 * once from the memory cache, a fade alone under Battery Saver, nothing under "Remove animations".
 * A direct Coil call — `AsyncImage(`, `SubcomposeAsyncImage(`, `rememberAsyncImagePainter(` — anywhere
 * else is a picture that pops in. The few that mean to are listed below with why; a new one anywhere
 * fails, and so does a listed file holding fewer than it says (lower its count: it may only fall).
 * Comments don't count. Generated code and the tests are not scanned.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const android = join(root, 'apps/android');

/** The shared component itself. */
const SHARED = 'core/design/src/main/kotlin/com/resonance/design/ImageReveal.kt';

/** What may still call Coil directly, per file: how many, and why. */
const ALLOWED: Record<string, { count: number; why: string }> = {
  'app/src/main/kotlin/com/resonance/app/ui/ThreadComposer.kt': {
    count: 3,
    why: "the composer's previews of what rides with a message (a card's cover, a picture's thumb): the writer's own choice, shown at once",
  },
};

const PATTERN = /\b(?:AsyncImage|SubcomposeAsyncImage|rememberAsyncImagePainter)\(/g;

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'build' || name === 'generated' || name === 'test' || name === 'androidTest' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (name.endsWith('.kt')) out.push(path);
  }
  return out;
}

/** The code without its comments (a `//` after `:` is an address, not a comment). */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Android pictures through the reveal', () => {
  const files = ['app', 'core'].flatMap((d) => sources(join(android, d)));
  const found: Record<string, number> = Object.fromEntries(
    files
      .map((f) => [relative(android, f), code(readFileSync(f, 'utf8')).match(PATTERN)?.length ?? 0] as const)
      .filter(([f, n]) => n > 0 && f !== SHARED),
  );

  it('scans the app and its modules, and the shared component is there', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(code(readFileSync(join(android, SHARED), 'utf8'))).toMatch(/fun RevealImage\(/);
  });

  it('brings every other remote picture in through RevealImage', () => {
    const extra = Object.entries(found).filter(([f, n]) => n > (ALLOWED[f]?.count ?? 0));
    expect(extra, 'direct Coil calls where RevealImage should be (core/design ImageReveal.kt)').toEqual([]);
  });

  it('keeps its list as short as the code', () => {
    const stale = Object.entries(ALLOWED)
      .filter(([f, { count: allowed }]) => (found[f] ?? 0) < allowed)
      .map(([f, { count: allowed }]) => [f, found[f] ?? 0, allowed]);
    expect(stale, 'fewer direct calls than listed: lower the count (or drop the file)').toEqual([]);
  });

  it('pins the total that may only fall', () => {
    const total = Object.values(found).reduce((a, b) => a + b, 0);
    expect(total).toBe(3);
  });
});
