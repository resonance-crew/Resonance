---
paths:
  - "next.config.ts"
  - "src/lib/api/securityHeaders.ts"
  - "src/lib/appCheck/**"
  - "src/lib/auth/firebase/**"
  - "src/app/api/app-check/**"
  - "src/app/api/csp-report/**"
  - "apps/**/*AppCheck*"
---

# Security headers and App Check

## Security headers

`next.config.ts` turns Next's image optimizer off (`images.unoptimized`, with patterns that admit nothing as a backstop: nothing draws next/image, and `/_next/image` would otherwise resize any local path for anyone) and sends, on every path (`src/lib/api/securityHeaders.ts`): `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and a **report-only** CSP (reports to `/api/csp-report`) listing what the site loads — Firebase Auth's iframe and endpoints, apis.google.com, Turnstile (challenges.cloudflare.com), the R2 image origin (and a former one during a move), fonts.
Watch the `[csp]` logs before enforcing it; a new script, frame, font or API origin must be added there.

## App Check (watched, not enforced)

Firestore and Auth are in App Check's monitoring mode, and the API only logs.
The web's provider is Cloudflare Turnstile as a custom provider (`src/lib/appCheck/config.ts`, `src/lib/auth/firebase/appCheck.ts`): on the production origin only (`NEXT_PUBLIC_SITE_URL`; previews, local builds and emulators go without), the invisible widget's token is traded at `POST /api/app-check` (Cloudflare siteverify with `TURNSTILE_SECRET_KEY` — host, action, single use — then the Admin SDK mints a 12 h token for the web app; ten exchanges per address per 10 min per instance).
App Check starts with the first read or call that can carry it (`ensureAppCheck()`: Firestore's first instance, the first `callApi`), never with the app itself, so a signed-out landing page loads no Turnstile.
Nothing waits on a challenge: a token kept from an earlier visit (`resonance:appcheck-until`) starts App Check at once, else the challenge runs when idle and App Check starts once it has a token.
`callApi` sends `X-Firebase-AppCheck` when a token is at hand within 150 ms.
Every v1 request's token is checked after the response (`withUser` → `noteAppCheck`): one `[appcheck] <valid|missing|invalid> <platform> <route>` line per kind per 10 min per instance, with a count.
The privacy policy names Turnstile (its privacy addendum is required for the invisible widget).
A new production domain needs the widget's hostname list in Cloudflare and NEXT_PUBLIC_SITE_URL changed together.
The apps attest with App Attest (iOS release) and Play Integrity (Android release; every Play signer's SHA-256 must be in Firebase), the debug provider in debug builds, nothing against the emulators; they send the token at hand on API calls (`AppCheckHeader` in both apps) and never wait for one.
Enforce only once the logs show `missing`/`invalid` from old builds and scripts alone.
