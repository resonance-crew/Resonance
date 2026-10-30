/**
 * Renders the 小紙團 stickers: each choreography (designs/stickers/<pack>/<id>.ts) drawn frame by frame in headless Chrome
 * with its own clock (the page is a pure function of t), at 2×, scaled to 432 px, given its cream die-cut margin, and
 * encoded as an animated WebP that plays twice and rests on its key frame.
 *
 *   npm run stickers -- [pack | pack/id | pack/icon …] [--serve [port]]
 *
 * With no target every pack is rendered (the stickers that have a choreography, and each pack's icon). Writes
 *   public/stickers/<pack>/<id>.webp        432 × 432, 12 fps, lossy q 80 (stepping down to 68 to keep near 120 KB),
 *                                           loop count 2, first frame = last frame = the key pose; past 200 KB it fails
 *   public/stickers/<pack>/<id>.thumb.webp  the hero frame (the definition's `hero`, what the sticker means at a
 *                                           glance: the picker shows it, the thread rests on it), 256 × 256, still
 *   public/stickers/<pack>/icon.webp        the pack's tab icon, 96 × 96 (designs/stickers/<pack>/icon.ts, else the
 *                                           hero's head)
 *   src/lib/stickers/catalog.generated.ts, public/stickers/catalog.json, designs/stickers/review/data.js (catalog.ts)
 *   designs/stickers/review/contact-<pack>.webp (contact.ts)
 *
 * --out <dir> writes the files there instead (no catalog, no contact sheet): with it a target may be a path to a draft
 * choreography (`designs/stickers/tuck/morning.ts`, or any `<pack>/<id>.ts`). --fast tries one quality with a quick
 * encoder — to try things, never for the files committed.
 *
 * --frames <dir> also writes every frame (after the die-cut) as a PNG there, to look at closely.
 *
 * --serve plays the targets live in a browser instead (http://localhost:<port>/, day and night paper), for working on
 * a choreography; nothing is written.
 *
 * Needs Chrome (CHROME_PATH) and img2webp (libwebp).
 */
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { build } from 'esbuild';
import sharp from 'sharp';
import { STICKER_PACKS } from '../../src/lib/stickers/catalog';
import { HEROES, writeCatalog } from './catalog';
import { launchChrome, openPage, type Browser } from './chrome';
import { contactSheet } from './contact';
import {
  checkDuration, dieCut, frameDiff, frameDurations, ICON, SIZE, SIZE_CAP, SIZE_TARGET, sampleTimes, sizeVerdict, THUMB,
  touchesEdge,
} from './pipeline';

const ROOT = resolve(__dirname, '../..');
const DESIGNS = join(ROOT, 'designs/stickers');
const PARTS = join(DESIGNS, 'parts');
const KIT = join(DESIGNS, 'kit/scene.ts');
const PUBLIC = join(ROOT, 'public/stickers');
/** Lossy qualities tried in turn until the file is within the target (never below the last). */
const QUALITIES = [80, 74, 68];
/** The die-cut margin at 432 px; the icon's is wider, as it is drawn 4.5× smaller. */
const MARGIN = 2.5;
const ICON_MARGIN = 7;

interface Job {
  pack: string;
  /** A sticker id, or 'icon'. */
  id: string;
  /** The module whose default export is the sticker (null: the default icon, the hero's head). */
  file: string | null;
  hero: string;
}

function jobs(targets: string[]): Job[] {
  const out: Job[] = [];
  const want = targets.length ? targets : STICKER_PACKS.map(p => p.id);
  for (const t of want) {
    if (t.endsWith('.ts')) {
      // a draft outside the packs (with --out): named after its folder and file
      const file = resolve(t);
      const pack = basename(dirname(file));
      out.push({ pack, id: basename(file, '.ts'), file, hero: STICKER_PACKS.find(p => p.id === pack)?.hero ?? 'tuck' });
      continue;
    }
    const [pack, id] = t.split('/');
    const p = STICKER_PACKS.find(x => x.id === pack);
    if (!p) throw new Error(`unknown pack ${pack}`);
    const ids = id ? [id] : [...p.stickers.map(s => s.id), 'icon'];
    for (const sid of ids) {
      if (sid !== 'icon' && !p.stickers.some(s => s.id === sid)) throw new Error(`unknown sticker ${pack}/${sid}`);
      const file = join(DESIGNS, pack, `${sid}.ts`);
      if (sid !== 'icon' && !existsSync(file)) {
        if (id) throw new Error(`no choreography at ${file}`);
        continue;
      }
      out.push({ pack, id: sid, file: existsSync(file) ? file : null, hero: p.hero });
    }
  }
  return out;
}

