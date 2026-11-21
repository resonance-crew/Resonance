import { ENTITY_NAMES } from '@/server/domain/schema/registry';
import type { CanonicalRow } from '@/server/domain/schema/canonical';
import type { EntitySource, ImportTarget } from '@/server/ports/portability';

/** How many rows go to a target in one `write`. */
export const BATCH = 400;

/** Every entity of the source into the target, a batch at a time; returns the rows written per entity. */
export async function load(source: EntitySource, target: ImportTarget, batch = BATCH): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const entity of ENTITY_NAMES) {
    let rows: CanonicalRow[] = [];
    let n = 0;
    for await (const read of source.read(entity)) {
      rows.push(read.row);
      if (rows.length >= batch) {
        await target.write(entity, rows);
        n += rows.length;
        rows = [];
      }
    }
    if (rows.length) await target.write(entity, rows);
    counts[entity] = n + rows.length;
  }
  await target.finish();
  return counts;
}
