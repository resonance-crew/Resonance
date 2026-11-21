# 0002 — A minimum supported build: `GET /api/v1/client-config`

**Status:** Accepted (2026-11-21, owner)

## Context

An installed app build that reads and writes Firestore directly can't be fixed by the server.
Today `clientBuild.ts` only recognises older builds by their User-Agent to stay compatible with
them; nothing can ask an old build to stop. Without that, the direct paths of 0001 — and the rules
marked "close once the old builds are gone" — can never be retired, and a bad release can't be
rolled back feature by feature.

## Decision

- Add `GET /api/v1/client-config` (a new endpoint, additive), answering
  `{ minBuild: { ios, android }, recommendedBuild: { ios, android }, features: { … } }`.
- Apps read it at launch and on returning to the foreground. Below `minBuild`: an update screen,
  and no direct Firestore access. Below `recommendedBuild`: a quiet suggestion to update.
- `features` are server-controlled flags (each with a safe default when absent) so a new path can
  be switched off without a store release — e.g. falling back from the API path to the old one
  while a regression is fixed.
- The values live on the server (configuration, not code), changed by the owner.

## Consequences

- The mechanism has to ship in one app release, and most users update past it, before it can be
  relied on — so it goes out as early as possible, with Phase 2.
- Retiring a direct Firestore path gets a date: the owner raises `minBuild` once the logs show old
  builds have faded, then the matching rules close.
- Every new client feature that may need a rollback gets a flag and a tested default; flags are
  removed once the feature has settled.
