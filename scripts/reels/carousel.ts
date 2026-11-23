/**
 * Makes the weekly 那句留下來的話 carousel: four 1080 × 1350 JPEGs from a JSON
 * file shaped like `Passage` (scripts/reels/page/carousel.ts) — only a public,
 * named card, and only with its author's yes.
 *
 *   npx tsx scripts/reels/carousel.ts ../Resonance-marketing/instagram/<week>/passage.json [--out <dir>]
 *
 * Without a file it renders the sample (小夏's 搬家後的第一個晚上), for checking the look.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const file = argv[0] && !argv[0].startsWith('--') ? resolve(argv[0]) : null;
const out = resolve(ROOT, argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : file ? dirname(file) : '../Resonance-marketing/instagram/sample');
const data = file ? JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))) : null;

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], cwd: ROOT });
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
}

const tmp = mkdtempSync(join(tmpdir(), 'carousel-'));
try {
  run('npx', ['tsx', 'scripts/reels/assets.ts']);
  const query = `reel=passage${data ? `&data=${encodeURIComponent(data)}` : ''}`;
  run('npx', ['tsx', 'scripts/promo/render.ts', '--page', 'scripts/reels/page', '--size', '1080x1350', '--query', query, '--name', 'slide', '--locale', 'zh-TW', '--stills', '0,1,2,3', '--stills-dir', tmp]);
  mkdirSync(out, { recursive: true });
  for (let i = 0; i < 4; i++) {
    const jpg = join(out, `carousel-${i + 1}.jpg`);
    run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', join(tmp, `slide-zh-TW-${i}.00.png`), '-q:v', '2', jpg]);
    console.log(jpg);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
