# Backups: what exists, and the interim plan

Written 2026-11-21 for 任務 #3 (middleware decouple), Phase 0. Every step below that touches
production — creating a bucket, a schedule, an export, a copy, a key — is an **owner step**: an
agent writes and tests the commands against the emulators or a scratch project, and the owner runs
them on `resonance-stories`.

## What exists today

| Data | Where | Protection today | What is missing |
| --- | --- | --- | --- |
| Firestore (cards, users, conversations, notes, …) | `resonance-stories`, `asia-east1` | Point-in-time recovery on (7 days), delete protection on (owner, 2026-10-02) | No scheduled export: anything older than 7 days, or a project lost or locked, has no copy |
| Public pictures (covers, story pictures, avatars) | R2 `R2_BUCKET`, served at `img.resonance.channel` | R2's own durability only | No second copy: a key deleted by mistake, or a bucket emptied, is gone |
| Chat pictures | R2 `resonance-chat-images` (no public address) | Same | Same |
| Auth accounts | Firebase Auth | Google's | No export of the user list (uids, providers) |
| A person's own copy | `/api/account/export` (compact JSON) | — | Pictures are URLs only, not the files: once a file is gone, so is the picture |

PITR answers "undo the last few days" (a bad deploy, a backfill that wrote the wrong thing). It does
not answer "the project is gone", "we noticed after two weeks", or "move to another provider". The
plan below closes those gaps until Phase 3's exporter replaces it.

## Interim plan

### 1. Firestore: a scheduled managed export to GCS (owner step)

1. Create a bucket in the same region, not public, with a lifecycle rule (keep 30 daily, then
   delete; or 12 weekly in a cheaper class):
   `gcloud storage buckets create gs://resonance-stories-backups --project resonance-stories --location asia-east1 --uniform-bucket-level-access`
2. Give the Firestore service agent write access to it
   (`service-<project number>@gcp-sa-firestore.iam.gserviceaccount.com`, role
   `roles/storage.admin` on that bucket only).
3. Run one export by hand and look at it:
   `gcloud firestore export gs://resonance-stories-backups/$(date -u +%Y%m%d) --project resonance-stories`
4. Schedule it daily — either Cloud Scheduler calling the Firestore Admin `exportDocuments` API, or
   Firestore's scheduled backups (`gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d`)
   if the owner prefers Google's managed backups to plain exports. A managed backup restores only
   into Firestore; a plain export can also be read by other tools, which is what a move needs.
5. Write the result into `docs/release/owed.md` as done, with the date.

### 2. R2: a periodic bucket copy with rclone (owner step)

1. Make a second bucket (another R2 bucket in another account or jurisdiction, or an S3/GCS bucket),
   and an R2 API token that may only **read** the two source buckets.
2. Configure rclone with two remotes (`r2:` with the read-only token, `backup:` the target) on a
   machine the owner trusts, or a GitHub Action with the keys as secrets.
3. Copy, never sync-with-delete, so a deletion at the source can't reach the copy:
   `rclone copy r2:<R2_BUCKET> backup:resonance-public --checksum --transfers 8`
   `rclone copy r2:resonance-chat-images backup:resonance-chat-images --checksum --transfers 8`
4. Weekly is enough at today's volume (keys are UUIDs and never rewritten, so each run only copies
   what is new). Chat pictures are private messages: the target must be as closed as the source, and
   an account purge does not reach the copy — the copy's retention (e.g. 30 days, then delete) is
   what keeps a purge true; say so in the privacy policy if the copy is kept longer.

The repository's own tool does the same as rclone's copy, with a manifest and a compare to prove it
(`scripts/storage/{copy,compare}.ts`; docs/ops/storage-migration.md): a dry run by default, never a delete,
an object already there with the same size and hash skipped —
`npx tsx scripts/storage/copy.ts --from r2:public --to s3:BACKUP --manifest <outside the repo>/public.json --apply`.

### 3. A restore drill (agent can rehearse, owner runs the production half)

