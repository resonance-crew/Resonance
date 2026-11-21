# Scheduled jobs (the cron routes)

What runs on a clock, how it is called, and how to call it from somewhere other than Vercel Cron.
Written in 任務 #3 Phase 1 (the middleware decouple, routes lane): nothing here changes production —
Vercel Cron still calls every route below, as `vercel.json` `crons` says. This page is what a move to
another scheduler needs.

## The contract every cron route keeps

- **A `GET`** to the route's path on the production host (`https://resonance.channel/api/cron/…`), no body.
- **`Authorization: Bearer $CRON_SECRET`** — `src/lib/api/cronAuth.ts` `cronAuthorized()` compares it in
  constant time (as SHA-256 digests). Any other caller gets **401** `{ "error": "Unauthorized" }`, and so does
  every caller while `CRON_SECRET` is unset: a cron route never runs for a guess. Vercel Cron sends this header
  by itself when the project has a `CRON_SECRET` env var; any other scheduler must send it.
- **Answers 200 with a small JSON summary** of the run (counts only — never ids, never who); a thrown error is a 500.
  Each run also logs its summary (`[index-cards] {…}` and so on).
- **Each run works within a budget below its `maxDuration`** (the function's limit, exported from the route and,
  for the routes pinned to Tokyo, repeated in `vercel.json` `functions`): it starts no new unit of work past
  the budget and leaves the rest for the next run. So a run that is cut short is safe, and a run repeated the
  same day does no harm (each job's own note says how).
- **Idempotent per period.** A second call the same day (or week) finds nothing more to do, or writes the same
  rows again under the same ids. A retry on a 5xx is safe for every job.
- Times below are **UTC** (Vercel Cron, GitHub Actions and Cloud Scheduler with `timeZone: Etc/UTC` read cron
  expressions in UTC). Taipei is UTC+8. Vercel's Hobby plan fires a job anywhere within its hour and at most
  once a day per job.

## The jobs

| Route | `vercel.json` schedule (UTC) | Taipei | `maxDuration` | Budget | Region |
| --- | --- | --- | --- | --- | --- |
| `/api/cron/index-cards` | `0 10 * * *` | 18:00 daily | 300 s | starts no reading past 190 s | `hnd1` (calls OpenAI) |
| `/api/cron/warm-picks` | `0 11 * * *` | 19:00 daily | 300 s | starts no build past 240 s, every build done by 295 s | `hnd1` (calls OpenAI) |
| `/api/cron/push-picks` | `0 12 * * *` | 20:00 daily | 300 s | starts no push past 270 s | `hkg1` |
| `/api/cron/purge-accounts` | `0 18 * * *` | 02:00 daily | 300 s | starts no account past 270 s | `hkg1` |
| `/api/cron/purge-trash` | `30 18 * * *` | 02:30 daily | 300 s | starts nothing past 270 s | `hkg1` |
| `/api/cron/read-summary` | `0 1 * * 1` | Monday 09:00 | 300 s | starts no card past 270 s | `hkg1` |

The order inside the evening matters: the re-reading (10:00) before the warm-up (11:00), the warm-up before the
push (12:00), which only reads what the warm-up built. The trash purge runs half an hour after the account purge.

### `/api/cron/index-cards`

The daily re-reading of cards whose reading is owed (an applied edit marks one: `markIndexOwed`), at most
`INDEX_OWED_LIMIT` a run, a few at a time (`src/server/app/recommendIndex.ts` `indexOwedIn`). Each reading has its
own deadline (100 s), so none starts after `maxDuration − 110 s`. Answers the run's counts. A card not reached
stays owed for tomorrow. Calls OpenAI: must run outside Hong Kong (`hnd1`, rule 9).

### `/api/cron/warm-picks`

First the pool's numbers (`refreshPoolStats`: μ, r(x), τ — no model; a failure is logged and the run goes on with
`pool: null`), then tonight's picks for each reader active lately (`src/server/app/recommendWarm.ts`
`warmPicksIn`, the funnel as the build). Answers `{ pool, readers, outcomes, deferred }`. A reader not reached is
built when they next ask. Calls OpenAI: `hnd1`.

### `/api/cron/push-picks`

