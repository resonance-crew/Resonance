import { cardPagePaths, landingPagePaths, profilePagePaths } from '@/lib/api/revalidate';
import { isQueriedField, personQuery, SPECS, type EntityName, type ExportSection, type PersonQuery } from '@/server/domain/schema/registry';
import type { AccountData, AccountTxRepo, ExportCardLine, PurgeSession } from '@/server/ports/repos/account';
import type { MemoryState, Row } from '../state';
import type { MemoryTx } from '../uow';
import { bellEdited } from './bell';

/**
 * `account` over a MemoryState. Tables are named by collection path, as
 * Firestore's: `cards`, and for a subcollection `users/alice/blocks` — so a
 * collection group is every table whose last segment is its name, and a
 * tree is a row with every table under its path. The purge's plan is the
 * registry's, as on Firestore; the export's titles (cardLines) are a
 * simplification: a card's title shows when it is public, named and someone
 * else's (no blocks, no connections).
 */

const DELETIONS = 'accountDeletions';

/** `account` inside a memory transaction: the account aggregate needs none. */
export function accountTx(_tx: MemoryTx): AccountTxRepo {
  return {};
}

/** The value at a dotted field path (`payload.fromUserId`). */
function at(row: Row, field: string): unknown {
  let value: unknown = row;
  for (const part of field.split('.')) value = value && typeof value === 'object' ? (value as Row)[part] : undefined;
  return value;
}

function matches(row: Row, q: { field: string; op: PersonQuery['op'] }, uid: string): boolean {
  const value = at(row, q.field);
  return q.op === 'array-contains' ? Array.isArray(value) && value.includes(uid) : value === uid;
}

function plain(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  return value;
}

const split = (path: string) => {
  const i = path.lastIndexOf('/');
  return { table: path.slice(0, i), id: path.slice(i + 1) };
};