async function bundle(job: Job, live = false): Promise<string> {
  const entry = job.file
    ? `import def from ${JSON.stringify(job.file)};\nimport { mount } from ${JSON.stringify(KIT)};\nmount(def);`
    : `import { iconSticker, mount } from ${JSON.stringify(KIT)};\nmount(iconSticker(${JSON.stringify(job.hero)}));`;
  const r = await build({
    stdin: { contents: entry + (live ? LIVE : ''), resolveDir: ROOT, loader: 'ts', sourcefile: `${job.pack}-${job.id}.ts` },
    bundle: true, format: 'iife', target: 'chrome120', write: false, logLevel: 'warning', tsconfig: join(ROOT, 'tsconfig.json'),
  });
  return r.outputFiles[0].text;
}

/** --serve: the sticker plays on its own clock, on twos, on the paper the page's ?bg says. */
const LIVE = `
const s = window.__sticker;
const bg = new URLSearchParams(location.search).get('bg');
document.body.style.background = bg === 'night' ? 'oklch(20.5% 0.0084 62)' : 'oklch(96.5% 0.015 75)';
s.ready.then(() => { const t0 = performance.now(); let last = -1;
  const tick = () => { const t = ((performance.now() - t0) / 1000) % s.duration; const f = Math.floor(t * 12);
    if (f !== last) { last = f; s.renderAt(f / 12); } requestAnimationFrame(tick); };
  tick(); });
`;

const MIME: Record<string, string> = { '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };

function serve(pages: Map<string, string>, port = 0): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (url === '/' && pages.size) {
      const links = [...pages.keys()].map(k => `<p>${k}: <a href="/page/${k}.html">day</a> · <a href="/page/${k}.html?bg=night">night</a></p>`);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset=utf-8><body style="font:16px system-ui">${links.join('')}`);
      return;
    }
    const page = /^\/page\/(.+)\.(html|js)$/.exec(url);
    if (page && pages.has(page[1])) {
      if (page[2] === 'js') res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end(pages.get(page[1]));
      else res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><meta charset="utf-8"></head><body><script src="/page/${page[1]}.js"></script></body></html>`);
      return;
    }
    if (url.startsWith('/parts/')) {
      const file = join(PARTS, url.slice('/parts/'.length));
      if (file.startsWith(PARTS) && existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
        return;
      }
    }
    res.writeHead(404).end();
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => {
    const a = server.address();
    ok({ server, origin: `http://127.0.0.1:${typeof a === 'object' && a ? a.port : port}` });
  }));
}

const key = (j: Job) => `${j.pack}-${j.id}`;

/** Each sticker's hero time, for the review page and the contact sheets (designs/stickers/review/heroes.json). */
function recordHero(job: Job, hero: number): void {
  const all = existsSync(HEROES) ? (JSON.parse(readFileSync(HEROES, 'utf8')) as Record<string, number>) : {};
  all[`${job.pack}/${job.id}`] = Math.round(hero * 1000) / 1000;
  const sorted = Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(HEROES, `${JSON.stringify(sorted, null, 1)}\n`);
}

