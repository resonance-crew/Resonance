// A tiny in-memory stand-in for the Admin SDK's Firestore, for suites that
// render server code (pages, route handlers) without the emulator: documents
// by path, `doc(path).get()` / `.set()` / `.create()`, `getAll(…refs, { fieldMask })`, `collection(name).doc(id)`,
// `batch()` and queries — `where` (`==`, `!=`, `in`, `array-contains`, `<`, `<=`, `>`, `>=`) chained, `orderBy` (a
// field, or `FieldPath.documentId()`), `startAfter` (the order's values, or a snapshot), `select` (which, as in
// Firestore, leaves only the named fields in `data()`), `limit`, `get`. A snapshot's `get` reads a dotted field path
// (`payload.cardId`), as Firestore's does.
// Store timestamps as firebase-admin `Timestamp`s so the real mappers convert
// them. Every read path is recorded in `reads` (a query as
// `name?field==value&…`), so a test can prove a document was never read, and
// every write path in `writes`. `update` merges fields — a dotted key (`payload.fromUserIds`) sets that nested
// field — taking `FieldValue.delete()` and `FieldValue.increment(n)`, and `runTransaction` runs its function once with a
// transaction whose get/getAll/set/update/delete act at once (no isolation: a suite
// that needs a conflict makes it happen inside a fake it passes in).
// `billed()` counts documents as Firestore bills reads: one per document a get
// or getAll asks (there or not), one per document a query answers (at least
// one for a query that answers none) — what the read-count ratchets
// (src/server/readCounts.test.ts) hold down. A query's snapshot has a
// `readTime` (now, as a Timestamp), as Firestore's does. `count()` answers a
// query's count, billed as Firestore bills an aggregation (one read per
// thousand index entries, at least one). With `serverTime`, a
// `FieldValue.serverTimestamp()` written is stored as the commit's time —
// each later than every one before, and every readTime at or after them — so
// a change read by its `editedAt` after a cursor is never missed nor repeated.
// `hold(read)`, if given, is awaited before a read answers (it is logged in
// `reads` first): a suite can keep one read pending and see which others
// were asked meanwhile — that two reads run side by side, or one after the
// other.
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

/** The order key `FieldPath.documentId()` stands for. */
const NAME = '__name__';

export interface FakeAdminDb {
  db: Firestore;
  docs: Record<string, Data>;
  reads: string[];
  writes: string[];
  /** Documents read so far, as Firestore bills them. */
  billed(): number;
}

type Op = '==' | '!=' | 'in' | 'array-contains' | '<' | '<=' | '>' | '>=';
const OPS = new Set<string>(['==', '!=', 'in', 'array-contains', '<', '<=', '>', '>=']);

interface Filter {
  field: string;
  op: Op;
  value: unknown;
}

/** A dotted field path's value in `data` (`payload.cardId`). */
function fieldOf(data: Data | undefined, field: string): unknown {
  let cur: unknown = data;
  for (const part of field.split('.')) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Data)[part];
  }
  return cur;
}
const hasField = (data: Data, field: string) => fieldOf(data, field) !== undefined;

export interface FakeAdminDbOptions {
  hold?: (read: string) => Promise<void> | void;
  /** Store `FieldValue.serverTimestamp()` as the commit's time (see above); off, sentinels are stored as they are. */
  serverTime?: boolean;
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
  if (a instanceof Timestamp && b instanceof Timestamp) return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
  if (typeof a === 'number' || typeof a === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return 0;
}
const same = (a: unknown, b: unknown) => rank(a) === rank(b) && compare(a, b) === 0;

/** A document with only the masked fields — a dotted one (`signature.placeholder`) keeps that nested field alone, as Firestore's does. */
function masked(whole: Data, fields: string[]): Data {
  const out: Data = {};
  for (const field of fields) {
    const [head, ...rest] = field.split('.');
    if (!(head in whole)) continue;
    if (!rest.length) {
      out[head] = whole[head];
      continue;
    }
    const inner = whole[head];
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) continue;
    const picked = masked(inner as Data, [rest.join('.')]);
    if (Object.keys(picked).length) out[head] = { ...((out[head] as Data | undefined) ?? {}), ...picked };
  }
  return out;
}

