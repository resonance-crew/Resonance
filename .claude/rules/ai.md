---
paths:
  - "src/lib/ai/**"
  - "src/lib/recommend/**"
  - "src/lib/cards/**"
  - "src/app/api/cards/**"
  - "src/app/api/recommend/**"
  - "src/app/api/generate-image/**"
  - "vercel.json"
  - "scripts/backfill-recommend-index.ts"
---

# AI and recommendations

## AI (`src/lib/ai/`)

Card URLs use English slugs (LLM translates the title, then slugify + handle/numeric-suffix collision handling).
`openai.ts` wraps API calls, `tasks.ts` defines the tasks (slug base, tag suggestions, story illustration), `slugify.ts`/`tags.ts` are pure logic with tests.
OpenAI is only called from server routes — the key never reaches the client — and every call carries a timeout (`signal`).
A route that can reach the OpenAI client runs in `hnd1`: list it in vercel.json `functions` (with its `maxDuration`); `src/lib/ai/regions.test.ts` follows every route's imports and fails on a missing or stale entry.
Recommendations (`src/lib/recommend`) search the vector store by COSINE distance (smaller = closer); `indexCard` (after publish and apply) indexes a card the trash reached before or while it ran all the same, its vectors private — a restore only sets their visibility back and asks no LLM — and reads the card again once its vectors are written, following a trash, restore or delete that landed meanwhile; the light boost for authors the reader has answered (`getEngagedAuthorIds`) counts named originals only — one for an anonymous card's author would point at them.
Lists that pick cards for readers (latest feed, recommendations, related, landing, pushes, sitemap) leave out blank cards and **unlisted** ones (`unlistedCard` in `src/lib/cards/blank.ts`), judged at save time and stored, so no list reads a story or asks a model: `thin` (fewer than `LISTED_MIN_UNITS` words, stamped by publish and edits/apply in their own write, server-only — `indexCard` skips the LLM for one and re-stamps a card an older build's client write left unstamped) and `signature.placeholder` (the signature's model calls it a test or filler; no vectors).
Every list's field mask carries `LISTING_FIELDS`; after the signature recipe changes (`INDEX_VERSION`), `npx tsx -r dotenv/config scripts/backfill-recommend-index.ts --all` restates existing cards.
