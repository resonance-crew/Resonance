import { describe, expect, it } from 'vitest';
import { coverThumbKey, coverThumbUrl } from './coverThumb';
import { coverThumbOf } from '@/lib/api/v1/present';

// A cover's ≤ 960 px copy is found from the cover's own URL (B2): the same base, the same name with -w960.webp.
const BASES = ['https://img.resonance.channel', 'https://pub-old.r2.dev'];

describe('a cover’s copy', () => {
  it('is named after the cover, on the base the cover is on, older keys included', () => {
    expect(coverThumbKey('image/2026-11/0b6e.webp')).toBe('image/2026-11/0b6e-w960.webp');
    expect(coverThumbKey('image/uid123/2025-09/a.avif')).toBe('image/uid123/2025-09/a-w960.webp');
    expect(coverThumbUrl('https://img.resonance.channel/image/2026-11/x.webp', BASES)).toBe('https://img.resonance.channel/image/2026-11/x-w960.webp');
    expect(coverThumbUrl('https://pub-old.r2.dev/image/2026-01/y.png', BASES)).toBe('https://pub-old.r2.dev/image/2026-01/y-w960.webp');
  });

  it('is none for a picture that is not ours, not an image key, or already a copy', () => {
    expect(coverThumbUrl('https://images.unsplash.com/image/2026-11/x.webp', BASES)).toBeNull();
    expect(coverThumbUrl('https://img.resonance.channel/chat/2026-11/x.webp', BASES)).toBeNull();
    expect(coverThumbKey('image/2026-11/x-w960.webp')).toBeNull();
    expect(coverThumbUrl(null, BASES)).toBeNull();
  });

  it('is what FeedCard.imageThumbUrl answers: the kept one when ours, else the derived one, never a video’s', () => {
    const url = 'https://img.resonance.channel/image/2026-11/x.webp';
    expect(coverThumbOf({ type: 'image', url }, BASES)).toBe('https://img.resonance.channel/image/2026-11/x-w960.webp');
    expect(coverThumbOf({ type: 'image', url, thumbUrl: 'https://pub-old.r2.dev/image/2026-11/x-w960.webp' }, BASES)).toBe(
      'https://pub-old.r2.dev/image/2026-11/x-w960.webp',
    );
    // A thumbUrl written to point elsewhere is never passed on.
    expect(coverThumbOf({ type: 'image', url, thumbUrl: 'https://evil.example/x.webp' }, BASES)).toBe(
      'https://img.resonance.channel/image/2026-11/x-w960.webp',
    );
    expect(coverThumbOf({ type: 'video', url }, BASES)).toBeNull();
    expect(coverThumbOf({ type: 'image', url: 'https://elsewhere.example/a.jpg' }, BASES)).toBeNull();
    expect(coverThumbOf(undefined, BASES)).toBeNull();
  });
});
