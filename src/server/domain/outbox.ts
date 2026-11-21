import type { OutboxOp } from '@/server/ports/outbox';
import { SPECS, type EntityName } from './schema/registry';

/**
 * The transactional outbox (plan section 4.3): every row a UnitOfWork
 * transaction writes is also recorded, in the same transaction, as
 * `changeLog/{ulid}` — which row, never what it holds. The replicator
 * (app/replicate.ts) reads the entries in ulid order, reads the source's
 * latest row, and applies it to a target.
 *
 * `userIds` — the uids an entry's row id names (`users/{uid}`,
 * `resonanceTaps/{card}_{uid}`, `connections/{a}_{b}`): the replicator needs
 * the plain id to read the row, so it isn't hashed; instead the entry is
 * registered as holding those uids (registry `changeLog`, purged with the
 * account by `userIds[]`), lives at most CHANGE_LOG_TTL_DAYS (`expireAt`),
 * and holds nothing else of anyone. It is an over-approximation: every
 * segment of the id of an entity that names a person (a card id among them),
 * so no uid inside an id is ever missed.
 */
export const CHANGE_LOG = 'changeLog';

/** Days an entry is kept (Firestore's TTL on `expireAt`; PostgreSQL's daily sweep). */
export const CHANGE_LOG_TTL_DAYS = 7;

export interface ChangeEntry {
  entity: string;
  id: string;
  op: OutboxOp;
  /** When the transaction recorded it, in microseconds since the epoch (orders a row's changes). */
  version: number;
  at: Date;
  done: boolean;
  expireAt: Date;
  userIds: string[];
}

/** The uids a row id may name (see the module's comment). */
export function userIdsOf(entity: string, id: string): string[] {
  const spec = (SPECS as Record<string, { uid: readonly string[] } | undefined>)[entity as EntityName];
  if (spec && spec.uid.length === 0) return [];
  return [...new Set(id.split(/[/_]/).filter((s) => s.length > 0))].sort();
}

export function changeEntry(entity: string, id: string, op: OutboxOp, atMs: number): ChangeEntry {
  return {
    entity,
    id,
    op,
    version: atMs * 1000,
    at: new Date(atMs),
    done: false,
    expireAt: new Date(atMs + CHANGE_LOG_TTL_DAYS * 24 * 3600_000),
    userIds: userIdsOf(entity, id),
  };
}

/**
 * The entity and row id of a document path, as the registry names them: a
 * top-level document `cards/{id}` → (`cards`, id); a subcollection's
 * `users/{uid}/blocks/{other}` → (`blocks`, `{uid}/{other}`) — the shape the
 * PostgreSQL tables key a child row by (infra/postgres/schema.ts).
 */
export function entityOfPath(path: string): { entity: string; id: string } {
  const parts = path.split('/');
  if (parts.length === 2) return { entity: parts[0], id: parts[1] };
  if (parts.length === 4) return { entity: parts[2], id: `${parts[1]}/${parts[3]}` };
  return { entity: parts[parts.length - 2], id: parts.filter((_, i) => i % 2 === 1).join('/') };
}

/** entityOfPath's inverse (the registry's parent of a subcollection). */
export function pathOf(entity: string, id: string): string {
  const parent = (SPECS as Record<string, { parent?: string } | undefined>)[entity]?.parent;
  if (!parent) return `${entity}/${id}`;
  const slash = id.indexOf('/');
  return `${parent}/${id.slice(0, slash)}/${entity}/${id.slice(slash + 1)}`;
}
