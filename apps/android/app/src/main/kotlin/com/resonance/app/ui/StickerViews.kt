package com.resonance.app.ui

import android.graphics.drawable.Animatable2
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.RememberObserver
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import com.resonance.app.Stickers
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.chat.PlaybackLimiter
import com.resonance.kit.chat.StickerBox
import com.resonance.kit.chat.StickerCatalog
import kotlinx.coroutines.flow.first
import kotlin.math.roundToInt

/**
 * A sticker's hero pose (round 22): the 256 px still, decoded once and kept ([Stickers.pose]) — what the
 * panel's grid and a sticker at rest show. Nothing while it is read (a cell keeps its place).
 */
@Composable
internal fun StickerPose(sticker: StickerCatalog.Sticker, origin: String, modifier: Modifier = Modifier) {
    val pose by rememberStickerPose(sticker, origin)
    Box(modifier) { pose?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) } }
}

/**
 * A sticker's pose standing for its message, small (round 24 §C): the composer's reply row, the quote over a reply —
 * its square drawn so that its pose ([StickerCatalog.Sticker.poseBox]) stands in the middle, as large as fits with
 * 4 % to spare and never smaller than the square ([com.resonance.kit.chat.StickerBox.quoteScale]): 點點, whose
 * drawing fills only the square's lower part, no longer stands below the half. Cut at its box.
 */
@Composable
internal fun QuotedStickerPose(sticker: StickerCatalog.Sticker, origin: String, modifier: Modifier = Modifier) {
    val pose by rememberStickerPose(sticker, origin)
    val fit = sticker.poseBox
    Box(modifier.clipToBounds()) {
        pose?.let {
            Image(
                it, null,
                Modifier.fillMaxSize().graphicsLayer {
                    transformOrigin = TransformOrigin(0f, 0f)
                    scaleX = fit.quoteScale
                    scaleY = fit.quoteScale
                    translationX = fit.quoteX * size.width
                    translationY = fit.quoteY * size.height
                },
                contentScale = ContentScale.Fit,
            )
        }
    }
}

/**
 * [sticker]'s key pose: the one kept in memory at once, else read ([Stickers.pose]) — and only ever [sticker]'s. Held
 * per sticker (round 24 §A): a view that goes on to show another sticker — the composer's reply row when 回覆 is chosen
 * on a second sticker — starts empty and reads that one's, where `produceState`'s value, kept across its keys and only
 * read while empty, went on showing the first sticker's pose.
 */
@Composable
internal fun rememberStickerPose(sticker: StickerCatalog.Sticker, origin: String): State<ImageBitmap?> {
    val pose = remember(sticker) { mutableStateOf(Stickers.cachedPose(sticker)) }
    LaunchedEffect(sticker) { if (pose.value == null) pose.value = Stickers.pose(sticker, origin) }
    return pose
}

/** A pack's tab icon (the character's head). */
@Composable
internal fun PackIcon(pack: StickerCatalog.Pack, origin: String, modifier: Modifier = Modifier) {
    val icon by produceState<ImageBitmap?>(null, pack.id, pack.iconV) { value = Stickers.icon(pack, origin) }
    Box(modifier) { icon?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) } }
}

/**
 * Who is playing in the thread (round 22 §4.5): each sticker message plays its two plays the first time
 * it comes on screen in this session ([firstSight]), at most three at once ([PlaybackLimiter]: a fourth
 * stops the one playing longest); a tap replays one. The app's, so a thread opened again this session
 * shows its stickers at rest.
 */
internal object StickerPlayback {
    private val limiter = PlaybackLimiter(3)
    private val seen = HashSet<String>()
    /** Bumped for a key told to stop (another took its place): its view goes back to the key pose. */
    val stops = mutableStateMapOf<String, Int>()

    /** Whether [key] plays now: the first time it is seen this session. */
    @Synchronized
    fun firstSight(key: String): Boolean = seen.add(key)

    /** [key] starts playing; whoever must stop for it is told ([stops]). */
    fun start(key: String) {
        limiter.start(key).forEach { stops[it] = (stops[it] ?: 0) + 1 }
    }

    /**
     * [key] stopped playing (its plays ended, it was told to stop, or it left the screen): its turn is free,
     * and a stop it was told is forgotten — a sticker drawn again later doesn't take an old one as news.
     */
    fun stop(key: String) {
        limiter.stop(key)
        stops.remove(key)
    }
}

