/**
 * Contact sheets for the review: every frame of every drawn sticker of a pack, in reading order, from the WebP files
 * themselves (what clients will play) — designs/stickers/review/contact-<pack>.webp. Each sticker's block starts with its
 * hero frame — its thumb, what the picker shows and the thread rests on — on the night paper in a terracotta frame, then
 * the frames of its animation on the day paper, 8 to a row (the first and the last are its key pose).
 *
 *   npx tsx scripts/stickers/contact.ts [pack…]      (render.ts writes the sheet of every pack it rendered)
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { STICKER_PACKS } from '../../src/lib/stickers/catalog';
import { PUBLIC, readHeroes, REVIEW } from './catalog';
import { readWebp } from './pipeline';
import { readFileSync } from 'node:fs';

const CELL = 150;
const COLS = 8;
const HEAD = 30;
const GAP = 14;
/** The two papers a sticker must read on (tokens.css: --paper, and the night page). */
const DAY = { r: 246, g: 240, b: 231 };
const NIGHT = { r: 33, g: 29, b: 25 };
/** The hero cell's frame (terracotta). */
const ACCENT = { r: 196, g: 106, b: 63 };

const esc = (s: string) => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

export async function contactSheet(pack: string): Promise<string | null> {
  const p = STICKER_PACKS.find(x => x.id === pack);
  if (!p) throw new Error(`unknown pack ${pack}`);
  const blocks: { svg: string; items: sharp.OverlayOptions[]; h: number }[] = [];
  for (const st of p.stickers) {
    const file = join(PUBLIC, pack, `${st.id}.webp`);
    if (!existsSync(file)) continue;
    const info = readWebp(readFileSync(file));
    if (!info.animated) continue;
    const { data, info: meta } = await sharp(file, { pages: -1 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ph = meta.pageHeight ?? meta.height;
    const n = Math.round(meta.height / ph);
    const frame = async (i: number) => sharp(data.subarray(i * ph * meta.width * 4, (i + 1) * ph * meta.width * 4), {
      raw: { width: meta.width, height: ph, channels: 4 },
    }).resize(CELL - 6, CELL - 6).png().toBuffer();
    const cells = n + 1;
    const rows = Math.ceil(cells / COLS);
    const items: sharp.OverlayOptions[] = [];
    const thumb = await sharp(join(PUBLIC, pack, `${st.id}.thumb.webp`)).resize(CELL - 14, CELL - 14).png().toBuffer();
    for (let c = 0; c < cells; c++) {
      const x = (c % COLS) * CELL;
      const y = HEAD + Math.floor(c / COLS) * CELL;
      const hero = c === 0;
      if (hero) {
        items.push({ input: { create: { width: CELL - 2, height: CELL - 2, channels: 4, background: { ...ACCENT, alpha: 1 } } }, left: x + 1, top: y + 1 });
        items.push({ input: { create: { width: CELL - 10, height: CELL - 10, channels: 4, background: { ...NIGHT, alpha: 1 } } }, left: x + 5, top: y + 5 });
        items.push({ input: thumb, left: x + 7, top: y + 7 });
        continue;
      }
      items.push({
        input: { create: { width: CELL - 2, height: CELL - 2, channels: 4, background: { ...DAY, alpha: 1 } } },
        left: x + 1, top: y + 1,
      });
      items.push({ input: await frame(c - 1), left: x + 3, top: y + 3 });
    }
    const kb = (readFileSync(file).length / 1024).toFixed(1);
    const hero = readHeroes()[`${pack}/${st.id}`];
    const label = `${pack}/${st.id} · ${st.name['zh-TW']} · ${st.name.en} · ${n} frames · ${(info.durationMs / 1000).toFixed(2)} s · ${kb} KB`
      + (hero != null ? ` · first cell: hero ${hero.toFixed(2)} s = thumb` : '');
    blocks.push({ svg: esc(label), items, h: HEAD + rows * CELL + GAP });
  }
  if (!blocks.length) return null;
  const W = COLS * CELL;
  const H = blocks.reduce((s, b) => s + b.h, 0);
  const comp: sharp.OverlayOptions[] = [];
  let y0 = 0;
  for (const b of blocks) {
    comp.push({
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HEAD}"><text x="6" y="21" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#3a332c">${b.svg}</text></svg>`),
      left: 0, top: y0,
    });
    for (const it of b.items) comp.push({ ...it, top: (it.top ?? 0) + y0 });
    y0 += b.h;
  }
  mkdirSync(REVIEW, { recursive: true });
  const out = join(REVIEW, `contact-${pack}.webp`);
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite(comp).webp({ quality: 82, effort: 5 }).toFile(out);
  return out;
}

if (require.main === module) {
  const packs = process.argv.slice(2);
  (async () => {
    for (const p of packs.length ? packs : STICKER_PACKS.map(x => x.id)) {
      const out = await contactSheet(p);
      if (out) console.log(out);
    }
  })().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
