import { describe, expect, it } from 'vitest';
import type { Card } from '@/lib/db/types';
import { cardVisible, toFeedCard } from './present';

// Who may read a card, as the server decides for the Admin SDK (which skips
// the rules) — and what a card in the trash says, and to whom.

const DAY = 86_400_000;
const NOW = Date.now();
const card = (extra: Partial<Card> = {}): Card => ({
  id: 'c1',
  authorId: 'alice',
  thoughtCore: '安靜的夜晚',
  story: '原本的故事',
  tags: [],
  originalLocale: 'zh-TW',
  translations: {},
  visibility: 'public',
  publishedAt: new Date('2026-09-01T08:00:00Z'),
  readCount: 0,
  resonanceCount: 0,
  inviteCount: 0,
  anonymous: false,
  ...extra,
});
const never = () => false;

describe('cardVisible', () => {
  it('opens a published public card to anyone, and a draft or private one to its author alone', () => {
    expect(cardVisible(card(), 'bob', never)).toBe(true);
    expect(cardVisible(card({ visibility: 'private' }), 'bob', never)).toBe(false);
    expect(cardVisible(card({ publishedAt: null }), 'bob', never)).toBe(false);
    expect(cardVisible(card({ visibility: 'private' }), 'alice', never)).toBe(true);
    expect(cardVisible(card({ visibility: 'connections' }), 'bob', () => true)).toBe(true);
  });

  it("keeps a card in the trash from everyone but its author — whatever its stored visibility says", () => {
    const trashed = card({ trashedAt: new Date(NOW - DAY), trashedFrom: { visibility: 'public', referenceCardId: null } });
    expect(cardVisible(trashed, 'alice', never)).toBe(true);
    expect(cardVisible(trashed, 'bob', never)).toBe(false);
    expect(cardVisible({ ...trashed, visibility: 'connections' }, 'bob', () => true)).toBe(false);
    // However odd the stored value, a card that names a trash date is no one else's.
    expect(cardVisible(card({ trashedAt: 'soon' as unknown as Date }), 'bob', never)).toBe(false);
  });

  it('closes it to its author too once its 30 days are up, before the cron reaches it', () => {
    expect(cardVisible(card({ trashedAt: new Date(NOW - 29 * DAY) }), 'alice', never)).toBe(true);
    expect(cardVisible(card({ trashedAt: new Date(NOW - 30 * DAY - 1000) }), 'alice', never)).toBe(false);
  });
});

describe('toFeedCard', () => {
  const trashed = card({
    visibility: 'private',
    trashedAt: new Date('2026-10-01T08:00:00Z'),
    trashedFrom: { visibility: 'connections', referenceCardId: 'orig' },
  });

  it("says when its author's card went into the trash, when it goes and what restoring brings back — in their own answers only", () => {
    expect(toFeedCard(trashed, undefined, { deanonymize: true, own: true })).toMatchObject({
      visibility: 'private',
      trashedAt: '2026-10-01T08:00:00.000Z',
      purgeAt: '2026-10-31T08:00:00.000Z',
      restoresTo: 'connections',
    });
    const elsewhere = toFeedCard(trashed, undefined, { deanonymize: true });
    expect(elsewhere).not.toHaveProperty('trashedAt');
    expect(elsewhere).not.toHaveProperty('purgeAt');
    expect(elsewhere).not.toHaveProperty('restoresTo');
  });

  it('adds nothing to a card that is not in the trash, and restores an unknown visibility as private', () => {
    expect(toFeedCard(card(), undefined, { own: true })).not.toHaveProperty('trashedAt');
    const odd = card({ trashedAt: new Date('2026-10-01T08:00:00Z'), trashedFrom: { visibility: 'everyone' as 'public', referenceCardId: null } });
    expect(toFeedCard(odd, undefined, { own: true }).restoresTo).toBe('private');
  });
});
