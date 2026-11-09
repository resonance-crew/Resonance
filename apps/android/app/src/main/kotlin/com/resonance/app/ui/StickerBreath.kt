package com.resonance.app.ui

import android.content.Context
import android.graphics.drawable.Animatable2
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.Drawable
import android.os.PowerManager
import android.os.SystemClock
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import com.resonance.app.Stickers
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.chat.ChatSticker
import com.resonance.kit.chat.StickerCatalog
import kotlin.math.min
import kotlin.random.Random

/**
 * The sticker panel's cells "breathing" (round 23 §3, the owner's: 「預覽的時候就讓它會動(只有在視線範圍內的這些會動…不會對系統產生
 * 負擔)」): a cell at least 60 % in view plays its file once — the two plays baked into it, about 4.8 s — then rests on
 * its thumb (the hero pose the file starts and ends on, so the swap never shows) for 1.5–3 s, and plays again. At
 * most [max] play at once (the picker's own limit, never the thread's [StickerPlayback]: picking never stops a sticker
 * in the thread, nor the thread one here); cells waiting take a free turn first come, first served — the one waiting
 * longest, since it came into view or since its rest ended, reading order only between cells that began waiting
 * together (a play outlasts the longest rest, so turns in reading order alone would keep going to the first 2 × [max]
 * cells and the rest of a grown panel would never play) — one every [STAGGER_MILLIS] (so a screenful starts as a
 * ripple, not all in one frame), and none starts while the grid is being scrolled.
 *
 * Plain state and a clock, so its rule is tested without a screen: [step] is called every [STAGGER_MILLIS] with the
 * cells in view, [ended] when a cell's play runs out.
 */
@Stable
internal class PickerBreath(
    private val max: Int,
    private val now: () -> Long = SystemClock::uptimeMillis,
    private val rest: () -> Long = { Random.nextLong(REST_MIN_MILLIS, REST_MAX_MILLIS + 1) },
) {
    /** The cells playing now, by key (read by each cell while it composes). */
    val playing = mutableStateListOf<String>()
    private val restUntil = HashMap<String, Long>()
    /** When each cell in view and not playing began waiting for a turn: as it came into view, or as its rest ends. */
    private val waitingSince = HashMap<String, Long>()
    private var lastStart = Long.MIN_VALUE / 2

    /**
     * A step: [inView] (the cells ≥ 60 % in view, in reading order) and whether the grid is [scrolling]. A cell gone
     * from view stops at once and waits no more; one in view and not playing waits from now — or from the end of its
     * rest. Then, with a turn free, not scrolling, and [STAGGER_MILLIS] since the last start, the cell waiting longest
     * starts (the first in reading order among those that began waiting at the same moment).
     */
    fun step(inView: List<String>, scrolling: Boolean) {
        val shown = inView.toHashSet()
        if (playing.any { it !in shown }) playing.removeAll { it !in shown }
        val t = now()
        waitingSince.keys.retainAll(shown)
        val busy = playing.toHashSet()
        for (key in inView) if (key !in busy && key !in waitingSince) waitingSince[key] = maxOf(t, restUntil[key] ?: Long.MIN_VALUE)
        if (scrolling || playing.size >= max) return
        if (t - lastStart < STAGGER_MILLIS) return
        val next = inView.filter { (waitingSince[it] ?: Long.MAX_VALUE) <= t }.minByOrNull { waitingSince.getValue(it) } ?: return
        waitingSince.remove(next)
        playing += next
        lastStart = t
    }

    /** [key]'s play ran out: its turn is free, and it rests on its thumb a while before it plays again. */
    fun ended(key: String) {
        if (playing.remove(key)) restUntil[key] = now() + rest()
    }

    /** Whether [key] plays now. */
    fun plays(key: String): Boolean = key in playing

    companion object {
        /** One start every this long (the ripple across a screenful). */
        const val STAGGER_MILLIS = 80L
        const val REST_MIN_MILLIS = 1_500L
        const val REST_MAX_MILLIS = 3_000L
    }
}

/** The picker's limit (round 23 §3): eight playing at once on a phone, twelve on a tablet's wider panel. */
internal const val PICKER_PLAYING_PHONE = 8
internal const val PICKER_PLAYING_WIDE = 12

