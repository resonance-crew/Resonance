import type { InsightSignature } from '@/lib/db/types';
import type { PickLog } from '@/lib/push/picks';
import { RECOMMENDATIONS, readStored, shownCounts } from '@/lib/recommend/stored';
import type { CardIndexFields, ConnectionCard, PicksWrite, RecommendData, RecommendTxRepo, StoredPoolStats } from '@/server/ports/repos/recommend';
import type { MemoryState, Row } from '../state';
import type { MemoryTx } from '../uow';

/**
 * Tables, named after the collections, rows shaped as their documents with
 * Dates for times: `recommendations`, `userProfiles`, `cardSignatures`,
 * `config` (`recommendPool`), and the ones the recommender reads of others'
 * aggregates — `cards`, `notes`, `resonanceTaps`, `users/{uid}/bookmarks`,
 * `readerSignals`, `connections`, `devices`, `pickPushes`,
 * `notificationSettings`. What the store stamps is the wall clock's.
 */
const CARD_SIGNATURES = 'cardSignatures';
const CONFIG = 'config';
const POOL_STATS_ID = 'recommendPool';

const ms = (v: unknown): number | null => (v instanceof Date ? v.getTime() : null);
const idOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/');
/** A dotted field's value (`signature.placeholder`). */
const field = (row: Row | null | undefined, path: string): unknown =>
  path.split('.').reduce<unknown>((cur, part) => (cur && typeof cur === 'object' ? (cur as Row)[part] : undefined), row);

/** A build's result as written on `recommendations/{uid}` (undefined: the field removed by the merge). */
function picksFields(p: PicksWrite): Row {
  return {
    date: p.date,
    items: p.items,
    partial: p.partial,
    coldStart: p.coldStart === true,
    generatedAt: new Date(),
    leaseUntil: undefined,
    failedAt: undefined,
    ...(p.warm ? { warm: true } : { warm: undefined, askedOn: p.date }),
  };
}

/** Every Date in a row (deeply) as ms; null/absent as undefined. */
function datesToMs(v: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) return v.map(datesToMs);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v as Row).map(([k, x]) => [k, datesToMs(x)]));
  return v;
}

/**
 * `pickPushes/{uid}` as lib/push/picks readPickLog reads it, its times Dates
 * here (that module isn't loaded for a memory test: the contract holds the
 * two to the same answer).
 */
function pickLogOf(row: Row | null): PickLog {
  const data = datesToMs(row) as Row | undefined;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const recent = Array.isArray(data?.recent)
    ? (data.recent as unknown[]).flatMap((r) => {
        const cardId = (r as { cardId?: unknown } | null)?.cardId;
        const at = num((r as { at?: unknown } | null)?.at);
        return typeof cardId === 'string' && at !== null ? [{ cardId, at }] : [];
      })
    : [];
  const sentAt = Array.isArray(data?.sentAt) ? (data.sentAt as unknown[]).map(num).filter((v): v is number => v !== null) : [];
  return { recent, sentAt };
}

/** A merge's fields with `undefined` dropped, for a row being made (MemoryTx.merge drops them itself). */
const defined = (fields: Row): Row => Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

export function recommendTx(tx: MemoryTx): RecommendTxRepo {
  return {
    async getPicks(uid) {
      return readStored(tx.get(RECOMMENDATIONS, uid) ?? undefined);
    },
    async getShown(uid) {
      return shownCounts(tx.get(RECOMMENDATIONS, uid) ?? undefined);
    },
    putLease(uid, until) {
      tx.merge(RECOMMENDATIONS, uid, { leaseUntil: new Date(until) });
    },
    putServedPicks(uid, p, shown) {
      tx.merge(RECOMMENDATIONS, uid, { ...picksFields(p), shown });
    },
    putAsked(uid, day, shown) {
      tx.merge(RECOMMENDATIONS, uid, { askedOn: day, shown });
    },
    async getCardText(cardId) {
      const row = tx.get('cards', cardId);
      if (!row) return null;
      return { thoughtCore: row.thoughtCore, story: row.story, thin: row.thin === true, signature: row.signature as InsightSignature | undefined };
    },
    async cardExists(cardId) {
      return tx.get('cards', cardId) !== null;
    },
    patchCardIndexed(cardId, hash) {
      // Read before the write (the card was read in this transaction already: getCardText).
      const signature = { ...((tx.state.get('cards', cardId)?.signature as Row | undefined) ?? {}), contentHash: hash };
      tx.merge('cards', cardId, { signature, indexPendingAt: undefined });
    },
    patchCardThin(cardId, thin) {
      tx.merge('cards', cardId, { thin: thin ? true : undefined });
    },
    putReading(cardId, row) {
      tx.put(CARD_SIGNATURES, cardId, { ...row, updatedAt: new Date() });
    },
    mergeReadingFailure(cardId, failure) {
      tx.merge(CARD_SIGNATURES, cardId, { ...failure, failedAt: new Date() });
    },
  };
}

