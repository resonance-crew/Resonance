# PostgreSQL (+ pgvector): the Phase 3 adapter

任務 #3 Phase 3 (the middleware decouple, plan section 3.3, 4.3–4.4, appendix E). Production stays on
Firestore: `PRIMARY_BACKEND` is firestore, no new env var is required, and nothing in the default build or
`serverCtx()` connects to PostgreSQL — `pg` is loaded with `await import()` only when the environment asks
(`src/server/infra/postgres/pool.ts`). **Nothing here is a production step; `docs/release/owed.md` owes nothing
for it.**

## Stand one up locally

Any PostgreSQL 15+ with the `vector` extension (pgvector 0.8 for the filtered HNSW scan). With Docker/OrbStack:

```bash
docker run -d --name resonance-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=resonance -p 55432:5432 pgvector/pgvector:pg17
POSTGRES_URL=postgres://postgres:pg@localhost:55432/resonance npx tsx scripts/postgres/migrate.ts
docker rm -f resonance-pg   # when done
```

## Migrations

Plain SQL files in `src/server/infra/postgres/migrations/` (`NNNN_name.sql`), applied in name order by
`migrate.ts`, each in its own transaction, recorded in `schema_migrations` (name, sha256, when) under an advisory
lock. A file already applied that changed is refused: a change is a new file.

`0001_init.sql` has a table for every entity of `src/server/domain/schema/registry.ts` (`schema.test.ts` fails
otherwise), after appendix E:

- ids stay the Firestore strings; a deterministic id used for uniqueness or idempotency (`handles/{lower}`,
  `letters/{w}_{r}`, `resonanceTaps/{card}_{uid}`, `notifications/resonance_{uid}_{card}`, `rtap_…`, a message's
  `clientId`, `rateLimits/{uid}_{bucket}`) is the primary key; slugs and upload keys are partial unique indexes.
- `timestamptz` (µs); `vector(1536)` under HNSW `vector_cosine_ops`; GIN for array membership
  (`connection_origins.resonance_cards`, `notifications.payload->fromUserIds`, `change_log.user_ids`); `userIds[]`
  and `participants[]` as two columns (`user_a < user_b`); `message_reactions` and the map's nodes/edges/groups
  as child tables (each part is written alone).
- the anonymous card check (never connections-only) is `not valid`: the old published ones stay as they are.
- what is queried, indexed, unique or checked is a column; every other field of a document lives losslessly in
  `extra jsonb` (`schema.ts`, `codec.ts`: Dates tagged, a value its column can't hold kept under its field), so a
  row read back is the document written — what the replicator and the shadow reads need.
- **TTL**: Firestore's TTL policies are one function, `select resonance_ttl_sweep()` — `reader_signals`,
  `card_reads`, `card_draft_log` by `expire_at`, done `change_log` entries by `expire_at`, `handle_holds` by
  `until`, `unsent_messages` 30 days after `unsent_at`, lapsed `leases`. Run it daily (docs/ops/scheduler.md);
  it answers how many rows went.

## Run the suites

```bash
PG_TEST_URL=postgres://postgres:pg@localhost:55432/resonance npx vitest run src/server/infra/postgres src/server/app
```

Each suite migrates a schema of its own (`t_…`, dropped at the end) — never point it at a database you keep.
Without `PG_TEST_URL` the PostgreSQL cases skip with that reason, so `npm test` and CI's `checks` stay green; CI's
`postgres` job runs them on a `pgvector/pgvector:pg17` service. The emulator suite
`test/emulator/ports.outbox.emulator.test.ts` runs its PostgreSQL case too when `PG_TEST_URL` is set.

## What is implemented

| Port | PostgreSQL | Held to |
| --- | --- | --- |
| `UnitOfWork` | `PostgresUnitOfWork`: `begin isolation level serializable`; 40001 / 40P01 run `fn` again (doubling, jittered backoff, 12 attempts); writes buffered to the commit, so a read after a write is `ReadAfterWriteError`, as on Firestore; nested runs refused | `uow.contract` |
| `RateLimiter` | `rate_limits`, one serializable transaction per request | `rateLimit.contract` |
| `LeaseStore` | `leases`: one conditional upsert | `lease.contract` |
| `RealtimePublisher` | `signals`: counters added in one upsert | `realtime.contract` |
| `VectorStore` | pgvector, WHERE pre-filter + `<=>`, iterative scan | against the exact (memory) search |
| `taps` | resonance_taps, reader_signals, card_reads, `cards.read_count`; keyset page on `(at, user_id)` | `taps.contract` |
| `social` | bookmarks, blocks, connections, invites | `social.contract` |
| `graph` | connections, connection_origins, invites, notifications, letters | `graph.contract` |
| `users` | `hasBlocked`, `rowsOf` only | the social contract, the shadow reads |

Not implemented (each throws `NotWiredError` naming `postgres.<aggregate>`): `cards`, `users` (the rest),
`conversations`, `bell`, `pushState`, `recommend`, `account` (the purge and the export), `infra`, `translations`,
`writer`; and the `/api/v1` emulator suites parameterised over PostgreSQL.

## The outbox and the replicator

- `OUTBOX_ENABLED=1` (off by default): `FirestoreUnitOfWork.run` records `changeLog/{ulid}` =
  `{ entity, id, op: 'upsert' | 'delete', version (µs), at, done, expireAt (+7 days), userIds }` for every row the
  transaction wrote, in the same transaction — no content. Only writes through the UnitOfWork are seen: batches,
  bulk deletes outside a transaction (the account purge, the trash purge) and old apps' direct writes are not,
  which is why Phase 4 needs the full parity sweep (plan section 4.3).
- `userIds`: a row id may be or hold a uid, and the replicator needs it plain, so it is not hashed; the registry
  purges an account's entries by `userIds[]`, and Firestore would need a TTL policy on `changeLog.expireAt`
  (Phase 4, with the switch).
- `src/server/app/replicate.ts`: entries in ulid order → the source's latest row → applied when newer than the
  target's (`replica_versions`) → marked done. Idempotent on replay. `/api/cron/replicate` is a stub, not
  scheduled (docs/ops/scheduler.md).

## Shadow reads

`READ_BACKEND=shadow` with `POSTGRES_URL` (off by default): `GET /api/v1/cards/{id}/taps`, `GET /api/v1/me/blocks`
and `GET /api/v1/me/connections` answer from Firestore, and after the response recompute on PostgreSQL; a
difference logs `[parity] <route> <field paths> <sha256(key) prefix>` only — array positions, schema field names,
any other key hashed — so an anonymous card's author never reaches a log (`src/server/app/shadow.test.ts`).
`anonymousBlocks.pg.test.ts` runs the taps and social reads on memory and PostgreSQL with and without each block:
identical answers.

## What Phase 4 would need (not done)

1. PostgreSQL repositories for the remaining aggregates, each held to its contract, and the `/api/v1` emulator
   suites (`anonymousBlocks`, `accountPurge`, `apiV1Resonate`, `apiV1Trash`, `apiV1Conversations`) parameterised.
2. The account purge and export over PostgreSQL (the registry's plan as queries), and the purge run on both
   backends while both are live.
3. A managed PostgreSQL near the functions (asia-east1 / hkg1), its URL as a Vercel env var, the migrations run.
4. Firestore TTL on `changeLog.expireAt`, `OUTBOX_ENABLED=1`, the full export → import (the portability lane),
   the replicator scheduled, shadow reads on in staging, a week of zero parity differences.
5. The cut-over and the reverse replicator (plan section 4.5) — only on the owner's decision.
