import type { StickerRef } from '@/lib/stickers/catalog';

/**
 * What a message may carry beyond words, a card and a picture (round 22): a
 * 小紙團 sticker, and an album's place for one of several pictures sent
 * together. Read from stored documents (a reply's quote, an unsend's copy, a
 * report's evidence, the push), so each is taken only in the shape the
 * server writes it — anything else reads as absent.
 */

/** A sticker as a message keeps it: `{ pack, id }` (the ids the catalog's schema takes). */
export function messageStickerOf(value: unknown): StickerRef | null {
  if (!value || typeof value !== 'object') return null;
  const { pack, id } = value as { pack?: unknown; id?: unknown };
  if (typeof pack !== 'string' || !/^[a-z0-9-]{1,32}$/.test(pack)) return null;
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id)) return null;
  return { pack, id };
}

/** One of several pictures sent together: the album's id, this picture's place, how many it has. */
export interface MessageAlbum {
  id: string;
  index: number;
  count: number;
}

/** An album as a message keeps it (`{ id, index, count }`: index 0..count-1, count 2..10). */
export function messageAlbumOf(value: unknown): MessageAlbum | null {
  if (!value || typeof value !== 'object') return null;
  const { id, index, count } = value as { id?: unknown; index?: unknown; count?: unknown };
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) return null;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 2 || count > 10) return null;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= count) return null;
  return { id, index, count };
}

/**
 * The language a sticker's fallback words are written in: the recipient's
 * profile language (`users/{uid}.primaryLocale`) — English for `en`, Chinese
 * for anything else, a profile without one included (the fallback is read by
 * installed builds, which show the words as they are).
 */
export function fallbackLocale(primaryLocale: unknown): 'en' | 'zh-TW' {
  return typeof primaryLocale === 'string' && primaryLocale.toLowerCase().startsWith('en') ? 'en' : 'zh-TW';
}

/**
 * How close one sticker must follow the sender's previous one, a sticker too,
 * to ring without a sound (a run of stickers buzzes once).
 */
export const STICKER_RUN_MS = 10_000;

/**
 * Whether a sticker sent at `sentAtMs` continues a run: the sender's previous
 * message in that conversation (`previous`, null when there is none close
 * enough to have been found) was a sticker too, sent less than STICKER_RUN_MS
 * before it.
 */
export function continuesStickerRun(previous: { sticker: unknown; sentAtMs: number } | null, sentAtMs: number): boolean {
  if (!previous || !messageStickerOf(previous.sticker)) return false;
  const gap = sentAtMs - previous.sentAtMs;
  return gap >= 0 && gap < STICKER_RUN_MS;
}
