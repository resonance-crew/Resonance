// A fixed wait of ${MS} milliseconds — for the one thing a flow can't wait on by looking: the writer's autosave of
// words typed while an earlier save is still unanswered (offline). The bar has said 儲存中⋯ since that first save and
// says nothing new when the next is handed over, so the pause in the typing (the app's 1.5 s) is waited out as time.
// Everything else waits with extendedWaitUntil on what the person would see (maestro/README.md, Waiting).
//
//   - runScript:
//       file: common/pause.js
//       env:
//         MS: '4000'
var until = Date.now() + Number(MS);
while (Date.now() < until) {
  // Maestro's scripts have no timer: the clock is read until the time has passed.
}