/**
 * One decoded sticker's plays, as the end callback of its `AnimatedImageDrawable` sees them (2.4.1).
 *
 * Why it exists: Android's `AnimatedImageDrawable` posts its start (first draw after `start()`) and end
 * (`stop()`) callbacks to the main looper, and the posted lambda walks its callback list without asking
 * whether it is still there; unregistering the last callback sets that list to null. A sticker let go
 * between its first draw and that posted lambda — a tap replaying it, a quick second tap in the panel, the
 * three-at-once limit — took the app down with a NullPointerException in
 * `AnimatedImageDrawable.lambda$postOnAnimationStart`. So a drawable's callback is registered once and never
 * unregistered, and it decides here whether an end it hears ends anything:
 * - only while the sticker is still on screen ([release]d: never again);
 * - only while a play we started is under way (a play we stopped ourselves ended already: [stopped]);
 * - only once the drawable has really stopped: a replay is `stop(); start()`, and the end the `stop()` posts
 *   arrives after the `start()`, while the drawable runs again.
 */
internal class StickerRun {
    private var live = true
    private var started = false

    /** A play starts (`start()` is called right after). */
    fun started() {
        started = true
    }

    /** We stopped the play ourselves (its ending has been handled). */
    fun stopped() {
        started = false
    }

    /** The sticker left the screen: nothing it hears matters any more. */
    fun release() {
        live = false
        started = false
    }

    /** Whether an end the drawable reports, while it is [running] or not, is the end of our play. */
    fun ends(running: Boolean): Boolean = live && started && !running
}

/**
 * A sticker in the thread takes room for its drawing, not its square (round 24 §B, the owner: no empty paper above
 * 點點): [size] wide (placed as the square is) and as tall as its [StickerBox.trimHeight] of [size] — the drawing of
 * every frame ([box]) and 2 % above and below — with its [size] square laid [StickerBox.trimTop] of it up. What reaches
 * past that room is clear in every frame, so nothing drawn is cut; taps, the hold, the reactions' chip at its foot and
 * the face beside it go by the room.
 */
internal fun Modifier.stickerRoom(size: Dp, box: StickerBox): Modifier = layout { measurable, constraints ->
    val side = size.roundToPx()
    val square = measurable.measure(Constraints.fixed(side, side))
    val (top, height) = stickerRoomPx(side, box)
    layout(side.coerceIn(constraints.minWidth, constraints.maxWidth), height.coerceIn(constraints.minHeight, constraints.maxHeight)) { square.place(0, -top) }
}

/**
 * How far up [side]'s square is laid in a sticker's room, and the room's height, in whole pixels ([stickerRoom]): the
 * height its own [StickerBox.trimHeight] of the side, never the square's foot less the top (the web's and iOS's room —
 * it may end a pixel past the foot, where the square is clear), at least one pixel, never more than the square.
 */
internal fun stickerRoomPx(side: Int, box: StickerBox): Pair<Int, Int> {
    val top = (side * box.trimTop).roundToInt()
    val height = (side * box.trimHeight).roundToInt().coerceIn(1, side.coerceAtLeast(1))
    return top to height
}

/**
 * A sticker as the thread draws it (round 22 §4.5): no bubble, [size] square, standing on the page —
 * playing its file's two plays when [autoplay] says so as it is first placed on screen (its first sight this
 * session; a row the list composes ahead of the screen isn't placed, and neither plays nor takes a turn),
 * else resting on its hero pose (the thumb); [replays] bumped (a tap) plays it again from its first frame.
 * At most three play at once ([StickerPlayback]). The file is decoded once, the first time it plays, and
 * kept while the sticker is on screen: a replay starts the same drawable over. With the system's animations
 * off, the hero pose only. It takes room for its drawing alone ([stickerRoom]).
 */
