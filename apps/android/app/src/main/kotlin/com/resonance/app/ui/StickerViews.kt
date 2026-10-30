package com.resonance.app.ui

import android.graphics.drawable.Animatable2
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.RememberObserver
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import com.resonance.app.Stickers
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.chat.PlaybackLimiter
import com.resonance.kit.chat.StickerCatalog
import kotlin.math.roundToInt

/**
 * A sticker's key pose (round 22): the 256 px still, decoded once and kept ([Stickers.pose]) — what the
 * panel's grid, a quote and a sticker at rest show. Nothing while it is read (a cell keeps its place).
 */
@Composable
internal fun StickerPose(sticker: StickerCatalog.Sticker, origin: String, modifier: Modifier = Modifier) {
    val pose by produceState(Stickers.cachedPose(sticker), sticker) { if (value == null) value = Stickers.pose(sticker, origin) }
    Box(modifier) { pose?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) } }
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

    fun stop(key: String) = limiter.stop(key)
}

/**
 * A sticker as the thread draws it (round 22 §4.5): no bubble, [size] square, standing on the page —
 * playing its file's two plays when [autoplay] (its first sight this session), else resting on its key
 * pose; [replays] bumped (a tap) plays it again. At most three play at once ([StickerPlayback]); leaving
 * the screen lets its frames go. With the system's animations off, the key pose only.
 */
@Composable
internal fun PlayingSticker(
    sticker: StickerCatalog.Sticker,
    origin: String,
    key: String,
    size: Dp,
    autoplay: Boolean,
    replays: Int,
    modifier: Modifier = Modifier,
) {
    val still = LocalContext.current.prefersReducedMotion()
    var playing by remember(key) { mutableStateOf(autoplay && !still) }
    LaunchedEffect(replays) { if (replays > 0 && !still) playing = true }
    val stopped = StickerPlayback.stops[key] ?: 0
    LaunchedEffect(stopped) { if (stopped > 0) playing = false }
    Box(modifier.size(size)) {
        // The pose under it all the time: the first frame is the key pose, so nothing jumps when the file takes over or lets go.
        StickerPose(sticker, origin, Modifier.fillMaxSize())
        if (playing) {
            val drawable by produceState<Drawable?>(null, sticker, replays, playing) { value = Stickers.animated(sticker, origin) }
            val d = drawable
            if (d is AnimatedImageDrawable) {
                val painter = remember(d) { DrawablePainter(d) }
                DisposableEffect(d) {
                    StickerPlayback.start(key)
                    val done = object : Animatable2.AnimationCallback() {
                        override fun onAnimationEnd(drawable: Drawable?) {
                            playing = false
                        }
                    }
                    d.registerAnimationCallback(done)
                    // Two plays: the file says so itself (its loop count), and this holds whatever it says.
                    d.repeatCount = 1
                    d.start()
                    onDispose {
                        d.unregisterAnimationCallback(done)
                        d.stop()
                        StickerPlayback.stop(key)
                    }
                }
                Image(painter, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            } else if (d != null) {
                // A still file (the stand-ins before the art lands): nothing to play.
                LaunchedEffect(d) { playing = false }
            }
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
