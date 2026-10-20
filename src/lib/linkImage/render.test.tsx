import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { Card, User } from '@/lib/db/types';
import { fontCoverage } from './cmap';
import { MISSING, OG_FONT_DIR, allFonts, drawable, fontsFor, latinFonts } from './fonts';
import { coverVersion, drawnCard, drawnCardVersion, type DrawnCard } from './model';
import { drawnCardElement, renderDrawnCard } from './render';
import { imageVersion } from './version';

// The link-preview image of a card without a cover: what it draws, from what,
// and — for an anonymous card — what it never draws. Rendering itself (satori,
// the JPEG) is covered by the route's suite (src/app/api/og/card), except that
// a render never reaches the network for a glyph.

const STORAGE = ['https://img.example'];
const PHOTO = 'https://img.example/avatar/2026-10/0b9c6a2e-1f43-4c55-9d8e-2a1c3b4d5e6f.webp';

const card = (extra: Partial<Card> = {}): Card => ({
  id: 'card1',
  authorId: 'uid-author',
  slug: 'grandmas-plums',
  thoughtCore: '外婆的醃梅子',
  story: '每年五月，外婆都會把青梅一顆顆擦乾，排在竹篩上曬。\n\n她說梅子要曬過太陽才會甜，人也是。',
  tags: ['family'],
  originalLocale: 'zh-TW',
  translations: {},
  visibility: 'public',
  publishedAt: new Date('2026-10-10T03:00:00Z'),
  readCount: 0,
  resonanceCount: 0,
  inviteCount: 0,
  ...extra,
});

const author: User = {
  id: 'uid-author',
  handle: 'quiet-walker',
  region: 'Taipei',
  primaryLocale: 'zh-TW',
  autoTranslateTo: [],
  verified: true,
  phoneHash: '',
  avatarSeed: '41',
  initials: 'QW',
  avatarUrl: PHOTO,
  accentColor: 'oklch(88% 0.08 55)',
  joinedAt: new Date(),
  handleChangedAt: new Date(),
};

