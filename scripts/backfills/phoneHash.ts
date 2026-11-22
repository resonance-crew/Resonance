import { FieldPath, FieldValue, type Firestore } from 'firebase-admin/firestore';

const PAGE = 400;

/**
 * Profiles made before audit L10 (`ae7c040f`) all hold `phoneHash: ''`, a
 * field nothing reads (the web maps a missing one to `''`, the API never
 * answered it, no app build ever named it): the empty ones lose it. Only a
 * value exactly `''` goes; any other value — a real hash, or something odd —
 * is kept and only counted. Only that field is written (no date, nothing
 * else), each update held to the document as it was read (`lastUpdateTime`),
 * so a profile changed meanwhile is skipped and counted, not overwritten.
 *
 * Idempotent; with `apply: false` it only counts (count queries and an
 * id-only read of the empty ones: nothing written).
 */
export async function removeEmptyPhoneHashes(db: Firestore, opts: { apply: boolean; log?: (line: string) => void }) {
  const log = opts.log ?? console.log;
  const users = db.collection('users');
  const [empty, other] = await Promise.all([
    users.where('phoneHash', '==', '').count().get(),
    // Every profile whose phoneHash is a value other than '' (another string, a number…; Firestore's != leaves out null and a missing field): kept.
    users.where('phoneHash', '!=', '').count().get(),
  ]);
  const counts = { empty: empty.data().count, kept: other.data().count };
  log(`profiles with phoneHash '' (to remove): ${counts.empty}; with any other non-null value (kept): ${counts.kept}`);
  if (!opts.apply || !counts.empty) return { ...counts, removed: 0, skipped: 0 };

  let removed = 0;
  let skipped = 0;
  let after: string | null = null;
  for (;;) {
    let page = users.where('phoneHash', '==', '').orderBy(FieldPath.documentId()).select().limit(PAGE);
    if (after) page = page.startAfter(after);
    const snap = await page.get();
    if (snap.empty) break;
    const writer = db.bulkWriter();
    // A failed precondition (the profile changed since this read) is not retried: it is skipped.
    writer.onWriteError(() => false);
    const writes = snap.docs.map((d) =>
      writer.update(d.ref, { phoneHash: FieldValue.delete() }, { lastUpdateTime: d.updateTime }).then(
        () => void removed++,
        () => void skipped++,
      ),
    );
    await writer.close();
    await Promise.all(writes);
    if (snap.size < PAGE) break;
    after = snap.docs[snap.size - 1].id;
  }
  log(`removed the empty phoneHash from ${removed} profile(s)${skipped ? `; ${skipped} changed meanwhile, left as they are (run again)` : ''}`);
  return { ...counts, removed, skipped };
}
