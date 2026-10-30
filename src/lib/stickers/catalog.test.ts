import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STICKER_PACKS, isSticker, stickerFallbackText, stickerName, stickerPath } from './catalog';
import { catalogJson } from './catalogJson';

const root = resolve(__dirname, '../../..');

describe('sticker catalog', () => {
  it('names every pack and sticker with ids messages can keep for good', () => {
    const packs = new Set<string>();
    for (const p of STICKER_PACKS) {
      expect(p.id).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(packs.has(p.id)).toBe(false);
      packs.add(p.id);
      const ids = new Set<string>();
      for (const st of p.stickers) {
        expect(st.id).toMatch(/^[a-z0-9-]{1,40}$/);
        expect(ids.has(st.id)).toBe(false);
        ids.add(st.id);
        expect(st.name['zh-TW']).not.toMatch(/。$/);
        expect(st.name.en).not.toMatch(/\.$/);
      }
      expect(p.stickers.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('has every file at its path: the animation, its key frame and each pack icon', () => {
    for (const p of STICKER_PACKS) {
      expect(existsSync(resolve(root, `public/stickers/${p.id}/icon.webp`))).toBe(true);
      for (const st of p.stickers) {
        for (const kind of ['anim', 'thumb'] as const) {
          const path = stickerPath({ pack: p.id, id: st.id }, kind).split('?')[0];
          expect(existsSync(resolve(root, `public${path}`)), path).toBe(true);
        }
      }
    }
  });

  it('tells known stickers from anything else', () => {
    expect(isSticker('nod', 'hug')).toBe(true);
    expect(isSticker('nod', 'nope')).toBe(false);
    expect(isSticker('__proto__', 'hug')).toBe(false);
    expect(isSticker(1, 'hug')).toBe(false);
  });

  it('gives installed builds words for a sticker, in the reader’s language', () => {
    expect(stickerFallbackText({ pack: 'twine', id: 'thanks' }, 'zh-TW')).toBe('〔貼圖：謝謝〕');
    expect(stickerFallbackText({ pack: 'twine', id: 'thanks' }, 'en')).toBe('[Sticker: Thanks]');
    expect(stickerName({ pack: 'hush', id: 'good-night' }, 'en-GB')).toBe('Good night');
  });

  it('keeps public/stickers/catalog.json current (npx tsx scripts/stickers/catalog-json.ts)', () => {
    expect(readFileSync(resolve(root, 'public/stickers/catalog.json'), 'utf8')).toBe(catalogJson());
  });
});
