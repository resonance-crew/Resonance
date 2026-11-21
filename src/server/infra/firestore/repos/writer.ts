import { FieldValue, Timestamp, type DocumentData, type Transaction } from 'firebase-admin/firestore';
import { edgeRowOf, groupRowOf, nodeRowOf } from '@/server/domain/writer';
import type { DraftPatch, MapItems, MapWrite, WriterData, WriterTxRepo } from '@/server/ports/repos/writer';
import type { AdminDb } from '../db';
import { sanitize } from '../mapper';
import { tombstoneRef } from './cards';

// What the clients wrote straight to Firestore (client/thoughtMap.ts, client/cards.ts createCardDraft /
// updateCardDraft, client/cardEdits.ts and the apps' twins), written by the server: the same documents and
// fields, server timestamps where the clients wrote serverTimestamp().

const rowOf = (data: DocumentData | undefined): Record<string, unknown> | null => (data ? sanitize<Record<string, unknown>>(data) : null);
const pairOf = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
/** Firestore's `in` takes at most 30 values. */
const IN_MAX = 30;
const chunks = <T>(list: readonly T[]) => Array.from({ length: Math.ceil(list.length / IN_MAX) }, (_, i) => list.slice(i * IN_MAX, (i + 1) * IN_MAX));

const now = () => FieldValue.serverTimestamp();

/** A draft's autosave as the card's fields: the cover replaced whole, removed fields deleted (media) or null (accentHue). */
function patchFields(patch: DraftPatch): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch.set };
  for (const field of patch.clear) out[field] = field === 'media' ? FieldValue.delete() : null;
  return out;
}

/** The patch as the log keeps it (a removal named, never a FieldValue). */
const loggedPatch = (patch: DraftPatch) => ({ set: patch.set, clear: [...patch.clear] });