"A card for tonight": for each reader with picks pushes on, the first pick the warm-up stored, if the reader's
week has room and they haven't opened their picks today (`src/server/app/pushPicks.ts` `pushPicksIn`, FCM through
`ctx.push`). The walk starts at the day's point in the user ids, so the readers a short run misses aren't the same
ones every day. The pick log keeps a second run the same day from pushing again. Answers
`{ readers, outcomes, deferred }`.

### `/api/cron/purge-accounts`

Accounts whose deletion grace period (7 days) has ended, longest overdue first, a few at a time
(`src/server/app/account.ts` `purgeDueAccountsIn`): their records (the registry's purge plan), uploaded pictures
(`ctx.objects`), chat pictures (`ctx.chatObjects`), the sign-in (`ctx.identity.deleteUser`), and last the deletion
request itself; their cached pages are revalidated. One cut short keeps its request and is finished by the next
run. Answers `{ purged, failed, deferred }` (counts).

### `/api/cron/purge-trash`

Side by side, each within the whole budget: cards in the trash 30 days or more deleted for good
(`purgeExpiredTrashIn`, each card's pages revalidated), chat pictures uploaded more than a day ago that no message
carries (`purgeUnsentChatImagesIn`, skipped — `unsentPictures: null` — where no chat picture store is set up), and
the copies of messages unsent 30 days ago or more (`purgeUnsentCopiesIn`). Answers
`{ purged, skipped, failed, deferred, unsentPictures, unsentMessages }`.

### `/api/cron/read-summary`

Weekly "people read your card to the end": bell rows only (written already pushed — nothing rings), for public
cards three or more readers finished in the past seven days, never naming them
(`src/server/app/pushReadSummary.ts` `runReadSummaryIn`). The week ends at the start of the UTC hour the run fires
in, so a run that fires at 01:37 still covers exactly [Monday 01:00 − 7 days, Monday 01:00); the row's id carries
the run's day, so a second run the same day writes nothing new. **Fire it within the hour after Monday 01:00 UTC**:
a run at another hour covers another week.

## Not scheduled: `/api/cron/replicate` (Phase 3)

The outbox's replicator (`src/server/app/replicate.ts`, plan section 4.3): Firestore's `changeLog` into
PostgreSQL. **It is not in `vercel.json` `crons`, on purpose** — nothing in production runs it, and it answers
`{ "replicated": false, "off": "…" }` unless `OUTBOX_ENABLED=1`, `REPLICA_TARGET=postgres` and `POSTGRES_URL`
are all set (none is). It keeps the contract above: `GET`, `Authorization: Bearer $CRON_SECRET`, counts only
(`seen`, `applied`, `stale`, `more` — never ids), `maxDuration` 60 s, starts no batch past 45 s.

When Phase 4 is decided (docs/ops/postgres.md), it would run **every minute**, region `hkg1` (it calls no
model), and is safe to run as often as wanted or twice at once: each change is applied only when it is newer
than what the target holds (`replica_versions`), and an entry is marked done only after its row was applied.
Vercel Cron needs a Pro plan for a per-minute job; elsewhere:

- `vercel.json`: `{ "path": "/api/cron/replicate", "schedule": "* * * * *" }`
- GitHub Actions: `schedule: - cron: '*/5 * * * *'` (Actions' floor is five minutes) calling it with `curl` as below.
- Cloud Scheduler: `--schedule="* * * * *"`, the same header.
- A long-running worker can call `replicate()` in a loop instead (no route at all).

PostgreSQL's TTL sweep (`select resonance_ttl_sweep()`, docs/ops/postgres.md) would be a daily job beside it.

## The same jobs on another scheduler

Whatever calls them, keep: the UTC times and their order, the bearer header, a client timeout a little above the
route's `maxDuration` (the work happens in the function; the caller only waits), and **no automatic retry
earlier than a few minutes** (a run cut by a platform timeout is finished by the next run anyway). Keep exactly one
scheduler enabled per job: two would run each job twice (harmless, by the idempotency above, but twice the reads).

### GitHub Actions

`.github/workflows/cron.yml` (not in the repo — a sketch), with `CRON_SECRET` as a repository secret:

```yaml
name: cron
on:
  schedule:
    - cron: '0 10 * * *'    # index-cards
    - cron: '0 11 * * *'    # warm-picks
    - cron: '0 12 * * *'    # push-picks
    - cron: '0 18 * * *'    # purge-accounts
    - cron: '30 18 * * *'   # purge-trash
    - cron: '0 1 * * 1'     # read-summary
  workflow_dispatch:
    inputs:
      job: { description: 'route under /api/cron', required: true }
jobs:
  call:
    runs-on: ubuntu-latest
    timeout-minutes: 8
    steps:
      - name: Call the route
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          SCHEDULE: ${{ github.event.schedule }}
          JOB: ${{ inputs.job }}
        run: |
          case "$SCHEDULE" in
            '0 10 * * *') JOB=index-cards ;;
            '0 11 * * *') JOB=warm-picks ;;
            '0 12 * * *') JOB=push-picks ;;
            '0 18 * * *') JOB=purge-accounts ;;
            '30 18 * * *') JOB=purge-trash ;;
            '0 1 * * 1') JOB=read-summary ;;
          esac
          curl --fail-with-body --silent --show-error --max-time 320 \
            -H "Authorization: Bearer $CRON_SECRET" \
            "https://resonance.channel/api/cron/$JOB"
```

GitHub fires scheduled workflows late under load (often 5–30 minutes) and may skip one; the order above
(10:00 → 11:00 → 12:00) has an hour between jobs, which absorbs that. `read-summary` must still fire within its
hour (see above): if GitHub's delay is a worry, give it `'5 1 * * 1'`. Scheduled workflows run only on the
default branch and stop after 60 days without a commit to the repository.

### Google Cloud Scheduler

One HTTP job per route, in the project's region (`asia-east1`), `timeZone: Etc/UTC`:

```bash
gcloud scheduler jobs create http resonance-index-cards \
  --location=asia-east1 --schedule='0 10 * * *' --time-zone='Etc/UTC' \
  --uri='https://resonance.channel/api/cron/index-cards' --http-method=GET \
  --headers='Authorization=Bearer <CRON_SECRET>' \
  --attempt-deadline=320s --max-retry-attempts=1 --min-backoff=300s
```

and the same for `warm-picks` (`0 11 * * *`), `push-picks` (`0 12 * * *`), `purge-accounts` (`0 18 * * *`),
`purge-trash` (`30 18 * * *`), `read-summary` (`0 1 * * 1`). The default attempt deadline (180 s) is shorter than
the routes' 300 s: set `--attempt-deadline` (HTTP targets take up to 30 minutes). The secret sits in the job's
headers; anyone with `cloudscheduler.jobs.get` on the project can read it, so keep that role narrow (or put a
Cloud Run / Cloud Function in front that reads it from Secret Manager).

### Cloudflare Cron Triggers

A Worker with the six schedules in its `wrangler.toml` and the secret as a Worker secret
(`wrangler secret put CRON_SECRET`):

```toml
[triggers]
crons = ["0 10 * * *", "0 11 * * *", "0 12 * * *", "0 18 * * *", "30 18 * * *", "0 1 * * 1"]
```

```ts
const JOBS: Record<string, string> = {
  '0 10 * * *': 'index-cards',
  '0 11 * * *': 'warm-picks',
  '0 12 * * *': 'push-picks',
  '0 18 * * *': 'purge-accounts',
  '30 18 * * *': 'purge-trash',
  '0 1 * * 1': 'read-summary',
};

export default {
  async scheduled(event: ScheduledController, env: { CRON_SECRET: string }, ctx: ExecutionContext) {
    const job = JOBS[event.cron];
    if (!job) return;
    const res = await fetch(`https://resonance.channel/api/cron/${job}`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      signal: AbortSignal.timeout(320_000),
    });
    console.log(job, res.status, await res.text());
    if (!res.ok) throw new Error(`${job}: ${res.status}`);
  },
};
```

Cron Triggers read their expressions in UTC. Waiting on `fetch` costs the Worker wall time, not CPU time, and a
scheduled handler may run for minutes; the work itself stays in the Vercel function. A failed invocation shows in
the Worker's Cron Events; Cloudflare doesn't retry it.

## Moving off Vercel Cron

1. Set up the other scheduler with the same secret, its jobs **disabled**; call each route once by hand
   (`curl -H "Authorization: Bearer …"`) and check its summary and logs.
2. In one change: enable the other scheduler's jobs and remove `crons` from `vercel.json` (deployed by the push
   that ships it — a release step, `docs/release/owed.md`). Never both on for long.
3. `CRON_SECRET` stays a Vercel env var: the routes check it whoever calls.
