package com.resonance.design

import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos

/**
 * Whether this phone softens what lies under an overlay ([softenedUnder]: a held message's, a modal's) within its
 * frames (round 17 addendum A4). The blur is drawn again every frame the overlay moves over it: a phone with a GPU does
 * that in a millisecond or two (about 4 % of what it draws while a message is held), but one drawing in software — an
 * emulator whose GPU is off, as the project's AVDs are — spent a third to a half of each 150–400 ms frame on it. The
 * first overlays that blur time their opening frames ([timeOpening]); when the middle one of them takes longer than
 * [SLOW_FRAME_MILLIS], softening stops at once and for as long as the app runs — the scrim alone sets what lies under
 * back, as below Android 12. Read [affordable] where the blur is drawn: it is state, so turning it off redraws.
 */
object BackdropBlurBudget {
    var affordable by mutableStateOf(true)
        private set

    /** Longer than this, the middle frame of an opening overlay says the blur is out of this phone's reach: four of a 60 Hz screen. */
    const val SLOW_FRAME_MILLIS = 64f

    /** How strongly to soften: [amount] while the blur is [affordable], else nothing. */
    fun softening(amount: Float): Float = if (affordable) amount else 0f

    /** Notes the intervals (ms) between the opening frames of an overlay that blurred what lies under it. */
    fun note(intervals: List<Float>) {
        if (intervals.isEmpty()) return
        val middle = intervals.sorted()[intervals.size / 2]
        if (middle > SLOW_FRAME_MILLIS) affordable = false
    }

    /**
     * Times an overlay's opening while it softens what lies under it — [frames] intervals after its first frame (which
     * composes the overlay, whatever the blur costs) — and [note]s them. Nothing to time once the blur is off, or below
     * Android 12 (no blur there).
     */
    suspend fun timeOpening(frames: Int = 6) {
        if (!affordable || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        var last = withFrameNanos { it }
        val intervals = ArrayList<Float>(frames)
        repeat(frames) {
            val now = withFrameNanos { it }
            intervals += (now - last) / 1_000_000f
            last = now
        }
        note(intervals)
    }

    /** For tests: a phone that blurs. */
    internal fun reset() {
        affordable = true
    }
}
