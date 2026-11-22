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
| 2026-11-16T12:23:19Z | 20261116-101735 | c4e7283a | android, ios, mac, web | all | 375 | 接受新基准 |
| 2026-11-19T16:14:28Z | 20261118-235458 | 50d535cb | android, ios, mac, web | all | 517 | 你帮我 push，然后把截图设成基准 |
| 2026-11-19T16:15:30Z | 20261119-030144 | 8053fbe7 | android, ios, mac, web | all | 182 | 你帮我 push，然后把截图设成基准 |
| 2026-11-19T16:15:50Z | 20261119-042009 | cbcfe81b | android, ios, mac | all | 24 | 你帮我 push，然后把截图设成基准 |
| 2026-11-19T16:15:54Z | 20261119-063118 | d05f87ac | android, ios, mac, web | all | 148 | 你帮我 push，然后把截图设成基准 |
| 2026-11-19T20:02:09Z | 20261119-195529 | 22103904 | android | thread-attach | 4 | 你帮我 push，然后把截图设成基准 |
| 2026-11-21T12:34:07Z | 20261121-095831 | 4d186439 | web | landing | 5 | 收為基準 |
| 2026-11-21T18:04:10Z | 20261121-161711 | 4afae1ba | android, ios, mac, web | card-passages, taps-author-list, taps-list, card-tapped | 56 | 收為基準 |
| 2026-11-21T18:04:48Z | 20261121-163239 | 4afae1ba | android, ios, mac, web | card-passage-picked | 8 | 收為基準 |
| 2026-11-22T03:49:42Z | 20261121-140459 | ce42d27a (dirty) | ios, mac | ios/iphone/update-required@dark-zh-TW.png, ios/iphone/update-required@light-zh-TW.png, ios/iphone/update-required@light-en.png, ios/ipad/update-required@light-zh-TW.png, mac/mac/update-required@light-zh-TW.png | 5 | 好，接受 |
| 2026-11-22T03:49:51Z | 20261121-142552 | 55f7c566 (dirty) | android | update-required | 4 | 好，接受 |
