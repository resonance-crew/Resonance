/**
 * The stickers' own copy of the cast's parts, at 2× the landing page's export (1.6 px per rig unit, the kit exporter's
 * `--scale 1.6`), so a sticker drawn at 432 px — rendered at 864 and then scaled down — never stretches a part up.
 *
 *   npx tsx scripts/stickers/export-parts.ts [slug…]      (npm run stickers:parts)
 *
 * Reads the live rigs (designs/mascots/cast/<slug>/rig.svg — what the generators in designs/mascots/round3|4/<slug>/gen
 * write), adds the few extra parts only stickers need, runs the kit's exporter (designs/mascots/round3/kit/export-parts.mjs:
 * headless Chrome, CHROME_PATH) and writes designs/stickers/parts/<slug>/<part>.webp (lossless) and manifest.json.
 * The landing page's public/mascots is never touched.
 *
 * Extra parts (`extra: true` in the manifest; hidden unless a choreography shows them):
 *   tuck   `flap`, `flap-alt` — the dog-ear alone (shut, and lifted as torso-alt draws it), to lay over something
 *          slipped under the corner;
 *   night  `star-glow-0…10` — each star's glow on its own (stars-glow split), so the stars can light one by one; the
 *          stars' centres and sizes are in the manifest as `stars: [[x, y, r], …]` (rig units).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { MASCOT_CAST } from '../../src/lib/mascots/cast.generated';

const ROOT = resolve(__dirname, '../..');
const CAST = join(ROOT, 'designs/mascots/cast');
const OUT = join(ROOT, 'designs/stickers/parts');
const EXPORTER = join(ROOT, 'designs/mascots/round3/kit/export-parts.mjs');
/** Px per rig unit: 2× the cast's 0.8. */
export const PARTS_SCALE = 1.6;

const SLUGS = ['tuck', 'tag', 'card', 'dot', 'night'] as const;

/** A part group to add to the rig: hidden in the exporter's rest render (it's marked a variant), `extra` afterwards. */
function partGroup(name: string, pivot: string, body: string): string {
  return `<g data-part="${name}" data-parent="body" data-pivot="${pivot}" data-variant-of="${name}">${body}</g>`;
}

/** The inside of a part's group (between its opening tag and the next part). */
function partSource(svg: string, name: string): { start: number; end: number; open: string; inner: string } {
  const open = new RegExp(`<g data-part="${name}"[^>]*>`).exec(svg);
  if (!open) throw new Error(`no part ${name}`);
  const start = open.index;
  const next = svg.indexOf('<g data-part=', start + open[0].length);
  const close = svg.lastIndexOf('</g>', next < 0 ? svg.length : next);
  return { start, end: close + 4, open: open[0], inner: svg.slice(start + open[0].length, close) };
}

/** 摺摺: its dog-ear (the flap's paper, its shadow and its crease line) out of torso / torso-alt, as parts of their own. */
function tuckExtras(svg: string): string {
  const flap = /(<g(?: transform="[^"]*")?>\s*<path d="[^"]*" fill="oklch\(28% 0\.03 55\)"[^>]*\/>\s*<path d="[^"]*" style="fill:var\(--tk-flap-back[^>]*\/>\s*<\/g>\s*<g style="stroke:var\(--tk-ink[^"]*" stroke-width="1\.6"[^>]*>(?:<path [^>]*\/>)+<\/g>)/;
  const extras: string[] = [];
  for (const [from, name] of [['torso', 'flap'], ['torso-alt', 'flap-alt']] as const) {
    const part = partSource(svg, from);
    const wrap = /^<g transform="([^"]*)">/.exec(part.inner);
    const m = flap.exec(part.inner);
    if (!wrap || !m) throw new Error(`tuck: no dog-ear in ${from}`);
    const pivot = /data-pivot="([^"]*)"/.exec(part.open)![1];
    extras.push(partGroup(name, pivot, `<g transform="${wrap[1]}">${m[1]}</g>`));
  }
  const at = partSource(svg, 'deco').start;
  return svg.slice(0, at) + extras.join('\n ') + '\n ' + svg.slice(at);
}

interface Star {
  x: number;
  y: number;
  r: number;
}

