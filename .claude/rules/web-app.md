---
paths:
  - "src/middleware.ts"
  - "src/app/**"
  - "src/i18n/**"
  - "src/lib/auth/**"
  - "src/lib/seo.ts"
  - "src/lib/appStores.ts"
  - "src/lib/site.ts"
  - "public/**"
  - "next.config.ts"
---

# The web app: routing, pages, sign-in

## Routing & i18n

`src/middleware.ts` intercepts all requests and routes through `[locale]` (supports `en` and `zh-TW`, `localePrefix: 'always'`).
The `next-intl` plugin handles server-side translations; message files live in `src/messages/{locale}.json`.
The path alias `@/*` maps to `src/*`.
Note: `next.config.ts` lists `firebase`/`firebase-admin` in `serverExternalPackages` to avoid Webpack vendor-chunk require errors.

The copy rule (strings end without a full stop): [copy.md](copy.md).

App routes under `src/app/[locale]/`:

- `page.tsx` — the landing page: the film of paper (`sections/LandingFilm`, since 2026-11-12 — see Landing film); the old sections (`HeroSection → CardFeedSection → CTASection`, `LandingStage`) are no longer on it
- `(auth)/` — `signin`, `signup`
- `(app)/` — `home` (feed), `me`, `settings`, `messages` (DMs), `notifications` (the bell's page, round 23: where `BELL_PAGE_QUERY` in `AppHeader/BellList.tsx` holds — `(max-width: 720px), (pointer: coarse) and (max-height: 500px)` — the bell, a `<Link href="/notifications">`, goes there, the header's brand slot naming it (a title longer than 10 characters — English 'Notifications' — steps its size down to fit, the header's icons never moving) and the bell wearing `bell-fill`, as the phone header's 私訊 wears `chat-fill` on /messages (`aria-current` on both); wider a click opens the Modal instead; one `BellList`/`useBell` for both, so a row tapped in either lowers the badge; closed in robots.txt by `APP_PAGES`), `write/[id]` (editor), `card/[slug]` (card page — the byline under the title names the author at every width, a rail beside the text for the story's contents only (`storyHasContents`), the head from the header's pen line — the reading head tokens `--story-head-gap` / `--story-head-cover-gap` / `--story-meta-gap` / `--story-lead-gap`, compact on phones —, the story's end the reader's capsule (共振 · 寄小紙條 · 用卡片回應, layout.md) with the card's passive actions as one group — 收藏 (`molecules/CardDetail/CardBookmark`, a signed-in reader's), then the card's share · ⋯ again only when the story is long enough that the byline and its end can't be in view at once (`useEndsApart`) — at the end of the capsule's row, at the column's end, in a window over 560, and at the end of the tags (which wrap in their own column) on a phone, where the capsule spans the column (round 28, `END_ROW_PHONE_QUERY`); its author's own card has no capsule and keeps share · ⋯ at ≥ 1200 at the end of their line, below it at the end of the tags (the apps' tablets have share · ⋯ in the bar once the byline scrolls under it, and never at the story's end): ISR, `revalidate = 300`, and `next.config.ts`'s `expireTime: 86400` bounds any stale ISR HTML to a day; a server component seeds `CardDetailClient` through `src/lib/data/cardSeed.ts` — a public card's story is in the HTML, an anonymous card's author never is — and the client replaces it with its own read through the rules; blocks stay client-side, `cardHold.ts` hides the card pre-paint in a signed-in browser until the block list is known), `u/[handle]` (public profile)
  Settings → 通知 has 有人共振 (`resonanceTaps`, round 26: on until turned off) with its hint line `settings.notifications.tapsHint`, as both apps do; the bell draws `resonance_tap` and `read_summary` rows (push.md).

