package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import com.resonance.design.Grain
import com.resonance.design.LinkPreviewSection
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
 * Round 33 post-merge review: a link's preview picture is not a cover — it keeps covering the box bled past the
 * bubble's sides (4 dp), so a square picture under the 1.91:1 frame leaves no strip of the tint under the bubble's
 * wobble. Only a shared card's cover is cut for the bubble's seen width (§Q4).
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, qualifiers = "w400dp-h800dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LinkPreviewBleedTest {
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

    private val url = "https://example.com/og/square.png"

    @OptIn(DelicateCoilApi::class)
    @Before fun loader() {
        val app = RuntimeEnvironment.getApplication()
        AppFonts.init(app)
        Grain.init(app)
        val square = Bitmap.createBitmap(600, 600, Bitmap.Config.ARGB_8888).apply { eraseColor(android.graphics.Color.RED) }
        SingletonImageLoader.setUnsafe(
            ImageLoader.Builder(app).memoryCache(null).diskCache(null).components {
                add(Fetcher.Factory<Uri> { data, _: Options, _: ImageLoader ->
                    if (data.toString() == url) Fetcher { ImageFetchResult(square.asImage(), isSampled = false, dataSource = DataSource.MEMORY_CACHE) as FetchResult } else null
                })
            }.build(),
        )
    }

    @OptIn(DelicateCoilApi::class)
    @After fun reset() {
        SingletonImageLoader.reset()
    }

    private fun Color.isRed() = red > 0.8f && green < 0.2f && blue < 0.2f

    @Test fun aSquarePreviewFillsTheBleedPastTheBubblesSides() {
        compose.setContent {
            Box(Modifier.testTag("stage").background(Color.White).padding(16.dp)) {
                Column(Modifier.width(240.dp)) {
                    LinkPreviewSection("A page", null, "example.com", url, afterWords = false, onClick = null, onLongPress = null)
                }
            }
        }
        compose.waitUntil(5_000) {
            compose.onNodeWithTag("stage").captureToImage().toPixelMap()[136, 40].isRed()
        }
        compose.waitForIdle()
        val image = compose.onNodeWithTag("stage").captureToImage().toPixelMap()
        // 2 dp into the bled side, left and right of the column (16 in, 240 wide): picture, not the 6 % tint.
        val y = 16 + 30
        val left = image[16 - 2, y]
        val right = image[16 + 240 + 1, y]
        assertTrue("left bleed is $left", left.isRed())
        assertTrue("right bleed is $right", right.isRed())
    }
}