export function writerTx(db: AdminDb, tx: Transaction): WriterTxRepo {
  const map = (uid: string) => db.doc(`thoughtMaps/${uid}`);
  const col = { node: 'nodes', edge: 'edges', group: 'groups' } as const;
  return {
    async getMapItems(uid, keys) {
      const refs = [
        ...keys.nodes.map((id) => map(uid).collection('nodes').doc(id)),
        ...keys.edges.map((id) => map(uid).collection('edges').doc(id)),
        ...keys.groups.map((id) => map(uid).collection('groups').doc(id)),
      ];
      const snaps = refs.length ? await tx.getAll(...refs) : [];
      const out: MapItems = { nodes: [], edges: [], groups: [] };
      for (const s of snaps) {
        if (!s.exists) continue;
        const data = rowOf(s.data())!;
        const kind = s.ref.parent.id;
        if (kind === 'nodes') out.nodes.push(nodeRowOf(s.id, data));
        else if (kind === 'edges') out.edges.push(edgeRowOf(s.id, data));
        else out.groups.push(groupRowOf(s.id, data));
      }
      return out;
    },
    async edgesTouching(uid, cardIds) {
      const edges = map(uid).collection('edges');
      const pages = await Promise.all(
        chunks(cardIds).flatMap((ids) => [tx.get(edges.where('sourceCardId', 'in', ids)), tx.get(edges.where('targetCardId', 'in', ids))]),
      );
      const seen = new Map<string, ReturnType<typeof edgeRowOf>>();
      for (const page of pages) for (const d of page.docs) seen.set(d.id, edgeRowOf(d.id, rowOf(d.data())!));
      return [...seen.values()];
    },
    async nodesInGroups(uid, groupIds) {
      const nodes = map(uid).collection('nodes');
      const pages = await Promise.all(chunks(groupIds).map((ids) => tx.get(nodes.where('groupId', 'in', ids))));
      return pages.flatMap((page) => page.docs.map((d) => nodeRowOf(d.id, rowOf(d.data())!)));
    },
    writeMap(uid, writes: readonly MapWrite[]) {
      for (const w of writes) {
        const ref = map(uid).collection(col[w.kind]).doc(w.id);
        if (w.write === 'delete') tx.delete(ref);
        else if (w.write === 'create') {
          // The clients' whole set: a node stamped created and updated now, an arrow and a group created now.
          tx.set(ref, { ...w.fields, createdAt: now(), ...(w.kind === 'node' ? { updatedAt: now() } : {}) });
        } else tx.update(ref, { ...w.fields, ...(w.kind === 'node' ? { updatedAt: now() } : {}) });
      }
    },

    async getCard(id) {
      return rowOf((await tx.get(db.doc(`cards/${id}`))).data());
    },
    async isTombstoned(id) {
      return (await tx.get(tombstoneRef(db, id))).exists;
    },
    async getAnswerTarget(uid, originalId) {
      const original = await tx.get(db.doc(`cards/${originalId}`));
      if (!original.exists) return null;
      const card = rowOf(original.data())!;
      const author = typeof card.authorId === 'string' && card.authorId && !card.authorId.includes('/') ? card.authorId : null;
      if (!author || author === uid) return { card, connected: false, blocked: false };
      const [connection, out, into] = await tx.getAll(
        db.doc(`connections/${pairOf(uid, author)}`),
        db.doc(`users/${uid}/blocks/${author}`),
        db.doc(`users/${author}/blocks/${uid}`),
      );
      return { card, connected: connection.exists, blocked: out.exists || into.exists };
    },
    createDraft(id, author, draft) {
      tx.create(db.doc(`cards/${id}`), {
        authorId: author,
        ...draft,
        translations: {},
        publishedAt: null,
        readCount: 0,
        resonanceCount: 0,
        inviteCount: 0,
        createdAt: now(),
        updatedAt: now(),
      });
    },
    patchDraft(id, patch, rev) {
      // An update, never a merge: a cover sent replaces the stored one whole (a merge would keep a frame left out).
      tx.update(db.doc(`cards/${id}`), { ...patchFields(patch), draftRev: rev, updatedAt: now() });
    },
    logDraftPatch(id, author, entry) {
      tx.set(db.doc(`cards/${id}/draftLog/${entry.rev}`), {
        authorId: author,
        rev: entry.rev,
        patch: loggedPatch(entry.patch),
        at: now(),
        expireAt: Timestamp.fromDate(entry.expireAt),
      });
    },

    async getEdit(id) {
      return rowOf((await tx.get(db.doc(`cards/${id}/edits/current`))).data());
    },
    putEdit(id, author, copy) {
      const { media, ...rest } = copy;
      tx.set(db.doc(`cards/${id}/edits/current`), { ...rest, ...(media ? { media } : {}), authorId: author, updatedAt: now() });
    },
    deleteEdit(id) {
      tx.delete(db.doc(`cards/${id}/edits/current`));
    },
  };
}

export function writerData(db: AdminDb): WriterData {
  return {
    async loadMap(uid) {
      const map = db.doc(`thoughtMaps/${uid}`);
      const [nodes, edges, groups] = await Promise.all([map.collection('nodes').get(), map.collection('edges').get(), map.collection('groups').get()]);
      return {
        nodes: nodes.docs.map((d) => nodeRowOf(d.id, rowOf(d.data())!)),
        edges: edges.docs.map((d) => edgeRowOf(d.id, rowOf(d.data())!)),
        groups: groups.docs.map((d) => groupRowOf(d.id, rowOf(d.data())!)),
      };
    },
    async getCard(id) {
      return rowOf((await db.doc(`cards/${id}`).get()).data());
    },
    async getEdit(id) {
      return rowOf((await db.doc(`cards/${id}/edits/current`).get()).data());
    },
    async draftLog(id) {
      const page = await db.collection(`cards/${id}/draftLog`).get();
      return page.docs
        .map((d) => {
          const data = rowOf(d.data())!;
          return {
            rev: Number(data.rev),
            authorId: String(data.authorId ?? ''),
            patch: data.patch as DraftPatch,
            expireAt: data.expireAt instanceof Date ? data.expireAt : null,
          };
        })
        .sort((a, b) => a.rev - b.rev);
    },
    async deleteDraftLog(id) {
      // A page at a time, a batch per page (the log has nothing under it; recursiveDelete is the account purge's).
      const log = db.collection(`cards/${id}/draftLog`).select().limit(500);
      for (;;) {
        const page = await log.get();
        if (page.empty) return;
        const batch = db.batch();
        for (const d of page.docs) batch.delete(d.ref);
        await batch.commit();
      }
    },
  };
}
