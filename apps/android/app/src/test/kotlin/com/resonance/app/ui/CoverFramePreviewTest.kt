package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.Uri
import coil3.annotation.DelicateCoilApi
import coil3.asImage
import coil3.decode.DataSource
import coil3.fetch.FetchResult
import coil3.fetch.Fetcher
import coil3.fetch.ImageFetchResult
import coil3.request.Options
import com.resonance.design.CoverFraming
import com.resonance.design.CoverFrame as Slot
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.design.StoryCardCover
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.junit.runners.model.Statement
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Round 32 §P5 (the owner: 「调整封面」在 AI 生成图片上调整后，预览没有更新): the preview's cover redraws on the new framing
 * at once, an illustration's (the generate route's 1536 × 1024, stored under `image/…`, its `-w960` copy beside it) as a
 * photo's — the same [StoryCardCover], keyed by its URL, whose scale and alignment ([com.resonance.design.CoverFit])
 * follow the frame on every draw. Android draws both alike: this pins it.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, qualifiers = "w400dp-h800dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CoverFramePreviewTest {
    private val compose = createComposeRule()

    @get:Rule val rules: RuleChain = RuleChain.outerRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                val app = RuntimeEnvironment.getApplication()
                shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
                base.evaluate()
            }
        }
    }.around(compose)

    /** A picture red on its left half and blue on its right. */
    private fun halves(w: Int, h: Int): Bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { b ->
        val c = Canvas(b)
        c.drawRect(0f, 0f, w / 2f, h.toFloat(), Paint().apply { color = android.graphics.Color.RED })
        c.drawRect(w / 2f, 0f, w.toFloat(), h.toFloat(), Paint().apply { color = android.graphics.Color.BLUE })
    }

    private val pictures = mapOf(
        // An illustration as the generate route stores it, and a photo as the upload route does.
        "https://img.resonance.channel/image/2026-11/ai-cover.webp" to halves(1536, 1024),
        "https://img.resonance.channel/image/2026-11/photo.jpg" to halves(1600, 1200),
    )

    @OptIn(DelicateCoilApi::class)
    @Before fun loader() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        val app = RuntimeEnvironment.getApplication()
        SingletonImageLoader.setUnsafe(
            ImageLoader.Builder(app).memoryCache(null).diskCache(null).components {
                add(Fetcher.Factory<Uri> { data, _: Options, _: ImageLoader ->
                    pictures[data.toString()]?.let { bitmap ->
                        Fetcher { ImageFetchResult(bitmap.asImage(), isSampled = false, dataSource = DataSource.MEMORY_CACHE) as FetchResult }
                    }
                })
            }.build(),
        )
    }

    @OptIn(DelicateCoilApi::class)
    @After fun reset() {
        SingletonImageLoader.reset()
    }

    private fun colourAt(xDp: Float, yDp: Float): Color {
        val image = compose.onNodeWithTag("cover").captureToImage()
        val d = compose.density.density
        return image.toPixelMap()[(xDp * d).toInt(), (yDp * d).toInt()]
    }

    private fun Color.isRed() = red > 0.7f && blue < 0.3f
    private fun Color.isBlue() = blue > 0.7f && red < 0.3f

    @Test fun adjustingAnIllustrationsFramingRedrawsThePreviewAtOnceAsAPhotos() {
        val framing: MutableState<CoverFraming?> = mutableStateOf(null)
        val url = mutableStateOf(pictures.keys.first())
        compose.setContent {
            Box(Modifier.size(300.dp, 186.dp).testTag("cover")) {
                StoryCardCover(url.value, Slot(5.0, Color.LightGray, Color.Gray, ""), framing = framing.value)
            }
        }
        for (picture in pictures.keys) {
            compose.runOnIdle {
                framing.value = null
                url.value = picture
            }
            // Centred: 80 % across the box is the picture's right half.
            compose.waitUntil(5_000) { colourAt(240f, 93f).isBlue() }
            // 完成 on a frame looking at the left side, zoomed in: the same box shows the red half — without a new URL.
            compose.runOnIdle { framing.value = CoverFraming(0.3, 0.5, 2.0, if (picture.contains("ai")) 1.5 else 4.0 / 3) }
            compose.waitForIdle()
            val now = colourAt(240f, 93f)
            assertTrue("$picture: the new framing drawn at once, not the old crop ($now)", now.isRed())
            // And back to the centre.
            compose.runOnIdle { framing.value = null }
            compose.waitForIdle()
            assertTrue("$picture: the centre again", colourAt(240f, 93f).isBlue())
        }
    }
}
