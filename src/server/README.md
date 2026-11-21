# src/server — the server's middle layer

Phase 1 of 任務 #3 (the middleware decouple): the server's code learns to
reach its database, push service, storage and models through ports, so any of
them can be replaced without touching the services. Behaviour doesn't change.
The design: `Resonance-notes/2026-11-20-middleware-refactor/phase1-spec.md`.

## Layers

| Directory | What | May import |
| --- | --- | --- |
| `ctx.ts` | `ServerCtx` and `serverCtx()` (production, from the environment, one per instance) | ports, infra factories |
| `app/<aggregate>.ts` | application services, `(ctx: ServerCtx, …input) → output` | ports, domain, `@/lib` pure code |
| `domain/` | pure policy (who may see what, clocks, limits) | nothing with I/O |
| `ports/` | interfaces only: `uow.ts`, `repos/<aggregate>.ts`, one file per other port, `time.ts` | types |
| `infra/<vendor>/` | adapters: `firestore/`, `fcm/`, `firebase-auth/`, `appcheck/`, `s3/`, `openai/`, `next/`, `env/`, `system/`, `memory/` | anything |
| `contract/` | port contracts, written once, run on memory (unit) and on the emulator (`test/emulator/ports.*`) | vitest, ports |

**Only `infra/` imports a vendor SDK** (`firebase-admin`, `@aws-sdk/*`, `next/server`'s `after`, `next/cache`).
`ratchet.test.ts` counts the files outside `src/server/infra` that import
`firebase-admin` (statically or with `import()`): the number only falls, and a
change that empties a file lowers `MAX` in the same commit. Phase 1 ends at 0.

## Contexts

- `serverCtx()` — routes and server components. It takes its database from
  `@/lib/db/firestore/admin` on purpose: the emulator suites `vi.mock` that path.
- `ctxFor(db, overrides?)` (`infra/firestore/ctx.ts`) — a context on a given
  Firestore. Legacy facades use it, so the emulator suites, which call
  `publishCard(db, …)` with their emulator, run the new code unchanged.
- `memoryCtx(overrides?)` (`infra/memory/ctx.ts`) — no I/O: repositories over a
  `MemoryState` (`ctx.state.seed(…)`, `ctx.state.dump()`), a clock that moves
  only when told, predictable ids, recording pages / after / realtime / logs.

**The model is never in the default context.** OpenAI refuses requests from
Hong Kong, where the functions run; `src/lib/ai/regions.test.ts` follows each
route's imports to the OpenAI client and requires those routes pinned to
`hnd1`. So `ctx.llm` throws unless the route itself imports
`openAiLlm()` from `infra/openai/llm.ts` and passes it —
`serverCtx({ llm: openAiLlm() })`, `ctxFor(db, { llm: openAiLlm() })` — which
the regions test then sees. Never wire it into `ctxFor` / `serverCtx`.

Building a context loads no SDK: adapters load theirs on first use
(`lazyAsync`, or `await import()` inside a method). A port whose lane hasn't
built an adapter yet is `notWired('<port>')`, which throws `NotWiredError` when
called — never when the context is built. Pass a real one in `overrides`.

## Platform ports (Phase 1 wave 2)

- **One admin app**: `infra/firebase/app.ts` `ensureAdminApp()` is the only
  `initializeApp` — Firestore, Auth and App Check each call it first.
- **RateLimiter** — the budgets (`LIMITS`) and the fixed-window arithmetic are
  `domain/rateLimit.ts`; `infra/firestore/rateLimit.ts` keeps the windows in
  `rateLimits/{uid}_{bucket}` (one transaction, `tx.getAll` first),
  `infra/memory/rateLimit.ts` in the state's `rateLimits` table; both answer
  through `infra/rateLimit.ts` (the 429). `lib/api/rateLimit` `spend(db, …)`
  is a facade.
- **Identity** — `infra/firebase-auth/auth.ts` is the Admin SDK code (the
  revocation cache, the unverified-password refusal, `isAuthOutage`);
  `./identity.ts` the ports over it, loaded on first use. `getCurrentUser()`
  asks `infra/identityChain.ts` `requestVerifier()`: verifiers in order, the
  first non-null answer wins, an outage (`domain/identity.ts`
  `AuthUnavailableError`) stops it. A second identity joins that list.
- **Attestation** — `infra/appcheck/appCheck.ts` (verify, mint); Turnstile,
  the exchange's brake and the tally stay in `lib/appCheck/server`.

## Conversations (Phase 1 wave 3)

- Notes, letters, messages, reactions, unsending, private shares, chat
  pictures, reports and the public pictures' owner records (`uploads`):
  services in `app/{conversations,messages,sharedCards,chatImages,
  chatImageUpload,safety}.ts`, the Firestore code in
  `infra/firestore/repos/conversations.ts`, pure names and policy in
  `domain/conversations.ts`; `lib/api/v1/{conversations,messageActions,
  sharedCards,chatImages,chatImageUpload,safety}.ts` and `lib/storage/uploads`
  are facades. The Transaction- or snapshot-taking helpers other modules
  compose (`clearLetters(tx, db, …)`, `letterRef`, `openRequest`,
  `hasPenName`, `lettersLeft`, `chatImageFiles`, `privateShareRef`…) live in
  the infra repo and are re-exported from their old paths.
- A message's `sentAt` reaches services as an `Instant`, so a page
  (`data.conversations.listMessages`, `(sentAt, id)` descending) never skips
  messages sent in the same millisecond. Writes take the service's `at`;
  Firestore writes its server time instead, memory a strictly increasing
  instant shared by one transaction's writes (as a commit's).
