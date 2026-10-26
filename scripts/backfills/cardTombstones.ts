import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import { TOMBSTONE, tombstoneRef } from '../../src/lib/db/firestore/tombstones';

const PAGE = 500;
/** Cards read at once (getAll). */
const CARDS_AT_ONCE = 100;
/** What a client-made card id looks like: the only ids the rules let a new card take. */
const CARD_ID = /^[A-Za-z0-9]{20}$/;

export interface CardTombstonesReport {
  /** Card ids something still names. */
  named: number;
  /** Of those, the ones with no card: tombstoned (or that would be, without `apply`). */
  gone: number;
  written: number;
}

/**
 * Tombstones (`cardTombstones/{id}`) for cards deleted before deleting a card
 * left one. Every server path that deletes a card now writes it, and the
 * rules refuse a new card under such an id — but an id deleted earlier is
 * still free, and what still names it (another reader's resonance, a
 * bookmark, a card shared in a thread, a bell, a thought-map node, a legacy
 * card link, a pending edit left behind) would follow whoever created a card
 * under it. Only the ids something names, and only ids a client could take.
 * A tombstone holds no uid. Idempotent; with `apply: false` it only counts.
 */
export async function backfillCardTombstones(
  db: Firestore,
  opts: { apply: boolean; log?: (line: string) => void },
): Promise<CardTombstonesReport> {
  const log = opts.log ?? console.log;
  const named = new Set<string>();
  const note = (v: unknown) => {
    if (typeof v === 'string' && CARD_ID.test(v)) named.add(v);
  };

  await each(db.collection('cards').select('referenceCardId', 'trashedFrom'), (d) => {
    note(d.get('referenceCardId'));
    note(d.get('trashedFrom.referenceCardId'));
  });
  await each(db.collectionGroup('bookmarks').select('cardId'), (d) => {
    note(d.id);
    note(d.get('cardId'));
  });
  await each(db.collectionGroup('messages').select('cardRef', 'replyTo'), (d) => {
    note(d.get('cardRef'));
    note(d.get('replyTo.cardRef'));
  });
  await each(db.collection('conversations').select('request'), (d) => note(d.get('request.cardId')));
  await each(db.collection('notifications').select('payload'), (d) => note(d.get('payload.cardId')));
  await each(db.collectionGroup('nodes').select('cardId'), (d) => {
    note(d.id);
    note(d.get('cardId'));
  });
  await each(db.collection('cardLinks').select('sourceCardId', 'targetCardId'), (d) => {
    note(d.get('sourceCardId'));
    note(d.get('targetCardId'));
  });
  await each(db.collectionGroup('edits').select(), (d) => note(d.ref.parent.parent?.id));

  const ids = [...named];
  const gone: string[] = [];
  for (let i = 0; i < ids.length; i += CARDS_AT_ONCE) {
    const slice = ids.slice(i, i + CARDS_AT_ONCE);
    const [cards, stones] = await Promise.all([
      db.getAll(...slice.map((id) => db.doc(`cards/${id}`)), { fieldMask: [] }),
      db.getAll(...slice.map((id) => tombstoneRef(db, id)), { fieldMask: [] }),
    ]);
    const kept = new Set(stones.filter((s) => s.exists).map((s) => s.id));
    for (const c of cards) if (!c.exists && !kept.has(c.id)) gone.push(c.id);
  }
  log(`card ids still named: ${named.size}; with no card and no tombstone: ${gone.length}`);
  let written = 0;
  if (opts.apply) {
    for (let i = 0; i < gone.length; i += PAGE) {
      const batch = db.batch();
      gone.slice(i, i + PAGE).forEach((id) => batch.set(tombstoneRef(db, id), TOMBSTONE));
      await batch.commit();
      written += Math.min(PAGE, gone.length - i);
    }
    log(`tombstones written: ${written}`);
  }
  return { named: named.size, gone: gone.length, written };
}

/** Every document of `query`, a page at a time by document path. */
async function each(query: Query, visit: (d: FirebaseFirestore.QueryDocumentSnapshot) => void): Promise<void> {
  let after: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let page = query.orderBy(FieldPath.documentId()).limit(PAGE);
    if (after) page = page.startAfter(after);
    const snap = await page.get();
    snap.docs.forEach(visit);
    if (snap.size < PAGE) return;
    after = snap.docs[snap.size - 1];
  }
}
