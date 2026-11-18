import { FieldPath, type DocumentData, type Firestore, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { mapCard } from '@/lib/db/firestore/mapper';
import { CARD_VISIBILITY_FIELDS, visibleTo } from '@/lib/api/v1/present';
import { READER_SIGNALS } from '@/lib/api/v1/reading';
import { TAPS } from '@/lib/api/v1/taps';

/**
 * A downloadable copy of everything the user wrote — offered before account
 * deletion ("download a backup first") and useful on its own. Only the user's
 * own words: other people's messages and notes are not included. Beside them,
 * what the service records of them on its own (round 26): the cards they
 * resonated with, and how they read cards (the privacy policy says both).
 *
 * It is made as a stream of JSON text (exportAccountJson): the collections
 * are read a page at a time and written out as they come, so a prolific
 * writer's backup neither sits whole in the function's memory nor runs into
 * the platform's limit on a buffered response body (about 4.5 MB on Vercel).
 */
export interface AccountExport {
  exportedAt: string;
  profile: DocumentData | null;
  cards: DocumentData[];
  bookmarks: DocumentData[];
  thoughtMap: { nodes: DocumentData[]; edges: DocumentData[]; groups: DocumentData[] };
  notesSent: DocumentData[];
  messagesSent: DocumentData[];
  /** The cards they resonated with (共振, the tap) and haven't taken back: a title and a link each. */
  cardsResonated: DocumentData[];
  /** How they read cards (lib/api/v1/reading), each record as kept — 180 days past its last read. */
  reading: DocumentData[];
}

/** Documents read per query page (a card can hold a long story). */
const PAGE = 100;

/** Firestore Timestamps → ISO strings so the file is plain JSON. */
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

const row = (d: QueryDocumentSnapshot) => ({ id: d.id, ...(plain(d.data()) as DocumentData) });

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

/** A JSON array of rows, a page at a time. */
async function* array(...sources: AsyncIterable<DocumentData[]>[]): AsyncGenerator<string> {
  let first = true;
  yield '[';
  for (const source of sources) {
    for await (const rows of source) {
      if (!rows.length) continue;
      yield (first ? '' : ',') + rows.map((r) => JSON.stringify(r)).join(',');
      first = false;
    }
  }
  yield ']';
}

async function* rows(q: Query, extra: Record<string, unknown> = {}): AsyncGenerator<DocumentData[]> {
  for await (const docs of pages(q)) yield docs.map((d) => ({ ...extra, ...row(d) }));
}

/**
 * What a note of yours keeps in your export: your words, the card you left
 * them on and when — never whom they reached, nor whether they were read.
 * Every note alike, so no difference between two of them says anything: a
 * note on an anonymous card names its author, one withheld across a block
 * reached no one (`withheldFor` names whom it was withheld from), and a card
 * named now may have been anonymous then.
 */
const NOTE_OMIT = ['toUserId', 'readAt', 'withheldFor'] as const;

async function* noteRows(db: Firestore, uid: string): AsyncGenerator<DocumentData[]> {
  for await (const docs of pages(db.collection('notes').where('fromUserId', '==', uid))) {
    yield docs.map((d) => {
      const r: DocumentData = row(d);
      for (const key of NOTE_OMIT) delete r[key];
      return r;
    });
  }
}

/**
 * What the export says of a card someone else wrote that the account
 * resonated with or read: its title — only while they may still read it — and
 * its link, by id (an anonymous card's slug may hold its author's pen name).
 * Never its author.
 */
async function cardLines(db: Firestore, uid: string, ids: string[]): Promise<Map<string, { cardId: string; title: string | null; link: string }>> {
  const unique = [...new Set(ids)].filter((id) => id && !id.includes('/'));
  const out = new Map<string, { cardId: string; title: string | null; link: string }>();
  if (!unique.length) return out;
  const snaps = await db.getAll(...unique.map((id) => db.doc(`cards/${id}`)), { fieldMask: [...CARD_VISIBILITY_FIELDS, 'thoughtCore'] });
  const cards = snaps.filter((s) => s.exists).map((s) => mapCard(s.id, s.data()!));
  const readable = new Set((await visibleTo(db, uid, cards)).filter((c) => c.authorId !== uid).map((c) => c.id));
  const titles = new Map(cards.map((c) => [c.id, String(c.thoughtCore ?? '')]));
  for (const id of unique) {
    out.set(id, { cardId: id, title: readable.has(id) ? (titles.get(id) ?? null) : null, link: `/card/${encodeURIComponent(id)}` });
  }
  return out;
}

/** The cards the account resonated with (on only), a page at a time: `{ cardId, title, link, at }`. */
async function* tapRows(db: Firestore, uid: string): AsyncGenerator<DocumentData[]> {
  for await (const docs of pages(db.collection(TAPS).where('userId', '==', uid))) {
    const on = docs.filter((d) => d.get('on') === true && typeof d.get('cardId') === 'string');
    const lines = await cardLines(db, uid, on.map((d) => d.get('cardId') as string));
    yield on.map((d) => ({ ...lines.get(d.get('cardId') as string), at: plain(d.get('at')) ?? null }));
  }
}

/** The account's reading records, a page at a time: what was kept, beside the card's title and link. */
const READING_OMIT = ['userId', 'reportDay', 'reportsToday', 'expireAt'] as const;
async function* readingRows(db: Firestore, uid: string): AsyncGenerator<DocumentData[]> {
  for await (const docs of pages(db.collection(READER_SIGNALS).where('userId', '==', uid))) {
    const lines = await cardLines(db, uid, docs.map((d) => String(d.get('cardId') ?? '')));
    yield docs.map((d) => {
      const r: DocumentData = row(d);
      for (const key of READING_OMIT) delete r[key];
      delete r.id;
      return { ...lines.get(String(d.get('cardId') ?? '')), ...r, keptUntil: plain(d.get('expireAt')) ?? null };
    });
  }
}

/**
 * The export, as JSON text in pieces (an AccountExport once joined). The
 * first piece comes after the profile is read, so a caller that waits for it
 * before answering turns a failure to start into an error status rather
 * than a broken file.
 */
export async function* exportAccountJson(db: Firestore, uid: string, now = new Date()): AsyncGenerator<string> {
  const user = db.collection('users').doc(uid);
  const map = db.collection('thoughtMaps').doc(uid);
  const profile = await user.get();
  yield `{"exportedAt":${JSON.stringify(now.toISOString())},"profile":${JSON.stringify(profile.exists ? plain(profile.data()) : null)}`;

  yield ',"cards":';
  yield* array(rows(db.collection('cards').where('authorId', '==', uid)));
  yield ',"bookmarks":';
  yield* array(rows(user.collection('bookmarks')));
  yield ',"thoughtMap":{"nodes":';
  yield* array(rows(map.collection('nodes')));
  yield ',"edges":';
  yield* array(rows(map.collection('edges')));
  yield ',"groups":';
  yield* array(rows(map.collection('groups')));
  yield '},"notesSent":';
  yield* array(noteRows(db, uid));

  yield ',"messagesSent":';
  const conversations = await db.collection('conversations').where('participants', 'array-contains', uid).select().get();
  yield* array(
    ...conversations.docs.map((c) => rows(c.ref.collection('messages').where('senderId', '==', uid), { conversationId: c.id })),
  );
  yield ',"cardsResonated":';
  yield* array(tapRows(db, uid));
  yield ',"reading":';
  yield* array(readingRows(db, uid));
  yield '}';
}

/** The whole export as one object (what the streamed file parses to). */
export async function exportAccountData(db: Firestore, uid: string, now = new Date()): Promise<AccountExport> {
  let text = '';
  for await (const piece of exportAccountJson(db, uid, now)) text += piece;
  return JSON.parse(text) as AccountExport;
}
