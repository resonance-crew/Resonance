import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { fakeAdminDb } from '../../../../test/fakeAdminDb';
import { cardByKey, slugShaped } from './cardKey';

// The card a URL segment names: by its slug, else by its document id. A key
// that can't be a slug the server made (an auto-id has capitals) is read both
// ways at once — one round trip, not two, for every card page opened by id —
// and the slug's holder still wins; a slug-shaped key keeps its order.

const at = (ms: number) => Timestamp.fromMillis(ms);
const SLUG_QUERY = (key: string) => `cards?slug==${key}`;

/** A read kept pending until `release()`, to see what else was asked meanwhile. */
function holding(read: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { hold: (r: string) => (r === read ? gate : undefined), release };
}

describe('slugShaped', () => {
  it('is what slugify writes: lowercase ASCII letters, digits and hyphens', () => {
    expect(slugShaped('a-quiet-night-2')).toBe(true);
    expect(slugShaped('Zx81kQpLmNoPqRsTuVwX')).toBe(false);
    expect(slugShaped('__x__')).toBe(false);
    expect(slugShaped('雨後')).toBe(false);
  });
});

describe('cardByKey', () => {
  it("reads a key that can't be a slug by its id beside the slug query", async () => {
    const gate = holding(SLUG_QUERY('Zx81kQ'));
    const { db, reads } = fakeAdminDb({ 'cards/Zx81kQ': { authorId: 'alice', publishedAt: at(1) } }, gate);
    const found = cardByKey(db, 'Zx81kQ');
    await Promise.resolve();
    // The slug query hasn't answered, and the document is asked for already.
    expect(reads).toEqual([SLUG_QUERY('Zx81kQ'), 'cards/Zx81kQ']);
    gate.release();
    expect((await found)?.id).toBe('Zx81kQ');
  });

  // An older client could write a slug itself: one that is another card's id still names its holder.
  it('still answers the holder of a slug that is also another card’s id', async () => {
    const { db } = fakeAdminDb({
      'cards/Zx81kQ': { authorId: 'alice', publishedAt: at(1) },
      'cards/later': { authorId: 'bob', slug: 'Zx81kQ', publishedAt: at(3) },
      'cards/first': { authorId: 'carol', slug: 'Zx81kQ', publishedAt: at(2) },
    });
    expect((await cardByKey(db, 'Zx81kQ'))?.id).toBe('first');
  });

  it('resolves a slug-shaped key before reading a document by it', async () => {
    const gate = holding(SLUG_QUERY('a-quiet-night'));
    const { db, reads } = fakeAdminDb({ 'cards/a-quiet-night': { authorId: 'alice', publishedAt: at(1) } }, gate);
    const found = cardByKey(db, 'a-quiet-night');
    await Promise.resolve();
    expect(reads).toEqual([SLUG_QUERY('a-quiet-night')]);
    gate.release();
    // Missed: the id comes next.
    expect((await found)?.id).toBe('a-quiet-night');
    expect(reads).toEqual([SLUG_QUERY('a-quiet-night'), 'cards/a-quiet-night']);
  });

  it('reads no document when a slug-shaped key is a slug', async () => {
    const { db, reads } = fakeAdminDb({ 'cards/c1': { authorId: 'alice', slug: 'a-quiet-night', publishedAt: at(1) } });
    expect((await cardByKey(db, 'a-quiet-night'))?.id).toBe('c1');
    expect(reads).toEqual([SLUG_QUERY('a-quiet-night')]);
  });

  it('names no card by an id Firestore keeps for itself, nor by a path', async () => {
    const { db, reads } = fakeAdminDb({});
    expect(await cardByKey(db, '__x__')).toBeNull();
    expect(await cardByKey(db, 'cards/x')).toBeNull();
    expect(reads).toEqual([SLUG_QUERY('__x__')]);
  });

  it('answers null for a key that is neither', async () => {
    const { db } = fakeAdminDb({});
    expect(await cardByKey(db, 'Zx81kQ')).toBeNull();
    expect(await cardByKey(db, 'no-such-slug')).toBeNull();
  });
});
