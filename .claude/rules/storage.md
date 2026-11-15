---
paths:
  - "src/lib/storage/**"
  - "src/lib/images/**"
  - "src/app/api/upload/**"
  - "src/app/api/emulator-storage/**"
  - "infra/**"
  - "scripts/backfill.ts"
  - "scripts/dev-emulator.mjs"
---

# Storage and pictures

## Storage & Image Pipeline

`src/lib/storage/` is an abstraction over Cloudflare R2 (S3-compatible API via `@aws-sdk/client-s3`).
Keys are `{kind}/{yyyy-mm}/{uuid}.{ext}` (no uid); `storeOwned()` records the owner in server-only `uploads/{uuid}`.
Once `config/storage` names the host, the rules take covers and avatars from it only.
Images are compressed client-side (`src/lib/images/compress.ts`), uploaded through `/api/upload` or `/api/generate-image`, converted to AVIF with sharp (`src/lib/storage/image.ts`), and served from `R2_PUBLIC_BASE` with `Cache-Control: public, max-age=31536000, immutable` (keys are UUIDs, never rewritten).
R2 CORS config is in `infra/r2-cors.json`.

Against the emulators (`npm run dev:emulator`, which blanks R2) covers, avatars and story pictures go to a folder on this machine instead (`lib/storage/local`: `EMULATOR_STORAGE_DIR`, else the temp dir) and the dev server serves them at `http://localhost:<its port>/api/emulator-storage/<key>` — `dev-emulator.mjs` sets `R2_PUBLIC_BASE` to that, so `publicBases()`/`storageKeyOf()` hold as in production; the route is a 404 anywhere else.
The rules' `storedFile()` takes that plain-http `localhost` address only while `config/storage` is unset (production has it, and its host check refuses it), and `cardContentProblem` takes http only on our own base.
An Android emulator reaches it after `adb reverse tcp:<port> tcp:<port>` (apps/README.md).

**A cover's frame** (round 25): the picture stays whole in storage and the card keeps where it is looked at — `media.frame = { cx, cy, zoom, ar }` (the picture's point at the frame's centre, zoom 1–2, the picture's width ÷ height when framed; absent = the centre at zoom 1, as every older card). Every shape a cover is drawn in cuts its own crop from it with `coverCrop(ar, frame, boxRatio)` (`src/lib/images/coverFrame.ts`; `boxRatio` is the box's height ÷ width: feed card 0.62, card page 0.52, mini card 0.56, square thumbs 1, share picture 0.5, chat card and og image 1 : 1.91), so the subject stays put from one shape to the next; `native/fixtures/cover-frame.json` pins it for the web and the apps' twins (`UPDATE_COVER_FRAME=1` rewrites it). The og image is cut on it and its version string includes the frame. The rules (`validMedia` → `validFrame`) and the server (`cardContentProblem`, an edit's `pickMedia`) hold the four numbers to the same ranges: keep the three in step. A client that writes a cover without a frame over one that had it must delete `media.frame` itself where its write merges (Android's draft autosave, `draftUpdate`).

**Chat pictures** are not public files: `lib/storage/chatImages` keeps them in a bucket of their own with no public address, `R2_CHAT_BUCKET` (`resonance-chat-images`; keys `chat/{yyyy-mm}/{uuid}.webp` and `-thumb.webp`, which no client is told), through the account's R2 keys or its own (`R2_CHAT_ACCESS_KEY_ID` / `R2_CHAT_SECRET_ACCESS_KEY`); against the emulators, in a folder on this machine (`EMULATOR_CHAT_IMAGES_DIR`, else the temp dir); in production without the bucket, `POST /api/v1/chat-images` says pictures can't be sent.
Read only through `GET /api/v1/chat-images/{id}` (API Routes).

**Moving the storage to a new host** (the r2.dev host → `img.resonance.channel`, an R2 custom domain on the same bucket: both serve every key).
Uploads go to `R2_PUBLIC_BASE` only; `R2_FORMER_PUBLIC_BASES` (comma-separated) lists the earlier bases, which everything that recognizes "a picture we stored" also accepts — `storageKeyOf()`/`publicBases()` in `src/lib/storage/publicUrl.ts` (applying an edit, `/api/og` share images, the integrity check) and the report-only CSP's `img-src`/`media-src`.
In the rules, `storedFile()` takes `config/storage.host` or any host in its optional `formerHosts`, so a draft or pending edit still holding an old-host cover stays saveable.
The order matters, since the rules refuse a cover on a host `config/storage` doesn't name: deploy the rules; with `R2_PUBLIC_BASE` set to the new base and the old one in `R2_FORMER_PUBLIC_BASES`, run `backfill.ts storage-host --apply` (the host it replaces joins `formerHosts`); deploy the site with the same two variables; then `backfill.ts rehost-images --apply` rewrites stored URLs on a former base to the same key on the new one — profile photos, covers and story pictures of cards and pending edits, without touching `updatedAt` or the list summary; `reportEvidence/*` keeps what was reported as it was.
Retire an old host only once a `rehost-images` dry run finds nothing left on it: drop it from `R2_FORMER_PUBLIC_BASES` and, by hand, from `formerHosts`.
