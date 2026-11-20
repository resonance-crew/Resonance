import { FieldPath, Timestamp, type BulkWriter, type DocumentData, type DocumentReference, type Query, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { cardPagePaths, landingPagePaths, profilePagePaths } from '@/lib/api/revalidate';
import { chatImageFiles, CHAT_IMAGES } from '@/lib/api/v1/chatImages';
import { CARD_VISIBILITY_FIELDS, visibleTo } from '@/lib/api/v1/present';
import { handleKey, holdHandle, reservable } from '@/lib/db/firestore/handles';
import { mapCard } from '@/lib/db/firestore/mapper';
import { RETIRED_SLUG, TOMBSTONE, retirable, retiredSlugRef, tombstoneRef } from '@/lib/db/firestore/tombstones';
import { purgeTapRows } from '@/lib/push/tapBell';
import { uploadedKeys } from '@/lib/storage/uploads';
import { isQueriedField, personQuery, SPECS, type EntityName, type ExportSection, type PersonQuery, type PurgePlan } from '@/server/domain/schema/registry';
import type { AccountCollection, AccountData, AccountTxRepo, ExportCardLine, ExportRow, PurgeSession } from '@/server/ports/repos/account';
import type { AdminDb } from '../db';

export type { BulkWriter };

/** The deletion requests (admin-only: the rules deny every client). */
export const DELETIONS_COLLECTION = 'accountDeletions';

/** Firestore `in` queries accept at most 30 values. */
const IN_CHUNK = 30;
/** A batch's limit on writes. */
const BATCH_MAX = 500;
/** Documents read per export page (a card can hold a long story). */
const PAGE = 100;
/** What a card's purge reads of it: its pages (slug, published, public) and whether it is in the trash. */
const CARD_PAGE_FIELDS = ['slug', 'publishedAt', 'visibility', 'trashedAt'] as const;

/** `account` inside a Firestore transaction: the account aggregate needs none. */
export function accountTx(_db: AdminDb, _tx: Transaction): AccountTxRepo {
  return {};
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(0);
}

/** Firestore Timestamps → ISO strings so the export is plain JSON. */
function plain(value: unknown): unknown {
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

/** A person field as a Firestore query (a collection group one for a subcollection). */
function query(db: AdminDb, q: PersonQuery, uid: string): Query {
  return (q.group ? db.collectionGroup(q.entity) : db.collection(q.entity)).where(q.field, q.op, uid);
}

/** The entities that need `step`, per the plan. */
const needing = (plan: PurgePlan, step: Parameters<PurgePlan['steps']['get']>[0]) => new Set<EntityName>(plan.steps.get(step) ?? []);

/** One run's deletes through `writer`; closing it closes the writer. */
export function firestorePurgeSession(db: AdminDb, writer: BulkWriter): PurgeSession {
  return {
    deleteTree: (path) => db.recursiveDelete(db.doc(path), writer),
    deleteDoc: (path) => writer.delete(db.doc(path)).then(() => undefined),
    flush: () => writer.flush(),
    close: () => writer.close(),
  };
}

/** `q` a page at a time, in document id order. */
async function* pages(q: Query): AsyncGenerator<QueryDocumentSnapshot[]> {
  let after: string | null = null;
  for (;;) {
    let page = q.orderBy(FieldPath.documentId()).limit(PAGE);
    if (after) page = page.startAfter(after);
    const snap = await page.get();
    if (snap.empty) return;
    yield snap.docs;
    if (snap.size < PAGE) return;
    after = snap.docs[snap.size - 1].id;
  }
}

/** `account` outside a transaction: the purge and the export, their queries derived from the registry. */
export function accountData(db: AdminDb): AccountData {
  const deletions = () => db.collection(DELETIONS_COLLECTION);

  return {
    async putDeletion(deletion) {
      await deletions().doc(deletion.uid).set(deletion);
    },

    async getDeletion(uid) {
      const snap = await deletions().doc(uid).get();
      if (!snap.exists) return null;
      const data = snap.data()!;
      return { uid, requestedAt: toDate(data.requestedAt), purgeAfter: toDate(data.purgeAfter) };
    },

    async deleteDeletion(uid) {
      await deletions().doc(uid).delete();
    },

    async dueDeletions(now) {
      const due = await deletions().where('purgeAfter', '<=', now).select('purgeAfter', 'triedAt').get();
      const at = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : v instanceof Date ? v.getTime() : 0);
      return due.docs.map((d) => ({ uid: d.id, at: at(d.get('triedAt')) || at(d.get('purgeAfter')) }));
    },

    async noteTried(uid, now) {
      await deletions().doc(uid).update({ triedAt: now });
    },

    async removeDevices(uid) {
      const devices = await db.collection('devices').where('userId', '==', uid).get();
      if (!devices.empty) {
        const batch = db.batch();
        devices.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    },

    /**
     * Every record of the account, as the registry's plan finds it: its
     * roots (`{collection}/{uid}`), its trees (cards, conversations — only
     * ids and the fields the pages need are read), the records found through
     * its cards (`byCard`), and the single records naming it. A record
     * inside a tree goes with the tree, one found through a card with the
     * card.
     */
    async collect(uid, plan) {
      const pageTrees = needing(plan, 'pages');
      const byCardTrees = needing(plan, 'byCard');
      const roots: DocumentReference[] = plan.roots.map((entity) => db.collection(entity).doc(uid));
      const profileEntity = plan.roots.find((e) => pageTrees.has(e));

      const [treeSnaps, profile] = await Promise.all([
        Promise.all(
          plan.trees.map((q) => {
            const found = query(db, q, uid);
            return (pageTrees.has(q.entity) ? found.select(...CARD_PAGE_FIELDS) : found.select()).get();
          }),
        ),
        profileEntity ? db.collection(profileEntity).doc(uid).get() : null,
      ]);

      // Only a published card ever had a page someone could have cached; a
      // public one may be on the landing page too. One in the trash has none
      // left: its pages were revalidated when it went in, and show nothing
      // since. Revalidating them now, beside the profile, would tie an
      // anonymous one to it — the moment its cache starts again would be the
      // account's (no outsider learns from its going: it was gone to them at
      // the trash, see cardByKeyForAnyone).
      const paged = plan.trees.flatMap((q, i) => (pageTrees.has(q.entity) ? treeSnaps[i].docs : []));
      const published = paged.filter((d) => d.get('publishedAt') != null && d.get('trashedAt') == null);
      const pagesToDrop = [
        ...published.flatMap((d) => cardPagePaths({ id: d.id, slug: typeof d.get('slug') === 'string' ? d.get('slug') : null })),
        ...profilePagePaths(profile?.get('handle')),
        ...landingPagePaths(...published.map((d) => d.data())),
      ];
      const trees = treeSnaps.flatMap((s) => s.docs.map((d) => d.ref));

      // Records found through one of the cards: chunked `in` queries on the card's id.
      const cardIds = plan.trees.flatMap((q, i) => (byCardTrees.has(q.entity) ? treeSnaps[i].docs.map((d) => d.id) : []));
      const cardCollection = [...byCardTrees][0];
      const cardQueries: Query[] = [];
      for (let i = 0; i < cardIds.length; i += IN_CHUNK) {
        const chunk = cardIds.slice(i, i + IN_CHUNK);
        for (const { entity, field } of plan.byCard) cardQueries.push(db.collection(entity).where(field, 'in', chunk));
      }
      const fieldOf = new Map(plan.byCard.map((b) => [b.entity as string, b.field]));

      const [snaps, cardSnaps] = await Promise.all([
        Promise.all(plan.rows.map((q) => query(db, q, uid).select().get())),
        Promise.all(cardQueries.map((q) => q.select(...new Set(plan.byCard.map((b) => b.field))).get())),
      ]);
      const byCard = new Map<string, string[]>();
      for (const d of cardSnaps.flatMap((s) => s.docs)) {
        const path = `${cardCollection}/${d.get(fieldOf.get(d.ref.parent.id) ?? 'cardId')}`;
        byCard.set(path, [...(byCard.get(path) ?? []), d.ref.path]);
      }
      const treePaths = new Set([...trees, ...roots].map((r) => r.path));
      // A record inside a tree (a card's pending edit) goes with the tree.
      const inTree = (path: string) => {
        const parts = path.split('/');
        for (let i = 2; i <= parts.length; i += 2) if (treePaths.has(parts.slice(0, i).join('/'))) return true;
        return false;
      };
      const first = new Set([...byCard.values()].flat());
      const singles = new Set<string>();
      for (const snap of snaps) {
        for (const d of snap.docs) if (!inTree(d.ref.path) && !first.has(d.ref.path)) singles.add(d.ref.path);
      }
      const handle = profile?.get('handle');
      return {
        trees: trees.map((r) => r.path),
        roots: roots.map((r) => r.path),
        singles: [...singles],
        byCard,
        pages: pagesToDrop,
        handle: typeof handle === 'string' ? handle : '',
      } satisfies AccountCollection;
    },

    async deleteDocs(paths) {
      for (let i = 0; i < paths.length; i += BATCH_MAX) {
        const batch = db.batch();
        for (const path of paths.slice(i, i + BATCH_MAX)) batch.delete(db.doc(path));
        await batch.commit();
      }
    },

    async retireCard(path) {
      const ref = db.doc(path);
      const slug = (await ref.get()).get('slug');
      await Promise.all([tombstoneRef(db, ref.id).set(TOMBSTONE), retirable(slug) ? retiredSlugRef(db, slug).set(RETIRED_SLUG) : null]);
    },

    async holdHandle(handle) {
      if (handle && reservable(handleKey(handle))) await holdHandle(db, handle, null);
    },

    removeFromTapRows: (uid) => purgeTapRows(db, uid),

    uploadedKeys: (uid) => uploadedKeys(db, uid),

    async chatPicturePage(uid, field, limit) {
      const page = await db.collection(CHAT_IMAGES).where(field, '==', uid).select('key', 'thumbKey').limit(limit).get();
      return { paths: page.docs.map((d) => d.ref.path), files: chatImageFiles(page.docs) };
    },

    openSession: () => firestorePurgeSession(db, db.bulkWriter()),

    async exportDoc(section, uid) {
      const snap = await db.collection(section.entity).doc(uid).get();
      return snap.exists ? (plain(snap.data()) as Record<string, unknown>) : null;
    },

    async exportTrees(section, uid) {
      const parent = SPECS[section.entity].parent;
      if (!parent) return [];
      const field = SPECS[parent].uid.find(isQueriedField);
      if (!field) return [];
      const snap = await query(db, personQuery(parent, field), uid).select().get();
      return snap.docs.map((d) => d.id);
    },

    async *exportRows(section, uid, treeId) {
      for await (const docs of pages(exportQuery(db, section, uid, treeId))) {
        yield docs.map((d): ExportRow => ({ id: d.id, data: plain(d.data()) as DocumentData }));
      }
    },

    /**
     * What the export says of a card someone else wrote that the account
     * resonated with or read: its title — only while they may still read it
     * — and its link, by id (an anonymous card's slug may hold its author's
     * pen name). Never its author.
     */
    async cardLines(uid, ids) {
      const unique = [...new Set(ids)].filter((id) => id && !id.includes('/'));
      const out = new Map<string, ExportCardLine>();
      if (!unique.length) return out;
      const snaps = await db.getAll(...unique.map((id) => db.doc(`cards/${id}`)), { fieldMask: [...CARD_VISIBILITY_FIELDS, 'thoughtCore'] });
      const cards = snaps.filter((s) => s.exists).map((s) => mapCard(s.id, s.data()!));
      const readable = new Set((await visibleTo(db, uid, cards)).filter((c) => c.authorId !== uid).map((c) => c.id));
      const titles = new Map(cards.map((c) => [c.id, String(c.thoughtCore ?? '')]));
      for (const id of unique) {
        out.set(id, { cardId: id, title: readable.has(id) ? (titles.get(id) ?? null) : null, link: `/card/${encodeURIComponent(id)}` });
      }
      return out;
    },
  };
}

/** The Firestore query an export section reads. */
function exportQuery(db: AdminDb, section: ExportSection, uid: string, treeId?: string): Query {
  const parent = SPECS[section.entity].parent;
  switch (section.find.kind) {
    case 'where':
      return db.collection(section.entity).where(section.find.field, '==', uid);
    case 'under':
      return db.collection(parent!).doc(uid).collection(section.entity);
    case 'inTrees':
      return db.collection(parent!).doc(treeId!).collection(section.entity).where(section.find.field, '==', uid);
    case 'doc':
      throw new Error(`export section ${section.key} is a document (exportDoc)`);
  }
}
