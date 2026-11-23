package com.resonance.kit.visual

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * A cold start's milestones (round 32 §P7: a tapped push, from process start to the thread's first message drawn), said
 * in logcat as `LaunchTrace: <what> +<ms>` — ms since the process started — so a launch can be timed on a device:
 * `adb logcat -s LaunchTrace`. Debug builds only: the app calls [start] with its clock and its log in a debug build,
 * and until then (every release build) every call returns at its first line.
 *
 * A milestone is said once a process ([mark]); the first [REQUESTS] requests through the app's client each say when
 * they went and when they answered ([request]), with their path — what a launch asks for, in what order.
 */
object LaunchTrace {
    const val TAG = "LaunchTrace"

    /** How many requests a launch says (the first ones: the launch's own). */
    const val REQUESTS = 40

    @Volatile var enabled: Boolean = false
        private set

    private var since: () -> Long = { 0L }
    private var say: (String) -> Unit = {}
    private val said = ConcurrentHashMap.newKeySet<String>()
    private val requests = AtomicInteger(0)

    /** Starts saying: [since] the ms since the process started, [say] the log. */
    fun start(since: () -> Long, say: (String) -> Unit) {
        this.since = since
        this.say = say
        enabled = true
    }

    /** Says [what] the first time it happens in this process. */
    fun mark(what: String) {
        if (!enabled || !said.add(what)) return
        say("$what +${since()}ms")
    }

    /** A request on its way ([path]); the returned call says when it answered (with [code]), or null once enough were said. */
    fun request(path: String): ((code: Int?) -> Unit)? {
        if (!enabled) return null
        val n = requests.incrementAndGet()
        if (n > REQUESTS) return null
        say("request#$n $path +${since()}ms")
        return { code -> say("response#$n ${code ?: "failed"} $path +${since()}ms") }
    }
}
