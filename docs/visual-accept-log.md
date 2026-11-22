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
| 2026-11-22T04:39:13Z | 20261122-035402 | b4169a57 | web | card, card-own-taps, card-picked-people, taps-author-list, taps-list, card-other, card-tapped | 35 | 修改完就可以接受为基准 |
| 2026-11-22T04:39:24Z | 20261122-035931 | b4169a57 | mac | card, card-own-taps, card-picked-people, taps-author-list, taps-list, card-other, card-tapped | 7 | 修改完就可以接受为基准 |
| 2026-11-22T04:39:25Z | 20261122-040232 | b4169a57 | ios | card-own-taps, card-tapped, taps-list, taps-author-list | 16 | 修改完就可以接受为基准 |
| 2026-11-22T04:39:31Z | 20261122-042207 | b4169a57 | ios | card, card-picked-people, card-other | 12 | 修改完就可以接受为基准 |
| 2026-11-22T04:39:32Z | 20261122-040953 | b4169a57 | android | card, card-own-taps, card-picked-people, taps-author-list, taps-list, card-other, card-tapped | 28 | 修改完就可以接受为基准 |
| 2026-11-22T09:09:17Z | 20261122-050028 | 4aafa213 | web | all | 60 | 现在其他分支也有一些修改，请你用最新的画面当作新的 baseline |
| 2026-11-22T09:09:23Z | 20261122-051139 | 4aafa213 | android, ios, mac | all | 54 | 现在其他分支也有一些修改，请你用最新的画面当作新的 baseline |
| 2026-11-22T09:09:31Z | 20261122-090015 | 4aafa213 | ios | all | 27 | 现在其他分支也有一些修改，请你用最新的画面当作新的 baseline |
| 2026-11-22T10:07:39Z | 20261122-050607 | 9000b994 | web | card-picked-people | 5 | 接受為基準 |
| 2026-11-22T10:07:39Z | 20261122-050711 | 9000b994 | mac | card-picked-people | 1 | 接受為基準 |
| 2026-11-22T10:07:40Z | 20261122-050903 | 9000b994 | android | card-picked-people | 4 | 接受為基準 |
| 2026-11-22T10:07:40Z | 20261122-083711 | 9000b994 | ios | card-picked-people | 1 | 接受為基準 |
| 2026-11-22T10:07:41Z | 20261122-085814 | 9000b994 | ios | card-picked-people | 3 | 接受為基準 |
| 2026-11-22T18:14:14Z | 20261122-170103 | c9ea85ed | web | thought-map, publish-cover | 4 | 1、2 接受，3 是設計本來如此 |
| 2026-11-22T18:14:21Z | 20261122-170235 | c9ea85ed | android | card-note-open | 3 | 1、2 接受，3 是設計本來如此 |