/** 悄悄: stars-glow split into one glow per star (its halo, its bright core, and the two big ones' crosses). */
function nightExtras(svg: string): { svg: string; stars: Star[] } {
  const part = partSource(svg, 'stars-glow');
  const groups = [...part.inner.matchAll(/<g filter="url\(#([^)]+)\)">([\s\S]*?)<\/g>/g)];
  if (groups.length !== 2) throw new Error('night: stars-glow is not two filtered groups');
  const circles = (s: string) => [...s.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"[^>]*\/>/g)];
  const halos = circles(groups[0][2]);
  const cores = circles(groups[1][2]);
  const crosses = [...groups[1][2].matchAll(/<path d="M([\d.]+),([\d.]+)L[^"]*"[^>]*\/>/g)];
  if (!halos.length || halos.length !== cores.length) throw new Error('night: halos and cores differ');
  const pivot = /data-pivot="([^"]*)"/.exec(part.open)![1];
  const stars: Star[] = [];
  const extras = halos.map((h, i) => {
    const [x, y] = [Number(h[1]), Number(h[2])];
    const core = cores.find(c => Number(c[1]) === x && Number(c[2]) === y);
    if (!core) throw new Error(`night: no core for the star at ${x},${y}`);
    // a cross is drawn from (x, y - r): its first point names its star's x
    const cross = crosses.filter(c => Number(c[1]) === x).map(c => c[0]).join('');
    stars.push({ x, y, r: Number(core[3]) });
    return partGroup(`star-glow-${i}`, pivot,
      `<g filter="url(#${groups[0][1]})">${h[0]}</g><g filter="url(#${groups[1][1]})">${core[0]}${cross}</g>`);
  });
  const at = partSource(svg, 'deco').start;
  return { svg: svg.slice(0, at) + extras.join('\n ') + '\n ' + svg.slice(at), stars };
}

interface Part {
  name: string;
  img: string;
  w: number;
  variantOf: string | null;
  hidden?: boolean;
  extra?: boolean;
  [key: string]: unknown;
}

async function exportSlug(slug: (typeof SLUGS)[number]): Promise<void> {
  let svg = readFileSync(join(CAST, slug, 'rig.svg'), 'utf8');
  let stars: Star[] | null = null;
  let extraNames: string[] = [];
  if (slug === 'tuck') {
    svg = tuckExtras(svg);
    extraNames = ['flap', 'flap-alt'];
  }
  if (slug === 'night') {
    const r = nightExtras(svg);
    svg = r.svg;
    stars = r.stars;
    extraNames = stars.map((_, i) => `star-glow-${i}`);
  }
  const tmp = mkdtempSync(join(tmpdir(), `stickers-parts-${slug}-`));
  try {
    const rig = join(tmp, 'rig.svg');
    writeFileSync(rig, svg);
    const out = join(tmp, 'parts');
    const report = execFileSync('node', [EXPORTER, rig, out, '--scale', String(PARTS_SCALE)], { encoding: 'utf8' });
    const json = JSON.parse(report.slice(report.indexOf('{'), report.lastIndexOf('}') + 1)) as { problems: string[]; recomposeDiffPct: number };
    if (json.problems.length) throw new Error(`${slug}: ${json.problems.join('; ')}`);
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) as { parts: Part[]; [k: string]: unknown };
    // the landing build's measurements (in rig units, so they hold at any scale): the torso's pointer shape, the secret
    const cast = MASCOT_CAST.find(c => c.slug === slug);
    const dir = join(OUT, slug);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const p of manifest.parts) {
      if (extraNames.includes(p.name)) {
        p.variantOf = null;
        p.hidden = true;
        p.extra = true;
      }
      const live = cast?.manifest.parts.find(q => q.name === p.name);
      if (live?.hit) p.hit = live.hit;
      if (live?.reveal) p.reveal = live.reveal;
      if (!p.w) continue;
      const webp = p.img.replace(/\.png$/, '.webp');
      await sharp(join(out, p.img)).webp({ lossless: true, effort: 6 }).toFile(join(dir, webp));
      p.img = webp;
    }
    if (stars) manifest.stars = stars.map(s => [s.x, s.y, s.r]);
    writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
    const bytes = readdirSync(dir).reduce((n, f) => n + readFileSync(join(dir, f)).length, 0);
    console.log(`${slug}: ${manifest.parts.length} parts, recompose diff ${json.recomposeDiffPct}%, ${(bytes / 1024).toFixed(0)} KB`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const want = process.argv.slice(2);
  for (const s of want) if (!SLUGS.includes(s as (typeof SLUGS)[number])) throw new Error(`unknown slug ${s}`);
  for (const slug of SLUGS) if (!want.length || want.includes(slug)) await exportSlug(slug);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
