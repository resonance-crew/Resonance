/**
 * The 小紙團 sticker packs: one pack per paper puppet, the puppet its protagonist (round 22, the owner's choice — people
 * pick a sticker set by its character first). Pack and sticker ids are stored in messages for good (`sticker: { pack,
 * id }`): lowercase `[a-z0-9-]`, never renamed or reused. The order here is the picker's.
 *
 * The art and its numbers are generated (`catalog.generated.ts`, by the sticker pipeline in `scripts/stickers`); what a
 * sticker is called is written here, in both languages, for screen readers, the conversation list, the push and the
 * fallback text installed builds show.
 */
import { STICKER_ART } from './catalog.generated';

export type StickerLocale = 'zh-TW' | 'en';
export type StickerName = Record<StickerLocale, string>;

export interface StickerDef {
  id: string;
  name: StickerName;
}

export interface StickerPackDef {
  id: string;
  /** The puppet who leads the pack: its cast slug (`designs/mascots/cast/<slug>`). */
  hero: 'tuck' | 'tag' | 'card' | 'dot' | 'night';
  name: StickerName;
  stickers: readonly StickerDef[];
}

const s = (id: string, zh: string, en: string): StickerDef => ({ id, name: { 'zh-TW': zh, en } });

export const STICKER_PACKS: readonly StickerPackDef[] = [
  {
    id: 'tuck', hero: 'tuck', name: { 'zh-TW': '摺摺', en: 'Tuck' },
    stickers: [
      s('morning', '早安', 'Good morning'),
      s('deep-thanks', '真的很謝謝你', 'Thank you so much'),
      s('tucked-away', '收到了', "Got it, I'll keep it"),
      s('warm-heart', '心暖暖', 'Warms my heart'),
      s('take-your-time', '慢慢來', 'Take your time'),
      s('glad-youre-here', '有你真好', "Glad you're here"),
    ],
  },
  {
    id: 'twine', hero: 'tag', name: { 'zh-TW': '牽牽', en: 'Twine' },
    stickers: [
      s('anyone-there', '在嗎？', 'Are you there?'),
      s('thanks', '謝謝', 'Thanks'),
      s('for-you', '這是給你的', 'This is for you'),
      s('well-done', '辛苦了', 'You worked hard'),
      s('okay', '好喔', 'Okay'),
      s('resonate', '共振了', 'We resonate'),
    ],
  },
  {
    id: 'nod', hero: 'card', name: { 'zh-TW': '聆聆', en: 'Nod' },
    stickers: [
      s('thanks-for-sharing', '謝謝你願意說', 'Thank you for telling me'),
      s('read-to-the-end', '謝謝你讀到最後', 'Thanks for reading to the end'),
      s('so-moved', '好感動', 'So moved'),
      s('i-understand', '我懂', 'I understand'),
      s('love-this-line', '這句好喜歡', 'Love this line'),
      s('hug', '抱抱', 'Hug'),
    ],
  },
  {
    id: 'pip', hero: 'dot', name: { 'zh-TW': '點點', en: 'Pip' },
    stickers: [
      s('hi', '嗨！', 'Hi!'),
      s('thank-you', '謝謝你！', 'Thank you!'),
      s('beautifully-written', '寫得真好', 'Beautifully written'),
      s('you-got-this', '加油', "You've got this"),
      s('haha', '哈哈', 'Haha'),
      s('congrats', '恭喜', 'Congratulations'),
    ],
  },
  {
    id: 'hush', hero: 'night', name: { 'zh-TW': '悄悄', en: 'Hush' },
    stickers: [
      s('good-night', '晚安', 'Good night'),
      s('teary', '眼眶濕濕的', 'Teary-eyed'),
      s('lit-up', '心裡亮了一下', 'That lit me up'),
      s('im-here', '我在這裡', "I'm here"),
      s('listening', '慢慢說，我在聽', "I'm listening"),
    ],
  },
];

/** What a message names a sticker by. */
export interface StickerRef {
  pack: string;
  id: string;
}

/** A sticker as drawn: its names and its art's numbers. */
export interface Sticker extends StickerDef {
  pack: string;
  /** One play of the animation (the file plays it twice). */
  durationMs: number;
  frames: number;
  /** The files' content version, for their immutable URLs (`?v=`). */
  v: string;
}

/** The catalog's version: bumped whenever a pack or a sticker is added (clients that bundle an older one fetch the rest). */
export const STICKER_CATALOG_VERSION = 1;

/** A sticker by pack and id, or null for one no build knows. */
export function stickerOf(pack: string, id: string): Sticker | null {
  const p = STICKER_PACKS.find((x) => x.id === pack);
  const def = p?.stickers.find((x) => x.id === id);
  if (!p || !def) return null;
  const art = STICKER_ART[`${pack}/${id}`];
  return { ...def, pack, durationMs: art?.durationMs ?? 2000, frames: art?.frames ?? 1, v: art?.v ?? '0' };
}

export function isSticker(pack: unknown, id: unknown): boolean {
  return typeof pack === 'string' && typeof id === 'string' && stickerOf(pack, id) !== null;
}

/** The animated file (two plays, then it rests on its key frame), the static key frame, and a pack's tab icon. */
export function stickerPath(ref: StickerRef, kind: 'anim' | 'thumb' = 'anim'): string {
  const v = stickerOf(ref.pack, ref.id)?.v ?? '0';
  return `/stickers/${ref.pack}/${ref.id}${kind === 'thumb' ? '.thumb' : ''}.webp?v=${v}`;
}
export function stickerPackIconPath(pack: string): string {
  return `/stickers/${pack}/icon.webp?v=${STICKER_ART[`${pack}/icon`]?.v ?? '0'}`;
}

/** A sticker's name in `locale` (zh-TW for anything else). */
export function stickerName(ref: StickerRef, locale: string): string | null {
  const st = stickerOf(ref.pack, ref.id);
  if (!st) return null;
  return locale.startsWith('en') ? st.name.en : st.name['zh-TW'];
}

/**
 * The words a sticker message carries for builds that can't draw it (installed builds draw an empty bubble for an
 * empty text): 〔貼圖：謝謝〕 / [Sticker: Thanks].
 */
export function stickerFallbackText(ref: StickerRef, locale: string): string {
  const en = locale.startsWith('en');
  const name = stickerName(ref, en ? 'en' : 'zh-TW');
  if (en) return name ? `[Sticker: ${name}]` : '[Sticker]';
  return name ? `〔貼圖：${name}〕` : '〔貼圖〕';
}
