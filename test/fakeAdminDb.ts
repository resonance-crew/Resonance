// A tiny in-memory stand-in for the Admin SDK's Firestore, for suites that
// render server code (pages, route handlers) without the emulator: documents
// by path, `doc(path).get()` / `.set()`, `getAll(…refs, { fieldMask })`, `collection(name).doc(id)` and
// queries — `where` (`==`, `!=`, `in`) chained, `orderBy`, `select` (which, as
// in Firestore, leaves only the named fields in `data()`), `limit`, `get`.
// Store timestamps as firebase-admin `Timestamp`s so the real mappers convert
// them. Every read path is recorded in `reads` (a query as
// `name?field==value&…`), so a test can prove a document was never read, and
// every write path in `writes`. `update` merges top-level fields (taking
// `FieldValue.delete()` and `FieldValue.increment(n)`), and `runTransaction` runs its function once with a
// transaction whose get/getAll/set/update/delete act at once (no isolation: a suite
// that needs a conflict makes it happen inside a fake it passes in).
// `hold(read)`, if given, is awaited before a read answers (it is logged in
// `reads` first): a suite can keep one read pending and see which others
// were asked meanwhile — that two reads run side by side, or one after the
// other.
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

export interface FakeAdminDb {
  db: Firestore;
  docs: Record<string, Data>;
  reads: string[];
  writes: string[];
}

interface Filter {
  field: string;
  op: '==' | '!=' | 'in';
  value: unknown;
}

export interface FakeAdminDbOptions {
  hold?: (read: string) => Promise<void> | void;
}

/** Firestore's order across types (null < booleans < numbers < timestamps < strings), then within one. */
function rank(v: unknown): number {
  if (v === null) return 0;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 2;
  if (v instanceof Timestamp) return 3;
  if (typeof v === 'string') return 4;
  return 5;
}
function compare(a: unknown, b: unknown): number {
  const byType = rank(a) - rank(b);
  if (byType) return byType;
  if (a instanceof Timestamp && b instanceof Timestamp) return a.toMillis() - b.toMillis();
  if (typeof a === 'number' || typeof a === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return 0;
}
const same = (a: unknown, b: unknown) => rank(a) === rank(b) && compare(a, b) === 0;

export function fakeAdminDb(docs: Record<string, Data>, options: FakeAdminDbOptions = {}): FakeAdminDb {
  const reads: string[] = [];
  const held = async (read: string) => {
    reads.push(read);
    await options.hold?.(read);
  };
  const writes: string[] = [];
  const snap = (path: string, fields?: string[]) => {
    const whole = docs[path];
    const data = whole && fields ? Object.fromEntries(fields.filter((f) => f in whole).map((f) => [f, whole[f]])) : whole;
    return {
      id: path.split('/').pop()!,
      exists: data !== undefined,
      data: () => data,
      get: (field: string) => data?.[field],
    };
  };
  const docRef = (path: string) => ({
    get: async () => {
      await held(path);
      return snap(path);
    },
    // A plain replace (FieldValue sentinels are stored as they are).
    set: async (data: Data) => {
      writes.push(path);
      docs[path] = data;
    },
    update: async (data: Data) => update(path, data),
  });
  const update = (path: string, data: Data) => {
    if (!docs[path]) throw Object.assign(new Error(`fakeAdminDb: no document to update at ${path}`), { code: 5 });
    writes.push(path);
    const next = { ...docs[path] };
    for (const [field, value] of Object.entries(data)) {
      if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete next[field];
      else if (value instanceof FieldValue && typeof (value as { operand?: unknown }).operand === 'number') {
        // FieldValue.increment(n): added to what is there (a missing or non-number field counts as 0).
        const was = next[field];
        next[field] = (typeof was === 'number' ? was : 0) + (value as unknown as { operand: number }).operand;
      } else next[field] = value;
    }
    docs[path] = next;
  };
  interface Spec {
    filters: Filter[];
    order: { field: string; dir: 'asc' | 'desc' }[];
    fields?: string[];
    max: number;
  }
  const query = (name: string, spec: Spec) => ({
    where: (field: string, op: string, value: unknown) => {
      if (op !== '==' && op !== '!=' && op !== 'in') throw new Error(`fakeAdminDb: unsupported operator ${op}`);
      return query(name, { ...spec, filters: [...spec.filters, { field, op, value }] });
    },
    orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => query(name, { ...spec, order: [...spec.order, { field, dir }] }),
    select: (...fields: string[]) => query(name, { ...spec, fields }),
    limit: (n: number) => query(name, { ...spec, max: n }),
    get: async () => {
      await held(`${name}?${spec.filters.map((f) => `${f.field}${f.op === 'in' ? ' in ' : f.op}${String(f.value)}`).join('&')}`);
      const matches = (f: Filter, v: unknown) =>
        f.op === 'in' ? (f.value as unknown[]).some((x) => same(v, x)) : same(v, f.value) === (f.op === '==');
      const hits = Object.keys(docs)
        .filter((p) => p.startsWith(`${name}/`) && p.split('/').length === 2)
        // As in Firestore, a document missing a filtered or ordered field never matches.
        .filter((p) => spec.filters.every((f) => f.field in docs[p] && matches(f, docs[p][f.field])))
        .filter((p) => spec.order.every((o) => o.field in docs[p]))
        .sort((a, b) => {
          for (const o of spec.order) {
            const c = compare(docs[a][o.field], docs[b][o.field]);
            if (c) return o.dir === 'desc' ? -c : c;
          }
          return 0;
        })
        .slice(0, spec.max)
        .map((p) => snap(p, spec.fields));
      return { docs: hits, empty: hits.length === 0, size: hits.length };
    },
  });
  type Ref = ReturnType<typeof docRef> & { path?: string };
  const pathOf = (ref: Ref) => ref.path!;
  const db = {
    doc: (path: string) => Object.assign(docRef(path), { path }),
    // getAll(ref…, { fieldMask }?): each document as `doc().get()` gives it, with only the masked fields.
    getAll: async (...args: unknown[]) => {
      const last = args.at(-1) as { fieldMask?: string[]; path?: string } | undefined;
      const read = last && !last.path ? (args.pop() as { fieldMask?: string[] }) : {};
      const refs = args as Ref[];
      await Promise.all(refs.map((ref) => held(pathOf(ref))));
      return refs.map((ref) => snap(pathOf(ref), read.fieldMask));
    },
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: (ref: Ref) => ref.get(),
        getAll: (...args: unknown[]) => db.getAll(...args),
        set: (ref: Ref, data: Data) => void ref.set(data),
        update: (ref: Ref, data: Data) => update(pathOf(ref), data),
        delete: (ref: Ref) => {
          writes.push(pathOf(ref));
          delete docs[pathOf(ref)];
        },
      }),
    collection: (name: string) => ({
      doc: (id: string) => Object.assign(docRef(`${name}/${id}`), { path: `${name}/${id}` }),
      ...query(name, { filters: [], order: [], max: Infinity }),
    }),
  };
  return { db: db as unknown as Firestore, docs, reads, writes };
}
