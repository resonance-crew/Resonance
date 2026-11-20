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
