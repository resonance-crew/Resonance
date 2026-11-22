package com.resonance.kit.visual

/**
 * The release screenshots' "this screen is drawn" (scripts/visual/android.ts): without it, a capture waited a
 * fixed 4 s (8 s on an account's first launch), then for two frames alike 1 s apart, then 3.5 s more, before it
 * trusted a frame. With it, the app says when the screen is quiet and the harness goes on at once — a short settle
 * and its skeleton check after, as ever; and if this never comes, the harness waits as it always did.
 *
 * Quiet: at least one request through the app's one OkHttpClient (the API and the pictures, [AppHttp]) has
 * answered since the launch, none is on its way, no skeleton or picture placeholder is on screen ([Skeleton]'s
 * shimmer), and all of that has held for [QUIET_MS]. Said once a launch: `VisualReady: ready <token>` in logcat,
 * the token the harness launched with (`--es visualReadyToken`), so a line from an earlier launch never counts.
 *
 * Debug only and only when asked: MainActivity calls [start] in a debug build launched with the token; until then
 * (and in every release build) [enabled] is false and every call returns at its first line.
 */
object VisualReady {
    const val TAG = "VisualReady"
    const val QUIET_MS = 800L

    @Volatile var enabled: Boolean = false
        private set

    private var token: String = ""
    private var inFlight = 0
    private var placeholders = 0
    private var answered = 0
    private var generation = 0L
    private var said = false
    private var schedule: (delayMs: Long, run: () -> Unit) -> Unit = { _, _ -> }
    private var say: (String) -> Unit = {}

    /** Starts listening for this launch: the token to say, how to run something later, how to say it. */
    @Synchronized
    fun start(token: String, schedule: (delayMs: Long, run: () -> Unit) -> Unit, say: (String) -> Unit) {
        this.token = token
        this.schedule = schedule
        this.say = say
        inFlight = 0
        placeholders = 0
        answered = 0
        generation = 0
        said = false
        enabled = true
    }

    /** Stops (a test's end). */
    @Synchronized
    fun stop() {
        enabled = false
    }

    /** A request leaves; answers whether it was counted (only a counted one may [requestEnded]). */
    @Synchronized
    fun requestStarted(): Boolean {
        if (!enabled) return false
        inFlight++
        generation++
        return true
    }

    @Synchronized
    fun requestEnded() {
        if (!enabled) return
        inFlight = (inFlight - 1).coerceAtLeast(0)
        answered++
        changed()
    }

    /** A skeleton block or a picture's placeholder came on screen (+1) or went (-1). */
    @Synchronized
    fun placeholder(delta: Int) {
        if (!enabled) return
        placeholders = (placeholders + delta).coerceAtLeast(0)
        changed()
    }

    private fun changed() {
        generation++
        if (said || inFlight > 0 || placeholders > 0 || answered == 0) return
        val at = generation
        schedule(QUIET_MS) { settle(at) }
    }

    @Synchronized
    private fun settle(at: Long) {
        if (!enabled || said || at != generation || inFlight > 0 || placeholders > 0) return
        said = true
        say("ready $token")
    }
}