/** One frame: the page's 864 px shot, scaled to 432, die-cut. Straight RGBA. */
async function shoot(png: Buffer, margin: number): Promise<Uint8Array> {
  const { data } = await sharp(png).ensureAlpha().resize(SIZE, SIZE, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  return dieCut(new Uint8Array(data.buffer, data.byteOffset, data.length), SIZE, SIZE, { radius: margin });
}
const png = (rgba: Uint8Array, size = SIZE) => sharp(Buffer.from(rgba), { raw: { width: size, height: size, channels: 4 } });

interface Options {
  /** Where the files go: public/stickers, or a draft folder (--out). */
  out: string;
  /** Write every frame there too (--frames). */
  dump: string | null;
  /** One quality, a quicker encoder (--fast): for trying a choreography, never for the files committed. */
  fast: boolean;
}

async function renderJob(browser: Browser, origin: string, job: Job, o: Options): Promise<string> {
  const { dump } = o;
  const OUT = o.out;
  const page = await openPage(browser.cdp, `${origin}/page/${key(job)}.html`, { width: SIZE, height: SIZE, dpr: 2 });
  try {
    for (let i = 0; i < 200 && !(await page.eval<boolean>('typeof window.__sticker === "object"')); i++) await new Promise(r => setTimeout(r, 50));
    await page.eval('window.__sticker.ready');
    const duration = await page.eval<number>('window.__sticker.duration');
    const hero = await page.eval<number>('window.__sticker.hero');
    const tmp = mkdtempSync(join(tmpdir(), `sticker-${key(job)}-`));
    try {
      if (job.id === 'icon') {
        await page.eval('window.__sticker.renderAt(0)');
        const rgba = await shoot(await page.shot(), ICON_MARGIN);
        mkdirSync(join(OUT, job.pack), { recursive: true });
        const out = join(OUT, job.pack, 'icon.webp');
        await png(rgba).resize(ICON, ICON, { kernel: 'lanczos3' }).webp({ quality: 90, alphaQuality: 95, effort: 6 }).toFile(out);
        return `${job.pack}/icon: ${(statSync(out).size / 1024).toFixed(1)} KB`;
      }
      if (o.out === PUBLIC) checkDuration(duration);
      const times = sampleTimes(duration);
      const frames: Uint8Array[] = [];
      for (const t of times) {
        await page.eval(`window.__sticker.renderAt(${t})`);
        const rgba = await shoot(await page.shot(), MARGIN);
        if (dump) {
          mkdirSync(join(dump, key(job)), { recursive: true });
          await png(rgba).png().toFile(join(dump, key(job), `t${t.toFixed(3)}.png`));
        }
        if (touchesEdge(rgba, SIZE, SIZE)) {
          const at = join(tmpdir(), `sticker-edge-${key(job)}.png`);
          await png(rgba).png().toFile(at);
          throw new Error(`${job.pack}/${job.id}: the frame at ${t.toFixed(3)} s touches the canvas edge — keep everything 6 px inside (${at})`);
        }
        frames.push(rgba);
      }
      // the end: t = duration must be the key pose again (the file shows frame 0 there; a different pose would jump)
      await page.eval(`window.__sticker.renderAt(${duration})`);
      const end = await shoot(await page.shot(), MARGIN);
      const seam = frameDiff(end, frames[0]);
      if (seam > 0.02) throw new Error(`${job.pack}/${job.id}: t = ${duration} is not the key pose (${(seam * 100).toFixed(1)}% of pixels differ from t = 0)`);
      // the hero frame: what the sticker means at a glance — its thumb (the picker, and the thread once it has played)
      if (!(hero >= 0 && hero <= duration)) throw new Error(`${job.pack}/${job.id}: hero ${hero} is not within 0–${duration} s`);
      await page.eval(`window.__sticker.renderAt(${hero})`);
      const heroFrame = await shoot(await page.shot(), MARGIN);
      if (frameDiff(heroFrame, frames[0]) < 0.01) {
        throw new Error(`${job.pack}/${job.id}: hero ${hero} s is the key pose — pick the moment that says what the sticker means`);
      }
      const files: string[] = [];
      for (const [i, f] of [...frames, frames[0]].entries()) {
        const file = join(tmp, `f${String(i).padStart(3, '0')}.png`);
        await png(f).png({ compressionLevel: 3 }).toFile(file);
        files.push(file);
      }
      const durations = frameDurations(files.length);
      let best: { q: number; file: string; bytes: number } | null = null;
      for (const q of o.fast ? QUALITIES.slice(0, 1) : QUALITIES) {
        const file = join(tmp, `q${q}.webp`);
        const args = ['-loop', '2', '-lossy', '-q', String(q), '-m', o.fast ? '2' : '6'];
        files.forEach((f, i) => args.push('-d', String(durations[i]), f));
        execFileSync('img2webp', [...args, '-o', file], { stdio: ['ignore', 'ignore', 'pipe'] });
        const bytes = statSync(file).size;
        if (!best || bytes < best.bytes) best = { q, file, bytes };
        if (bytes <= SIZE_TARGET) break;
      }
      const verdict = sizeVerdict(best!.bytes);
      if (verdict === 'over-cap') throw new Error(`${job.pack}/${job.id}: ${(best!.bytes / 1024).toFixed(1)} KB is past the ${SIZE_CAP / 1024} KB cap — simplify the motion or hold more frames`);
      mkdirSync(join(OUT, job.pack), { recursive: true });
      renameSync(best!.file, join(OUT, job.pack, `${job.id}.webp`));
      await png(heroFrame).resize(THUMB, THUMB, { kernel: 'lanczos3' })
        .webp({ quality: 84, alphaQuality: 90, effort: 6 }).toFile(join(OUT, job.pack, `${job.id}.thumb.webp`));
      const thumb = statSync(join(OUT, job.pack, `${job.id}.thumb.webp`)).size;
      const warn = verdict === 'over-target' ? `  (over the ${SIZE_TARGET / 1024} KB target)` : '';
      if (OUT === PUBLIC) recordHero(job, hero);
      return `${job.pack}/${job.id}: ${files.length} frames, ${(durations.reduce((a, b) => a + b, 0) / 1000).toFixed(2)} s, ` +
        `${(best!.bytes / 1024).toFixed(1)} KB at q ${best!.q}, thumb (hero ${hero.toFixed(2)} s) ${(thumb / 1024).toFixed(1)} KB${warn}`;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  } finally {
    await page.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const si = argv.indexOf('--serve');
  const live = si >= 0;
  const port = live && argv[si + 1] && /^\d+$/.test(argv[si + 1]) ? Number(argv[si + 1]) : 0;
  const valueOf = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  const taken = new Set(['--frames', '--out'].map(f => argv.indexOf(f)).filter(i => i >= 0).map(i => i + 1));
  if (live && port) taken.add(si + 1);
  const dump = valueOf('--frames');
  const outDir = valueOf('--out');
  const o: Options = { out: outDir ? resolve(outDir) : PUBLIC, dump: dump ? resolve(dump) : null, fast: argv.includes('--fast') };
  const targets = argv.filter((a, i) => !a.startsWith('--') && !taken.has(i));
  if (targets.some(t => t.endsWith('.ts')) && !outDir) throw new Error('a draft (a .ts path) renders only with --out <dir>');
  const list = jobs(targets);
  if (!list.length) throw new Error('nothing to render: no choreography found');
  const pages = new Map<string, string>();
  for (const j of list) pages.set(key(j), await bundle(j, live));
  const { server, origin } = await serve(pages, live ? port || 3221 : 0);
  if (live) {
    console.log(`playing at ${origin}/ (Ctrl-C to stop)`);
    return;
  }
  const browser = await launchChrome();
  const failures: string[] = [];
  try {
    for (const j of list) {
      try {
        console.log(await renderJob(browser, origin, j, o));
      } catch (e) {
        failures.push((e as Error).message);
        console.error(`FAILED ${(e as Error).message}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (o.out !== PUBLIC) {
    if (failures.length) process.exit(1);
    return;
  }
  writeCatalog();
  for (const pack of new Set(list.map(j => j.pack))) {
    const out = await contactSheet(pack);
    if (out) console.log(`contact sheet: ${out.replace(ROOT + '/', '')}`);
  }
  if (failures.length) {
    console.error(`\n${failures.length} failed:\n${failures.join('\n')}`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
