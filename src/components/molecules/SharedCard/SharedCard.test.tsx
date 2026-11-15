// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/../test/render';
import type { Card } from '@/lib/db/types';
import { SharedCardContent } from './SharedCard';

/**
 * Round 25 post-merge (§G1): a card shared in a thread draws its 1.91 : 1 cover from the cover's frame, as the
 * iOS and Android chat cards do — the web bubble kept a centred object-fit cover and could cut the subject off.
 */

const card: Card = {
  id: 'c-bridge',
  authorId: 'u-1',
  thoughtCore: 'The bridge at dusk',
  story: 'We met on the bridge.',
  tags: [],
  originalLocale: 'en',
  translations: {},
  visibility: 'public',
  publishedAt: new Date('2026-10-01'),
  readCount: 0,
  resonanceCount: 0,
  inviteCount: 0,
  media: { type: 'image', url: 'https://img.example.com/bridge.webp' },
};

const coverImg = (c: Card) => renderWithIntl(<SharedCardContent card={c} author={null} />).container.querySelector('img')!;

describe('the shared card’s cover', () => {
  it('without a frame: centred, as the stylesheet covers it', () => {
    const img = coverImg(card);
    expect(img).not.toHaveAttribute('data-frame');
    expect(img.style.left).toBe('');
  });

  it('with an off-centre frame: placed so the frame’s crop fills the box', () => {
    const img = coverImg({ ...card, media: { ...card.media!, frame: { cx: 0.1, cy: 0.5, zoom: 1.5, ar: 1 } } });
    expect(img).toHaveAttribute('data-frame');
    // a square picture in a 1.91 : 1 box, its left edge in view: the picture starts at the box's left
    expect(img.style.left).toBe('0%');
    // and runs well past the box's right edge, its top above the box (not the centred slice: -50% of the excess)
    expect(Number.parseFloat(img.style.width)).toBeGreaterThan(100);
    expect(Number.parseFloat(img.style.top)).toBeLessThan(0);
    const centred = coverImg({ ...card, media: { ...card.media!, frame: { cx: 0.5, cy: 0.5, zoom: 1.5, ar: 1 } } });
    expect(centred.style.left).not.toBe(img.style.left);
  });
});
