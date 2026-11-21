import { DocumentReference, FieldValue, GeoPoint, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { ENTITY_NAMES, SPECS, type EntityName } from '@/server/domain/schema/registry';
import { fromCanonical, type CanonicalRow, type StoreCodec, type ToCanonicalOptions } from '@/server/domain/schema/canonical';
import { readCanonical, storePath } from '@/server/domain/schema/rows';
import type { CanonicalRead, EntitySource, ImportTarget } from '@/server/ports/portability';
import { instantFromParts, instantParts, isInstant, toInstant } from '@/server/ports/time';

/**
 * Firestore ⇄ canonical rows (plan §4.1–§4.2, scripts/portability): a
 * Timestamp is an Instant (its microseconds kept: a server time has them), a
 * DocumentReference its path, a VectorValue `number[]`, Bytes base64, a
 * GeoPoint `[lat, lng]`. What a read hands back holds no FieldValue
 * sentinel (they only exist on the way in); one seen is refused, as is any
 * other class the codec doesn't know.
 */

const isVectorValue = (v: unknown): v is { toArray(): number[] } =>
  !!v && typeof v === 'object' && v.constructor?.name === 'VectorValue' && typeof (v as { toArray?: unknown }).toArray === 'function';

export function firestoreCodec(db: Firestore): StoreCodec {
  return {
    readTime(value) {
      if (value instanceof Timestamp) return instantFromParts(value.seconds, value.nanoseconds);
      if (value instanceof FieldValue) throw new TypeError('A FieldValue sentinel in a read');
      return null;
    },
    readVector: (value) => (isVectorValue(value) ? [...value.toArray()] : null),
    readRef: (value) => (value instanceof DocumentReference ? value.path : null),
    readBytes: (value) => (value instanceof Uint8Array ? Buffer.from(value).toString('base64') : null),
    readGeo: (value) => (value instanceof GeoPoint ? [value.latitude, value.longitude] : null),
    writeTime(instant) {
      const { seconds, nanos } = instantParts(instant);
      return new Timestamp(seconds, nanos);
    },
    writeVector: (values) => FieldValue.vector(values),
    writeRef: (path) => db.doc(path),
    writeBytes: (base64) => Buffer.from(base64, 'base64'),
    writeGeo: ([lat, lng]) => new GeoPoint(lat, lng),
  };
}

/** A page of a scan: documents are read in pages, so a large collection never sits in one answer. */
const PAGE = 500;

async function* documents(db: Firestore, entity: EntityName): AsyncIterable<{ id: string; data: DocumentData }> {
  const parent = SPECS[entity].parent;
  const query = parent ? db.collectionGroup(entity) : db.collection(entity);
  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let page = query.orderBy('__name__').limit(PAGE);
    if (last) page = page.startAfter(last);
    const snap = await page.get();
    for (const doc of snap.docs) {
      if (!parent) {
        yield { id: doc.id, data: doc.data() };
        continue;
      }
      // A collection group reaches every collection of the name: only the registered parent's, one level down.
      const parentDoc = doc.ref.parent.parent;
      if (!parentDoc || parentDoc.parent.id !== parent || parentDoc.parent.parent) continue;
      yield { id: `${parentDoc.id}/${doc.id}`, data: doc.data() };
    }
    if (snap.size < PAGE) return;
    last = snap.docs[snap.docs.length - 1];
  }
}

/** Every registered entity of this Firestore, read as canonical rows (scripts/portability/export.ts). */
export function firestoreSource(db: Firestore, options: ToCanonicalOptions & { kind?: string } = {}): EntitySource {
  const codec = firestoreCodec(db);
  return {
    kind: options.kind ?? 'firestore',
    async *read(entity): AsyncIterable<CanonicalRead> {
      for await (const { id, data } of documents(db, entity)) yield readCanonical(entity, id, data, codec, options);
    },
    async unregistered() {
      const top = (await db.listCollections()).map((c) => c.id);
      const known = new Set<string>(ENTITY_NAMES.filter((e) => !SPECS[e].parent));
      return top.filter((id) => !known.has(id)).sort();
    },
  };
}

/** The stored document of a canonical row. */
export function firestoreRow(db: Firestore, entity: EntityName, row: CanonicalRow): DocumentData {
  return fromCanonical(SPECS[entity].schema, row, firestoreCodec(db));
}

/**
 * Writes canonical rows into a Firestore — the emulator only: the import
 * refuses any other (scripts/portability/import.ts asks before it builds
 * this, and this asks again).
 */
export function firestoreTarget(db: Firestore): ImportTarget {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('An import writes only into the Firestore emulator (FIRESTORE_EMULATOR_HOST is not set)');
  const writer = db.bulkWriter();
  return {
    kind: 'emulator',
    async write(entity, rows) {
      for (const row of rows) {
        const { collection, doc } = storePath(entity, String(row._id));
        void writer.set(db.collection(collection).doc(doc), firestoreRow(db, entity, row));
      }
      await writer.flush();
    },
    async finish() {
      await writer.close();
    },
  };
}

/**
 * A Firestore for the portability scripts: the emulator's (FIRESTORE_EMULATOR_HOST set, a `demo-` project)
 * on its own app, or — `owner` only — the service's own, from the environment's service account, whose
 * project must be the one asked for.
 */
export async function openFirestore(project: string, mode: 'emulator' | 'owner'): Promise<Firestore> {
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (mode === 'emulator') {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is not set');
    const name = `portability-${project}`;
    const app = getApps().find((a) => a.name === name) ?? initializeApp({ projectId: project }, name);
    return getFirestore(app);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is set: the owner mode reads the real project');
  const configured = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (configured !== project) throw new Error(`--project ${project} is not the environment's project`);
  const { getAdminDb } = await import('./db');
  return getAdminDb();
}

/** For tests: a Date or an Instant as the Timestamp Firestore would hold. */
export function timestampOf(at: Date | string): Timestamp {
  const instant = typeof at === 'string' && isInstant(at) ? at : toInstant(new Date(at));
  const { seconds, nanos } = instantParts(instant);
  return new Timestamp(seconds, nanos);
}
