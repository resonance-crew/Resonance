import { describe, expect, it } from 'vitest';
import { mapCard } from './map';

const base = {
  authorId: 'u1',
  thoughtCore: 'core',
  story: 'story',
  tags: [],
  visibility: 'public',
};

describe('mapCard (client)', () => {
  // Its author's read of their own card in the trash (no one else can read it).
  it('says when a card went into the trash and what restoring brings back — nothing for a card not there', () => {
    const at = new Date('2026-10-01T08:00:00Z');
    expect(mapCard('c1', { ...base, visibility: 'private', trashedAt: at, trashedFrom: { visibility: 'connections', referenceCardId: 'orig' } })).toMatchObject({
      visibility: 'private',
      trashedAt: at,
      trashedFrom: { visibility: 'connections', referenceCardId: 'orig' },
    });
    // What it holds is checked: an unknown visibility comes back private, a stray reference none.
    expect(mapCard('c1', { ...base, trashedAt: at, trashedFrom: { visibility: 'everyone', referenceCardId: 7 } }).trashedFrom).toEqual({
      visibility: 'private',
      referenceCardId: null,
    });
    const live = mapCard('c1', base);
    expect(live).not.toHaveProperty('trashedAt');
    expect(live).not.toHaveProperty('trashedFrom');
  });

  it('keeps a numeric accentHue', () => {
    expect(mapCard('c1', { ...base, accentHue: 215 }).accentHue).toBe(215);
  });

  it('normalises a missing or null accentHue to undefined', () => {
    expect(mapCard('c1', base).accentHue).toBeUndefined();
    expect(mapCard('c1', { ...base, accentHue: null }).accentHue).toBeUndefined();
  });

  it("keeps the server's link previews a reader may draw, in order, and nothing else", () => {
    const linkPreviews = [
      { url: 'https://example.com/a', title: 'A', description: 'About a', siteName: 'Ex', image: '/api/link-image?u=x&s=y' },
      { url: 'javascript:alert(1)', title: 'Not a page' },
      { url: 'https://example.com/untitled' },
      { url: 'https://example.com/b', title: 'B', image: 'https://tracker.example/p.gif', extra: 'dropped' },
      'not an object',
    ];
    expect(mapCard('c1', { ...base, linkPreviews }).linkPreviews).toEqual([
      { url: 'https://example.com/a', title: 'A', description: 'About a', siteName: 'Ex', image: '/api/link-image?u=x&s=y' },
      { url: 'https://example.com/b', title: 'B' },
    ]);
    // None (or nothing usable) is no field at all.
    expect(mapCard('c1', base)).not.toHaveProperty('linkPreviews');
    expect(mapCard('c1', { ...base, linkPreviews: 'x' })).not.toHaveProperty('linkPreviews');
  });
});
