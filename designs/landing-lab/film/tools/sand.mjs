#!/usr/bin/env node
/**
 * The paper's sand (script/sand.ts): two small tiles of fine specks — dark ones, pale ones — the world's planes are
 * filled with (World.tsx's `film-sand` pattern). Seeded, so a rerun writes the same files; each tile is seamless (the
 * noise is laid 3 × 3, softened a little so specks clump as grit does, and the middle cut out).
 *
 *   node designs/landing-lab/film/tools/sand.mjs      → src/components/lab/landing/film/sand-{dark,light}.png
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from '/Users/ncchen/Documents/Resonance-landing/node_modules/sharp/lib/index.js';

const N = 128;
/** The tile's side in pixels: the noise is laid on a 128 grid and drawn twice as large, so a speck is a soft round grain about a CSS pixel wide. */
const PX = 256;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../../../src/components/lab/landing/film');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One tone's tile: `share` of the grid's cells carry a speck, its strength rising with the noise; `peak` the strongest alpha. */
async function tile(name, seed, [r, g, b], share, peak) {
  const rand = rng(seed);
  const base = new Float32Array(N * N);
  for (let i = 0; i < base.length; i++) {
    const v = rand();
    base[i] = v > 1 - share ? ((v - (1 - share)) / share) ** 0.8 : 0;
  }
  // 3 × 3, enlarged and softened, the middle kept: seamless
  const big = Buffer.alloc(9 * N * N);
  for (let y = 0; y < 3 * N; y++) for (let x = 0; x < 3 * N; x++) big[y * 3 * N + x] = Math.round(base[(y % N) * N + (x % N)] * 255);
  const soft = await sharp(big, { raw: { width: 3 * N, height: 3 * N, channels: 1 } })
    .resize(3 * PX, 3 * PX, { kernel: 'cubic' })
    .blur(0.7)
    .extract({ left: PX, top: PX, width: PX, height: PX })
    .raw()
    .toBuffer();
  let max = 0;
  for (const v of soft) max = Math.max(max, v);
  const rgba = Buffer.alloc(4 * PX * PX);
  for (let i = 0; i < PX * PX; i++) {
    rgba[4 * i] = r;
    rgba[4 * i + 1] = g;
    rgba[4 * i + 2] = b;
    rgba[4 * i + 3] = Math.round((soft[i] / max) * peak * 255);
  }
  const file = join(OUT, `sand-${name}.png`);
  // (no dithering: an error-diffused alpha draws diagonal streaks across the paper)
  await sharp(rgba, { raw: { width: PX, height: PX, channels: 4 } }).png({ palette: true, colours: 16, dither: 0, compressionLevel: 9, effort: 10 }).toFile(file);
  console.log(file);
}

await tile('dark', 5101, [0x17, 0x12, 0x1d], 0.15, 0.36);
// (the pale specks quieter than the dark: on the night's dark paper they are all one sees, and must not read as static)
await tile('light', 5202, [0xff, 0xf7, 0xe8], 0.1, 0.2);
