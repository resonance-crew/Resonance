# Visual baseline accepts

Every `npm run visual -- accept` appends a row here (`scripts/visual/acceptLog.ts`): when, the run
and the commit it captured, the platforms, the screens named with `--only` (*all* when none was),
how many captures went into the baseline, and the reason — the owner's words, or what the accept
rests on. The baselines themselves are git-ignored (`visual/`, this machine's own); this file is
what says on whose word they changed. Commit the new row with the accept
(`git commit -- docs/visual-accept-log.md`).

| Accepted (UTC) | Run | Commit | Platforms | --only | Captures | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-15T05:18:17Z | 20261115-000009 | 752eac5e (dirty) | ios, mac, web | ios/iphone/thread-reply@light-en.png, mac/mac/notifications@light-zh-TW.png, mac/mac/profile@light-zh-TW.png, mac/mac/settings@light-zh-TW.png, mac/mac/thread-letter@light-zh-TW.png, mac/mac/thread-reply@light-zh-TW.png, mac/mac/thread-stickers@light-zh-TW.png, mac/mac/thread@light-zh-TW.png, web/desktop/landing@light-zh-TW.png, web/phone/landing@dark-zh-TW.png, web/phone/landing@light-en.png, web/phone/landing@light-zh-TW.png, web/tablet/landing@light-zh-TW.png | 13 | 我看完了都没有问题，界面看起来都是正常的啊 / 我会接受这十三张新的图 as the new baseline |
