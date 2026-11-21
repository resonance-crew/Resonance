# 0003 — The future target database is assumed to be PostgreSQL + pgvector

**Status:** Accepted (2026-11-21, owner)

## Context

The server grows ports (repositories, a UnitOfWork, a vector store, a realtime publisher) so that
Firestore becomes one adapter among possible others. Ports designed with no target in mind tend to
copy Firestore's shape; designed for one product, they lock into it. The data is relational at
heart: a connection is a pair of users, a conversation has participants, a reply card points at its
original, a block is user to user — today modelled with `array-contains`, sorted `a_b` pair ids and
`in` queries in chunks of 30. Firestore transactions are serializable. Vector search already sits
behind `IVectorStore`.

## Decision

- Design the ports so that both Firestore and **PostgreSQL (with pgvector)** can implement them;
  PostgreSQL is the assumed target for Phase 3's second adapter and any later move.
- No hosting vendor is chosen now (Cloud SQL / AlloyDB, Neon, Supabase are the candidates, compared
  on price before any move); the region stays near Taiwan (`asia-east1` or Tokyo).
- Ports stay vendor-neutral: no Firestore types (`Timestamp`, `DocumentReference`, cursors) and no
  SQL in their signatures; neutral cursors and ids; transactions as `SERIALIZABLE` with automatic
  retry on the PostgreSQL side to match Firestore's guarantee.
- Moving the production database (Phase 4) is not part of this decision: the owner said
  「不執行 Phase 4 線上主庫切換」.

## Consequences

- Phase 3 builds and tests a PostgreSQL adapter against the same contract tests as the Firestore
  one, plus export/import and parity tools — without switching production.
- Some Firestore-specific conveniences (listeners on arbitrary queries, field-level rules as the
  only guard) are given up in the ports, which 0001 already requires.
- If another target is chosen later (Spanner, say), the vendor-neutral ports still hold; only the
  adapter is new.
