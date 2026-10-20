package com.resonance.app.ui.share

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import com.resonance.design.ShareCardBackdrop
import com.resonance.design.ShareCardCanvas
import com.resonance.design.ShareCardModel
import com.resonance.design.ShareCardRecipe
import com.resonance.design.ShareCardSticker
import com.resonance.design.shareCanvasPixels
import com.resonance.design.shareStickerWidth
import kotlinx.coroutines.CompletableDeferred

/**
 * Draws a share card into pictures on the device (share.spec §4.7): the card is composed out of
 * sight — measured at its fixed pixel size inside a layout that takes no room, at a fixed density
 * (3 for the 1080 × 1920 composite and the Stories backdrop, 2 for the 624-wide sticker) and a
 * text scale of 1, so the picture is the same whatever the device's text size — and each drawing
 * is recorded into a GraphicsLayer it is never drawn from on screen, then read back as a bitmap.
 * [ShareCardRendererHost] is where the compositions live (on the card page); [render] asks it for
 * one card's pictures and waits for them.
 */
@Stable
class ShareCardRenderer {
    internal class Job(
        val model: ShareCardModel,
        val cover: ImageBitmap?,
        val stories: Boolean,
        val done: CompletableDeferred<SharePictures>,
    ) {
        /** Each recording asked for has drawn at least once. */
        val drawn = CompletableDeferred<Unit>()
        private val recordings = if (stories) 3 else 1
        private val seen = HashSet<Int>()

        /** Recording [which] has drawn (a recording draws again whenever it is invalidated: counted once). */
        fun recorded(which: Int) {
            if (seen.add(which) && seen.size == recordings) drawn.complete(Unit)
        }
    }

    internal var job by mutableStateOf<Job?>(null)
        private set

    /**
     * The card's pictures: the composite always, and with [stories] the sticker and the backdrop.
     * One render at a time (a second waits for the first's place). Throws when the device can't
     * draw them (the caller shares the link alone).
     */
    suspend fun render(model: ShareCardModel, cover: ImageBitmap?, stories: Boolean): SharePictures {
        val done = CompletableDeferred<SharePictures>()
        val mine = Job(model, cover, stories, done)
        job = mine
        try {
            return done.await()
        } finally {
            if (job === mine) job = null
        }
    }

    internal fun finished(job: Job, result: Result<SharePictures>) {
        result.fold(job.done::complete, job.done::completeExceptionally)
    }
}

/** A share's pictures, as bitmaps ready to write (software, so they can be encoded). */
class SharePictures(val composite: Bitmap, val sticker: Bitmap?, val backdrop: Bitmap?) {
    fun recycle() {
        composite.recycle()
        sticker?.recycle()
        backdrop?.recycle()
    }
}

/**
 * Where [renderer]'s compositions live: put it once on the page that shares (anywhere — it takes
 * no room and draws nothing on screen, and TalkBack never meets it).
 */
@Composable
fun ShareCardRendererHost(renderer: ShareCardRenderer) {
    val job = renderer.job ?: return
    val composite = rememberGraphicsLayer()
    val sticker = rememberGraphicsLayer()
    val backdrop = rememberGraphicsLayer()
    val (width, height) = shareCanvasPixels()
    Box(Modifier.clearAndSetSemantics { }) {
        Recording(composite, Constraints.fixed(width, height), ShareCardRecipe.Canvas.SCALE, { job.recorded(0) }) {
            ShareCardCanvas(job.model, job.cover)
        }
        if (job.stories) {
            Recording(sticker, Constraints.fixedWidth(shareStickerWidth()), ShareCardRecipe.Sticker.SCALE, { job.recorded(1) }) {
                ShareCardSticker(job.model, job.cover)
            }
            Recording(backdrop, Constraints.fixed(width, height), ShareCardRecipe.Canvas.SCALE, { job.recorded(2) }) {
                ShareCardBackdrop(job.model)
            }
        }
    }
    LaunchedEffect(job) {
        val result = runCatching {
            job.drawn.await()
            SharePictures(
                composite.toImageBitmap().software(),
                if (job.stories) sticker.toImageBitmap().software() else null,
                if (job.stories) backdrop.toImageBitmap().software() else null,
            )
        }
        renderer.finished(job, result)
    }
}

/**
 * [content] at [density] (text scale 1), measured with [constraints] in pixels inside a layout
 * that takes no room, and recorded into [layer] — never drawn from it (no `drawLayer`),
 * so nothing shows. [onRecorded] after each recording.
 */
@Composable
private fun Recording(layer: GraphicsLayer, constraints: Constraints, density: Float, onRecorded: () -> Unit, content: @Composable () -> Unit) {
    Box(
        Modifier
            .layout { measurable, _ ->
                val placeable = measurable.measure(constraints)
                layout(0, 0) { placeable.place(0, 0) }
            }
            .drawWithContent {
                layer.record { this@drawWithContent.drawContent() }
                onRecorded()
            },
    ) {
        CompositionLocalProvider(LocalDensity provides Density(density, 1f)) { content() }
    }
}

/** A recorded layer reads back as a hardware bitmap; encoding needs a software copy. */
private fun ImageBitmap.software(): Bitmap {
    val bitmap = asAndroidBitmap()
    if (bitmap.config != Bitmap.Config.HARDWARE) return bitmap
    return bitmap.copy(Bitmap.Config.ARGB_8888, false).also { bitmap.recycle() }
}
