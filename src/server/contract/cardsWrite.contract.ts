import { describe, expect, it } from 'vitest';
import { ReadAfterWriteError, type DataRepos, type UnitOfWork } from '@/server/ports/uow';

/**
 * What every implementation of the cards write side and the users write side
 * (ports/repos/{cards,users}.ts, the `write side (cardsWrite lane)` sections)
 * keeps: run on memory (src/server/infra/memory/cardsWrite.test.ts) and on the
 * Firestore emulator (test/emulator/ports.cardsWrite.emulator.test.ts). The
 * risky parts: the trash's clock and its in-transaction query, a delete's
 * tombstone and retired slug, publishing twice, an edit applied whole and
 * after the reads, the purge's paging, the pen-name reservations.
 *
 * Seeds hold rows as a service sees them — times as Date — keyed by document
 * path (`cards/c1`, `cards/c1/edits/current`, `handles/dawn`); `peek(path)`
 * answers a stored document the same way, or null.
 */
export type WriteSeed = Record<string, Record<string, unknown>>;

export interface WriteHarness {
  uow: UnitOfWork;
  data: DataRepos;
  peek(path: string): Promise<Record<string, unknown> | null>;
}

export type MakeWriteHarness = (seed: WriteSeed) => Promise<WriteHarness>;

const at = (iso: string) => new Date(iso);
const card = (authorId: string, extra: Record<string, unknown> = {}) => ({
  authorId,
  thoughtCore: 'A quiet night',
  story: 'The rain stopped and the street went on talking to itself for a while.',
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: at('2026-11-01T00:00:00.000Z'),
  ...extra,
});
const ms = (v: unknown) => (v instanceof Date ? v.getTime() : null);

