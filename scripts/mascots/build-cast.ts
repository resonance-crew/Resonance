/**
 * The landing stage's cast (src/lib/mascots): designs/mascots/cast/<slug>/parts — the kit's exported rig parts, PNGs
 * at the manifest's `scale` (0.8 px per rig unit) — becomes
 *   public/mascots/<slug>/<part>.webp   alpha WebP at PX_PER_UNIT, what the page loads;
 *   src/lib/mascots/cast.generated.ts   each manifest with the torso's pointer shape (`hit`) and torso-alt's secret
 *                                       (`reveal`) measured from the part images (the stage prototype's outline.py,
 *                                       ported), each character's traits, and its images' content version (`?v=`).
 * The boxes and pivots stay in rig units (the engine sizes every image by them), so only `scale` and `img` change.
 * cast.generated.test.ts fails while either output is stale against designs/mascots/cast or this script.
 *
 *   npm run mascots:cast
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import type { Traits } from '../../src/lib/mascots/types';
import {
  CAST_GENERATED, CAST_PUBLIC, CAST_SOURCE, CAST_URL, ROOT, castSlugs, contentVersion, scriptHash, sourceFiles, sourceHash,
} from './castFiles';

/**
 * Px per rig unit of the served images, one for all five. 摺摺 (420 units) is 120 CSS px on a desktop, ≈0.29 px a
 * unit; the height curve makes the smaller ones a little larger for their size, up to 點點's ≈0.33 (77 px for 231
 * units). A 2× screen wants ≈0.53–0.66 and a phone at 3× (80 px) the same, so 0.66 is never stretched up by the browser.
 */
const PX_PER_UNIT = 0.66;
/**
 * Lossy colour, lossless alpha (the paper's torn edges stay clean). At 94 the pencil tooth and the paper's specks keep
 * at 2× (lower, they smear into the paper; lossless costs almost twice the bytes for what the eye can't tell apart).
 */
const WEBP = { quality: 94, alphaQuality: 100, smartSubsample: true, effort: 6 } as const;

/** Per-character habits the engine reads (the stage prototype's TRAITS). */
const TRAITS: Record<string, Traits> = {
  tuck: { likes: ['read', 'reveal'] },
  tag: { pace: 1.1, likes: ['reveal', 'wave'] },
  card: { pace: 0.85, shuffle: true, likes: ['deco', 'read'] },
  // keeps its eyes open while it stretches: shut, its pale face would have no dark mark
  dot: { likes: ['hop'], openStretch: true },
  // the night one: by day it keeps to the footer and the CTA more than the bright hero, and comes round more often
  // on the dark page
  night: {
    pace: 0.7, naps: true, likes: ['nap', 'twinkle'],
    zones: { light: { hero: 0.35, cta: 1.5, footer: 2 }, dark: { hero: 1.3, footer: 1.5 } },
    often: { light: 0.8, dark: 1.6 },
  },
};

// --- the kit's manifest ------------------------------------------------------------------------------------------------

type Pt = [number, number];
interface Part {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  img: string;
  hidden?: boolean;
  hit?: Pt[];
  reveal?: Reveal;
  [key: string]: unknown;
}
interface Manifest {
  scale?: number;
  parts: Part[];
  [key: string]: unknown;
}
interface Reveal {
  at: Pt;
  tip: Pt;
  frac: number;
  spread: number;
}

// --- outline.py, ported: what a manifest gains from its part images ------------------------------------------------------

/** Python's round(x, digits): the double's exact value rounded half to even (outline.py's numbers, digit for digit). */
function pyRound(x: number, digits = 0): number {
  const exact = Math.abs(x).toFixed(100);
  const [int, frac = ''] = exact.split('.');
  const kept = int + frac.slice(0, digits);
  const rest = frac.slice(digits);
  const half = rest[0] === '5' && /^0*$/.test(rest.slice(1));
  const up = rest[0] > '5' || (rest[0] === '5' && !half) || (half && Number(kept[kept.length - 1]) % 2 === 1);
  let n = BigInt(kept) + (up ? 1n : 0n);
  if (x < 0) n = -n;
  return Number(n) / 10 ** digits;
}

interface Raster {
  w: number;
  h: number;
  px: Buffer;
}

async function raster(file: string): Promise<Raster> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`${file}: ${info.channels} channels`);
  return { w: info.width, h: info.height, px: data };
}

/**
 * The torso's outline as a polygon (fractions of its image box), a little inside the paper: the engine's pointer shape
 * (never the arms' or legs' transparent corners). 32 rays from the opaque centroid, each to its farthest opaque pixel.
 */
function polygon({ w, h, px }: Raster, n = 32, shrink = 0.94): Pt[] {
  const alpha = (x: number, y: number) => px[(y * w + x) * 4 + 3];
  let sx = 0;
  let sy = 0;
  let cnt = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (alpha(x, y) > 128) {
        sx += x;
        sy += y;
        cnt += 1;
      }
    }
  }
  const cx = sx / cnt;
  const cy = sy / cnt;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    let r = 0;
    let far = 0;
    for (;;) {
      const x = cx + dx * r;
      const y = cy + dy * r;
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (alpha(Math.trunc(x), Math.trunc(y)) > 128) far = r;
      r += 1;
    }
    pts.push([pyRound((cx + dx * far * shrink) / w, 4), pyRound((cy + dy * far * shrink) / h, 4)]);
  }
  return pts;
}

