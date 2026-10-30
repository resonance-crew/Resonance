import { STICKER_ART } from './catalog.generated';
import { STICKER_CATALOG_VERSION, STICKER_PACKS, stickerOf } from './catalog';

/** The catalog as `public/stickers/catalog.json` holds it (scripts/stickers/catalog-json.ts writes it). */
export function catalogJson(): string {
  const packs = STICKER_PACKS.map((p) => ({
    id: p.id,
    hero: p.hero,
    name: p.name,
    icon: `${p.id}/icon.webp`,
    iconV: STICKER_ART[`${p.id}/icon`]?.v ?? '0',
    stickers: p.stickers.map((d) => {
      const st = stickerOf(p.id, d.id)!;
      return { id: st.id, name: st.name, durationMs: st.durationMs, frames: st.frames, v: st.v };
    }),
  }));
  return `${JSON.stringify({ version: STICKER_CATALOG_VERSION, packs }, null, 1)}\n`;
}