@Composable
internal fun PlayingSticker(
    sticker: StickerCatalog.Sticker,
    origin: String,
    key: String,
    size: Dp,
    autoplay: () -> Boolean,
    replays: Int,
    modifier: Modifier = Modifier,
) {
    val still = LocalContext.current.prefersReducedMotion()
    var playing by remember(key) { mutableStateOf(false) }
    var placed by remember(key) { mutableStateOf(false) }
    // Keyed on the sticker: a sticker never shows another's frames (produceState's value would outlive its key).
    var drawable by remember(key, sticker) { mutableStateOf<Drawable?>(null) }
    LaunchedEffect(key, sticker) {
        while (true) {
            snapshotFlow { playing }.first { it }
            val decoded = Stickers.animated(sticker, origin)
            if (decoded != null) {
                drawable = decoded
                break
            }
            // Not readable now (a file this build doesn't carry, offline): at rest, and a tap asks again.
            playing = false
        }
    }
    val d = drawable
    val stopped = StickerPlayback.stops[key] ?: 0
    LaunchedEffect(stopped) { if (stopped > 0) playing = false }
    // A tap: from the first frame again — the same drawable, stopped and started; at rest, it simply plays.
    LaunchedEffect(replays) {
        if (replays == 0 || still) return@LaunchedEffect
        if (playing && d is AnimatedImageDrawable) {
            d.stop()
            d.start()
            StickerPlayback.start(key)
        } else playing = true
    }
    Box(
        modifier.stickerRoom(size, sticker.box).onPlaced {
            if (!placed) {
                placed = true
                if (!still && autoplay()) playing = true
            }
        },
    ) {
        // The thumb is the sticker's hero pose, not the file's first frame: it shows at rest and until the file's first
        // frame is ready, never under the playing frames (their clear parts would show it through, a ghost).
        if (!playing || d !is AnimatedImageDrawable) StickerPose(sticker, origin, Modifier.fillMaxSize())
        if (d is AnimatedImageDrawable) {
            val run = remember(d) { StickerRun() }
            // Registered once for this drawable and never unregistered (see [StickerRun]); declared before the play below,
            // so it is there before the first start() and let go after the last stop().
            DisposableEffect(d) {
                d.registerAnimationCallback(
                    object : Animatable2.AnimationCallback() {
                        override fun onAnimationEnd(drawable: Drawable?) {
                            if (run.ends(d.isRunning)) {
                                run.stopped()
                                playing = false
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
                    StickerPlayback.start(key)
                    // Two plays: the file says so itself (its loop count), and this holds whatever it says.
                    d.repeatCount = 1
                    run.started()
                    // A drawable stopped (or played out) starts over from its first frame.
                    d.start()
                    onDispose {
                        run.stopped()
                        d.stop()
                        StickerPlayback.stop(key)
                    }
                }
                Image(painter, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            }
        } else if (playing && d != null) {
            // A still file (the stand-ins before the art lands): nothing to play.
            LaunchedEffect(d) { playing = false }
        }
    }
}

/**
 * A [Drawable] as a Compose painter that follows its frames (an `AnimatedImageDrawable` asks to be drawn
 * again on each one through its callback): the frames are drawn into the canvas, nothing is copied.
 */
internal class DrawablePainter(private val drawable: Drawable) : Painter(), RememberObserver {
    private var frame by mutableIntStateOf(0)
    private val main = Handler(Looper.getMainLooper())
    private val callback = object : Drawable.Callback {
        override fun invalidateDrawable(who: Drawable) {
            frame++
        }

        override fun scheduleDrawable(who: Drawable, what: Runnable, `when`: Long) {
            main.postAtTime(what, `when`)
        }

        override fun unscheduleDrawable(who: Drawable, what: Runnable) {
            main.removeCallbacks(what)
        }
    }

    init {
        drawable.callback = callback
    }

    override val intrinsicSize: Size
        get() = if (drawable.intrinsicWidth > 0 && drawable.intrinsicHeight > 0) Size(drawable.intrinsicWidth.toFloat(), drawable.intrinsicHeight.toFloat()) else Size.Unspecified

    override fun DrawScope.onDraw() {
        frame // read: a new frame draws again
        drawIntoCanvas { canvas ->
            drawable.setBounds(0, 0, size.width.roundToInt(), size.height.roundToInt())
            canvas.save()
            drawable.draw(canvas.nativeCanvas)
            canvas.restore()
        }
    }

    override fun onRemembered() {}

    override fun onForgotten() {
        drawable.callback = null
        (drawable as? AnimatedImageDrawable)?.stop()
    }

    override fun onAbandoned() = onForgotten()
}