Outside `[locale]`, at the root: `robots.ts` (on the production deployment only — `VERCEL_ENV`; previews and local builds disallow everything — it opens the public pages, closes `/api/` except `/api/og/` and the signed-in app's pages, and names the sitemap) and `sitemap.ts` (the landing and policy pages in both locales with hreflang, and the newest `SITEMAP_MAX_CARDS` public, published, non-anonymous cards by slug, read with the Admin SDK; ISR hourly, and `revalidateLocalized` drops it whenever the landing page is among the paths).
Lists in `src/lib/seo.ts`.
A root file with neither a metadata route nor a `public/` file falls into `[locale]` and 404s — as /robots.txt and /favicon.ico once did.
Also there: `download/route.ts` — /download, the link the landing page's QR code (`public/download-qr.svg`, made once by `scripts/web/download-qr.swift`) encodes: an iPhone/iPad goes to the App Store, Android to Google Play, anything else to the landing page's `#download` block (store links and the UA rule in `src/lib/appStores.ts`); the middleware's matcher skips exactly that path.
The download badges are `molecules/GetTheApp` (Apple's and Google's official files in `public/badges/`, never modified — a test pins their hashes — drawn at one visible height): the server renders both stores, a phone keeps its own after hydration, and only a hover-and-mouse device sees the QR code.
The public pages carry Safari's Smart App Banner (`smartAppBanner` in `src/lib/appStores.ts`, the `itunes` metadata of the landing page, About, Paper Pals, a card, a profile).
Also at the root: `manifest.ts` (/manifest.webmanifest, round 23 — the owner wants the system's own invitation, never a banner of ours): `display: 'browser'` and no `display_override`, so no browser offers to install the site, and `related_applications` names the Play app (`PLAY_PACKAGE`) with `prefer_related_applications`, so Chrome on Android may offer the app with its own prompt when its model decides (CSP `manifest-src 'self'`); other browsers get nothing.
`public/.well-known/apple-app-site-association` (served `application/json` by next.config's headers) claims for the iOS and Mac app (`V7H59QAJPL.com.resonance.stories`) exactly the paths Android's `autoVerify` filter claims — `/card/*`, `/u/*`, `/messages/*`, `/me/thought-map`, bare and under each locale — `src/lib/appLinks.test.ts` derives the list from the Android manifest so the two can't drift; Apple's CDN refreshes it within a day and can't be flushed, so it is deployed before an app build with the associated-domains entitlement ships.

## Authentication

1.
Browser signs in with the Firebase client SDK (Google / Email; Apple behind `NEXT_PUBLIC_ENABLE_APPLE_SIGNIN` — the web needs a Services ID and a Sign in with Apple key on Firebase's Apple provider, which the iOS app doesn't; phone OTP behind `NEXT_PUBLIC_ENABLE_PHONE_OTP`) and gets an ID token.
The sign-in and sign-up pages are a cover beside a sheet (`AuthCard`), stacked on a phone or an upright tablet (≤ 1024px).
2.
`POST /api/auth/session` exchanges it for an httpOnly session cookie (`__session`, signed by firebase-admin); it takes JSON from the site's own origin only (login CSRF), and a bad token is a 401.
`DELETE` logs out.
The browser mints it in the background (`ensureSession()` in `src/lib/auth/firebase/client.ts`: deduped, only when missing or under a day from expiry, remembered in localStorage `resonance:session`); explicit sign-ins await it.
`useAuth().loading` ends as soon as the SDK restores the user; only callers of cookie-authenticated `/api` routes wait for `useSessionReady()` (a context of its own, so its flip re-renders only them; `useAuth().user` keeps its object while the account is the same) — prefer `callApi` (Bearer) for new calls.
Only the sign-in pages set Auth up with the popup resolver (`wantsPopupResolver`: Safari and phones load Google's gapi and auth frame up front with it, holding back the user's restore — and blocking the popup without it); one reached by a client-side hop reloads itself once on such a browser (`reloadForPopupOnce`, from `ProviderButtons`).
3.
Server code verifies the cookie or ID token via `getCurrentUser()` in `src/lib/auth`, locally (signed out is a 401 everywhere, never a 500).
Revocation and disabled state are asked of Firebase Auth live on writes, `/api/account/*`, upload and generate-image; v1 GETs and `/api/recommend/feed` use a per-instance cache (`REVOCATION_CACHE_MS`, 2 min) via `getCurrentUser({ revocation: 'cached' })`.
Revoke with `revokeSessions(uid)` (clears the local entry), never a bare `revokeRefreshTokens`.
An Auth outage is `AuthUnavailableError` → 500, never a 401.
4. Firestore waits for Auth restoration on its own, so public reads (feed, related, resonances) don't gate on auth; reads of the viewer's own data wait for the user.
