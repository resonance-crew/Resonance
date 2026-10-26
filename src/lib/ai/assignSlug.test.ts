import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { fakeAdminDb } from '../../../test/fakeAdminDb';
import { assignSlug } from './assignSlug';

// Naming a card as publishing does (publishCard; apiV1Publish.emulator.test.ts
// covers the whole publish): from the card the publish transaction read,
// with the author's pen name read while the title is translated.

const at = (ms: number) => Timestamp.fromMillis(ms);

function translating() {
  let finish!: (base: string) => void;
  const titles: string[] = [];
  const slugBase = (title: string) => {
    titles.push(title);
    return new Promise<string>((resolve) => (finish = resolve));
  };
  return { slugBase, titles, finish: (base: string) => finish(base) };
}

const card = { authorId: 'alice', thoughtCore: '雨後的夜', anonymous: false, publishedAt: at(1) };

describe('assignSlug', () => {
  it('names the card it is handed without reading it again, reading the pen name while the title is translated', async () => {
    const { db, reads, docs } = fakeAdminDb({
      'cards/c1': { ...card },
      'cards/other': { authorId: 'bob', slug: 'a-quiet-night', publishedAt: at(0) },
      'users/alice': { handle: 'Alice' },
    });
    const llm = translating();
    const naming = assignSlug(db, 'c1', llm.slugBase, { ...card });
    await Promise.resolve();
    await Promise.resolve();
    expect(llm.titles).toEqual(['雨後的夜']);
    // The translation is still out; the author is asked for already, and the card not at all.
    expect(reads).toEqual(['users/alice']);
    llm.finish('a-quiet-night');
    expect(await naming).toBe('a-quiet-night-alice');
    expect(reads).not.toContain('cards/c1');
    expect(docs['cards/c1'].slug).toBe('a-quiet-night-alice');
  });

  it("never hands out a slug retired with a deleted card: its old links would open this one", async () => {
    const { db } = fakeAdminDb({
      'cards/c1': { ...card },
      'retiredSlugs/after-the-rain': { retiredAt: at(0) },
      'users/alice': { handle: 'alice' },
    });
    expect(await assignSlug(db, 'c1', async () => 'after-the-rain', { ...card })).toBe('after-the-rain-alice');
  });

  it('reads the card itself when it is not handed one', async () => {
    const { db, reads } = fakeAdminDb({ 'cards/c1': { ...card }, 'users/alice': { handle: 'alice' } });
    expect(await assignSlug(db, 'c1', async () => 'after-the-rain')).toBe('after-the-rain');
    expect(reads[0]).toBe('cards/c1');
  });

  it("never reads an anonymous card's author: its URL must not carry their pen name", async () => {
    const { db, reads } = fakeAdminDb({
      'cards/c1': { ...card, anonymous: true },
      'cards/other': { authorId: 'bob', slug: 'a-quiet-night', publishedAt: at(0) },
      'users/alice': { handle: 'alice' },
    });
    expect(await assignSlug(db, 'c1', async () => 'a-quiet-night', { ...card, anonymous: true })).toBe('a-quiet-night-2');
    expect(reads).not.toContain('users/alice');
  });

  it('keeps a slug the card already holds', async () => {
    const { db } = fakeAdminDb({ 'cards/c1': { ...card, slug: 'kept' } });
    expect(await assignSlug(db, 'c1', async () => 'never-asked', { ...card, slug: 'kept' })).toBe('kept');
  });
});
