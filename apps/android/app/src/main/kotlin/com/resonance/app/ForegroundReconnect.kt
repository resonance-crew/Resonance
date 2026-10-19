package com.resonance.app

/**
 * When Firestore's connection starts afresh on a return to the foreground ([AppFirebase.reconnect]):
 * after a real stay away, while someone is signed in — once per return.
 *
 * Every live list (an open thread, the Messages list and its badge, the connections, the blocks, the
 * bell) rides Firestore's one watch stream, and Android's Firestore SDK does not always restart it
 * when the app comes back. Away, the app has no network (Android closes a background app's sockets
 * within seconds and blocks it until it is back on screen), so the SDK keeps retrying and waiting
 * longer between tries, up to a minute and a half. Its own "back in the foreground" restart then runs
 * only if the network already reads as usable at the activity's start; when Android lifts the block a
 * moment after that — an unblock the SDK doesn't listen for — the stream waits out the rest of that
 * wait, and the screen shows what it showed when the person left (a message the notification already
 * showed among it) until then. A reconnect stops the streams and starts them again, which also starts
 * the SDK's waiting over. iOS's Firestore restarts its streams on every return by itself, so the iOS
 * app has no twin of this.
 *
 * A quick look at another app and back keeps the connection it has; [AWAY_MILLIS] away, Android has
 * cut it anyway. Times are elapsed time with sleep counted (SystemClock.elapsedRealtime), so a night
 * with the screen off counts as the night it was.
 */
class ForegroundReconnect(
    private val reconnect: () -> Unit,
    private val awayMillis: Long = AWAY_MILLIS,
) {
    /** When the app left the screen; null while it is on screen (or has never left it: a cold start's connection is new). */
    private var leftAt: Long? = null

    /** The app left the screen (a rotation doesn't count: the activity stays). */
    fun left(at: Long) {
        leftAt = at
    }

    /** The app is back on screen: Firestore reconnects when it was away long enough. Returns whether it did. */
    fun cameBack(at: Long, signedIn: Boolean): Boolean {
        val away = leftAt?.let { at - it } ?: return false
        leftAt = null
        if (!signedIn || away < awayMillis) return false
        reconnect()
        return true
    }

    companion object {
        /** Past Android's cut of a background app's network (a few seconds) and its freezer (ten). */
        const val AWAY_MILLIS = 20_000L
    }
}
