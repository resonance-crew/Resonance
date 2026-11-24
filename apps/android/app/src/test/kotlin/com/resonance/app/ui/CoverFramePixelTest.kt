package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
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
import com.resonance.design.AppFonts
import com.resonance.design.CoverFraming
import com.resonance.design.CropState
import com.resonance.design.FrameCrop
import com.resonance.design.Grain
import com.resonance.design.OrganicImage
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
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Round 33 §Q4 (the owner: AI 封面预览与调整框基准框统一): a card's cover draws its picture past its box by the wobbly
 * clip's bleed, and the frame's crop was cut for that larger box — the visible box showed the 調整封面 window's middle
 * (≈ 1.1× tighter at zoom 1, ≈ 1.28× at 1.5, on the owner's Pixel). Now the crop is the box seen: for the generate
 * route's 1536 × 1024 and a portrait 1024 × 1536, at zoom 1 and 1.5 off the centre (and unframed), every sampled point
 * of the drawn cover is the picture's point the stage's [FrameCrop] shows there, within 2.5 px of the box.
 *
 * The picture is a gradient that names its own pixels (red = x, green = y), drawn by [OrganicImage] — the cover of the
 * feed card, the publish preview and the writer — without its grain, which would tint the colours read back.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, qualifiers = "w400dp-h800dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CoverFramePixelTest {
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

    /** Each pixel's red is its x (0…255 across), its green its y. */
    private fun gradient(w: Int, h: Int): Bitmap {
        val px = IntArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            val r = (255.0 * x / (w - 1)).roundToInt()
            val g = (255.0 * y / (h - 1)).roundToInt()
            px[y * w + x] = android.graphics.Color.rgb(r, g, 0)
        }
        return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
    }

    private val wide = "https://img.resonance.channel/image/2026-11/ai-cover.webp"
    private val tall = "https://img.resonance.channel/image/2026-11/portrait.jpg"
    private val sizes = mapOf(wide to (1536 to 1024), tall to (1024 to 1536))
    private val pictures = sizes.mapValues { (_, s) -> gradient(s.first, s.second) }

    @OptIn(DelicateCoilApi::class)
    @Before fun loader() {
        val app = RuntimeEnvironment.getApplication()
        AppFonts.init(app)
        Grain.init(app)
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

    private val boxW = 300f
    private val boxH = 186f // the feed card's 0.62

    private fun Color.isGrey() = abs(red - blue) < 0.02f && abs(red - green) < 0.02f && red > 0.4f

    @Test fun theCoverShowsWhatTheAdjustWindowShowsForAWideAndATallPictureAtZoomOneAndOneAndAHalf() {
        val url = mutableStateOf(wide)
        val framing: MutableState<CoverFraming?> = mutableStateOf(null)
        compose.setContent {
            OrganicImage(url.value, 5.0, Modifier.size(boxW.dp, boxH.dp).testTag("cover"), frame = framing.value) {
                Box(Modifier.fillMaxSize().background(Color(0xFF888888)))
            }
        }
        val report = StringBuilder()
        var worst = 0.0
        for ((picture, size) in sizes) {
            val (iw, ih) = size
            // The 調整封面 window's maths at this box's shape (its stage units: the box's own).
            val stage = FrameCrop(iw.toDouble(), ih.toDouble(), boxW.toDouble(), boxH.toDouble(), CoverFraming.MAX_ZOOM)
            val states = listOf(
                "unframed" to null,
                "zoom 1, off centre" to stage.pan(CropState(), 30.0, -40.0),
                "zoom 1.5, off centre" to stage.pan(stage.zoomTo(CropState(), 1.5), 50.0, -30.0),
            )
            for ((name, state) in states) {
                val shown = stage.cropFractions(state ?: CropState())
                val frame = state?.let { stage.framing(it) }?.takeUnless { it.isCentred }
                compose.runOnIdle {
                    url.value = picture
                    framing.value = frame
                }
                compose.waitUntil(5_000) { !colour(boxW / 2, boxH / 2).isGrey() }
                compose.waitForIdle()
                val image = compose.onNodeWithTag("cover").captureToImage().toPixelMap()
                val d = compose.density.density
                var err = 0.0
                var spanX = 0.0
                // Inside the wobble's reach (it dips up to ~ 20 in at the corners).
                val fx = listOf(0.15, 0.5, 0.85)
                val fy = listOf(0.2, 0.5, 0.8)
                for (u in fx) for (v in fy) {
                    val c = image[(u * boxW * d).toInt(), (v * boxH * d).toInt()]
                    // The picture's point drawn here, in fractions of the picture, and the window's.
                    val gotX = c.red.toDouble()
                    val gotY = c.green.toDouble()
                    val wantX = shown.x + u * shown.w
                    val wantY = shown.y + v * shown.h
                    // In the box's pixels.
                    val ex = abs(gotX - wantX) / shown.w * boxW
                    val ey = abs(gotY - wantY) / shown.h * boxH
                    err = max(err, max(ex, ey))
                }
                // How much of the picture the box spans across, as a share of the window's (1 = the same).
                val left = image[(0.15 * boxW * d).toInt(), (0.5 * boxH * d).toInt()].red.toDouble()
                val right = image[(0.85 * boxW * d).toInt(), (0.5 * boxH * d).toInt()].red.toDouble()
                spanX = (right - left) / 0.7 / shown.w
                report.append("${iw}x$ih $name: worst ${"%.2f".format(err)} px, span ${"%.3f".format(spanX)} of the window's\n")
                worst = max(worst, err)
                assertTrue("${iw}x$ih $name: the cover is off the window's crop by ${"%.2f".format(err)} px\n$report", err <= 2.5)
                assertTrue("${iw}x$ih $name: the cover spans ${"%.3f".format(spanX)} of the window's width\n$report", abs(spanX - 1) < 0.02)
            }
        }
        println("CoverFramePixelTest\n$report(worst ${"%.2f".format(worst)} px)")
    }

    // The lead (round 33 §Q4): where the exact crop reaches the picture's edge, the wobble's outward swing past the box
    // ends at the picture's edge, on the card's paper — never the placeholder (the card's stripes) under a loaded picture.
    @Test fun theBleedPastTheBoxIsPictureNeverThePlaceholder() {
        val blue = Color(0xFF0000FF)
        val framing: MutableState<CoverFraming?> = mutableStateOf(null)
        compose.setContent {
            Box(Modifier.testTag("stage").background(Color(0xFF888888)).padding(24.dp)) {
                OrganicImage(wide, 5.0, Modifier.size(boxW.dp, boxH.dp).testTag("cover"), frame = framing.value) {
                    Box(Modifier.fillMaxSize().background(blue))
                }
            }
        }
        val stage = FrameCrop(1536.0, 1024.0, boxW.toDouble(), boxH.toDouble(), CoverFraming.MAX_ZOOM)
        // Unframed, and framed at zoom 1 against the top: the crop spans the picture's whole width, so its sides end at
        // the box's — the bleed on both sides has only the underlay to show.
        for (frame in listOf(null, stage.framing(stage.pan(CropState(), 0.0, 40.0)))) {
            compose.runOnIdle { framing.value = frame }
            compose.waitUntil(5_000) { !colour(boxW / 2, boxH / 2).isGrey() }
            compose.waitForIdle()
            val image = compose.onNodeWithTag("stage").captureToImage().toPixelMap()
            var bare = 0
            for (y in 0 until image.height) for (x in 0 until image.width) {
                val c = image[x, y]
                if (c.blue > 0.5f && c.red < 0.3f && c.green < 0.3f) bare++
            }
            assertTrue("$frame: $bare placeholder pixels in the bleed", bare == 0)
        }
    }

    private fun colour(xDp: Float, yDp: Float): Color {
        val image = compose.onNodeWithTag("cover").captureToImage()
        val d = compose.density.density
        return image.toPixelMap()[(xDp * d).toInt(), (yDp * d).toInt()]
    }
}
