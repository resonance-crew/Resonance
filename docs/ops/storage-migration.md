# Moving the pictures to another bucket (and back)

Written 2026-11-21 for 任務 #3 Phase 3 (plan §3.8, ADR 0005). Nothing here has been run on production:
every step that touches R2, DNS or Vercel's environment is an **owner step**. An agent rehearses the
commands on folders (`dir:`) or a scratch bucket.

## What makes a move cheap

- Public pictures are served from our own name, `img.resonance.channel`. Behind it can be an R2 custom
  domain, CloudFront + S3, or Cloud CDN + GCS: a move is a bucket copy plus a DNS change.
- Keys are UUIDs and never rewritten (`immutable` for a year), so a copy is idempotent and can run as many
  times as needed while uploads go on.
- Cards and profiles keep the key beside the URL (`media.key`, `avatarKey`; `npx tsx scripts/backfill.ts
  media-keys` for older documents), and answers build the URL from the key on `MEDIA_PUBLIC_BASE`. Story
  Markdown keeps absolute URLs; while the host stays `img.resonance.channel` they need nothing.
- The base must stay under `*.resonance.channel`: the apps draw a story's picture only from there
  (`StoryPictures.swift`, `StoryPictures.kt`), and a deployment whose base is elsewhere fails loudly
  (`MediaConfigError`, `src/server/infra/env/media.ts`).
- Chat pictures (`R2_CHAT_BUCKET`) have no public address: moving them is the same copy, then new
  credentials in the environment.

## The tools

| Command | What it does |
| --- | --- |
| `npx tsx scripts/storage/copy.ts --from <a> --to <b> [--prefix p] [--manifest f] [--apply]` | Copies every object of `a` missing at `b`; an object already at `b` with the same size and SHA-256 is skipped, one with other bytes is reported as a conflict and left (`--overwrite` to replace it). Never deletes. A dry run unless `--apply`; after each write it reads the object back and checks its hash |
| `npx tsx scripts/storage/compare.ts --from <a> --to <b> [--prefix p] [--sizes-only] [--json]` | Lists only the keys missing at `b`, extra at `b`, or with other bytes; exit code 0 when identical |

Buckets: `r2:public` (R2_BUCKET), `r2:chat` (R2_CHAT_BUCKET), `s3:<PREFIX>` (any S3-compatible bucket:
`<PREFIX>_ENDPOINT`, `_BUCKET`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, optional `_REGION`, `_CACHE_CONTROL`
— set `public, max-age=31536000, immutable` for the public target), `dir:<path>` (a folder). Hashes are
SHA-256 computed by streaming each object: R2's ETag for a multipart upload is not an MD5 of the object, so
no ETag is ever compared. Manifests (`--manifest`) hold every key with its size and hash: keep them outside
the repository (chat keys name conversations).

## The move

1. **Target.** Create the new bucket (public one: no listing; chat one: as closed as the source), a
   read-only token for the two R2 buckets, and a write token for the targets. Put the target's settings in
   the shell running the copy (`TARGET_*`, `TARGET_CHAT_*`), never in a file in the repository.
2. **First copy** (can take hours; uploads go on):
   `npx tsx scripts/storage/copy.ts --from r2:public --to s3:TARGET --manifest ~/move/public-1.json --apply`
   `npx tsx scripts/storage/copy.ts --from r2:chat --to s3:TARGET_CHAT --manifest ~/move/chat-1.json --apply`
3. **Catch up.** Run both again until a run copies (almost) nothing — only what was uploaded meanwhile.
4. **Prove it.** `npx tsx scripts/storage/compare.ts --from r2:public --to s3:TARGET` and the same for chat:
   `missing` must be empty or only today's newest uploads (run the copy once more), `mismatched` empty.
   `extra` should be empty (anything there was written to the target by something else: look first).
5. **Switch the public name.** Point `img.resonance.channel` at the new CDN (its origin the new bucket). The
   URLs stored in documents do not change. If the new CDN has another name under `*.resonance.channel`, set
   `MEDIA_PUBLIC_BASE` to it and the old one in `MEDIA_FORMER_BASES`, then redeploy: answers build URLs on
   the new base from the keys, and the old URLs stay "ours" for reads. The rules judge a client's picture by
   `config/storage` (`host`, `formerHosts`): `npx tsx scripts/backfill.ts storage-host` moves `host` to the
   new one and keeps the old among `formerHosts` — before the redeploy, or older apps' uploads are refused.
6. **Switch the writes.** Point the server's storage credentials (`R2_*` or the new adapter's) at the new
   buckets and redeploy; for chat, `R2_CHAT_BUCKET` and its keys. From here uploads land in the new bucket.
7. **Last catch-up.** Copy once more from the old buckets (uploads between steps 2 and 6), then compare again:
   identical, both buckets.
8. Keep the old buckets read-only for 30 days, then delete them (an owner step). The chat copy is private
   messages: the old bucket's deletion is what makes an account purge since the move true there.

## Rollback

- **Before step 6** (only reads moved): point `img.resonance.channel` back at R2 (and `MEDIA_PUBLIC_BASE`
  back, if it changed). Nothing was written to the new bucket that R2 lacks.
- **After step 6** (writes moved): first copy back what the new buckets gained —
  `npx tsx scripts/storage/copy.ts --from s3:TARGET --to r2:public --apply` (and chat) — compare
  (`--from s3:TARGET --to r2:public`: `missing` empty), then point the credentials and DNS back and redeploy,
  then copy back once more for uploads in between. Never `--overwrite` in a rollback: a conflict means a key
  was written twice, which UUID keys never are — stop and look.
- **A different domain** (not `*.resonance.channel`) is not a rollback path: it needs an app release that
  allows the new host first (ADR 0005), then `npx tsx scripts/backfill.ts storage-host` and `rehost-images`.

## Rehearsal (no production)

Against the emulators' folder (`npm run dev:emulator` keeps public pictures in the folder its storage
serves): `npx tsx scripts/storage/copy.ts --from dir:<that folder> --to dir:/tmp/move --apply`, write a file
into the source, copy again (one copied), compare (identical), change a byte in the target, compare
(`mismatched`). `scripts/storage/sync.test.ts` does the same on every `npm test`.