export function accountData(state: MemoryState): AccountData {
  const tables = () => Object.keys(state.dump());
  /** The tables an entity's rows live in: the collection, or every one of a collection group. */
  const tablesOf = (entity: EntityName, group: boolean) =>
    group ? tables().filter((t) => t.split('/').length % 2 === 1 && t.split('/').length > 1 && t.endsWith(`/${entity}`)) : [entity];
  const find = (q: PersonQuery, uid: string) =>
    tablesOf(q.entity, q.group).flatMap((table) => state.rows(table, (row) => matches(row, q, uid)).map((r) => ({ path: `${table}/${r.id}`, row: r.row })));
  const deleteDoc = (path: string) => {
    const { table, id } = split(path);
    state.delete(table, id);
  };
  const deleteTree = (path: string) => {
    deleteDoc(path);
    for (const table of tables()) if (table.startsWith(`${path}/`)) for (const r of state.rows(table)) state.delete(table, r.id);
  };

  return {
    async putDeletion(deletion) {
      state.put(DELETIONS, deletion.uid, { ...deletion });
    },
    async getDeletion(uid) {
      const row = state.get(DELETIONS, uid);
      return row ? { uid, requestedAt: row.requestedAt as Date, purgeAfter: row.purgeAfter as Date } : null;
    },
    async deleteDeletion(uid) {
      state.delete(DELETIONS, uid);
    },
    async dueDeletions(now) {
      const ms = (v: unknown) => (v instanceof Date ? v.getTime() : 0);
      return state
        .rows(DELETIONS, (row) => row.purgeAfter instanceof Date && row.purgeAfter <= now)
        .map((r) => ({ uid: r.id, at: ms(r.row.triedAt) || ms(r.row.purgeAfter) }));
    },
    async noteTried(uid, now) {
      if (state.get(DELETIONS, uid)) state.merge(DELETIONS, uid, { triedAt: now });
    },
    async removeDevices(uid) {
      for (const r of state.rows('devices', (row) => row.userId === uid)) state.delete('devices', r.id);
    },

    async collect(uid, plan) {
      const pageEntities = new Set<string>(plan.steps.get('pages') ?? []);
      const byCardEntities = new Set<string>(plan.steps.get('byCard') ?? []);
      const roots = plan.roots.map((entity) => `${entity}/${uid}`);
      const found = plan.trees.map((q) => ({ q, rows: find(q, uid) }));
      const profileEntity = plan.roots.find((e) => pageEntities.has(e));
      const profile = profileEntity ? state.get(profileEntity, uid) : null;
      const paged = found.flatMap((f) => (pageEntities.has(f.q.entity) ? f.rows : []));
      const published = paged.filter((r) => r.row.publishedAt != null && r.row.trashedAt == null);
      const pages = [
        ...published.flatMap((r) => cardPagePaths({ id: split(r.path).id, slug: typeof r.row.slug === 'string' ? r.row.slug : null })),
        ...profilePagePaths(profile?.handle),
        ...landingPagePaths(...published.map((r) => r.row)),
      ];
      const trees = found.flatMap((f) => f.rows.map((r) => r.path));
      const cards = new Set(found.flatMap((f) => (byCardEntities.has(f.q.entity) ? f.rows.map((r) => r.path) : [])));
      const cardTable = [...byCardEntities][0];
      const byCard = new Map<string, string[]>();
      for (const { entity, field } of plan.byCard) {
        for (const r of state.rows(entity, (row) => cards.has(`${cardTable}/${String(row[field])}`))) {
          const card = `${cardTable}/${String(r.row[field])}`;
          byCard.set(card, [...(byCard.get(card) ?? []), `${entity}/${r.id}`]);
        }
      }
      const treePaths = new Set([...trees, ...roots]);
      const inTree = (path: string) => {
        const parts = path.split('/');
        for (let i = 2; i <= parts.length; i += 2) if (treePaths.has(parts.slice(0, i).join('/'))) return true;
        return false;
      };
      const first = new Set([...byCard.values()].flat());
      const singles = new Set<string>();
      for (const q of plan.rows) for (const r of find(q, uid)) if (!inTree(r.path) && !first.has(r.path)) singles.add(r.path);
      return { trees, roots, singles: [...singles], byCard, pages, handle: typeof profile?.handle === 'string' ? profile.handle : '' };
    },

    async deleteDocs(paths) {
      paths.forEach(deleteDoc);
    },
    async retireCard(path) {
      const { table, id } = split(path);
      const slug = state.get(table, id)?.slug;
      state.put('cardTombstones', id, { deletedAt: new Date() });
      if (typeof slug === 'string' && slug && !slug.includes('/')) state.put('retiredSlugs', slug, { retiredAt: new Date() });
    },
    async holdHandle(handle) {
      const key = handle.trim().toLowerCase();
      if (key && !key.includes('/')) state.put('handleHolds', key, { heldFor: null, releasedAt: new Date() });
    },
    async removeFromTapRows(uid) {
      const rows = state.rows('notifications', (row) => matches(row, { field: 'payload.fromUserIds', op: 'array-contains' }, uid));
      for (const r of rows) {
        const left = (at(r.row, 'payload.fromUserIds') as string[]).filter((u) => u !== uid);
        if (!left.length) state.delete('notifications', r.id);
        else state.put('notifications', r.id, { ...r.row, payload: { ...(r.row.payload as Row), fromUserIds: left }, ...bellEdited(state) });
      }
      return rows.length;
    },
    async uploadedKeys(uid) {
      return state
        .rows('uploads', (row) => row.ownerId === uid)
        .map((r) => r.row.key)
        .filter((k): k is string => typeof k === 'string' && k.length > 0);
    },
    async chatPicturePage(uid, field, limit) {
      const page = state.rows('chatImages', (row) => row[field] === uid).slice(0, limit);
      return {
        paths: page.map((r) => `chatImages/${r.id}`),
        files: page.flatMap((r) => [r.row.key, r.row.thumbKey].filter((k): k is string => typeof k === 'string' && k.length > 0)),
      };
    },
    openSession(): PurgeSession {
      return {
        deleteTree: async (path) => deleteTree(path),
        deleteDoc: async (path) => deleteDoc(path),
        flush: async () => {},
        close: async () => {},
      };
    },

    async exportDoc(section, uid) {
      const row = state.get(section.entity, uid);
      return row ? (plain(row) as Row) : null;
    },
    async exportTrees(section, uid) {
      const parent = SPECS[section.entity].parent;
      const field = parent && SPECS[parent].uid.find(isQueriedField);
      return parent && field ? find(personQuery(parent, field), uid).map((r) => split(r.path).id) : [];
    },
    async *exportRows(section: ExportSection, uid: string, treeId?: string) {
      const parent = SPECS[section.entity].parent;
      const f = section.find;
      const table = f.kind === 'where' ? section.entity : f.kind === 'under' ? `${parent}/${uid}/${section.entity}` : `${parent}/${treeId}/${section.entity}`;
      const rows = state.rows(table, (row) => (f.kind === 'where' || f.kind === 'inTrees' ? row[f.field] === uid : true));
      if (rows.length) yield rows.map((r) => ({ id: r.id, data: plain(r.row) as Row }));
    },
    async cardLines(uid, ids) {
      const out = new Map<string, ExportCardLine>();
      for (const id of new Set(ids)) {
        if (!id || id.includes('/')) continue;
        const card = state.get('cards', id);
        const readable = card && card.visibility === 'public' && card.anonymous !== true && card.authorId !== uid;
        out.set(id, { cardId: id, title: readable ? String(card.thoughtCore ?? '') : null, link: `/card/${encodeURIComponent(id)}` });
      }
      return out;
    },
  };
}