export function describeCardsWriteContract(name: string, make: MakeWriteHarness) {
  describe(`cards / users write contract — ${name}`, () => {
    it('moves a card to the trash at the time given, parking its reference; restoring takes the trash fields away', async () => {
      const h = await make({ 'cards/r1': card('alice', { referenceCardId: 'orig', slug: 'a-quiet-night' }) });
      const when = at('2026-11-20T03:04:05.678Z');
      await h.uow.run(async (tx) => {
        expect(await tx.cards.getCardRow('r1')).toMatchObject({ referenceCardId: 'orig', publishedAt: at('2026-11-01T00:00:00.000Z') });
        tx.cards.moveToTrash('r1', when, { visibility: 'public', referenceCardId: 'orig' }, true);
      });
      const trashed = await h.peek('cards/r1');
      expect(ms(trashed?.trashedAt)).toBe(when.getTime());
      expect(trashed).toMatchObject({ visibility: 'private', trashedFrom: { visibility: 'public', referenceCardId: 'orig' }, trashedFor: 'deletion', slug: 'a-quiet-night' });
      expect(trashed).not.toHaveProperty('referenceCardId');
      // Never updatedAt: a draft keeps its place in edit order.
      expect(trashed).not.toHaveProperty('updatedAt');

      await h.uow.run(async (tx) => tx.cards.restore('r1', 'public', 'orig'));
      const back = await h.peek('cards/r1');
      expect(back).toMatchObject({ visibility: 'public', referenceCardId: 'orig' });
      for (const gone of ['trashedAt', 'trashedFrom', 'trashedFor']) expect(back).not.toHaveProperty(gone);
    });

    it("finds an author's answers to an original inside the transaction — theirs only, at most the limit", async () => {
      const h = await make({
        'cards/a1': card('alice', { referenceCardId: 'orig' }),
        'cards/a2': card('alice', { referenceCardId: 'orig' }),
        'cards/a3': card('alice', { referenceCardId: 'orig' }),
        'cards/b1': card('bob', { referenceCardId: 'orig' }),
        'cards/a4': card('alice', { referenceCardId: 'other' }),
      });
      const [two, all] = await h.uow.run(async (tx) => Promise.all([tx.cards.answersTo('alice', 'orig', 2), tx.cards.answersTo('alice', 'orig', 10)]));
      expect(two).toHaveLength(2);
      expect(two.every((id) => ['a1', 'a2', 'a3'].includes(id))).toBe(true);
      expect([...all].sort()).toEqual(['a1', 'a2', 'a3']);
    });

    it('deletes a card for good with its edit and translations, leaving a tombstone and retiring its slug', async () => {
      const h = await make({
        'cards/c1': card('alice', { slug: 'a-quiet-night' }),
        'cards/c1/edits/current': { thoughtCore: 'Edited', authorId: 'alice' },
        'cards/c1/translations/en': { text: 'x' },
        'cards/c2': card('alice', { slug: 'Not A Slug' }),
      });
      await h.uow.run(async (tx) => {
        tx.cards.takeBack(await tx.cards.readTakeBack('alice', 'c1'));
        tx.cards.deleteForGood('c1', 'a-quiet-night');
      });
      await h.uow.run(async (tx) => tx.cards.deleteForGood('c2', 'Not A Slug'));
      expect(await h.peek('cards/c1')).toBeNull();
      expect(await h.peek('cards/c1/edits/current')).toBeNull();
      expect(await h.peek('cards/c1/translations/en')).toBeNull();
      // When, never who.
      const tomb = await h.peek('cardTombstones/c1');
      expect(Object.keys(tomb ?? {})).toEqual(['deletedAt']);
      expect(tomb?.deletedAt).toBeInstanceOf(Date);
      expect(Object.keys((await h.peek('retiredSlugs/a-quiet-night')) ?? {})).toEqual(['retiredAt']);
      expect(await h.peek('cardTombstones/c2')).not.toBeNull();
      // A slug slugify couldn't have made can't be a document id: not retired.
      expect(await h.peek('retiredSlugs/Not A Slug')).toBeNull();
    });

    it('publishing stamps publishedAt the first time only, makes anonymous a boolean and stamps the summary', async () => {
      const h = await make({ 'cards/d1': card('alice', { publishedAt: null, anonymous: undefined }) });
      const first = await h.uow.run(async (tx) => {
        const row = (await tx.cards.getCardRow('d1'))!;
        tx.cards.publish('d1', row, row.publishedAt == null);
        return row;
      });
      expect(first.publishedAt).toBeNull();
      const published = (await h.peek('cards/d1'))!;
      expect(published.publishedAt).toBeInstanceOf(Date);
      expect(published).toMatchObject({ anonymous: false, readMinutes: 1 });
      expect(typeof published.excerpt).toBe('string');
      expect(ms(published.excerptAt)).toBe(ms(published.updatedAt));
      // Published again: never re-dated.
      await h.uow.run(async (tx) => {
        const row = (await tx.cards.getCardRow('d1'))!;
        tx.cards.publish('d1', row, row.publishedAt == null);
      });
      expect(ms((await h.peek('cards/d1'))!.publishedAt)).toBe(ms(published.publishedAt));
    });

    it('applies an edit whole: the cover removed when null, the buffer deleted — and no read after it', async () => {
      const h = await make({
        'cards/e1': card('alice', { media: { type: 'image', url: 'https://media.test/a.webp' }, thin: true }),
        'cards/e1/edits/current': { thoughtCore: 'New title', story: 'x' },
      });
      await expect(
        h.uow.run(async (tx) => {
          await tx.cards.getEditRow('e1');
          tx.cards.applyEdit('e1', { thoughtCore: 'New title', story: 'A story with words enough to stand on its own for a reader.', tags: ['night'], accentHue: null, media: null }, { visibility: 'connections', anonymous: false });
          await tx.cards.getCardRow('e1');
        }),
      ).rejects.toBeInstanceOf(ReadAfterWriteError);
      // Nothing of a transaction that threw is kept.
      expect(await h.peek('cards/e1/edits/current')).not.toBeNull();

      await h.uow.run(async (tx) => {
        await tx.cards.getEditRow('e1');
        tx.cards.applyEdit('e1', { thoughtCore: 'New title', story: 'A story with words enough to stand on its own for a reader.', tags: ['night'], accentHue: null, media: null }, { visibility: 'connections', anonymous: false });
      });
      const applied = (await h.peek('cards/e1'))!;
      expect(applied).toMatchObject({ thoughtCore: 'New title', tags: ['night'], accentHue: null, visibility: 'connections', anonymous: false, publishedAt: at('2026-11-01T00:00:00.000Z') });
      expect(applied).not.toHaveProperty('media');
      expect(ms(applied.excerptAt)).toBe(ms(applied.updatedAt));
      expect(await h.peek('cards/e1/edits/current')).toBeNull();
    });

    it('changes the audience with an updatedAt stamp, and the pending edit beside it', async () => {
      const h = await make({ 'cards/v1': card('alice'), 'cards/v1/edits/current': { thoughtCore: 'Draft', visibility: 'public' } });
      await h.uow.run(async (tx) => {
        const row = (await tx.cards.getCardRow('v1'))!;
        tx.cards.setAudience('v1', { anonymous: true, visibility: 'private' }, { story: row.story });
        tx.cards.patchEdit('v1', { visibility: 'private', anonymous: true });
      });
      const row = (await h.peek('cards/v1'))!;
      expect(row).toMatchObject({ anonymous: true, visibility: 'private' });
      expect(row.updatedAt).toBeInstanceOf(Date);
      expect(ms(row.excerptAt)).toBe(ms(row.updatedAt));
      expect(await h.peek('cards/v1/edits/current')).toMatchObject({ thoughtCore: 'Draft', visibility: 'private', anonymous: true });
    });

    it("pages the expired trash longest-there first without skipping cards that went in together; an author's trash newest first, counted", async () => {
      const same = at('2026-10-01T00:00:00.000Z');
      const h = await make({
        'cards/t1': card('alice', { trashedAt: same }),
        'cards/t2': card('bob', { trashedAt: same }),
        'cards/t3': card('alice', { trashedAt: same }),
        'cards/t4': card('alice', { trashedAt: at('2026-09-01T00:00:00.000Z') }),
        'cards/t5': card('alice', { trashedAt: at('2026-11-15T00:00:00.000Z') }),
        'cards/live': card('alice'),
      });
      const pages: string[][] = [];
      for await (const page of h.data.cards.expiredTrash(at('2026-10-02T00:00:00.000Z'), 2)) pages.push(page.map((r) => r.id));
      expect(pages.flat()[0]).toBe('t4');
      expect([...pages.flat()].sort()).toEqual(['t1', 't2', 't3', 't4']);
      expect(pages.every((p) => p.length <= 2)).toBe(true);
      const authors: unknown[] = [];
      for await (const page of h.data.cards.expiredTrash(at('2026-10-02T00:00:00.000Z'), 10)) authors.push(...page.map((r) => r.authorId));
      expect(authors.filter((a) => a === 'bob')).toHaveLength(1);

      const cutoff = at('2026-11-20T00:00:00.000Z');
      const ids = await h.data.cards.trashedIds('alice', cutoff, 10);
      expect(ids[0]).toBe('t5');
      expect(ids.at(-1)).toBe('t4');
      expect([...ids].sort()).toEqual(['t1', 't3', 't4', 't5']);
      expect(await h.data.cards.countTrashed('alice', cutoff)).toBe(4);
      expect(await h.data.cards.countTrashed('alice', at('2026-09-15T00:00:00.000Z'))).toBe(1);
    });

    it("reserves a pen name, releases the old one into a hold for its owner, and holds it from everyone else", async () => {
      const h = await make({ 'users/nina': { handle: 'Nina', handleLower: 'nina', joinedAt: at('2026-01-01T00:00:00.000Z') }, 'handles/nina': { uid: 'nina', handle: 'Nina' } });
      expect(await h.data.users.handleAvailable('omar', 'NINA')).toBe(false);
      expect(await h.data.users.handleAvailable('nina', 'nina')).toBe(true);
      expect(await h.data.users.handleAvailable('omar', '__x__')).toBe(false);
      await h.uow.run(async (tx) => {
        const [taken, releases] = await Promise.all([tx.users.handleTakenByOther('nina', 'Dawn'), tx.users.ownsReleasableReservation('nina', 'Nina', 'Dawn')]);
        expect(taken).toBe(false);
        expect(releases).toBe(true);
        tx.users.releaseHandle('nina', 'Nina');
        tx.users.reserveHandle('nina', 'Dawn');
        tx.users.patchProfile('nina', { handle: 'Dawn', bio: 'hi' });
      });
      expect(await h.peek('handles/nina')).toBeNull();
      expect(await h.peek('handles/dawn')).toMatchObject({ uid: 'nina', handle: 'Dawn' });
      expect(await h.peek('handleHolds/nina')).toMatchObject({ heldFor: 'nina' });
      expect(await h.peek('users/nina')).toMatchObject({ handle: 'Dawn', handleLower: 'dawn', bio: 'hi' });
      expect(await h.data.users.handleAvailable('omar', 'nina')).toBe(false);
      expect(await h.data.users.handleAvailable('nina', 'nina')).toBe(true);
      // A change of case keeps the same reservation: nothing to release.
      expect(await h.uow.run((tx) => tx.users.ownsReleasableReservation('nina', 'Dawn', 'DAWN'))).toBe(false);
    });

    it('creates a profile with its stamps and lower-cased pen name', async () => {
      const h = await make({});
      await h.uow.run(async (tx) => {
        expect(await tx.users.getProfile('zoe')).toBeNull();
        tx.users.createProfile('zoe', {
          handle: 'Zoe ', bio: '', region: 'TW', primaryLocale: 'en', autoTranslateTo: ['zh-TW'], verified: false,
          avatarSeed: '1', initials: 'ZO', accentColor: 'sage',
        });
      });
      const row = (await h.peek('users/zoe'))!;
      expect(row).toMatchObject({ handle: 'Zoe ', handleLower: 'zoe', initials: 'ZO' });
      expect(row.joinedAt).toBeInstanceOf(Date);
      expect(row.handleChangedAt).toBeInstanceOf(Date);
    });
  });
}
