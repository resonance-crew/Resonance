# 0004 — Firebase Auth stays the identity provider; Resonance signs its own short sessions

**Status:** Accepted (2026-11-21, owner)

## Context

The apps send a Firebase ID token as `Authorization: Bearer`; the web carries a session cookie
(`__session`) signed by firebase-admin. Every user id in the data — a card's `authorId`, a
conversation's pair id, `resonanceTaps/{cardId}_{uid}` — is a Firebase uid. Replacing the identity
provider today would change all three clients and the server at once, and rewrite every id.
Sign in with Apple's token revocation and App Check are Firebase products too.

## Decision

- Keep **Firebase Auth as the identity provider** (it signs people in with Google, Apple, e-mail).
- Add `POST /api/v1/auth/exchange`: a client trades an IdP token for a **Resonance-signed short-lived
  JWT** (access token) plus a **refresh token**. The server's `getCurrentUser()` accepts both the
  Resonance token and, for installed builds, the Firebase token (**dual-accept**) until the minimum
  build (0002) retires the old path.
- Add an `identities` mapping (`provider, subject → userId`). Every existing user's `userId` **is and
  stays their Firebase uid**, forever: nothing is renumbered, no data is rewritten.
- App Check goes behind an `AttestationVerifier` port, so App Attest / Play Integrity / Turnstile can
  be verified directly later.

## Consequences

- A later IdP change touches only the exchange and the clients' sign-in screens.
- The server owns session lifetime and revocation (refresh-token rotation, revoking on account
  deletion), which today Firebase does for it: keys to rotate, and tests for expiry and revocation.
- Apple's token revocation (`appleToken.ts`, iOS `revokeToken`) keeps working through Firebase; it is
  revisited only if the IdP changes.
- During dual-accept the server verifies two token kinds; that window closes with `minBuild`.

## Built (Phase 3, 2026-11-21)

- `POST /api/v1/auth/exchange` (`exchangeSession`), `/auth/refresh` (`refreshSession`), `/auth/logout`
  (`logoutSession`): `src/server/app/auth.ts` over the `SessionStore` (`src/server/ports/sessions.ts`;
  Firestore `identities/{provider}_{subject}` and `refreshTokens/{sha256}`, both server-only, both in the
  account registry's purge) and the signer (`src/server/infra/session/jwt.ts`: ES256 with `node:crypto`, a
  `kid` per key, no JWT library).
- The access token lives 15 minutes; `sub` is the Firebase uid, `auth_time` the exchange, `sid` the refresh
  family. A refresh token (`rt1.` + 32 random bytes) lives 30 days, is stored only as its SHA-256, and is good
  once. `revokeSessions(uid)` (account deletion) revokes every family of the account as well as Firebase's
  tokens.
- A second use of a refresh token (L3, the owner's option (b), 2026-11-22): within `REFRESH_GRACE_MS` (30 s,
  `src/server/domain/session.ts`) of its use, while the token it was traded for (`nextHash`, kept on the used
  row — a hash, never the token) is still unused, it is the client's own second try — two refreshes racing, a
  retry after a lost answer — and answers `409 conflict`: nothing revoked, nothing handed out. Returning the
  pair already issued instead was rejected: it means storing the next refresh token itself, and it hands a
  thief racing the owner a live pair. Any other second use — after the grace, or once the next token was
  used too (a token two generations old) — is theft: the family is deleted, the account is signed out
  everywhere (`revokeSessions`: every family and Firebase's refresh tokens, so the web's cookie and every
  device too), it is logged (`[auth] a used refresh token presented again`), and it answers `401`. The grace
  is short on purpose: a thief who replays within it only gets a `409` (and is caught on the next try), and
  a client that gets a `409` with no newer pair in hand logs its token out, which ends the family whoever
  won the race.
- `getCurrentUser()` asks `ResonanceJwtVerifier` first (`src/server/infra/session/verifier.ts`): a token with
  one of our key ids is decided there alone (signature, claims, then the account's standing at Firebase Auth —
  gone, disabled, or revoked after `auth_time` — live on writes, the instance's 2-minute cache on reads, as
  Firebase tokens); anything else goes on to Firebase Auth unchanged.
- Off unless `RESONANCE_JWT_KEYS` is set: exchange and refresh answer `503`, nothing else changes.

## Operating it

- Keys: `npx tsx scripts/auth/jwtKey.ts | vercel env add RESONANCE_JWT_KEYS production` (and `preview`).
  Rotate with `--rotate "$CURRENT"`: the new key signs, the old ones (their private part dropped) verify for
  the next 15 minutes; drop them at the following rotation. A leaked key: rotate *without* keeping it — every
  access token it signed fails at once, and clients refresh (their refresh tokens are not signed, so they
  stand).
- Rules and the `refreshTokens.expiresAt` TTL policy deploy before the web that issues tokens
  (`docs/release/owed.md`).

## Switching the clients (not done in this phase)

- The apps keep sending the Firebase ID token until a build switches. A build that switches: after sign-in,
  exchange the Firebase ID token once; keep the refresh token in the Keychain / EncryptedSharedPreferences;
  hand `APIConfiguration.idToken` (iOS) / the Android API client's token provider the access token, refreshing
  when it is within a minute of `expiresIn` or on a `401`; refresh one at a time (a single in-flight
  refresh shared by every caller). On a `409` from `/auth/refresh` (another refresh of the same token won):
  use the pair that refresh got; holding none (its answer was lost), call `/auth/logout` with the token
  and exchange again. On a `401` from `/auth/refresh` (reuse, revocation, deletion) exchange again from the
  Firebase SDK's current ID token, and sign out only if that fails too (after a reuse it does: the account
  was signed out everywhere). On
  sign-out call `/auth/logout`. On `503` (feature off) keep the Firebase token — the server accepts both.
- The web keeps its `__session` cookie (firebase-admin's); moving it onto Resonance's tokens is a later step.
- Dual accept ends only when `minBuild` (ADR 0002) passes every build that sends a Firebase token.
