/**
 * Where the landing stage's cast lives and how its files are fingerprinted, shared by build-cast.ts (which writes
 * src/lib/mascots/cast.generated.ts and public/mascots) and cast.generated.test.ts (which fails while either is stale).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT = resolve(__dirname, '../..');
/** The approved cast as the kit exports it: <slug>/parts/manifest.json and the part PNGs it names. */
export const CAST_SOURCE = join(ROOT, 'designs/mascots/cast');
/** What the site serves: <slug>/<part>.webp. */
export const CAST_PUBLIC = join(ROOT, 'public/mascots');
export const CAST_URL = '/mascots';
export const CAST_GENERATED = join(ROOT, 'src/lib/mascots/cast.generated.ts');
export const BUILD_SCRIPT = join(ROOT, 'scripts/mascots/build-cast.ts');

/** The bill's order (the reduced-motion still is 摺摺 when it is there); a new folder comes after these, by name. */
const ORDER = ['tuck', 'tag', 'card', 'dot', 'night'];

/** The characters in designs/mascots/cast (a folder with parts/manifest.json), in the bill's order. */
export function castSlugs(): string[] {
  const rank = (s: string) => (ORDER.indexOf(s) + 1 || ORDER.length + 1);
  return readdirSync(CAST_SOURCE, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(CAST_SOURCE, d.name, 'parts', 'manifest.json')))
    .map(d => d.name)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

interface SourcePart {
  name: string;
  w?: number;
  img: string;
}

/** A character's manifest and the part images it names (those with a box: a part without one has no image). */
export function sourceFiles(slug: string): { manifest: string; images: { name: string; file: string }[] } {
  const dir = join(CAST_SOURCE, slug, 'parts');
  const manifest = join(dir, 'manifest.json');
  const { parts } = JSON.parse(readFileSync(manifest, 'utf8')) as { parts: SourcePart[] };
  return { manifest, images: parts.filter(p => p.w).map(p => ({ name: p.name, file: join(dir, p.img) })) };
}

const sha = (chunks: (string | Buffer)[]) => {
  const h = createHash('sha256');
  for (const c of chunks) h.update(c).update('\0');
  return h.digest('hex');
};

/** What a character was built from: its manifest.json and every part image it names, byte for byte. */
export function sourceHash(slug: string): string {
  const { manifest, images } = sourceFiles(slug);
  return sha([readFileSync(manifest), ...images.flatMap(i => [i.name, readFileSync(i.file)])]).slice(0, 16);
}

/** The build script itself: its sizes, quality and measurements decide what is written. */
export function scriptHash(): string {
  return sha([readFileSync(BUILD_SCRIPT)]).slice(0, 16);
}

/** A character's images as served (part name and bytes, in the manifest's order): the `?v=` on each of its URLs. */
export function contentVersion(images: readonly { name: string; bytes: Buffer }[]): string {
  return sha(images.flatMap(i => [i.name, i.bytes])).slice(0, 10);
}
