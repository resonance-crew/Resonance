# 0005 — Media URLs: our own domain, resolved from keys, no proxy

**Status:** Accepted (2026-11-21, owner)

## Context

Pictures are stored in Cloudflare R2 and served from our own domain, `img.resonance.channel` (an R2
custom domain). Documents store full URLs: `cards.media.url`, `users.avatarUrl`, and the absolute
URLs inside a story's Markdown. Both apps draw a picture inside a story only when its host is the
site's domain or a subdomain of it (`StoryPictures.swift`, `StoryPictures.kt`); any other host
becomes a link. Chat pictures are private and already served only through
`/api/v1/chat-images/{id}`.

Two ways to make the storage replaceable: a proxy (every picture through `/api/media/…`) or a domain
abstraction (our domain in front of whichever store).

## Decision

- **Domain abstraction, no proxy.** Public pictures keep being served directly from
  `img.resonance.channel`; moving to S3 / GCS / another CDN means pointing that name at it. Chat
  pictures stay behind their API, as they are.
- Additive fields: `media.key` and `avatarKey`. Writes store the object key beside the URL; reads
  build the URL from the key through a `MediaUrlResolver` (`img.resonance.channel/<key>`), and older
  documents without a key fall back to `storageKeyOf()` on the stored URL (which every read path
  already uses).
- Story Markdown keeps absolute URLs (the web and apps render them as they are); a host change uses
  the existing `backfill.ts rehost-images`.
- The picture domain stays under `*.resonance.channel`: the apps only draw story pictures from there,
  so any other host needs an app release first.

## Consequences

- No function time or bandwidth spent per picture, no added latency; the CDN keeps caching
  immutable UUID keys for a year.
- A storage move is a DNS change plus a bucket copy (docs/ops/backup.md's rclone copy is the same
  tool); data needs no rewrite.
- New write paths must store keys; the resolver becomes the only place that knows the public base.
- A domain outside `*.resonance.channel` is effectively ruled out for story pictures.

## Built (Phase 3, 2026-11-21)

- Writes: the server keeps `media.key` (drafts, autosaves, pending edits, applying an edit) and `avatarKey`
  (PATCH /me, by key or URL) beside the URL — only when the URL is exactly that key on the current base
  (`src/server/domain/media.ts` `mediaKeyFor`), so a stored pair always agrees; a photo whose URL has no such
  key drops the old key. The rules take both as optional, and only as the key the URL ends in.
- Reads: `resolvedMediaUrl` answers `publicUrl(key)` on the current base, unless the stored URL names another
  of our keys (an older client changed only the URL) — then the URL; no key: the URL as stored. The v1
  presenters (`toAuthor`, `toFeedCard`'s `imageUrl` / `imageThumbUrl`, `GET /me`) go through it.
- The current base must be `https` on `resonance.channel` or a subdomain (http localhost for the emulators):
  on a deployment (`VERCEL_ENV`) any other makes every key-built URL and upload throw `MediaConfigError`,
  logged (`src/server/infra/env/media.ts` `assertMediaConfig`). Former bases are only read, so any host may
  stay there while a move finishes.
- Older documents: `npx tsx scripts/backfill.ts media-keys [--apply]`. A bucket move:
  `docs/ops/storage-migration.md`.
