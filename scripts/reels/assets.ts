/**
 * Splits the 小紙團 stickers the reels use (public/stickers/<pack>/<id>.webp,
 * animated) into numbered PNG frames under scripts/reels/.assets/stickers, with
 * a manifest of each one's frames and how long each is shown. A page can't seek an
 * animated WebP to a given moment; a numbered frame it can show for any t.
 *
 * It also exports the five paper puppets' parts for 小紙團劇場 (page/theater.ts)
 * from designs/mascots/cast/<slug>/rig.svg at 1.6 px per rig unit into
 * scripts/reels/.assets/mascots/<slug> (the kit's exporter): the site's own
 * images are 0.66 px a unit, made for a puppet 120 px tall, and a reel's is
 * about 550. Only when a rig is newer than its export.
 *
 *   npx tsx scripts/reels/assets.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { STICKERS } from './page/stickers';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'scripts/reels/.assets/stickers');
const PUPPETS = join(ROOT, 'scripts/reels/.assets/mascots');
/** Px per rig unit of the theater's puppet parts. */
const PUPPET_SCALE = 1.6;
const SLUGS = ['tuck', 'tag', 'card', 'dot', 'night'];

function exportPuppets() {
  for (const slug of SLUGS) {
    const rig = join(ROOT, 'designs/mascots/cast', slug, 'rig.svg');
    const dir = join(PUPPETS, slug);
    const manifest = join(dir, 'manifest.json');
    if (existsSync(manifest) && statSync(manifest).mtimeMs > statSync(rig).mtimeMs) continue;
    rmSync(dir, { recursive: true, force: true });
    const r = spawnSync('node', [join(ROOT, 'designs/mascots/round3/kit/export-parts.mjs'), rig, dir, '--scale', String(PUPPET_SCALE)], { stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.status !== 0) throw new Error(`export-parts ${slug} exited ${r.status}`);
    for (const f of ['_raw', '_export.html', '_comp.html', 'rest.png', 'recomposed.png']) rmSync(join(dir, f), { recursive: true, force: true });
    console.log(`${slug}: parts at ${PUPPET_SCALE} px a unit`);
  }
}

async function main() {
  exportPuppets();
  const manifest: Record<string, { frames: number; delays: number[]; size: number }> = {};
  for (const name of STICKERS) {
    const src = join(ROOT, 'public/stickers', `${name}.webp`);
    const meta = await sharp(src, { animated: true }).metadata();
    const frames = meta.pages ?? 1;
    const delays = Array.from({ length: frames }, (_, i) => (Array.isArray(meta.delay) ? meta.delay[i] : undefined) ?? 83);
    const dir = join(OUT, name.replace('/', '-'));
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < frames; i++) await sharp(src, { page: i }).png().toFile(join(dir, `${i}.png`));
    manifest[name] = { frames, delays, size: meta.width ?? 512 };
    console.log(`${name}: ${frames} frames, ${delays.reduce((a, b) => a + b, 0)} ms`);
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // The paper's grain: soft grey speckle around white, multiplied over every sheet (tiles at 540 px).
  const n = 540;
  const px = Buffer.alloc(n * n);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let i = 0; i < px.length; i++) px[i] = 255 - Math.round(Math.pow(rnd(), 3) * 46);
  await sharp(px, { raw: { width: n, height: n, channels: 1 } }).blur(0.6).png().toFile(join(OUT, '../grain.png'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
