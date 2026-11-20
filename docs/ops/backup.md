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
  (`rclone lsf backup:resonance-public/<key>`).
- Note the date, the export used, how long it took and what failed in `Resonance-notes`; repeat
  after any change to the schedule.

## What replaces it

Phase 3 of the middleware plan adds `scripts/portability/export.ts`: a vendor-neutral export of the
domain schema (JSON Lines per entity, with the pictures' keys and files), the same tool for backups,
restores into another adapter, and a move. Once it runs on a schedule and its restore drill passes,
the managed Firestore export above can be dropped (the R2 copy stays until the exporter carries the
files itself).
