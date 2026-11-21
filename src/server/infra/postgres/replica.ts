import type { ReplicaTarget } from '@/server/app/replicate';
import type { Doc } from './codec';
import { PostgresUnitOfWork, type PgPool, type PgTx } from './uow';

/**
 * PostgreSQL as the replicator's target: each row in its own serializable
 * transaction — the version applied last (`replica_versions`) read, the row
 * written or deleted only when the change is newer, the version kept.
 */
export function pgReplicaTarget(pool: PgPool): ReplicaTarget {
  const uow = new PostgresUnitOfWork<PgTx>(pool, (tx) => tx);
  return {
    apply(entity, id, row: Doc | null, version) {
      return uow.run(
        async (tx) => {
          const [was] = await tx.query<{ version: string }>('select version from replica_versions where entity = $1 and row_id = $2', [entity, id]);
          if (was && Number(was.version) >= version) return 'stale' as const;
          if (row) tx.put(entity, id, row);
          else tx.delete(entity, id);
          tx.exec(
            { table: entity, id },
            'insert into replica_versions (entity, row_id, version) values ($1, $2, $3) on conflict (entity, row_id) do update set version = excluded.version',
            [entity, id, version],
          );
          return 'applied' as const;
        },
        { label: 'replicate' },
      );
    },
  };
}