/**
 * Where torso-alt differs from the torso, and how much of the torso that is: a small secret (摺摺's dog-ear) is
 * something a mitten can lift open; a whole new side is not. `tip` is where what changed meets the paper's edge.
 */
async function reveal(m: Manifest, dir: string): Promise<Reveal | null> {
  const S = m.scale ?? 0.8;
  const t = m.parts.find(p => p.name === 'torso');
  const alt = m.parts.find(p => p.name === 'torso-alt');
  if (!t || !alt || !alt.w) return null;
  const x0 = Math.min(t.x, alt.x);
  const y0 = Math.min(t.y, alt.y);
  const x1 = Math.max(t.x + t.w, alt.x + alt.w);
  const y1 = Math.max(t.y + t.h, alt.y + alt.h);
  const W = Math.trunc((x1 - x0) * S) + 2;
  const H = Math.trunc((y1 - y0) * S) + 2;
  // each sheet laid on a clear canvas of the two boxes together (compositing onto clear paper keeps every pixel)
  const layer = async (p: Part) => {
    const im = await raster(join(dir, p.img));
    const c = Buffer.alloc(W * H * 4);
    const ox = pyRound((p.x - x0) * S);
    const oy = pyRound((p.y - y0) * S);
    for (let y = 0; y < im.h; y++) {
      const cy = y + oy;
      if (cy < 0 || cy >= H) continue;
      for (let x = 0; x < im.w; x++) {
        const cx = x + ox;
        if (cx < 0 || cx >= W) continue;
        const s = (y * im.w + x) * 4;
        if (im.px[s + 3] === 0) continue;
        im.px.copy(c, (cy * W + cx) * 4, s, s + 4);
      }
    }
    return c;
  };
  const a = await layer(t);
  const b = await layer(alt);
  const at = (c: Buffer, x: number, y: number, i: number) => c[(y * W + x) * 4 + i];
  let n = 0;
  let area = 0;
  let sx = 0;
  let sy = 0;
  let bx0 = 1e9;
  let by0 = 1e9;
  let bx1 = -1e9;
  let by1 = -1e9;
  const diff: Pt[] = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const aa = at(a, x, y, 3);
      const ba = at(b, x, y, 3);
      if (aa > 128) area += 1;
      const rgb = () => [0, 1, 2].reduce((s, i) => s + Math.abs(at(a, x, y, i) - at(b, x, y, i)), 0);
      if (Math.abs(aa - ba) > 100 || (aa > 128 && ba > 128 && rgb() > 70)) {
        n += 1;
        sx += x;
        sy += y;
        bx0 = Math.min(bx0, x);
        by0 = Math.min(by0, y);
        bx1 = Math.max(bx1, x);
        by1 = Math.max(by1, y);
        diff.push([x, y]);
      }
    }
  }
  if (!n || !area) return null;
  // spread: the box around what changed, against the torso's own box (a corner is small, a written-over card is not)
  const spread = ((bx1 - bx0) * (by1 - by0)) / (t.w * t.h * S * S);
  const outside = (x: number, y: number) =>
    x < 0 || y < 0 || x >= W || y >= H || Math.max(at(a, x, y, 3), at(b, x, y, 3)) <= 128;
  const r = 7;
  const around: Pt[] = [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]];
  const rim = diff.filter(([x, y]) => around.some(([dx, dy]) => outside(x + dx, y + dy)));
  let tx = sx / n;
  let ty = sy / n;
  if (rim.length) {
    // the rim's middle, pushed out to the paper's edge along the line from the torso's middle
    const mx = rim.reduce((s, q) => s + q[0], 0) / rim.length;
    const my = rim.reduce((s, q) => s + q[1], 0) / rim.length;
    const cx = (t.x + t.w / 2 - x0) * S;
    const cy = (t.y + t.h / 2 - y0) * S;
    let ux = mx - cx;
    let uy = my - cy;
    const d = Math.hypot(ux, uy) || 1;
    ux /= d;
    uy /= d;
    const score = ([x, y]: Pt) => (x - cx) * ux + (y - cy) * uy - 0.5 * Math.abs((x - cx) * uy - (y - cy) * ux);
    let best = rim[0];
    for (const q of rim) if (score(q) > score(best)) best = q;
    [tx, ty] = best;
  }
  return {
    at: [pyRound(x0 + sx / n / S, 1), pyRound(y0 + sy / n / S, 1)],
    tip: [pyRound(x0 + tx / S, 1), pyRound(y0 + ty / S, 1)],
    frac: spread < 0.3 ? pyRound(n / area, 3) : 1,
    spread: pyRound(spread, 3),
  };
}

