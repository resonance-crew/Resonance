/**
 * The emulator answers every query; production refuses one that needs a
 * composite index firebase/firestore.indexes.json doesn't declare
 * (FAILED_PRECONDITION). So every Admin SDK query the emulator suites run is
 * checked here against that file, and refused the way production would —
 * a server path that only works locally fails its test instead of its users
 * (清空垃圾桶's `remaining` count once did: the deletes went through, then the
 * count asked for an index nobody had made).
 *
 * The rule, as Firestore applies it: a query's order is its explicit
 * orderBys, then its inequality fields not ordered yet (by name, in the last
 * direction), then the document name. Equality filters alone, or one ordered
 * field and nothing else, are served by single-field indexes (none for a field
 * exempted in `fieldOverrides`; a collection group query needs its override to
 * name that scope). Anything else needs composite indexes whose fields are some
 * of the equality fields followed by exactly that order — one, or several that
 * between them name every equality field (Firestore merges them). OR queries
 * and vector searches aren't checked.
 */
import { Query } from 'firebase-admin/firestore';
import config from '../../firebase/firestore.indexes.json';

type Dir = 'ASCENDING' | 'DESCENDING';

interface IndexField {
  fieldPath: string;
  order?: Dir;
  arrayConfig?: string;
}

interface Shape {
  collection: string;
  group: boolean;
  /** Equality-like filters (==, in, array-contains), by field. */
  equals: Map<string, 'value' | 'array'>;
  /** The query's order without the document name at its end. */
  order: { field: string; dir: Dir }[];
}

const EQUALS: Record<string, 'value' | 'array'> = {
  EQUAL: 'value',
  IN: 'value',
  ARRAY_CONTAINS: 'array',
  ARRAY_CONTAINS_ANY: 'array',
};
const NAME = '__name__';

interface FilterLike {
  field?: { formattedName: string };
  op?: string;
  operator?: string;
  isInequalityFilter?: () => boolean;
  getFlattenedFilters: () => FilterLike[];
}

interface QueryLike {
  _queryOptions: {
    collectionId: string;
    allDescendants: boolean;
    filters: FilterLike[];
    fieldOrders: { field: { formattedName: string }; direction: Dir }[];
  };
}

/** What production needs of this query, or null for one this guard doesn't judge. */
function shapeOf(query: QueryLike): Shape | null {
  const o = query._queryOptions;
  if (o.filters.some((f) => f.operator === 'OR')) return null;
  const equals = new Map<string, 'value' | 'array'>();
  const inequalities = new Set<string>();
  for (const f of o.filters.flatMap((f) => f.getFlattenedFilters())) {
    const field = f.field?.formattedName;
    if (!field || !f.op) return null;
    if (f.isInequalityFilter?.()) inequalities.add(field);
    else if (EQUALS[f.op]) equals.set(field, EQUALS[f.op]);
    else return null;
  }
  const order = o.fieldOrders.map((x) => ({ field: x.field.formattedName, dir: x.direction }));
  const last = order.length ? order[order.length - 1].dir : 'ASCENDING';
  for (const field of [...inequalities].sort())
    if (field !== NAME && !order.some((x) => x.field === field)) order.push({ field, dir: last });
  while (order.length && order[order.length - 1].field === NAME) order.pop();
  return { collection: o.collectionId, group: o.allDescendants, equals, order };
}

const sameOrder = (fields: IndexField[], order: Shape['order']) =>
  fields.length === order.length && fields.every((f, i) => f.fieldPath === order[i].field && f.order === order[i].dir);

/** The equality fields a declared composite index serves for this order (null: it can't serve it). */
function servedBy(fields: IndexField[], shape: Shape): string[] | null {
  const own = fields[fields.length - 1]?.fieldPath === NAME ? fields.slice(0, -1) : fields;
  const prefix = own.slice(0, own.length - shape.order.length);
  if (!sameOrder(own.slice(prefix.length), shape.order)) return null;
  for (const f of prefix) {
    const kind = shape.equals.get(f.fieldPath);
    if (!kind || (kind === 'array') !== (f.arrayConfig === 'CONTAINS')) return null;
  }
  return prefix.map((f) => f.fieldPath);
}

/** The single-field index a field keeps in this scope (false: exempted, or a group query's never declared). */
function singleField(shape: Shape, field: string, dir: Dir | 'CONTAINS'): boolean {
  const override = config.fieldOverrides?.find((f) => f.collectionGroup === shape.collection && f.fieldPath === field);
  const scope = shape.group ? 'COLLECTION_GROUP' : 'COLLECTION';
  if (!override) return !shape.group;
  return (override.indexes as { order?: string; arrayConfig?: string; queryScope: string }[]).some(
    (i) => i.queryScope === scope && (i.order === dir || i.arrayConfig === dir),
  );
}

/** Why production would refuse this query (the index it would ask for), or null when it would answer. */
export function missingIndex(query: QueryLike): string | null {
  const shape = shapeOf(query);
  if (!shape) return null;
  const describe = () =>
    `${shape.collection} (${shape.group ? 'collection group' : 'collection'}): ` +
    [...[...shape.equals.keys()].map((f) => `${f} ==`), ...shape.order.map((x) => `${x.field} ${x.dir}`)].join(', ');
  // Single-field indexes: equalities merged, or one ordered field alone.
  if (!shape.order.length || (!shape.equals.size && shape.order.length === 1)) {
    const fields = [
      ...[...shape.equals].map(([f, kind]) => [f, kind === 'array' ? 'CONTAINS' : 'ASCENDING'] as const),
      ...shape.order.map((x) => [x.field, x.dir] as const),
    ];
    return fields.every(([f, dir]) => singleField(shape, f, dir)) ? null : `a single-field index: ${describe()}`;
  }
  const scope = shape.group ? 'COLLECTION_GROUP' : 'COLLECTION';
  const covered = new Set<string>();
  for (const index of config.indexes) {
    if (index.collectionGroup !== shape.collection || index.queryScope !== scope) continue;
    const served = servedBy(index.fields as IndexField[], shape);
    if (served) served.forEach((f) => covered.add(f));
    if (served && served.length === shape.equals.size) return null;
  }
  return [...shape.equals.keys()].every((f) => covered.has(f)) ? null : `a composite index: ${describe()}`;
}

// Every query the suites run goes through toProto (gets, streams, counts, transactions): an
// internal of the SDK's, so it is reached untyped.
const proto = Query.prototype as unknown as { toProto: (...args: unknown[]) => unknown };
const toProto = proto.toProto;
proto.toProto = function guarded(this: QueryLike, ...args: unknown[]) {
  const missing = missingIndex(this);
  if (missing) throw new Error(`9 FAILED_PRECONDITION: The query requires ${missing} (firebase/firestore.indexes.json)`);
  return toProto.apply(this, args);
};