- Into the emulator: `gcloud storage cp -r gs://resonance-stories-backups/<date> ./restore/` and
  start the Firestore emulator with `--import ./restore` — the emulator wants a
  `firebase-export-metadata.json` there whose `firestore.metadata_file` names the export's
  `<date>/<date>.overall_export_metadata` (write it by hand the first time and keep it with this
  page once the drill has passed) — then `npx tsx scripts/integrity.ts` against it and open a few pages under
  `npm run dev:emulator`.
- Into a scratch project: `gcloud firestore import gs://resonance-stories-backups/<date> --project <scratch>`
  (never into `resonance-stories`; a restore into production replaces documents and is decided by the
  owner, with PITR the first choice for anything within 7 days).
- Pictures: pick ten keys from the restored cards and check each is in the R2 copy
  (`rclone lsf backup:resonance-public/<key>`) — or check the whole copy at once, keys and bytes:
  `npx tsx scripts/storage/compare.ts --from r2:public --to s3:BACKUP` (missing, extra and mismatched keys only;
  SHA-256 computed by streaming, since R2's multipart ETags are not MD5s).
- Note the date, the export used, how long it took and what failed in `Resonance-notes`; repeat
  after any change to the schedule.

## What replaces it: the weekly portability export (Phase 3)

Phase 3 of the middleware plan added `scripts/portability/` (plan §4.2): a vendor-neutral export of
the canonical domain schema (`src/server/domain/schema/entities.ts`, one schema and version per entity
of the registry) — the same tool for backups, restores into another adapter, and a move.

- **Format 1**: `export-<UTC>-<source>/manifest.json` + `entities/<entity>/000001.ndjson.zst` (one
  canonical row a line, keys sorted, sorted by id, ≤ 100 000 a file, zstd from Node itself) +
  `objects/public.ndjson` (each picture's key, size, ETag, type). The manifest holds a sha256 per file
  (hash of the rows' hashes) and per entity, so a restore checks every file as it reads it. The chat
  bucket is listed only when its store can list (`objects.chat.listed: false` today: the private store
  has no listing) — the rclone copy of §2 stays until the exporter carries the files themselves.
- **It is the whole database** — every anonymous card's author, every private message, every report's
  evidence. It goes to the owner's encrypted storage only: `--out` on that volume (the default is
  `$TMPDIR/resonance-exports`, and a directory inside the repository is refused); `.gitignore` has
  `export-*/`, and CI's `repoCheck.ts` fails on a tracked file shaped like one or a workflow uploading
  one as an artifact.
- **The owner runs it, never CI and never an agent.** There is no default project; a real one needs
  `--i-am-the-owner` and prints a warning, with production's service account in `.env`:
  `npx tsx scripts/portability/export.ts --i-am-the-owner --project resonance-stories --out <encrypted volume> [--objects-r2]`.
  A value off its schema stops it (entity, id hash, field path); `--lenient` writes it generically and
  lists the path in the manifest instead — fix the row or the schema after.
- **The restore drill** (owner, once, then after any schema change): import the export into the
  emulator and compare — `npm run emulators`, then
  `npx tsx scripts/portability/import.ts --from <export> --target emulator --project demo-resonance`,
  `npx tsx scripts/portability/parity.ts <export> --emulator --project demo-resonance` (must print
  `parity: same`), `npx tsx scripts/integrity.ts --emulator`, and open a few pages under
  `npm run dev:emulator`. An import never writes to a real project. Note the date, the export and the
  time it took in `Resonance-notes`.
- **Once that drill has passed**, the weekly export (on a machine the owner trusts, to the encrypted
  storage, keeping e.g. 12 weeks) replaces §1's scheduled `gcloud firestore export`, which the owner may
  then drop. Nothing is scheduled by the code: the schedule is the owner's to set up.

The round trip (emulator → export → memory → export, byte for byte the same; parity finding a changed
row by id hash and field path only) is `test/emulator/portability.roundtrip.emulator.test.ts`.
