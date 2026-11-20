import { describe, expect, it } from 'vitest';
import type { DataRepos } from '@/server/ports/uow';

/**
 * What every implementation of the cards read side and the users read side
 * (ports/repos/{cards,users}.ts) keeps: run on memory (a unit test) and on
 * the Firestore emulator (test/emulator/ports.cards.emulator.test.ts).
 *
 * A seed holds rows as a service would see them — times as Date — and the
 * adapter writes them its own way (Firestore: Timestamps).
 */
export interface CardsSeed {
  cards?: Record<string, Record<string, unknown>>;
  users?: Record<string, Record<string, unknown>>;
  /** [who blocked, whom]. */
  blocks?: [string, string][];
  /** Connected pairs. */
  connections?: [string, string][];
}

export type MakeCardsRepos = (seed: CardsSeed) => Promise<Pick<DataRepos, 'cards' | 'users'>>;

const at = (iso: string) => new Date(iso);
const card = (authorId: string, published: string | null, extra: Record<string, unknown> = {}) => ({
  authorId,
  thoughtCore: `a card by ${authorId}`,
  story: 'a story long enough to be read',
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: published ? at(published) : null,
  ...extra,
});

export function describeCardsReadContract(name: string, make: MakeCardsRepos) {
  describe(`cards / users read contract — ${name}`, () => {
    it('pages the feed newest first, ties broken by id, never skipping a card that shares its boundary', async () => {
      const same = '2026-11-20T03:04:05.123Z';
      const { cards } = await make({
        cards: {
          a: card('alice', same),
          b: card('alice', same),
          c: card('alice', same),
          d: card('alice', '2026-11-20T03:04:06.000Z'),
          draft: card('alice', null),
          priv: card('alice', '2026-11-20T03:04:07.000Z', { visibility: 'private' }),
        },
      });
      const seen: string[] = [];
      let token: string | undefined;
      for (let i = 0; i < 5; i++) {
        const page = await cards.feedPage(2, token ? { pageToken: token } : undefined);
        seen.push(...page.cards.map((c) => c.id));
        if (!page.end.nextPageToken) break;
        token = page.end.nextPageToken;
      }
      expect(seen).toEqual(['d', 'c', 'b', 'a']);
    });

    it('takes a page token in the neutral format too, resuming at the same card', async () => {
      const { cards } = await make({ cards: { a: card('alice', '2026-11-20T03:04:05.123Z'), b: card('alice', '2026-11-20T03:04:05.123Z'), c: card('alice', '2026-11-20T03:04:04.000Z') } });
      const first = await cards.feedPage(1);
      expect(first.cards.map((c) => c.id)).toEqual(['b']);
      const neutral = 'c1.' + Buffer.from(JSON.stringify({ t: '2026-11-20T03:04:05.123000Z', id: 'b' })).toString('base64url');
      const [byOld, byNew] = await Promise.all([cards.feedPage(5, { pageToken: first.end.nextPageToken! }), cards.feedPage(5, { pageToken: neutral })]);
      expect(byOld.cards.map((c) => c.id)).toEqual(['a', 'c']);
      expect(byNew.cards.map((c) => c.id)).toEqual(['a', 'c']);
    });

    it('lists an author page without their anonymous cards, and counts the same', async () => {
      const { cards } = await make({
        cards: { named: card('alice', '2026-11-20T00:00:00.000Z'), anon: card('alice', '2026-11-20T00:00:01.000Z', { anonymous: true }), other: card('bob', '2026-11-20T00:00:02.000Z') },
      });
      expect((await cards.authorPage('alice', 10)).cards.map((c) => c.id)).toEqual(['named']);
      expect(await cards.countAuthorCards('alice', 40)).toBe(1);
    });

    it('reads cards by id in the order asked, each once, missing ones left out, without their stories', async () => {
      const { cards } = await make({ cards: { x: card('alice', '2026-11-20T00:00:00.000Z'), y: card('bob', '2026-11-20T00:00:00.000Z') } });
      const found = await cards.listByIds(['y', 'missing', 'x', 'y']);
      expect(found.map((c) => c.id)).toEqual(['y', 'x']);
      expect(found.every((c) => c.story === undefined)).toBe(true);
      await cards.withStories(found);
      expect(found.map((c) => c.story)).toEqual(['a story long enough to be read', 'a story long enough to be read']);
    });

    it('names a card by its slug before its id, and gives an anonymous card to anyone only by its id', async () => {
      const { cards } = await make({
        cards: {
          held: card('alice', '2026-11-20T00:00:00.000Z', { slug: 'night' }),
          later: card('bob', '2026-11-20T00:00:05.000Z', { slug: 'night' }),
          anon: card('carol', '2026-11-20T00:00:00.000Z', { slug: 'carols-walk', anonymous: true }),
        },
      });
      expect((await cards.findByKey('night'))?.id).toBe('held');
      expect((await cards.findByKey('later'))?.id).toBe('later');
      expect(await cards.findByKey('nope')).toBeNull();
      expect(await cards.findForAnyone('carols-walk')).toBeNull();
      expect((await cards.findForAnyone('anon'))?.card.id).toBe('anon');
    });

    it('reads blocks, connections and pen names', async () => {
      const { users } = await make({
        users: { alice: { handle: 'Alice', handleLower: 'alice', initials: 'AL', bio: 'hi', joinedAt: at('2026-01-01T00:00:00.000Z') }, bob: { handle: 'bob', handleLower: 'bob' } },
        blocks: [['alice', 'bob']],
        connections: [['bob', 'carol']],
      });
      expect([...(await users.blockedBy('alice'))]).toEqual(['bob']);
      expect(await users.hasBlocked('alice', 'bob')).toBe(true);
      expect(await users.hasBlocked('bob', 'alice')).toBe(false);
      expect(await users.connected('carol', 'bob')).toBe(true);
      expect(await users.connected('alice', 'bob')).toBe(false);
      expect([...(await users.connectedAmong('carol', ['bob', 'alice']))]).toEqual(['bob']);
      expect(await users.idForHandle('  ALICE ')).toBe('alice');
      const row = await users.getRow('alice');
      expect(row?.joinedAt).toEqual(at('2026-01-01T00:00:00.000Z'));
      expect(Object.fromEntries(await users.rowsOf(['alice', 'nobody'], ['handle', 'initials']))).toEqual({ alice: { handle: 'Alice', initials: 'AL' } });
    });
  });
}
