package com.resonance.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.resonance.app.DraftService
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull

/** How long one read of the reader's reply card may take before it counts as failed (round 35 (4): 6 s). */
internal const val REPLY_LOOKUP_PATIENCE_MS = 6_000L

/** The pauses before each retry of a background read that failed or hung (iOS's 1 s and 3 s). */
internal val REPLY_LOOKUP_RETRIES_MS = listOf(1_000L, 3_000L)

/**
 * Whether the reader has a card answering this one — a draft or published — as 用卡片回應 needs to know before it opens
 * the picker (a second reply card is never begun without knowing). iOS's ResonanceLookup is the twin.
 *
 * Round 35 (4) (the owner: 这个用卡片回应的这个按钮，有时候进到页面都会一直在 loading): on an emulator Firestore's channel can
 * stall without failing, and the read had no timeout, so the segment spun for good. Now the segment is live from the
 * first frame and never spins on its own: [look] reads in the background — each read [patienceMs] at most, tried again
 * after each of [retriesMs] — and when it answers the segment becomes 已回應 / 修改. A press before an answer [ask]s right
 * then (the segment inks only while [asking], [patienceMs] at most), and what it hears opens the picker, the card or the
 * writer; a failed ask raises [tapFailed] (the quiet load-error line under the capsule) and leaves the segment pressable.
 *
 * [find] answers the reader's reply card, or null for none; it throws when it can't be read.
 */
internal class ReplyLookup(
    private val find: suspend () -> DraftService.Resonance?,
    private val patienceMs: Long = REPLY_LOOKUP_PATIENCE_MS,
    private val retriesMs: List<Long> = REPLY_LOOKUP_RETRIES_MS,
) {
    sealed interface State {
        /** Not answered yet: the segment is live all the same (a press asks). */
        data object Looking : State

        /** Answered: the reader's reply card, or none ([mine] null). */
        data class Found(val mine: DraftService.Resonance?) : State

        /** Couldn't be read after the retries: a press asks again. */
        data object Failed : State
    }

    var state: State by mutableStateOf(State.Looking)
        private set

    /** A press's own read is on its way: the segment inks while it is. */
    var asking: Boolean by mutableStateOf(false)
        private set

    /** A press's read failed too: a quiet line says so, the segment stays to be pressed again. */
    var tapFailed: Boolean by mutableStateOf(false)
        private set

    /** What [ReplyAction] reads: null until answered, then the reader's card or none. */
    val mine: ReplyAction.Mine?
        get() = when (val s = state) {
            is State.Found -> s.mine?.let { ReplyAction.Mine.Found(it.published) } ?: ReplyAction.Mine.None
            else -> null
        }

    /**
     * Reads (again: after a change of the account's cards), keeping an answer already had on screen meanwhile, and tries
     * a failure again after each of [retriesMs] before it is [State.Failed].
     */
    suspend fun look() {
        if (state == State.Failed) state = State.Looking
        for (pause in listOf(0L) + retriesMs) {
            if (pause > 0) delay(pause)
            val found = answer() ?: continue
            state = found
            tapFailed = false
            return
        }
        state = State.Failed
    }

    /**
     * The segment pressed before an answer: read once more, at once, [patienceMs] at most. The answer — or null when it
     * couldn't be had (then [tapFailed]), or a read of this kind is already on its way.
     */
    suspend fun ask(): State.Found? {
        if (asking) return null
        asking = true
        try {
            val found = answer()
            if (found == null) {
                tapFailed = true
                return null
            }
            state = found
            tapFailed = false
            return found
        } finally {
            asking = false
        }
    }

    /** [find]'s answer, or null when it failed or hung past [patienceMs] (Firestore's `await` is cancellable). */
    private suspend fun answer(): State.Found? = try {
        withTimeoutOrNull(patienceMs) { State.Found(find()) }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }
}
