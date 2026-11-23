import type { StorySummary } from '@/server/domain/summary';
import type { PassageSource, SummarySource, SummaryWriter, TranslationsData, TranslationsTxRepo } from '@/server/ports/repos/translations';
import type { MemoryState, Row } from '../state';
import type { MemoryTx } from '../uow';

/**
 * `translations` over memory: the summary fields on the `cards` table (times
 * as Date), and each card's kept story translations in
 * `cards/{id}/translations`, by language.
 */

const translationsTable = (cardId: string) => `cards/${cardId}/translations`;
const time = (v: unknown): number | null => (v instanceof Date ? v.getTime() : null);

/** The stored summary while it still describes the story (storedSummary's rule over Dates); else null. */
function storedSummary(row: Row): StorySummary | null {
  const { excerpt, readMinutes, excerptAt, updatedAt } = row;
  const at = time(excerptAt);
  if (typeof excerpt !== 'string' || !Number.isInteger(readMinutes) || (readMinutes as number) < 1 || at === null) return null;
  if (updatedAt != null && (time(updatedAt) === null || time(updatedAt)! > at)) return null;
  return { excerpt, readMinutes: readMinutes as number };
}

function sourceOf(row: Row): SummarySource {
  return {
    title: typeof row.thoughtCore === 'string' ? row.thoughtCore : '',
    story: typeof row.story === 'string' ? row.story : '',
    storedExcerpt: storedSummary(row)?.excerpt ?? null,
    published: row.publishedAt != null,
    visibility: row.visibility,
    trashed: row.trashedAt != null,
    translations: row.summaryTranslations,
  };
}

function passageSourceOf(row: Row): PassageSource {
  return {
    title: typeof row.thoughtCore === 'string' ? row.thoughtCore : '',
    story: typeof row.story === 'string' ? row.story : '',
    fields: row,
    tapPassages: row.tapPassages,
    insight: (() => {
      const sig = row.signature as { coreInsight?: unknown } | undefined;
      return typeof sig?.coreInsight === 'string' && sig.coreInsight.trim() ? sig.coreInsight : null;
    })(),
  };
}

/** A row's version: its whole content (memory keeps no update times). */
const versionOf = (row: Row | null) => (row ? JSON.stringify(row) : '');

export function translationsTx(tx: MemoryTx): TranslationsTxRepo {
  return {
    async getSummarySource(id) {
      const row = tx.get('cards', id);
      return row ? sourceOf(row) : null;
    },
    putSummaryTranslations(id, value) {
      tx.merge('cards', id, { summaryTranslations: value });
    },
    async getPassageSource(id) {
      const row = tx.get('cards', id);
      return row ? passageSourceOf(row) : null;
    },
    putTapPassages(id, value) {
      tx.merge('cards', id, { tapPassages: { ...value, at: new Date() } });
    },
  };
}

export function translationsData(state: MemoryState): TranslationsData {
  return {
    async getSummarySource(id) {
      const row = state.get('cards', id);
      return row ? sourceOf(row) : null;
    },
    async removeSummaryTranslations(id) {
      if (!state.get('cards', id)) throw new Error(`No card ${id} to update`);
      state.merge('cards', id, { summaryTranslations: undefined });
    },
    async getPassageSource(id) {
      const row = state.get('cards', id);
      return row ? passageSourceOf(row) : null;
    },
    async removeTapPassages(id) {
      if (!state.get('cards', id)) throw new Error(`No card ${id} to update`);
      state.merge('cards', id, { tapPassages: undefined });
    },
    async putTapPassagesFailed(id, failed) {
      const row = state.get('cards', id);
      if (!row) throw new Error(`No card ${id} to update`);
      const stored = row.tapPassages && typeof row.tapPassages === 'object' ? (row.tapPassages as Record<string, unknown>) : {};
      state.merge('cards', id, { tapPassages: { ...stored, failed: { ...failed } } });
    },

    async getKeptTranslation(cardId, to) {
      const kept = state.get(translationsTable(cardId), to);
      if (!kept || typeof kept.title !== 'string' || typeof kept.story !== 'string') return null;
      return { hash: typeof kept.hash === 'string' ? kept.hash : null, title: kept.title, story: kept.story };
    },
    async keepTranslation(cardId, to, value) {
      state.put(translationsTable(cardId), to, { ...value, createdAt: new Date() });
    },

    async summaryPage(after, limit) {
      return state
        .rows('cards', (_row, id) => !after || id > after)
        .slice(0, limit)
        .map(({ id, row }) => ({
          id,
          published: row.publishedAt != null,
          story: typeof row.story === 'string' ? row.story : '',
          stored: storedSummary(row),
          version: versionOf(row),
        }));
    },
    summaryWriter(): SummaryWriter {
      return {
        async keep(id, summary, version) {
          const row = state.get('cards', id);
          if (!row) return 'failed';
          if (versionOf(row) !== version) return 'changed';
          state.merge('cards', id, { ...summary, excerptAt: new Date() });
          return 'written';
        },
        async close() {},
      };
    },

    async hasAnswerTo(uid, cardId) {
      return state.rows('cards', (row) => row.authorId === uid && row.referenceCardId === cardId).length > 0;
    },
  };
}
