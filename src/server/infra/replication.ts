import type { ChangeSource, ReplicaTarget } from "@/server/app/replicate";
import { getAdminDb } from "@/lib/db/firestore/admin";

/**
 * The replicator's ends from the environment, or why there are none. Off
 * unless all three are set: `OUTBOX_ENABLED=1` (FirestoreUnitOfWork records
 * the outbox), `REPLICA_TARGET=postgres` and `POSTGRES_URL`. Nothing sets
 * them in production (docs/ops/postgres.md); PostgreSQL is loaded only here.
 */
export async function replicationFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ source: ChangeSource; target: ReplicaTarget } | { off: string }> {
  if (env.OUTBOX_ENABLED !== "1") return { off: "OUTBOX_ENABLED is not 1" };
  if (env.REPLICA_TARGET !== "postgres")
    return { off: "REPLICA_TARGET is not postgres" };
  if (!env.POSTGRES_URL) return { off: "POSTGRES_URL is not set" };
  const [{ firestoreChangeSource }, { pgReplicaTarget }, { envPgPool }] =
    await Promise.all([
      import("./firestore/changeLog"),
      import("./postgres/replica"),
      import("./postgres/pool"),
    ]);
  return {
    source: firestoreChangeSource(getAdminDb()),
    target: pgReplicaTarget(await envPgPool(env)),
  };
}
