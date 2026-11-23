/** The stickers the reels show (public/stickers/<pack>/<id>), split into frames by scripts/reels/assets.ts. */
export const STICKERS = [
  'nod/love-this-line',
  'nod/so-moved',
  'nod/thanks-for-sharing',
  'hush/listening',
  'tuck/take-your-time',
  'pip/beautifully-written',
  'pip/hi',
  'twine/for-you',
] as const;

export type StickerName = (typeof STICKERS)[number];