export function fakeAdminDb(docs: Record<string, Data>, options: FakeAdminDbOptions = {}): FakeAdminDb {
  const reads: string[] = [];
  let billed = 0;
  const held = async (read: string) => {
    reads.push(read);
    await options.hold?.(read);
  };
  const writes: string[] = [];
  // The latest time handed out, a commit's or a read's (serverTime): a commit is a microsecond past it, or now
  // when later — so a commit after a read is always after its readTime, as in Firestore.
  let last: Timestamp | null = null;
  const commitTime = () => {
    const now = Timestamp.now();
    const next = last && compare(now, last) <= 0 ? new Timestamp(last.seconds, last.nanoseconds + 1000) : now;
    last = next.nanoseconds >= 1e9 ? new Timestamp(next.seconds + 1, next.nanoseconds - 1e9) : next;
    return last;
  };
  const readTime = () => {
    const now = Timestamp.now();
    last = last && compare(last, now) > 0 ? last : now;
    return last;
  };
  const isServerTime = (v: unknown) => v instanceof FieldValue && v.isEqual(FieldValue.serverTimestamp());
  /** `data` as stored: with serverTime, its server timestamps the commit's time (one for the whole write). */
  const stamped = (data: Data): Data => {
    if (!options.serverTime || !Object.values(data).some(isServerTime)) return data;
    const at = commitTime();
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, isServerTime(v) ? at : v]));
  };
  const snap = (path: string, fields?: string[]) => {
    const whole = docs[path];
    const data = whole && fields ? masked(whole, fields) : whole;
    return {
      id: path.split('/').pop()!,
      exists: data !== undefined,
      data: () => data,
      get: (field: string) => fieldOf(data, field),
      ref: Object.assign(docRef(path), { path, id: path.split('/').pop()! }),
    };
  };
  const docRef = (path: string) => ({
    get: async () => {
      billed += 1;
      await held(path);
      return snap(path);
    },
    // A plain replace (FieldValue sentinels are stored as they are).
    set: async (data: Data) => {
      writes.push(path);
      docs[path] = stamped(data);
    },
    update: async (data: Data) => update(path, data),
    // Fails (code 6, ALREADY_EXISTS) when the document is there, as Firestore's does.
    create: async (data: Data) => {
      if (docs[path] !== undefined) throw Object.assign(new Error(`fakeAdminDb: ${path} exists`), { code: 6 });
      writes.push(path);
      docs[path] = stamped(data);
    },
    delete: async () => {
      writes.push(path);
      delete docs[path];
    },
  });
  const update = (path: string, given: Data) => {
    if (!docs[path]) throw Object.assign(new Error(`fakeAdminDb: no document to update at ${path}`), { code: 5 });
    writes.push(path);
    const data = stamped(given);
    const next: Data = { ...docs[path] };
    for (const [key, value] of Object.entries(data)) {
      // A dotted key is a field path: the nested field it names, its parents copied rather than shared.
      const parts = key.split('.');
      let into = next;
      for (const part of parts.slice(0, -1)) {
        const inner = into[part];
        into[part] = inner && typeof inner === 'object' && !Array.isArray(inner) && !(inner instanceof Timestamp) ? { ...(inner as Data) } : {};
        into = into[part] as Data;
      }
      const field = parts[parts.length - 1];
      if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete into[field];
      else if (value instanceof FieldValue && typeof (value as { operand?: unknown }).operand === 'number') {
        // FieldValue.increment(n): added to what is there (a missing or non-number field counts as 0).
        const was = into[field];
        into[field] = (typeof was === 'number' ? was : 0) + (value as unknown as { operand: number }).operand;
      } else into[field] = value;
    }
    docs[path] = next;
  };
  interface Spec {
    filters: Filter[];
    order: { field: string; dir: 'asc' | 'desc' }[];
    fields?: string[];
    max: number;
    /** startAfter's boundary: the order's values, or a document path whose values it takes. */
    after?: unknown[] | string;
  }
  /** A query's documents (unbilled), in its order, within its limit. */
  const hitsOf = async (name: string, spec: Spec) => {
    await held(`${name}?${spec.filters.map((f) => `${f.field}${f.op === 'in' ? ' in ' : f.op}${String(f.value)}`).join('&')}`);
    const matches = (f: Filter, v: unknown) => {
      switch (f.op) {
        case 'in':
          return (f.value as unknown[]).some((x) => same(v, x));
        case 'array-contains':
          return Array.isArray(v) && v.some((x) => same(x, f.value));
        case '==':
          return same(v, f.value);
        case '!=':
          return !same(v, f.value);
        default: {
          // A range compares within one type, as Firestore's does.
          if (rank(v) !== rank(f.value)) return false;
          const c = compare(v, f.value);
          return f.op === '<' ? c < 0 : f.op === '<=' ? c <= 0 : f.op === '>' ? c > 0 : c >= 0;
        }
      }
    };
    const value = (p: string, field: string) => (field === NAME ? p.split('/').pop() : fieldOf(docs[p], field));
    const byOrder = (a: unknown[], b: unknown[]) => {
      for (const [i, o] of spec.order.entries()) {
        const c = compare(a[i], b[i]);
        if (c) return o.dir === 'desc' ? -c : c;
      }
      return 0;
    };
    const keyOf = (p: string) => spec.order.map((o) => value(p, o.field));
    const boundary = typeof spec.after === 'string' ? keyOf(spec.after) : spec.after;
    const hits = Object.keys(docs)
      // The collection's own documents (a subcollection's too: `users/bob/blocks`), never those under them.
      .filter((p) => p.startsWith(`${name}/`) && p.split('/').length === name.split('/').length + 1)
      // As in Firestore, a document missing a filtered or ordered field never matches.
      .filter((p) => spec.filters.every((f) => hasField(docs[p], f.field) && matches(f, fieldOf(docs[p], f.field))))
      .filter((p) => spec.order.every((o) => o.field === NAME || hasField(docs[p], o.field)))
      .sort((a, b) => byOrder(keyOf(a), keyOf(b)))
      .filter((p) => !boundary || byOrder(keyOf(p), boundary) > 0)
      .slice(0, spec.max)
      .map((p) => snap(p, spec.fields));
    return hits;
  };
  const query = (name: string, spec: Spec) => ({
    where: (field: string, op: string, value: unknown) => {
      if (!OPS.has(op)) throw new Error(`fakeAdminDb: unsupported operator ${op}`);
      return query(name, { ...spec, filters: [...spec.filters, { field, op: op as Op, value }] });
    },
    // `FieldPath.documentId()` orders by the document's id (kept as NAME).
    orderBy: (field: string | object, dir: 'asc' | 'desc' = 'asc') =>
      query(name, { ...spec, order: [...spec.order, { field: typeof field === 'string' ? field : NAME, dir }] }),
    select: (...fields: string[]) => query(name, { ...spec, fields }),
    limit: (n: number) => query(name, { ...spec, max: n }),
    // A snapshot (its path), or the order's values — a document id where the order names it.
    startAfter: (...values: unknown[]) => {
      const first = values[0] as { ref?: { path?: string } } | undefined;
      return query(name, { ...spec, after: values.length === 1 && first?.ref?.path ? first.ref.path : values });
    },
    get: async () => {
      const hits = await hitsOf(name, spec);
      billed += Math.max(1, hits.length);
      return { docs: hits, empty: hits.length === 0, size: hits.length, readTime: readTime() };
    },
    // An aggregation: one read per thousand index entries it counts, at least one.
    count: () => ({
      get: async () => {
        const n = (await hitsOf(name, spec)).length;
        billed += Math.max(1, Math.ceil(n / 1000));
        return { data: () => ({ count: n }), readTime: readTime() };
      },
    }),
  });
  type Ref = ReturnType<typeof docRef> & { path?: string };
  const pathOf = (ref: Ref) => ref.path!;
  const db = {
    doc: (path: string) => Object.assign(docRef(path), { path, id: path.split('/').pop()! }),
    // getAll(ref…, { fieldMask }?): each document as `doc().get()` gives it, with only the masked fields.
    getAll: async (...args: unknown[]) => {
      const last = args.at(-1) as { fieldMask?: string[]; path?: string } | undefined;
      const read = last && !last.path ? (args.pop() as { fieldMask?: string[] }) : {};
      const refs = args as Ref[];
      billed += refs.length;
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
      doc: (id?: string) => {
        // No id: a new one, as Firestore makes (20 letters and digits).
        const own = id ?? Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
        return Object.assign(docRef(`${name}/${own}`), { path: `${name}/${own}`, id: own });
      },
      ...query(name, { filters: [], order: [], max: Infinity }),
    }),
    // Writes queued and made on commit, in order.
    batch: () => {
      const queued: (() => void)[] = [];
      const b = {
        set: (ref: Ref, data: Data) => (queued.push(() => void ref.set(data)), b),
        update: (ref: Ref, data: Data) => (queued.push(() => update(pathOf(ref), data)), b),
        delete: (ref: Ref) => (queued.push(() => (writes.push(pathOf(ref)), delete docs[pathOf(ref)])), b),
        commit: async () => {
          for (const write of queued) write();
          return [];
        },
      };
      return b;
    },
  };
  return { db: db as unknown as Firestore, docs, reads, writes, billed: () => billed };
}
