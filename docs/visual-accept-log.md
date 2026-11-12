# Visual baseline accepts

Every `npm run visual -- accept` appends a row here (`scripts/visual/acceptLog.ts`): when, the run
and the commit it captured, the platforms, the screens named with `--only` (*all* when none was),
how many captures went into the baseline, and the reason — the owner's words, or what the accept
rests on. The baselines themselves are git-ignored (`visual/`, this machine's own); this file is
what says on whose word they changed. Commit the new row with the accept
(`git commit -- docs/visual-accept-log.md`).

| Accepted (UTC) | Run | Commit | Platforms | --only | Captures | Reason |
| --- | --- | --- | --- | --- | --- | --- |
