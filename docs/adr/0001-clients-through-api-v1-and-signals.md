# 0001 — All three clients reach data through `/api/v1`, with a `signals/{uid}` channel

**Status:** Accepted (2026-11-21, owner)

## Context

The web, iOS and Android apps read and write Firestore directly for much of what they do:
conversations and messages, the bell, read markers, blocks and bookmarks, profile fields, the
thought map, drafts and pending edits, other people's bylines. Firestore's rules, indexes and
document shapes are therefore a public API shared by three clients and every installed build — the
database can't change without all of them changing, and a guarantee the rules give has to be
re-checked on the server by hand (CLAUDE.md #6, #7). Live updates (a new message, a bell) come from
Firestore listeners on whole collections.

Long-lived connections on Vercel's serverless functions (SSE, WebSocket) are costly and bounded in
time; plain polling is too slow for a thread.

## Decision

- Every client read and write moves behind `/api/v1` (additive endpoints only, CLAUDE.md #8): the
  server does each operation in one transaction — a block, for one, writes the block, deletes the
  connection and withdraws invites together.
- Live updates become **signal + pull**. After a write, the server bumps version counters in
  `signals/{uid}` for everyone it concerns (a tiny server-written, owner-readable document:
  `{ inbox, bell, graph, thread: { [pair]: n } }`). A client listens to that one document only; when
  a counter moves it pulls the changes with `If-None-Match` (ETag / `304 Not Modified`) and an
  incremental cursor.
- A foreground safety pull every 60 s catches a missed signal; writes are **optimistic** in the
  client (shown at once, reconciled with the server's answer), so nothing feels slower than the
  direct writes it replaces.
- The first transport for signals is still a Firestore listener on `signals/{uid}`; it sits behind a
  `RealtimePublisher` port, so it can later be Ably, Supabase Realtime or our own socket with no
  change to the data or the API.
- Drafts and pending edits move last: they rely on Firestore's offline queue and write order, and
  need a server-side `rev` to keep that order.

## Consequences

- The database becomes an internal detail of the server: Phase 3's PostgreSQL adapter and any later
  move touch the server only.
- About fifteen new `/api/v1` routes and their emulator suites; each safety-relevant one joins the
  `anonymousBlocks` probes.
- Old builds keep writing directly until they fall below the minimum build (0002); until then the
  rules stay, a nightly parity check covers the small collections they write, and only after the
  owner raises `minBuild` do those rules become `if false`.
- One extra round trip after a signal (mitigated by ETag/304 and optimistic updates); one small
  extra document write per server write.
