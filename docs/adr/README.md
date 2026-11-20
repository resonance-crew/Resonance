# Architecture decision records

One file per decision that shapes how Resonance is built: why it was taken, what it costs. A record
is never rewritten once accepted; a later decision that changes it is a new record that says which
one it supersedes (and the old one's Status becomes `Superseded by NNNN`).

Format: `NNNN-short-title.md`, with **Status** (Proposed / Accepted (date, who) / Superseded),
**Context**, **Decision**, **Consequences**.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-clients-through-api-v1-and-signals.md) | All three clients reach data through `/api/v1`, with a `signals/{uid}` channel for live updates | Accepted (2026-11-21, owner) |
| [0002](0002-minimum-supported-build.md) | A minimum supported build: `GET /api/v1/client-config` | Accepted (2026-11-21, owner) |
| [0003](0003-target-database-postgresql.md) | The future target database is assumed to be PostgreSQL + pgvector; ports stay vendor-neutral | Accepted (2026-11-21, owner) |
| [0004](0004-identity-firebase-idp-resonance-sessions.md) | Firebase Auth stays the identity provider; Resonance signs its own short sessions | Accepted (2026-11-21, owner) |
| [0005](0005-media-urls-own-domain.md) | Media URLs: our own domain, resolved from keys, no proxy | Accepted (2026-11-21, owner) |

The five come from the middleware decouple plan (任務 #3, 2026-11-20, §1), which the owner accepted
on 2026-11-21 — 「接受將 Firebase 直連全部收斂改用 `/api/v1` API 封裝（搭配 `signals/{uid}` 訊號通道、ETag/304
與樂觀更新確保速度不降），並要求全部啟動 #3 中間層去平台綁定重構！」, and 「不執行 Phase 4 線上主庫切換」: the
production database is not switched as part of it.