// --- the build -----------------------------------------------------------------------------------------------------------

interface Built {
  slug: string;
  manifest: Manifest;
  version: string;
  bytes: number;
}

async function build(slug: string): Promise<Built> {
  const dir = join(CAST_SOURCE, slug, 'parts');
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;
  const S = m.scale ?? 0.8;
  const k = PX_PER_UNIT / S;
  const torso = m.parts.find(p => p.name === 'torso');
  if (!torso) throw new Error(`${slug}: no torso`);
  const hit = polygon(await raster(join(dir, torso.img)));
  const secret = await reveal(m, dir);

  const out = join(CAST_PUBLIC, slug);
  mkdirSync(out, { recursive: true });
  const images: { name: string; file: string; bytes: Buffer }[] = [];
  for (const { name, file } of sourceFiles(slug).images) {
    const meta = await sharp(file).metadata();
    const w = Math.max(1, Math.round((meta.width ?? 0) * k));
    const h = Math.max(1, Math.round((meta.height ?? 0) * k));
    const bytes = await sharp(file).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).webp(WEBP).toBuffer();
    images.push({ name, file: `${name}.webp`, bytes });
  }
  const version = contentVersion(images);
  for (const i of images) writeFileSync(join(out, i.file), i.bytes);
  // a part the manifest no longer names leaves no image behind
  const keep = new Set(images.map(i => i.file));
  for (const f of readdirSync(out)) if (!keep.has(f)) rmSync(join(out, f), { recursive: true });

  const file = new Map(images.map(i => [i.name, i.file]));
  const parts = m.parts.map(({ hidden: _hidden, hit: _hit, reveal: _reveal, ...p }) => {
    const part: Part = { ...p, img: file.has(p.name) ? `${file.get(p.name)}?v=${version}` : p.img };
    if (p.name === 'torso') part.hit = hit;
    if (p.name === 'torso-alt' && secret) part.reveal = secret;
    return part;
  });
  return { slug, manifest: { ...m, scale: PX_PER_UNIT, parts }, version, bytes: images.reduce((s, i) => s + i.bytes.length, 0) };
}

function source(cast: Built[], hashes: Record<string, string>): string {
  const q = (v: unknown) => JSON.stringify(v);
  const entry = ({ slug, manifest }: Built) => {
    const { parts, ...head } = manifest;
    const traits = TRAITS[slug];
    return [
      '  {',
      `    slug: ${q(slug)},`,
      `    base: ${q(`${CAST_URL}/${slug}/`)},`,
      ...(traits ? [`    traits: ${q(traits)},`] : []),
      '    manifest: {',
      ...Object.entries(head).map(([key, v]) => `      ${key}: ${q(v)},`),
      '      parts: [',
      ...parts.map(p => `        ${q(p)},`),
      '      ],',
      '    },',
      '  },',
    ].join('\n');
  };
  return `// Generated by scripts/mascots/build-cast.ts from designs/mascots/cast. Do not edit.
// Regenerate with \`npm run mascots:cast\` (it also writes public/mascots); cast.generated.test.ts fails while stale.
import type { CastEntry } from './types';

/** sha256 (first 16 hex) of what the cast was built from: the build script, each character's manifest and part images. */
export const MASCOT_CAST_SOURCES: { script: string; cast: Readonly<Record<string, string>> } = {
  script: ${q(scriptHash())},
  cast: {
${Object.entries(hashes).map(([slug, h]) => `    ${slug}: ${q(h)},`).join('\n')}
  },
};

/**
 * The landing stage's cast, in the bill's order: each part image at \`base + img\` (public/mascots/<slug>/, ${PX_PER_UNIT} px per
 * rig unit, its \`?v=\` the character's content version), each torso's pointer shape and torso-alt's secret measured.
 */
export const MASCOT_CAST: readonly CastEntry[] = [
${cast.map(entry).join('\n')}
];
`;
}

async function main() {
  const slugs = castSlugs();
  const cast: Built[] = [];
  for (const slug of slugs) cast.push(await build(slug));
  // a character no longer in the cast leaves no folder behind
  for (const d of readdirSync(CAST_PUBLIC, { withFileTypes: true })) {
    if (d.isDirectory() && !slugs.includes(d.name)) rmSync(join(CAST_PUBLIC, d.name), { recursive: true });
  }
  const hashes = Object.fromEntries(slugs.map(s => [s, sourceHash(s)]));
  writeFileSync(CAST_GENERATED, source(cast, hashes));
  const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;
  for (const c of cast) {
    const t = c.manifest.parts.find(p => p.name === 'torso-alt')?.reveal;
    console.log(`${c.slug.padEnd(6)} ${kb(c.bytes).padStart(9)}  v=${c.version}${t ? `  reveal frac ${t.frac} tip ${t.tip}` : ''}`);
  }
  console.log(`total  ${kb(cast.reduce((s, c) => s + c.bytes, 0)).padStart(9)}  → ${relative(ROOT, CAST_PUBLIC)}/, ${relative(ROOT, CAST_GENERATED)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