/** Whether a cell [shown] px of [size] px tall is in view enough to play (≥ 60 %). */
internal fun inViewEnough(size: Int, shown: Int): Boolean = size > 0 && shown * 5L >= size * 3L

/** The picker's cells hold still: the system's animations off, or the battery saver on (round 23 §3). */
internal fun Context.pickerHoldsStill(): Boolean =
    prefersReducedMotion() || (getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isPowerSaveMode == true

/**
 * A picker cell's sticker (round 23 §3): its hero pose at rest, its file playing while [playing] — decoded once, the
 * first time it plays, at the cell's own size ([Stickers.animated]'s `targetPx`), and kept while the cell stays; each
 * play starts the same drawable over from its first frame. [onEnded] when a play runs out. Built on the thread's
 * player (2.4.1, [PlayingSticker]): the drawable's end callback is registered once and never unregistered, and
 * [StickerRun] decides which ends count — an `AnimatedImageDrawable` whose last callback is unregistered crashes on
 * the end it has already posted.
 */
@Composable
internal fun BreathingSticker(
    sticker: StickerCatalog.Sticker,
    origin: String,
    playing: Boolean,
    onEnded: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var side by remember { mutableIntStateOf(0) }
    var drawable by remember(sticker) { mutableStateOf<Drawable?>(null) }
    val ended by rememberUpdatedState(onEnded)
    LaunchedEffect(sticker, playing, side) {
        if (!playing || drawable != null || side <= 0) return@LaunchedEffect
        val decoded = Stickers.animated(sticker, origin, targetPx = side)
        // Not readable now (a file this build doesn't carry, offline): the turn goes back, the pose stays.
        if (decoded == null) ended() else drawable = decoded
    }
    val d = drawable
    Box(modifier.onSizeChanged { side = min(it.width, it.height) }) {
        // The pose at rest and until the file's first frame is ready — never under the playing frames.
        if (!playing || d !is AnimatedImageDrawable) StickerPose(sticker, origin, Modifier.fillMaxSize())
        if (d is AnimatedImageDrawable) {
            val run = remember(d) { StickerRun() }
            DisposableEffect(d) {
                d.registerAnimationCallback(
                    object : Animatable2.AnimationCallback() {
                        override fun onAnimationEnd(drawable: Drawable?) {
                            if (run.ends(d.isRunning)) {
                                run.stopped()
                                ended()
                            }
                        }
                    },
                )
                onDispose {
                    run.release()
                    d.stop()
                    d.callback = null
                }
            }
            if (playing) {
                val painter = remember(d) { DrawablePainter(d) }
                DisposableEffect(d) {
                    // Its two plays, whatever the file says.
                    d.repeatCount = 1
                    run.started()
                    d.start()
                    onDispose {
                        run.stopped()
                        d.stop()
                    }
                }
                Image(painter, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            }
        } else if (playing && d != null) {
            // A still file (the stand-ins before the art lands): nothing to play; its turn goes back.
            LaunchedEffect(d) { ended() }
        }
    }
}

/**
 * A guard on one-tap sending (round 23 §3): a second tap on the same sticker within [windowMillis] of the first is the
 * old habit (「再點一次傳送」), not a second sticker — two different stickers may go back to back.
 */
internal class StickerTapGuard(private val windowMillis: Long = 600, private val now: () -> Long = SystemClock::uptimeMillis) {
    private var last: ChatSticker? = null
    private var lastAt = Long.MIN_VALUE / 2

    /** Whether a tap on [ref] sends. */
    fun take(ref: ChatSticker): Boolean {
        val t = now()
        if (ref == last && t - lastAt < windowMillis) return false
        last = ref
        lastAt = t
        return true
    }
}

/**
 * A value held as it was when something opened, until it closes (round 23 §3: the 🕘 recents while the sticker panel
 * shows — a sticker sent is kept at once, and shown in its place from the next opening).
 */
internal class FrozenWhileOpen<T> {
    private var held: T? = null
    private var open = false

    /** What to show: [live] while closed, and as it was when it opened while [isOpen]. */
    @Suppress("UNCHECKED_CAST")
    fun shown(isOpen: Boolean, live: T): T {
        if (isOpen && !open) held = live
        open = isOpen
        return if (isOpen) held as T else live
    }
}
