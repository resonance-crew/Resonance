import { describe, expect, it } from 'vitest';
import { STICKER_PACKS, stickerFallbackText } from '@/lib/stickers/catalog';
import { STICKER_RUN_MS, continuesStickerRun, fallbackLocale, messageAlbumOf, messageStickerOf } from './messageParts';

// What a stored message carries beyond words, a card and a picture (round 22),
// read back as the server wrote it — and only so: a reply's quote, an unsend's
// copy, a report's evidence and the push all go through these.

describe('messageStickerOf', () => {
  it('reads every sticker of the catalog back as its pack and id, and nothing beside them', () => {
    for (const pack of STICKER_PACKS) {
      for (const sticker of pack.stickers) {
        expect(messageStickerOf({ pack: pack.id, id: sticker.id, extra: 1 })).toEqual({ pack: pack.id, id: sticker.id });
      }
    }
  });

  it('reads anything else as no sticker', () => {
    for (const value of [null, undefined, true, 'twine/thanks', {}, { pack: 'twine' }, { id: 'thanks' }, { pack: 'Twine', id: 'thanks' },
      { pack: 'twine', id: 'a/b' }, { pack: 'twine', id: '' }, { pack: 'x'.repeat(33), id: 'thanks' }, { pack: 'twine', id: 7 }]) {
      expect(messageStickerOf(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe('messageAlbumOf', () => {
  const id = 'album-0123456789abcdef';

  it('reads a place in an album of 2 to 10 pictures', () => {
    expect(messageAlbumOf({ id, index: 0, count: 2 })).toEqual({ id, index: 0, count: 2 });
    expect(messageAlbumOf({ id, index: 9, count: 10, more: true })).toEqual({ id, index: 9, count: 10 });
  });

  it('reads anything else as no album', () => {
    for (const value of [null, 'album', { id, index: 2, count: 2 }, { id, index: -1, count: 2 }, { id, index: 0, count: 1 },
      { id, index: 0, count: 11 }, { id, index: 0.5, count: 2 }, { id: 'short', index: 0, count: 2 }, { id, index: '0', count: 2 }]) {
      expect(messageAlbumOf(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe('fallbackLocale', () => {
  it('writes a sticker\'s fallback in English for an English profile, Chinese for any other or none', () => {
    expect(fallbackLocale('en')).toBe('en');
    expect(fallbackLocale('en-GB')).toBe('en');
    expect(fallbackLocale('zh-TW')).toBe('zh-TW');
    expect(fallbackLocale(undefined)).toBe('zh-TW');
    expect(fallbackLocale(42)).toBe('zh-TW');
    expect(stickerFallbackText({ pack: 'twine', id: 'thanks' }, fallbackLocale('en'))).toBe('[Sticker: Thanks]');
    expect(stickerFallbackText({ pack: 'twine', id: 'thanks' }, fallbackLocale(null))).toBe('〔貼圖：謝謝〕');
  });
});

describe('continuesStickerRun', () => {
  const sticker = { pack: 'pip', id: 'haha' };

  it('is a run when the sender\'s previous message was a sticker sent less than ten seconds before', () => {
    expect(continuesStickerRun({ sticker, sentAtMs: 1_000 }, 1_000)).toBe(true);
    expect(continuesStickerRun({ sticker, sentAtMs: 1_000 }, 1_000 + STICKER_RUN_MS - 1)).toBe(true);
  });

  it('is no run ten seconds on, after words, with nothing before it, or out of order', () => {
    expect(STICKER_RUN_MS).toBe(10_000);
    expect(continuesStickerRun({ sticker, sentAtMs: 1_000 }, 1_000 + STICKER_RUN_MS)).toBe(false);
    expect(continuesStickerRun({ sticker: undefined, sentAtMs: 1_000 }, 2_000)).toBe(false);
    expect(continuesStickerRun(null, 2_000)).toBe(false);
    expect(continuesStickerRun({ sticker, sentAtMs: 3_000 }, 2_000)).toBe(false);
  });
});
