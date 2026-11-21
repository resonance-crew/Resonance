import { SPECS, type EntityName } from '@/server/domain/schema/registry';
import { fromCanonical, type CanonicalRow, type StoreCodec, type ToCanonicalOptions } from '@/server/domain/schema/canonical';
import { readCanonical, rowOfPath, storePath } from '@/server/domain/schema/rows';
import type { CanonicalRead, EntitySource, ImportTarget } from '@/server/ports/portability';
import { instantMillis, isInstant, toInstant, type Instant } from '@/server/ports/time';
import type { MemoryState } from './state';

/**
 * The memory state ⇄ canonical rows. Its tables are named by collection
 * path (`cards`, `cards/c1/edits`), as the memory repos name them. Times are
 * held as the memory repos hold them: a field something is ordered by
 * (`f.instant()`) as its Instant string, any other time as a `Date` — and,
 * since a Date has no microseconds, a known time whose microseconds aren't
 * zero stays an Instant string, so nothing is lost. A generic `$time` (a
 * field no schema names) becomes a Date: below a millisecond is dropped
 * there, the one place memory is lossy (Firestore keeps it).
 * Vectors are `number[]`, references their path, bytes a Uint8Array.
 */

const subMilli = (instant: Instant) => instant.slice(23, 26) !== '000';

export const memoryCodec: StoreCodec = {
  readTime(value, known) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? toInstant(value) : null;
    return known && isInstant(value) ? value : null;
  },
  // A known vector field takes a plain number[] (canonical.ts); nothing else is one here.
  readVector: () => null,
  readRef: () => null,
  readBytes: (value) => (value instanceof Uint8Array ? Buffer.from(value).toString('base64') : null),
  readGeo: () => null,
  writeTime(instant, field) {
    if (field && (field.ordering || subMilli(instant))) return instant;
    return new Date(instantMillis(instant));
  },
  writeVector: (values) => [...values],
  writeRef: (path) => path,
  writeBytes: (base64) => new Uint8Array(Buffer.from(base64, 'base64')),
  writeGeo: (latLng) => [...latLng],
};

/** The tables of the state, sorted, each with the entity it holds (null: none). */
function tablesOf(state: MemoryState): { table: string; entity: EntityName | null; parentId: string | null }[] {
  return Object.keys(state.dump())
    .sort()
    .map((table) => {
      const row = rowOfPath(`${table}/x`);
      if (!row) return { table, entity: null, parentId: null };
      return {
        table,
        entity: row.entity,
        parentId: SPECS[row.entity].parent ? row.id.slice(0, -2) : null,
      };
    });
}

export function memorySource(state: MemoryState, options: ToCanonicalOptions & { kind?: string } = {}): EntitySource {
  return {
    kind: options.kind ?? 'memory',
    async *read(entity): AsyncIterable<CanonicalRead> {
      for (const t of tablesOf(state)) {
        if (t.entity !== entity) continue;
        for (const { id, row } of state.rows(t.table))
          yield readCanonical(entity, t.parentId ? `${t.parentId}/${id}` : id, row, memoryCodec, options);
      }
    },
    async unregistered() {
      return tablesOf(state)
        .filter((t) => !t.entity)
        .map((t) => t.table);
    },
  };
}

export function memoryRow(entity: EntityName, row: CanonicalRow): Record<string, unknown> {
  return fromCanonical(SPECS[entity].schema, row, memoryCodec);
}

export function memoryTarget(state: MemoryState): ImportTarget {
  return {
    kind: 'memory',
    async write(entity, rows) {
      for (const row of rows) {
        const { collection, doc } = storePath(entity, String(row._id));
        state.put(collection, doc, memoryRow(entity, row));
      }
    },
    async finish() {},
  };
}
