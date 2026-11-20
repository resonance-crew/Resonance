import { beforeEach, describe, expect, it } from 'vitest';
import type { DataRepos, UnitOfWork } from '@/server/ports/uow';
import { ReadAfterWriteError } from '@/server/ports/uow';

/**
 * What every adapter of the translations aggregate's repositories guarantees
 * (ports/repos/translations.ts), run against memory
 * (src/server/infra/memory/repos/translations.test.ts) and Firestore's
 * emulator (test/emulator/ports.translations.emulator.test.ts). `make`
 * answers a fresh harness for each test; card ids are the harness's own
 * (`card(n)`, all after `card('')`), so runs never see each other's rows.
 */
export interface TranslationsHarness {
  uow: UnitOfWork;
  data: DataRepos;
  /** A card id of this harness's own. */
  card(n: string): string;
  /** Write card `id` whole; times as Date (stored as the store's own time). */
  seedCard(id: string, fields: Record<string, unknown>): Promise<void>;
  /** Change fields of card `id` (a later write: its version moves). */
  touchCard(id: string, fields: Record<string, unknown>): Promise<void>;
  /** The card's committed fields (times as Date), or null. */
  readCard(id: string): Promise<Record<string, unknown> | null>;
}

const T0 = new Date('2026-11-19T10:00:00Z');
const T1 = new Date('2026-11-19T11:00:00Z');
const T2 = new Date('2026-11-19T12:00:00Z');

const published = (extra: Record<string, unknown> = {}) => ({
  authorId: 'alice',
  thoughtCore: '外婆的醃梅子',
  story: '每年五月，外婆都會把青梅擦乾。',
  visibility: 'public',
  anonymous: false,
  publishedAt: T0,
  updatedAt: T0,
  ...extra,
});

