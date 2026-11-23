package com.resonance.design

import android.os.Build
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import coil3.compose.LocalPlatformContext
import coil3.decode.DataSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * How strongly a remote picture comes in (Wave 2 #7, every platform the same): blurred [blurDp] to
 * sharp over [durationMs], ease-out, its opacity 0 → 1 over the first 40 %. A picture the memory cache
 * already held shows at once — no flash, no blur.
 */
enum class ImageRevealKind(val blurDp: Float, val durationMs: Int) {
    /** A cover, a story's picture, a chat picture, a link's picture: 10 over 320 ms. */
    Cover(10f, 320),
    /** A small thumbnail (the bell's, the replying band's, the card picker's): 4 over 240 ms. */
    Thumb(4f, 240),
    /** A face: 3 over 200 ms. */
    Avatar(3f, 200),
    /** Opacity alone (the full-screen viewer, the thought map's thumbs, a picture already veiled). */
    Fade(0f, 240),
    /** Nothing at all (a picture of the device's own). */
    Off(0f, 0),
}

/** What one arrival plays: a blur of [blurDp] easing to 0 (0: a fade alone) over [durationMs]; [None] shows it at once. */
@Immutable
data class ImageReveal(val blurDp: Float, val durationMs: Int) {
    val plays: Boolean get() = durationMs > 0

    companion object {
        val None = ImageReveal(0f, 0)
    }
}

/** RenderEffect's first API (Android 12): earlier the reveal is a fade alone. */
const val REVEAL_BLUR_SDK = 31

/**
 * Whether — and how — a picture that just arrived from [source] comes in: never from the memory cache
 * (it was on screen a moment ago) nor under "Remove animations" ([reducedMotion]; the screenshots run
 * with the animator scales at 0, so they never catch one half sharp); under Battery Saver ([powerSave],
 * the owner's call) and before Android 12 ([sdk]) it only fades.
 */
fun imageReveal(kind: ImageRevealKind, source: DataSource, reducedMotion: Boolean, powerSave: Boolean, sdk: Int): ImageReveal {
    if (kind == ImageRevealKind.Off || source == DataSource.MEMORY_CACHE || reducedMotion) return ImageReveal.None
    val blur = if (powerSave || sdk < REVEAL_BLUR_SDK) 0f else kind.blurDp
    return ImageReveal(blur, kind.durationMs)
}

/** The opacity at [t] (0 → 1, linear time): over the first 40 % with a blur, over the whole with a fade alone. */
internal fun revealAlpha(reveal: ImageReveal, t: Float): Float =
    if (reveal.blurDp > 0f) (t / 0.4f).coerceIn(0f, 1f) else EaseOut.transform(t.coerceIn(0f, 1f))

/** The blur at [t], easing out to 0. */
internal fun revealBlur(reveal: ImageReveal, t: Float): Float = reveal.blurDp * (1f - EaseOut.transform(t.coerceIn(0f, 1f)))

/**
 * One picture's reveal: [play] when it arrives, [settle] when it fails. The time it holds is read only
 * while drawing ([imageReveal] modifier), so a frame of it recomposes nothing; [revealing] changes twice
 * a reveal (a caller keeping its skeleton under the picture until it is sharp).
 */
@Stable
class ImageRevealState internal constructor(private val scope: CoroutineScope) {
    internal var t by mutableFloatStateOf(1f)
    internal var reveal by mutableStateOf(ImageReveal.None)
    var revealing by mutableStateOf(false)
        private set
    private var job: Job? = null

    fun play(next: ImageReveal) {
        job?.cancel()
        reveal = next
        if (!next.plays) {
            t = 1f
            revealing = false
            return
        }
        t = 0f
        revealing = true
        job = scope.launch {
            try {
                animate(0f, 1f, animationSpec = tween(next.durationMs, easing = LinearEasing)) { v, _ -> t = v }
            } finally {
                t = 1f
                revealing = false
            }
        }
    }

    fun settle() = play(ImageReveal.None)
}

@Composable
fun rememberImageRevealState(): ImageRevealState {
    val scope = rememberCoroutineScope()
    return remember(scope) { ImageRevealState(scope) }
}

/** Draws [state]'s reveal: opacity and (Android 12+) a clamped blur, set only in the draw phase, none once sharp. */
fun Modifier.imageReveal(state: ImageRevealState): Modifier = graphicsLayer {
    val r = state.reveal
    val t = state.t
    alpha = if (t >= 1f) 1f else revealAlpha(r, t)
    val blur = if (t >= 1f) 0f else revealBlur(r, t)
    renderEffect = if (blur > 0.05f && Build.VERSION.SDK_INT >= REVEAL_BLUR_SDK) {
        val px = blur.dp.toPx()
        BlurEffect(px, px, TileMode.Clamp)
    } else {
        null
    }
}

private val Float.dp get() = androidx.compose.ui.unit.Dp(this)

/**
 * Coil's AsyncImage with the reveal: every remote picture on the screens comes through here (the
 * `imageReveal.android.test.ts` ratchet counts the ones that don't). [imageLoader] null: the app's own.
 */
@Composable
fun RevealImage(
    model: Any?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    kind: ImageRevealKind = ImageRevealKind.Cover,
    imageLoader: ImageLoader? = null,
    alignment: Alignment = Alignment.Center,
    contentScale: ContentScale = ContentScale.Fit,
    state: ImageRevealState = rememberImageRevealState(),
    onLoading: ((AsyncImagePainter.State.Loading) -> Unit)? = null,
    onSuccess: ((AsyncImagePainter.State.Success) -> Unit)? = null,
    onError: ((AsyncImagePainter.State.Error) -> Unit)? = null,
) {
    val budget = rememberMotionBudget()
    AsyncImage(
        model = model,
        contentDescription = contentDescription,
        imageLoader = imageLoader ?: SingletonImageLoader.get(LocalPlatformContext.current),
        modifier = modifier.imageReveal(state),
        onLoading = onLoading,
        onSuccess = { s ->
            state.play(imageReveal(kind, s.result.dataSource, budget.reducedMotion, budget.powerSave, Build.VERSION.SDK_INT))
            onSuccess?.invoke(s)
        },
        onError = { s ->
            state.settle()
            onError?.invoke(s)
        },
        alignment = alignment,
        contentScale = contentScale,
    )
}
