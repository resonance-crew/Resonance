import { SPECS, type EntityName } from './registry';
import { toCanonical, type StoreCodec, type ToCanonicalOptions } from './canonical';
import type { CanonicalRead } from '@/server/ports/portability';

/**
 * Where an entity's row lives in a store named by paths (Firestore, the
 * memory state's tables): a top-level entity's row `id` is the document
 * `entity/id`; a subcollection's row id is `<parent id>/<doc id>` and its
 * document `parent/<parent id>/entity/<doc id>` (every subcollection is one
 * level under a top-level entity).
 */
export function storePath(entity: EntityName, id: string): { collection: string; doc: string } {
  const parent = SPECS[entity].parent;
  if (!parent) {
    if (!id || id.includes('/')) throw new Error(`${entity}: not a document id`);
    return { collection: entity, doc: id };
  }
  const slash = id.indexOf('/');
  if (slash <= 0 || slash === id.length - 1 || id.indexOf('/', slash + 1) !== -1) throw new Error(`${entity}: a row id is <parent id>/<doc id>`);
  return {
    collection: `${parent}/${id.slice(0, slash)}/${entity}`,
    doc: id.slice(slash + 1),
  };
}

/** The row id of a document path (`cards/c1/edits/current` → `c1/current`), or null when it is no entity's. */
export function rowOfPath(path: string): { entity: EntityName; id: string } | null {
  const parts = path.split('/');
  if (parts.length === 2 && parts[0] in SPECS && !SPECS[parts[0] as EntityName].parent) return { entity: parts[0] as EntityName, id: parts[1] };
  if (parts.length === 4 && parts[2] in SPECS && SPECS[parts[2] as EntityName].parent === parts[0])
    return { entity: parts[2] as EntityName, id: `${parts[1]}/${parts[3]}` };
  return null;
}

/** A stored row as its entity's canonical row (the registry's schema). */
export function readCanonical(
  entity: EntityName,
  id: string,
  stored: Record<string, unknown>,
  codec: StoreCodec,
  options?: ToCanonicalOptions,
): CanonicalRead {
  return toCanonical(entity, SPECS[entity].schema, id, stored, codec, options);
}
