import { DRAFT_HEAD_FIELDS, edgeRowOf, groupRowOf, nodeRowOf } from '@/server/domain/writer';
import type { DraftPatch, MapItems, WriterData, WriterTxRepo } from '@/server/ports/repos/writer';
import type { MemoryState, Row } from '../state';
import type { MemoryTx } from '../uow';

/**
 * `writer` over memory, tables named by collection path as Firestore's:
 * `thoughtMaps/{uid}/nodes|edges|groups`, `cards`, `cards/{id}/edits`
 * (`current`), `cards/{id}/draftLog` (by rev), `cardTombstones`,
 * `connections` (by `a_b`), `users/{uid}/blocks`. Times are the service's `at`.
 */

const nodes = (uid: string) => `thoughtMaps/${uid}/nodes`;
const edges = (uid: string) => `thoughtMaps/${uid}/edges`;
const groups = (uid: string) => `thoughtMaps/${uid}/groups`;
const EDITS = (id: string) => `cards/${id}/edits`;
const LOG = (id: string) => `cards/${id}/draftLog`;
const pairOf = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const TABLE = { node: nodes, edge: edges, group: groups } as const;

/** A draft's autosave as the card's fields: `undefined` removes a field in a merge (MemoryState.merge). */
function patchFields(patch: DraftPatch): Row {
  const out: Row = { ...patch.set };
  for (const field of patch.clear) out[field] = field === 'media' ? undefined : null;
  return out;
}

type Read = <T extends Row = Row>(table: string, id: string) => T | null;
type Rows = <T extends Row = Row>(table: string, where?: (row: T, id: string) => boolean) => { id: string; row: T }[];

function reads(get: Read, rows: Rows) {
  return {
    loadItems(uid: string): MapItems {
      return {
        nodes: rows(nodes(uid)).map((r) => nodeRowOf(r.id, r.row)),
        edges: rows(edges(uid)).map((r) => edgeRowOf(r.id, r.row)),
        groups: rows(groups(uid)).map((r) => groupRowOf(r.id, r.row)),
      };
    },
    card: (id: string) => get('cards', id),
    edit: (id: string) => get(EDITS(id), 'current'),
  };
}

export function writerTx(tx: MemoryTx): WriterTxRepo {
  const r = reads(tx.get.bind(tx) as Read, tx.rows.bind(tx) as Rows);
  return {
    async getMapItems(uid, keys) {
      const pick = <T>(table: string, ids: readonly string[], of: (id: string, row: Row) => T) =>
        ids.flatMap((id) => {
          const row = tx.get(table, id);
          return row ? [of(id, row)] : [];
        });
      return { nodes: pick(nodes(uid), keys.nodes, nodeRowOf), edges: pick(edges(uid), keys.edges, edgeRowOf), groups: pick(groups(uid), keys.groups, groupRowOf) };
    },
    async edgesTouching(uid, cardIds) {
      return tx.rows(edges(uid), (row) => cardIds.includes(row.sourceCardId as string) || cardIds.includes(row.targetCardId as string)).map((e) => edgeRowOf(e.id, e.row));
    },
    async nodesInGroups(uid, groupIds) {
      return tx.rows(nodes(uid), (row) => typeof row.groupId === 'string' && groupIds.includes(row.groupId)).map((n) => nodeRowOf(n.id, n.row));
    },
    writeMap(uid, writes, at) {
      for (const w of writes) {
        const table = TABLE[w.kind](uid);
        if (w.write === 'delete') tx.delete(table, w.id);
        else if (w.write === 'create') tx.put(table, w.id, { ...w.fields, createdAt: at, ...(w.kind === 'node' ? { updatedAt: at } : {}) });
        else {
          if (!tx.state.get(table, w.id)) throw new Error(`No ${w.kind} ${w.id} to update`);
          tx.merge(table, w.id, { ...w.fields, ...(w.kind === 'node' ? { updatedAt: at } : {}) });
        }
      }
    },

    async getCard(id) {
      return r.card(id);
    },
    async getDraftHead(id) {
      const card = r.card(id);
      return card ? Object.fromEntries(DRAFT_HEAD_FIELDS.filter((f) => f in card).map((f) => [f, card[f]])) : null;
    },
    async isTombstoned(id) {
      return !!tx.get('cardTombstones', id);
    },
    async getAnswerTarget(uid, originalId) {
      const card = tx.get('cards', originalId);
      if (!card) return null;
      const author = typeof card.authorId === 'string' ? card.authorId : null;
      if (!author || author === uid) return { card, connected: false, blocked: false };
      return {
        card,
        connected: !!tx.get('connections', pairOf(uid, author)),
        blocked: !!tx.get(`users/${uid}/blocks`, author) || !!tx.get(`users/${author}/blocks`, uid),
      };
    },
    createDraft(id, author, draft, at) {
      tx.put('cards', id, { authorId: author, ...draft, translations: {}, publishedAt: null, readCount: 0, resonanceCount: 0, inviteCount: 0, createdAt: at, updatedAt: at });
    },
    patchDraft(id, patch, rev, at) {
      tx.merge('cards', id, { ...patchFields(patch), draftRev: rev, updatedAt: at });
    },
    logDraftPatch(id, author, entry, at) {
      tx.put(LOG(id), String(entry.rev), { authorId: author, rev: entry.rev, patch: { set: entry.patch.set, clear: [...entry.patch.clear] }, at, expireAt: entry.expireAt });
    },

    async getEdit(id) {
      return r.edit(id);
    },
    putEdit(id, author, copy, at) {
      const { media, ...rest } = copy;
      tx.put(EDITS(id), 'current', { ...rest, ...(media ? { media } : {}), authorId: author, updatedAt: at });
    },
    deleteEdit(id) {
      tx.delete(EDITS(id), 'current');
    },
  };
}

export function writerData(state: MemoryState): WriterData {
  const r = reads(state.get.bind(state) as Read, state.rows.bind(state) as Rows);
  return {
    async loadMap(uid) {
      return r.loadItems(uid);
    },
    async getCard(id) {
      return r.card(id);
    },
    async getEdit(id) {
      return r.edit(id);
    },
    async draftLog(id) {
      return state
        .rows(LOG(id))
        .map(({ row }) => ({
          rev: Number(row.rev),
          authorId: String(row.authorId ?? ''),
          patch: row.patch as DraftPatch,
          expireAt: row.expireAt instanceof Date ? row.expireAt : null,
        }))
        .sort((a, b) => a.rev - b.rev);
    },
    async deleteDraftLog(id) {
      for (const { id: rev } of state.rows(LOG(id))) state.delete(LOG(id), rev);
    },
  };
}
