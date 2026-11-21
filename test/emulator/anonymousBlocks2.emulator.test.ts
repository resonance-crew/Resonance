import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { getCardBox, getCardDetail } from '@/server/app/cardsRead';
import { resonateWithIn } from '@/server/app/resonate';
import { blockIn, deleteBookmarkIn, listBlocksIn, listConnectionsIn, lookupUsersIn, putBookmarkIn } from '@/server/app/social';

// Phase 2's social endpoints probed for what anonymousBlocks.emulator.test.ts
// holds of the rest (CLAUDE.md #6): no answer tells who wrote an anonymous
// card, and a block hides people and their named cards, never an anonymous
// one. Each probe runs without a block and with one, either way, and compares:
// the reader's answers about the anonymous card are the same in all three,
// the author's uid appears in none of them, and no signal reaches the author
// for anything the reader does to it.

const PROJECT = 'demo-resonance-anon-blocks-2';
let app: App;
let db: Firestore;
const ctx = () => ctxFor(db);
const AUTHOR = 'anonAuthorUid';
const READER = 'readerUid';

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'anon-blocks-2-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const card = (authorId: string, extra: Record<string, unknown> = {}) => ({
  authorId,
  thoughtCore: 'a card',
  story: 'What someone wrote, long enough to be a story.',
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: Timestamp.fromDate(new Date('2026-11-01T00:00:00Z')),
  ...extra,
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await Promise.all([
    db.doc(`users/${AUTHOR}`).set({ handle: 'author', handleLower: 'author', initials: 'AU', accentColor: 'x' }),
    db.doc(`users/${READER}`).set({ handle: 'reader', handleLower: 'reader', initials: 'RE', accentColor: 'y' }),
    db.doc('cards/anon').set(card(AUTHOR, { anonymous: true })),
    db.doc('cards/named').set(card(AUTHOR)),
    db.doc('cards/readerReply').set(card(READER)),
  ]);
});

type Block = 'none' | 'reader blocked author' | 'author blocked reader';
const BLOCKS: Block[] = ['none', 'reader blocked author', 'author blocked reader'];

async function withBlock(b: Block) {
  if (b === 'reader blocked author') await db.doc(`users/${READER}/blocks/${AUTHOR}`).set({ blockedUid: AUTHOR, createdAt: Timestamp.now() });
  if (b === 'author blocked reader') await db.doc(`users/${AUTHOR}/blocks/${READER}`).set({ blockedUid: READER, createdAt: Timestamp.now() });
}

/** What a call answers: its value, or its failure's code. */
async function outcome(p: Promise<unknown>): Promise<unknown> {
  try {
    return { ok: await p };
  } catch (e) {
    if (e instanceof ApiFailure) return { failed: e.code };
    throw e;
  }
}

async function wipe() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents/users/${READER}/bookmarks/anon`, { method: 'DELETE' });
}

describe('bookmarks of an anonymous card', () => {
  it('answer the same with or without a block, either way, and the card stays on the shelf without naming anyone', async () => {
    const seen: unknown[] = [];
    for (const b of BLOCKS) {
      await db.recursiveDelete(db.collection(`users/${READER}/blocks`));
      await db.recursiveDelete(db.collection(`users/${AUTHOR}/blocks`));
      await wipe();
      await withBlock(b);
      const put = await outcome(putBookmarkIn(ctx(), READER, 'anon'));
      const detail = await getCardDetail(ctx(), READER, 'anon');
      const shelf = await getCardBox(ctx(), READER, 'bookmarks');
      seen.push({ put, bookmarked: detail.bookmarked, shelf: shelf.cards.map((c) => c.id) });
      expect(JSON.stringify([detail, shelf]), b).not.toContain(AUTHOR);
      expect(await outcome(deleteBookmarkIn(ctx(), READER, 'anon'))).toEqual({ ok: undefined });
    }
    expect(seen).toEqual([seen[0], seen[0], seen[0]]);
    expect(seen[0]).toEqual({ put: { ok: undefined }, bookmarked: true, shelf: ['anon'] });
    // The author is never signalled for a bookmark.
    expect((await db.doc(`signals/${AUTHOR}`).get()).exists).toBe(false);
  });

  it('a named card answers its bookmark exactly as GET /cards answers the card, with a block either way', async () => {
    for (const b of BLOCKS) {
      await db.recursiveDelete(db.collection(`users/${READER}/blocks`));
      await db.recursiveDelete(db.collection(`users/${AUTHOR}/blocks`));
      await withBlock(b);
      const get = await outcome(getCardDetail(ctx(), READER, 'named'));
      const put = await outcome(putBookmarkIn(ctx(), READER, 'named'));
      expect('failed' in (get as object), b).toBe('failed' in (put as object));
    }
  });
});

describe('the block list, the connections and the people lookup', () => {
  it("a block never puts an anonymous card's author in anyone's answers, and the blocked person is never signalled", async () => {
    // The author blocks the reader: nothing of the reader's changed, so nothing reaches them.
    await blockIn(ctx(), AUTHOR, READER);
    expect((await db.doc(`signals/${READER}`).get()).exists).toBe(false);
    expect(await listBlocksIn(ctx(), READER)).toEqual({ blocks: [] });
    expect(await listConnectionsIn(ctx(), READER)).toEqual({ connections: [] });
    // The reader still reads the anonymous card, as before, and it names no one.
    const detail = await getCardDetail(ctx(), READER, 'anon');
    expect(JSON.stringify(detail)).not.toContain(AUTHOR);
  });

  it('answers a profile lookup the same with or without a block, either way — a profile is public, a card is not named', async () => {
    const seen: unknown[] = [];
    for (const b of BLOCKS) {
      await db.recursiveDelete(db.collection(`users/${READER}/blocks`));
      await db.recursiveDelete(db.collection(`users/${AUTHOR}/blocks`));
      await withBlock(b);
      const answer = await lookupUsersIn(ctx(), [AUTHOR]);
      // Nothing in it ties the person to any card.
      expect(JSON.stringify(answer)).not.toMatch(/"(anon|named|readerReply)"|card/i);
      seen.push(answer);
    }
    expect(seen).toEqual([seen[0], seen[0], seen[0]]);
  });

  it("a resonance with an anonymous card connects no one and signals no one: the author's channel stays silent", async () => {
    await resonateWithIn(ctx(), READER, 'anon', 'readerReply');
    expect((await db.doc(`signals/${AUTHOR}`).get()).exists).toBe(false);
    expect((await db.doc(`signals/${READER}`).get()).exists).toBe(false);
    expect(await listConnectionsIn(ctx(), READER)).toEqual({ connections: [] });
    expect(await listConnectionsIn(ctx(), AUTHOR)).toEqual({ connections: [] });
  });
});
