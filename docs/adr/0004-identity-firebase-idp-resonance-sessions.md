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
