# The daily check

After a release nothing used to look at production: the store's verdict came by e-mail, CI on
`main` went unread, and problems were found by the owner using the site. `scripts/ops/daily-check.ts`
gathers, read-only, what changed overnight into one short Markdown report. It is **prepared, not
switched on**: running it every morning is a Claude Desktop scheduled task that 念誠 creates
(below). Nothing here creates it.

```bash
npm run ops:daily                                   # CI, Vercel, stores; no data
npm run ops:daily -- --data production --out <file> # + moderation queue and integrity, report saved
npm run ops:daily -- --data emulator                # the same against the local emulators
```

| Section | Source | Needs |
|---|---|---|
| CI on main | `gh run list --branch main --workflow CI` | `gh` logged in |
| Web | `vercel ls resonance --prod --format json`, `vercel logs --environment production --level error --since 24h --json` | `vercel` logged in; run from the checkout that holds `.vercel/` (a lane falls back to the main checkout) |
| Store review | `scripts/ops/stores.ts`: App Store Connect reads versions' states once an API key is set (`ASC_READ_KEY_ID`, `ASC_ISSUER_ID`, `ASC_READ_KEY_PATH`, `ASC_APP_ID`); until then, and always for Play, a line saying where to look | nothing today ([../release/automation-options.md](../release/automation-options.md)) |
| Data | `npm run moderation -- list`, `npx tsx scripts/integrity.ts` — both only read, and print ids and counts, never anyone's writing | `--data production` (the default is `skip`), `.env`'s service account |
| Automatic issue | `gh issue list --label daily-check --state open` | `gh` |

The first line is the verdict: `# Resonance daily check <date>: OK` or `: <n> to look at`, followed
by the list. The exit code is 0 whatever it finds (2 only when it couldn't run): the report is the
result, and "the task ran" must never be read as "all is well".

## Where the report goes

`~/Documents/Resonance-notes/daily/<YYYY-MM-DD>.md` — outside the repo, beside the round notes.
The data section names report and card ids; the repository is public, so a report is never
committed and never pasted into an issue whole.

## The one-open-issue rule

At most **one** automatic issue is open at a time, labelled `daily-check`. The report's last section
says whether one is open.

- Nothing to look at → no issue, no comment.
- Something to look at and no `daily-check` issue open → open one: title = the report's first line
  without `# `, body = the "To look at" list and the path of the local report. Only those lines:
  they are counts and states, no ids, no log messages, no user data.
- Something to look at and one open → add one comment to it with the new "To look at" list, if it
  differs from the issue's last comment. Never a second issue.
- The task never closes, fixes, labels further or assigns anything. 念誠 (or a session 念誠 starts)
  closes it once handled; the next day's run may then open a new one.

Why: one person reads these. A pile of automatic issues is a review queue nobody empties; one
standing issue is a to-do.

## The scheduled task (for 念誠 to create)

Claude Desktop → Scheduled → New task (a **local** task: it needs this Mac's `gh`, `vercel` and
`.env` logins, which a cloud task's fresh clone doesn't have; the Mac must be on).

- **Name:** Resonance daily check
- **Schedule:** every day at 08:30 (Asia/Taipei) — after the night's crons (purges at 02:00 and
  02:30) and before the day's work.
- **Folder:** `/Users/ncchen/Documents/Resonance` (the main checkout: it holds `.vercel/` and `.env`).
- **Permission mode:** ask for anything not listed below.
- **Prompt:**

```text
Run the Resonance daily check and leave its report; change nothing else.

1. In /Users/ncchen/Documents/Resonance run:
   npm run -s ops:daily -- --data production --out ~/Documents/Resonance-notes/daily/$(date +%F).md
   It only reads (gh, vercel, the moderation list, the integrity check). Do not run any other
   script, and never anything with --apply, resolve, deploy, push, accept or upload.
2. Read the report's first line and its "To look at" and "Automatic issue" sections.
3. If it says OK: stop. Reply with the first line only.
4. If something is to look at:
   - and the report says no daily-check issue is open: open exactly one with
     gh issue create --label daily-check --title "<first line without '# '>" --body "<the 'To look at' lines, then: Report: <path of the report file>"
   - and one is open: if its latest comment doesn't already list the same lines, add one comment
     with gh issue comment <number> --body "<the 'To look at' lines, then the report path>".
   Put nothing else in the issue: no ids, no log messages, no report body (the repository is public).
5. Do not investigate or fix anything, close or edit issues, or open a pull request. Reply with the
   first line and the issue's URL.
```

Before the first run: create the label once (`gh label create daily-check --description "opened by the daily check"`),
run the command by hand once and read the report, and decide whether `--data production` belongs in
the scheduled run (without it the data section says "not checked").

## Later

- Crash reports join this report once Crashlytics is in the apps
  ([crash-reporting-proposal.md](crash-reporting-proposal.md)): the Firebase MCP's top issues by
  users affected, the new and the regressed ones, under the same one-issue rule.
- A deploy-triggered check (a cloud task called by Vercel after each production deployment) is
  the next step for the web; this daily one is the floor.
