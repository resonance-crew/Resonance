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
| 2026-11-15T07:15:16Z | 20261115-000009 | 752eac5e (dirty) | mac, web | mac/mac/card-other@light-zh-TW.png, mac/mac/card-private@light-zh-TW.png, mac/mac/card-trashed@light-zh-TW.png, mac/mac/card@light-zh-TW.png, web/desktop/landing-footer@light-zh-TW.png, web/desktop/landing-stories@light-zh-TW.png, web/phone/landing-footer@dark-zh-TW.png, web/phone/landing-footer@light-en.png, web/phone/landing-footer@light-zh-TW.png, web/phone/landing-stories@dark-zh-TW.png, web/phone/landing-stories@light-en.png, web/phone/landing-stories@light-zh-TW.png, web/tablet/landing-footer@light-zh-TW.png, web/tablet/landing-stories@light-zh-TW.png | 14 | Accept all 14 (the four Mac card screens with the duller 🇹🇼 and the ten new landing-stories / landing-footer captures) |
| 2026-11-16T05:41:09Z | 20261116-042416 | bc870994 | android, ios, mac, web | all | 295 | 可以，接受基準 |
| 2026-11-16T05:41:51Z | 20261116-052737 | f2a5178c | android | all | 4 | 可以，接受基準 |