/** Every string the image would draw and every attribute it carries, function components expanded as satori expands them. */
function everything(node: ReactNode, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => everything(n, out));
    return out;
  }
  if (isValidElement(node)) {
    const el = node as ReactElement<Record<string, unknown>>;
    if (typeof el.type === 'function') return everything((el.type as (p: unknown) => ReactNode)(el.props), out);
    for (const [key, value] of Object.entries(el.props)) {
      if (key === 'children') everything(value as ReactNode, out);
      else out.push(typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    out.push(`<${String(el.type)}>`);
  }
  return out;
}

const drawnTexts = (m: DrawnCard) => ({
  title: m.title,
  opening: m.opening,
  name: m.byline.name,
  initials: m.byline.anonymous ? '·' : m.byline.initials,
  date: m.date ?? '',
});

describe('what a card without a cover is drawn from', () => {
  it("draws a named card's title, opening, pen name, initials, photo and day, in its story's script", () => {
    const m = drawnCard(card(), author, STORAGE);
    expect(m).toMatchObject({
      id: 'card1',
      script: 'cjk',
      title: '外婆的醃梅子',
      opening: '每年五月，外婆都會把青梅一顆顆擦乾，排在竹篩上曬。\n她說梅子要曬過太陽才會甜，人也是。',
      date: '2026年10月10日',
      byline: { anonymous: false, name: 'quiet-walker', initials: 'QW', avatarSeed: 41, avatarUrl: PHOTO },
    });
    const latin = drawnCard(card({ thoughtCore: 'Plums', story: 'Every May my grandmother dried the plums.' }), author, STORAGE);
    expect(latin).toMatchObject({ script: 'latin', date: 'Oct 10, 2026' });
  });

  it('takes a photo only from our own storage, and initials from the pen name when none are stored', () => {
    expect(drawnCard(card(), { ...author, avatarUrl: 'https://elsewhere.example/me.png' }, STORAGE).byline).toMatchObject({ avatarUrl: null });
    expect(drawnCard(card(), { ...author, initials: '', avatarSeed: '' }, STORAGE).byline).toMatchObject({ initials: 'Q', avatarSeed: 'Q'.charCodeAt(0) * 13 });
  });

  it("wears the card's own family — its cover's hue, else its id's — and its id's wobble", () => {
    expect(drawnCard(card({ accentHue: 214 }), author).palette).toBe(4);
    expect(drawnCard(card({ id: 'card1' }), author).seed).toBe(drawnCard(card({ id: 'card1' }), null).seed);
    expect(drawnCard(card({ id: 'card2' }), author).seed).not.toBe(drawnCard(card({ id: 'card1' }), author).seed);
  });

  it('has a version of its own, apart from a cover\'s', () => {
    const m = drawnCard(card(), author, STORAGE);
    expect(drawnCardVersion(m)).toBe(drawnCardVersion(drawnCard(card(), author, STORAGE)));
    expect(drawnCardVersion(m)).toMatch(/^[0-9a-z]+$/);
    expect(coverVersion(PHOTO)).not.toBe(imageVersion(PHOTO));
  });
});

describe('an anonymous card', () => {
  const anonymous = card({ anonymous: true });

  it('is drawn without its author, whatever it is handed', () => {
    for (const handed of [author, null]) {
      const m = drawnCard(anonymous, handed, STORAGE);
      expect(m.byline).toEqual({ anonymous: true, name: '匿名' });
      const json = JSON.stringify(m);
      for (const secret of ['quiet-walker', 'QW', PHOTO, 'Taipei', '"41"']) expect(json).not.toContain(secret);
    }
    expect(drawnCard({ ...anonymous, thoughtCore: 'Plums', story: 'Every May.' }, author).byline).toEqual({ anonymous: true, name: 'Anonymous' });
  });

  // The rendered input — every string and attribute satori is handed — holds no pen name, avatar,
  // initials, region flag or verified mark.
  it("says 匿名 over the neutral avatar, and nothing that names its author", () => {
    const m = drawnCard(anonymous, author, STORAGE);
    const drawn = everything(drawnCardElement(m, drawnTexts(m), null));
    expect(drawn).toContain('匿名');
    expect(drawn).toContain('·');
    expect(drawn).not.toContain('<img>');
    const all = drawn.join('\n');
    for (const secret of ['quiet-walker', 'QW', PHOTO, 'avatar/', 'Taipei', 'flags/', '已驗證', 'Verified', 'uid-author']) {
      expect(all).not.toContain(secret);
    }
  });

  it('draws a named card with what names its author, for contrast', () => {
    const m = drawnCard(card(), author, STORAGE);
    const drawn = everything(drawnCardElement(m, drawnTexts(m), 'data:image/png;base64,AAAA'));
    expect(drawn).toContain('quiet-walker');
    expect(drawn).toContain('<img>');
    // The photo is drawn, so the initials aren't.
    expect(drawn).not.toContain('QW');
    expect(everything(drawnCardElement(m, drawnTexts(m), null))).toContain('QW');
  });
});

describe("the image's fonts", () => {
  const file = (name: string) => readFileSync(join(OG_FONT_DIR, name));

  it('knows what each face draws from its cmap', () => {
    const dm = fontCoverage(file('DMSans-Regular.ttf'));
    expect(dm.has('A'.codePointAt(0)!)).toBe(true);
    expect(dm.has('中'.codePointAt(0)!)).toBe(false);
    const sans = fontCoverage(file('NotoSansTC-Regular.ttf'));
    for (const ch of '外婆的醃梅子，。「」□…') expect(sans.has(ch.codePointAt(0)!), ch).toBe(true);
    // Big5 level 2, kana, Hangul and emoji are beyond the subset.
    for (const ch of ['喆', 'あ', '한', '😀']) expect(sans.has(ch.codePointAt(0)!), ch).toBe(false);
  });

  it('loads the Latin faces as a set of their own: Playfair 700 (lining figures, renamed) and DM Sans 400 and 600', async () => {
    const latin = await latinFonts();
    expect(latin.fonts.map((f) => [f.name, f.weight])).toEqual([
      ['Share Display', 700],
      ['Body', 400],
      ['Body', 600],
    ]);
  });

  it("leaves out what no face draws, so satori never sends for a glyph (next/og would ask Google Fonts or a CDN)", async () => {
    const { coverage } = await allFonts();
    expect(drawable('我想起喆和堃 😀 👨‍👩‍👧 한글 カナ ok', coverage)).toBe(`我想起${MISSING}和${MISSING}   ${MISSING}${MISSING} ${MISSING}${MISSING} ok`);
    expect(drawable('第一段\n第二段', coverage)).toBe('第一段\n第二段');
  });

  it('draws a space no face draws as a plain one, any line break as a line feed, and drops a byte-order mark', async () => {
    const latin = (await latinFonts()).coverage;
    expect(drawable('A\u3000title', latin)).toBe('A title');
    expect(drawable('Odd\uFEFFspace', latin)).toBe('Oddspace');
    expect(drawable('Line\u2028sep\u2029end\r\nnext\rlast', latin)).toBe('Line\nsep\nend\nnext\nlast');
    expect(drawable('Ogham\u1680mark\vtab\ffeed\there', latin)).toBe('Ogham mark tab feed here');
    // A space a face draws stays as it is: the CJK faces draw the ideographic space.
    expect(drawable('外婆\u3000的梅子', (await allFonts()).coverage)).toBe('外婆\u3000的梅子');
    // And a space alone never asks for the CJK faces.
    const set = await fontsFor({ title: 'A\u3000title' });
    expect(set.fonts.map((f) => f.name)).not.toContain('Story Sans');
    expect(set.texts.title).toBe('A title');
  });

  it('reads the CJK faces only for words that need them', async () => {
    const latin = await fontsFor({ title: 'Plums 2024', name: 'mira' });
    expect(latin.fonts.map((f) => f.name)).not.toContain('Story Sans');
    expect(latin.texts).toEqual({ title: 'Plums 2024', name: 'mira' });
    const cjk = await fontsFor({ title: '外婆的醃梅子 😀', name: 'mira' });
    expect(cjk.fonts.map((f) => f.name)).toEqual(expect.arrayContaining(['Story Serif', 'Story Sans', 'Share Display', 'Body']));
    expect(cjk.texts.title).toBe('外婆的醃梅子 ');
  });
});

// next/og hands satori a loader that fetches a glyph no font has from Google Fonts (font CSS,
// then the font) in the middle of the render, with no deadline. Satori asks for every grapheme
// but a tab and a line feed, spaces included: a space no face draws — an ideographic space
// typed from a Chinese IME into a Latin title, a BOM pasted along, a line separator — must not
// reach it either.
describe('a render', () => {
  afterEach(() => vi.unstubAllGlobals());

  const LATIN_STORY = 'Every May my grandmother dried the plums on a bamboo tray.';
  // A Latin card is drawn with the Latin faces alone, a CJK one with all of them.
  const titles: [string, string, string][] = [
    ['an ideographic space in a Latin title', 'A\u3000title', LATIN_STORY],
    ['a byte-order mark', 'Odd\uFEFFspace', LATIN_STORY],
    ['a line separator', 'Line\u2028sep', LATIN_STORY],
    ['a paragraph separator in a CJK title', '外婆\u2029的梅子', card().story],
    ['thin, narrow and medium mathematical spaces', 'Thin\u2009space\u202Fnarrow\u205Fmath', LATIN_STORY],
    ['the en quad to the hair space', 'Spaces\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u200Aend', LATIN_STORY],
    ['an Ogham space mark', 'Ogham\u1680mark', LATIN_STORY],
    ['a vertical tab, a form feed and a CRLF', 'Tab\vfeed\fline\r\nend', LATIN_STORY],
    ['a no-break space and a tab', 'No\u00A0break\there', LATIN_STORY],
  ];

  it.each(titles)('never sends for a glyph: %s', async (_, title, story) => {
    const sent = vi.fn(async (input: unknown) => {
      throw new Error(`no network in a render: ${String(input)}`);
    });
    vi.stubGlobal('fetch', sent);
    const jpeg = await renderDrawnCard(drawnCard(card({ thoughtCore: title, story }), author, STORAGE)).catch((e: unknown) => e);
    expect(sent.mock.calls.map(([input]) => String(input))).toEqual([]);
    expect(jpeg).toBeInstanceOf(Buffer);
    expect(await sharp(jpeg as Buffer).metadata()).toMatchObject({ format: 'jpeg', width: 1200, height: 630 });
  }, 30_000);
});