- The chat push stays `lib/push/chat` (`afterMessage.ts` schedules it on
  `AfterResponse`, Next's `after()` by default).

## The writer (Phase 2, lane 2a-writer)

- The thought map, a draft's creation and autosaves, and a published card's
  pending edit — what the clients wrote straight to Firestore — through
  `app/writer.ts`, the `writer` aggregate (`ports/repos/writer.ts`, its
  Firestore and memory repos) and the pure `domain/writer.ts` (a map batch's
  plan, the `rev` rule). `contract/writer.contract.ts` runs on memory
  (`app/writer.test.ts`) and the emulator (`test/emulator/ports.writer…`).
- The request schemas carry the rules' limits; `domain/writer.test.ts` reads
  each number out of `firebase/firestore.rules`, so the two move together.
- A draft's autosave applies only when its `rev` is above the stored
  `draftRev`; each applied one is kept in `cards/{id}/draftLog/{rev}` for 7
  days (TTL `expireAt`), deleted with the card (`deleteCardIn`) and the
  account (`authorId`). Every write that changed something touches its
  author's `map` or `drafts` signal after the commit.

## PostgreSQL, the outbox, shadow reads (Phase 3)

- `infra/postgres/`: the schema (`migrations/*.sql`, `schema.ts`, `codec.ts`: columns for what is queried,
  the rest of a document in `extra jsonb`), `PostgresUnitOfWork` (SERIALIZABLE, retried on 40001 / 40P01,
  writes buffered to the commit), the platform ports and the taps / social / graph repositories;
  `withPostgres(ctx, pool)` swaps a context's data ports. Optional: `pg` loads only when the environment
  asks. The `*.pg.test.ts` suites run the contracts on it with `PG_TEST_URL` and skip without.
- The outbox: `OUTBOX_ENABLED=1` makes `FirestoreUnitOfWork` record `changeLog/{ulid}` per written row
  (a Proxy on the Transaction notes the writes; no repo reports them); `app/replicate.ts` replays it.
- Shadow reads: `app/shadow.ts` `shadowRead`, `infra/shadow.ts` `shadowFromEnv` (`READ_BACKEND=shadow`);
  logs paths and hashes only (`domain/parity.ts`). docs/ops/postgres.md has the rest.

## Legacy facades

Every export an emulator suite or a script imports keeps its path, name and
signature. When a service moves, the old export stays as a facade:

```ts
// src/lib/api/v1/publish.ts
export function publishCard(db: AdminDb, ...a: PublishArgs) {
  return publishCardIn(ctxFor(db), ...a);
}
```

The 41 existing `test/emulator/*.emulator.test.ts` never change; new suites may be added.
`@/lib/db/firestore/admin` itself is now a re-export of `infra/firestore/db.ts`.

## Transactions

`ctx.uow.run(async (tx) => …)` — serializable; `fn` may run again (Firestore
retries), so nothing inside pushes, calls a model or writes to a bucket. Every
read comes before any write: the memory UoW throws `ReadAfterWriteError`
otherwise, and the Firestore UoW answers Firestore's own refusal as the same
error. Never nest one `run` in another. Outside a transaction, `ctx.data`.

## Adding a method to an aggregate

Each aggregate has one file in each of `ports/repos/`, `infra/firestore/repos/`
and `infra/memory/repos/`; a lane edits only its own aggregate's three files
(the `repos/index.ts` files only list them).

1. **Port** — `ports/repos/<agg>.ts`: the method on `<Agg>TxRepo` (inside a
   transaction) or `<Agg>Data` (outside), in domain types: `Date`, `Instant`
   (`ports/time.ts`), plain objects. Never `DocumentData`, `Timestamp`,
   `DocumentReference`, snapshots, `Transaction` or `FieldValue`. Reads are
   `get*` / `find*` / `list*` (async); writes `put*` / `patch*` / `delete*`.
   Uniqueness and counters are methods: `insertIfAbsent(…) → 'inserted' | 'exists'`,
   `increment…`, `bumpUnread`, `setReaction(…, null)`.
2. **Firestore** — `infra/firestore/repos/<agg>.ts`: today's query or
   transaction code, moved, not rewritten (`ref.create()`, `FieldValue.increment`,
   `'unread.' + uid` stay exactly as they were).
3. **Memory** — `infra/memory/repos/<agg>.ts`: the same over `MemoryTx`
   (`tx.get` / `tx.rows` read, `tx.put` / `tx.merge` / `tx.delete` write) or
   `MemoryState` outside a transaction. Name the tables after the collections.
4. **Contract** — what both must do, in `contract/<agg>.contract.ts`, run by a
   unit test on memory and a new `test/emulator/ports.<agg>.emulator.test.ts`.

Cursors: `ports/time.ts` `encodeCursor` / `decodeCursor` (`c1.` + base64url
`{ t: Instant, id }`); `contract/time.contract.ts` is what every codec keeps.

## Portability (Phase 3)

- `domain/schema/entities.ts` — the canonical storage schema of every
  registered entity (`fields.ts` kinds: Instants, `f.instant()` for what is
  ordered by, `map(…, { child })`, `rel(…)`, vectors); `registry.ts` gives
  each entry its `schema` and `version`. `canonical.ts` turns a stored row
  into `{ _e, _id, _v, …fields }` and back through a `StoreCodec`
  (`infra/firestore/canonical.ts`, `infra/memory/canonical.ts`), upgrading
  older shapes on read (each upgrade names its backfill).
- `ports/portability.ts` — `EntitySource` and `ImportTarget`, the seams
  `scripts/portability/{export,import,parity}.ts` know; a PostgreSQL adapter
  gives one of each.
- The export holds the whole database: never in the repo (`repoCheck.ts` in
  CI), never a CI artifact, written outside the checkout. docs/ops/backup.md.
