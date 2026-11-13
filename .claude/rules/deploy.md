---
paths:
  - "vercel.json"
  - "scripts/vercel/**"
  - "next.config.ts"
  - "docs/legal/**"
  - ".vercelignore"
---

# Deployment

Releasing — a store build, or a push that ships the web — follows [docs/release-checklist.md](../../docs/release-checklist.md): first the commit's CI is green (`gh run list --commit <sha> --workflow CI`), then the order of what goes live (rules before the web that needs them, the web before an iOS / Mac build with associated domains), the release run, the builds, and the owner's yes before any upload.

Vercel builds a pushed commit only when something the site is built from changed since the branch's last successful deployment: vercel.json's `ignoreCommand` (`scripts/vercel/ignore-build.sh`, tested in `src/lib/ignoreBuild.test.ts`) skips one whose changes are only in `apps/` or `docs/` — except `docs/legal`, which the policy pages read.
Every deployment keeps ~110 MB of functions for its retention period (7 days production and preview, 1 day errored and canceled, set in the dashboard: Build and Deployment → Deployment Retention Policy) against Hobby's 10 GB of Functions Storage.
If the site comes to read another file under `docs/` or `apps/`, narrow the script's exclusions with it (the test checks `next.config.ts`'s `outputFileTracingIncludes`).