export function describeTranslationsContract(name: string, make: () => TranslationsHarness | Promise<TranslationsHarness>) {
  describe(`translations repositories contract — ${name}`, () => {
    let h: TranslationsHarness;
    beforeEach(async () => {
      h = await make();
    });

    it('getSummarySource: the card as translations are made from it — a stored summary only while current; null when gone', async () => {
      const current = h.card('current');
      const behind = h.card('behind');
      const bare = h.card('bare');
      await h.seedCard(current, published({ excerpt: 'stored', readMinutes: 1, excerptAt: T1, updatedAt: T1 }));
      await h.seedCard(behind, published({ excerpt: 'old', readMinutes: 1, excerptAt: T1, updatedAt: T2, trashedAt: T2, visibility: 'private' }));
      await h.seedCard(bare, { authorId: 'alice', thoughtCore: 7, story: null, publishedAt: null, summaryTranslations: { of: 'x' } });

      expect(await h.data.translations.getSummarySource(current)).toEqual({
        title: '外婆的醃梅子',
        story: '每年五月，外婆都會把青梅擦乾。',
        storedExcerpt: 'stored',
        published: true,
        visibility: 'public',
        trashed: false,
        translations: undefined,
      });
      expect(await h.data.translations.getSummarySource(behind)).toMatchObject({ storedExcerpt: null, trashed: true, visibility: 'private' });
      expect(await h.data.translations.getSummarySource(bare)).toEqual({
        title: '',
        story: '',
        storedExcerpt: null,
        published: false,
        visibility: undefined,
        trashed: false,
        translations: { of: 'x' },
      });
      expect(await h.data.translations.getSummarySource(h.card('none'))).toBeNull();
      expect(await h.uow.run((tx) => tx.translations.getSummarySource(h.card('none')))).toBeNull();
    });

    it('summary translations put in a transaction (updatedAt untouched), removed outside one; a read after the put refused', async () => {
      const id = h.card('st');
      await h.seedCard(id, published());
      const value = { of: 'hash1', en: { title: 'Plums', excerpt: 'Every May' } };
      await h.uow.run(async (tx) => {
        expect(await tx.translations.getSummarySource(id)).not.toBeNull();
        tx.translations.putSummaryTranslations(id, value);
      });
      const after = await h.readCard(id);
      expect(after?.summaryTranslations).toEqual(value);
      expect((after?.updatedAt as Date).getTime()).toBe(T0.getTime());
      expect((await h.data.translations.getSummarySource(id))?.translations).toEqual(value);

      await expect(
        h.uow.run(async (tx) => {
          tx.translations.putSummaryTranslations(id, { of: 'hash2' });
          await tx.translations.getSummarySource(id);
        }),
      ).rejects.toBeInstanceOf(ReadAfterWriteError);
      expect((await h.readCard(id))?.summaryTranslations).toEqual(value);

      await h.data.translations.removeSummaryTranslations(id);
      expect((await h.readCard(id))?.summaryTranslations).toBeUndefined();
      expect((await h.data.translations.getSummarySource(id))?.translations).toBeUndefined();
    });

    it('a kept story translation: none, kept, read back with its hash; one whose words are not text reads as none', async () => {
      const id = h.card('kept');
      await h.seedCard(id, published());
      expect(await h.data.translations.getKeptTranslation(id, 'en')).toBeNull();
      await h.data.translations.keepTranslation(id, 'en', { title: 'Plums', story: 'Every May…', hash: 'h1', model: 'm' });
      expect(await h.data.translations.getKeptTranslation(id, 'en')).toEqual({ hash: 'h1', title: 'Plums', story: 'Every May…' });
      expect(await h.data.translations.getKeptTranslation(id, 'zh-TW')).toBeNull();
      await h.data.translations.keepTranslation(id, 'en', { title: 'Plums 2', story: 'Every June', hash: 'h2', model: 'm' });
      expect(await h.data.translations.getKeptTranslation(id, 'en')).toEqual({ hash: 'h2', title: 'Plums 2', story: 'Every June' });
    });

    it('summaryPage pages in id order after a cursor; the writer keeps a summary only while the card is unchanged', async () => {
      const a = h.card('a');
      const b = h.card('b');
      const c = h.card('c');
      await h.seedCard(a, published({ story: 'one' }));
      await h.seedCard(b, { authorId: 'alice', story: 'two', publishedAt: null });
      await h.seedCard(c, published({ excerpt: 'three', readMinutes: 1, excerptAt: T1, updatedAt: T0 }));

      const first = await h.data.translations.summaryPage(h.card(''), 2);
      expect(first.map((r) => r.id)).toEqual([a, b]);
      expect(first[0]).toMatchObject({ published: true, story: 'one', stored: null });
      expect(first[1]).toMatchObject({ published: false, story: 'two' });
      const second = await h.data.translations.summaryPage(b, 2);
      expect(second.map((r) => r.id)).toEqual([c]);
      expect(second[0].stored).toEqual({ excerpt: 'three', readMinutes: 1 });

      // `a` changes after it was read: its write is refused; `c`'s holds, stamped current.
      await h.touchCard(a, { story: 'one, edited' });
      const writer = h.data.translations.summaryWriter();
      const results = Promise.all([
        writer.keep(a, { excerpt: 'one', readMinutes: 1 }, first[0].version),
        writer.keep(c, { excerpt: 'three!', readMinutes: 2 }, second[0].version),
      ]);
      await writer.close();
      expect(await results).toEqual(['changed', 'written']);
      expect((await h.readCard(a))?.excerpt).toBeUndefined();
      const [again] = await h.data.translations.summaryPage(b, 1);
      expect(again.stored).toEqual({ excerpt: 'three!', readMinutes: 2 });
    });

    it("hasAnswerTo: only the viewer's own card answering it", async () => {
      const target = h.card('target');
      await h.seedCard(target, published({ authorId: 'bob' }));
      await h.seedCard(h.card('reply'), published({ referenceCardId: target }));
      await h.seedCard(h.card('other'), published({ authorId: 'carol', referenceCardId: h.card('elsewhere') }));
      expect(await h.data.translations.hasAnswerTo('alice', target)).toBe(true);
      expect(await h.data.translations.hasAnswerTo('carol', target)).toBe(false);
      expect(await h.data.translations.hasAnswerTo('alice', h.card('elsewhere'))).toBe(false);
    });
  });
}