function cardIndexFields(row: Row): CardIndexFields {
  return {
    publishedAt: row.publishedAt,
    thoughtCore: row.thoughtCore,
    story: row.story,
    authorId: row.authorId,
    visibility: row.visibility,
    trashed: row.trashedAt != null,
    thin: row.thin === true,
    contentHash: typeof field(row, 'signature.contentHash') === 'string' ? (field(row, 'signature.contentHash') as string) : undefined,
    indexPending: row.indexPendingAt != null,
  };
}

export function recommendData(state: MemoryState): RecommendData {
  const where = (table: string, test: (row: Row) => boolean, limit = Infinity) => state.rows(table, (row) => test(row)).slice(0, limit);
  return {
    async getPicks(uid) {
      return readStored(state.get(RECOMMENDATIONS, uid) ?? undefined);
    },
    async putPicks(uid, p) {
      state.merge(RECOMMENDATIONS, uid, picksFields(p));
    },
    async putFailure(uid, at) {
      state.merge(RECOMMENDATIONS, uid, { failedAt: new Date(at), leaseUntil: undefined });
    },
    async putProfile(uid, taste, against) {
      state.put('userProfiles', uid, { taste, against, updatedAt: new Date() });
    },

    async readerActivity(uid, limit) {
      return {
        own: where('cards', (r) => r.authorId === uid, limit).map(({ id, row }) => ({
          id,
          publishedAt: ms(row.publishedAt),
          trashed: row.trashedAt != null,
          referenceCardId: row.referenceCardId,
        })),
        notes: where('notes', (r) => r.fromUserId === uid, limit).map(({ row }) => ({ cardId: row.cardId, createdAt: ms(row.createdAt) })),
        taps: where('resonanceTaps', (r) => r.userId === uid, limit).map(({ row }) => ({ cardId: row.cardId, on: row.on === true, at: ms(row.at) })),
        saved: state
          .rows(`users/${uid}/bookmarks`)
          .slice(0, limit)
          .map(({ id, row }) => ({ id, cardId: row.cardId, createdAt: ms(row.createdAt) })),
        reading: where('readerSignals', (r) => r.userId === uid, limit).map(({ row }) => ({
          cardId: row.cardId,
          lastAt: ms(row.lastAt),
          reachedEndAt: ms(row.reachedEndAt),
          rereads: row.rereads,
          rereadAt: ms(row.rereadAt),
          shared: row.shared === true,
          activeSeconds: row.activeSeconds,
          maxProgress: row.maxProgress,
          expectedSeconds: row.expectedSeconds,
        })),
        shown: shownCounts(state.get(RECOMMENDATIONS, uid) ?? undefined),
      };
    },
    async connectionIds(uid) {
      const out = new Set<string>();
      for (const { row } of where('connections', (r) => Array.isArray(r.userIds) && r.userIds.includes(uid)))
        for (const id of row.userIds as unknown[]) if (idOk(id) && id !== uid) out.add(id);
      return [...out].sort();
    },
    async engagedAuthorIds(uid) {
      const refIds = new Set(
        where('cards', (r) => r.authorId === uid, 100)
          .filter(({ row }) => row.publishedAt != null && row.visibility === 'public' && row.anonymous !== true)
          .map(({ row }) => row.referenceCardId)
          .filter(idOk),
      );
      const authors = new Set<string>();
      for (const id of refIds) {
        const row = state.get('cards', id);
        if (!row || row.anonymous === true) continue;
        if (typeof row.authorId === 'string' && row.authorId !== uid) authors.add(row.authorId);
      }
      return authors;
    },
    async namedCardIds(cardIds) {
      return new Set(
        cardIds.filter(idOk).filter((id) => {
          const row = state.get('cards', id);
          return row !== null && row.anonymous !== true;
        }),
      );
    },
    async unlistedForStrangers(cardIds) {
      return new Set(cardIds.filter(idOk).filter((id) => state.get(CARD_SIGNATURES, id)?.listedForStrangers === false));
    },
    async connectionCards(authorIds) {
      const authors = new Set(authorIds);
      const out: ConnectionCard[] = [];
      for (const { id, row } of where('cards', (r) => authors.has(String(r.authorId)), 200)) {
        if (row.visibility !== 'public' || row.anonymous === true || row.publishedAt == null || row.trashedAt != null) continue;
        if (row.thin === true || field(row, 'signature.placeholder') === true) continue;
        out.push({ cardId: id, authorId: String(row.authorId), publishedAt: ms(row.publishedAt) ?? 0 });
      }
      return out;
    },

    async getPoolStats(embedModel) {
      const row = state.get<StoredPoolStats & Row>(CONFIG, POOL_STATS_ID);
      if (!row || row.embedModel !== embedModel) return null;
      return { ...row, at: ms(row.at) ?? 0 };
    },
    async putPoolStats(stats) {
      state.put(CONFIG, POOL_STATS_ID, { ...stats, at: new Date() });
    },

    async getCardForIndex(cardId) {
      const row = state.get('cards', cardId);
      return row ? cardIndexFields(row) : null;
    },
    async getCardVisibility(cardId) {
      const row = state.get('cards', cardId);
      return row ? { visibility: row.visibility, trashed: row.trashedAt != null } : null;
    },
    async markIndexPending(cardId) {
      if (!state.get('cards', cardId)) return 'not-found';
      state.merge('cards', cardId, { indexPendingAt: new Date() });
      return 'ok';
    },
    async clearIndexPending(cardId) {
      if (state.get('cards', cardId)) state.merge('cards', cardId, { indexPendingAt: undefined });
    },
    async putCardSignature(cardId, signature) {
      if (!state.get('cards', cardId)) return 'not-found';
      state.merge('cards', cardId, defined({ signature, indexedAt: new Date() }));
      return 'ok';
    },
    async listIndexPending(limit) {
      return where('cards', (r) => r.indexPendingAt != null)
        .sort((a, b) => (ms(a.row.indexPendingAt) ?? 0) - (ms(b.row.indexPendingAt) ?? 0) || (a.id < b.id ? -1 : 1))
        .slice(0, limit)
        .map(({ id }) => id);
    },
    async listTemplated(limit) {
      return where(CARD_SIGNATURES, (r) => r.templated === true, limit).map(({ id, row }) => ({ cardId: id, rewritten: row.rewritten === true }));
    },

    async warmInputs(uid) {
      const seen = where('devices', (r) => r.userId === uid && typeof r.token === 'string' && r.token !== '').map(({ row }) => ms(row.updatedAt) ?? 0);
      return {
        lastSeen: Math.max(0, ...seen),
        picks: readStored(state.get(RECOMMENDATIONS, uid) ?? undefined),
        pickLog: pickLogOf(state.get('pickPushes', uid)),
      };
    },
    async *pickReaders(opts) {
      const ids = where('notificationSettings', (r) => r.picks === true).map(({ id }) => id);
      // From just after `from` to the end, then from the start up to it (push/settings optedIn).
      const ordered = [...ids.filter((id) => id > opts.from), ...ids.filter((id) => id <= opts.from)];
      const size = opts.pageSize ?? 200;
      for (let i = 0; i < ordered.length; i += size) yield ordered.slice(i, i + size);
    },
  };
}
