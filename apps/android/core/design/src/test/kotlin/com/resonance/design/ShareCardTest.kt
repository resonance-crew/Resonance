package com.resonance.design

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.StoryScript
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * The share picture (share.spec §4.5): 1080 × 1920 at 3×, the sticker 624 wide at 2×, its type the
 * recipe's whatever the device's text size, the card within the Stories-safe height at its worst,
 * and an anonymous card's byline holding 匿名 alone — no pen name, initials or photo is anywhere in
 * what it draws.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ShareCardTest {
    @get:Rule val compose = createComposeRule()

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    private val words = "每年五月，外婆都會把青梅一顆顆擦乾，排在竹篩上曬。她說梅子要曬過太陽才會甜，人也是。那年我十二歲，第一次幫她把梅子放進玻璃罐，鹽一層、糖一層……".repeat(4)

    private fun model(byline: ShareByline, title: String = "外婆的醃梅子", text: String = words) =
        ShareCardModel("Xy7kQ", title, text, StoryScript.Cjk, accentHue = 55.0, date = "2026年10月10日", byline = byline)

    private val named = ShareByline.Named("念誠", "念", avatarSeed = 42.0, verified = true)

    /** [content] at [density], at its own size (the test's window is narrower than the picture). */
    private fun at(density: Float, fontScale: Float = 1f, content: @Composable () -> Unit) {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density, fontScale)) {
                Box(Modifier.wrapContentSize(Alignment.TopStart, unbounded = true)) { content() }
            }
        }
    }

    /** Every text the composed picture holds. */
    private fun texts(): List<String> = compose.onRoot(useUnmergedTree = true).fetchSemanticsNode().let { root ->
        fun walk(n: androidx.compose.ui.semantics.SemanticsNode): List<String> =
            n.config.getOrNull(SemanticsProperties.Text).orEmpty().map { it.text } + n.children.flatMap(::walk)
        walk(root)
    }

    @Test fun theCompositeIs1080By1920AtThreeTimes() {
        at(3f) { ShareCardCanvas(model(named), cover = null, Modifier.testTag("canvas")) }
        val size = compose.onNodeWithTag("canvas").fetchSemanticsNode().size
        assertEquals(1080, size.width)
        assertEquals(1920, size.height)
        assertEquals(1080 to 1920, shareCanvasPixels())
    }

    @Test fun theStickerIs624WideAtTwice() {
        at(2f) { ShareCardSticker(model(named), cover = null, Modifier.testTag("sticker")) }
        assertEquals(624, compose.onNodeWithTag("sticker").fetchSemanticsNode().size.width)
        assertEquals(624, shareStickerWidth())
    }

    @Test fun theDevicesTextSizeChangesNothing() {
        var scale by mutableFloatStateOf(1f)
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(3f, scale)) { ShareCard(model(named), cover = null, Modifier.testTag("card")) }
        }
        val normal = compose.onNodeWithTag("card").fetchSemanticsNode().size.height
        scale = 2f
        compose.waitForIdle()
        assertEquals(normal, compose.onNodeWithTag("card").fetchSemanticsNode().size.height)
    }

    @Test fun atItsLongestTheCardStaysInsideTheSafeHeight() {
        val long = "一個很長很長的標題，長到需要三行才放得下，甚至還要更長一點點才行"
        var cover by mutableStateOf<ImageBitmap?>(ImageBitmap(768, 384))
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(1f, 1f)) { ShareCard(model(named, title = long), cover, Modifier.testTag("card")) }
        }
        for (withCover in listOf(true, false)) {
            if (!withCover) cover = null
            compose.waitForIdle()
            val h = compose.onNodeWithTag("card").fetchSemanticsNode().size.height
            assertTrue("$withCover: $h", h <= ShareCardRecipe.Card.MAX_HEIGHT + 0.5f)
            assertTrue(h <= ShareCardRecipe.SafeZone.BOTTOM - ShareCardRecipe.SafeZone.TOP)
        }
    }

    @Test fun anAnonymousCardSaysAnonymousAndNamesNoOne() {
        at(1f) { ShareCardCanvas(model(ShareByline.Anonymous), cover = null) }
        val drawn = texts()
        assertTrue(drawn.contains(L10n.Card.anonymousAuthor))
        // The avatar's "·" is the neutral mark, not a name.
        assertEquals(setOf("外婆的醃梅子", words, "·", L10n.Card.anonymousAuthor, "2026年10月10日", "Resonance", "resonance.channel"), drawn.toSet())
        assertTrue(drawn.none { it == "念" || it == "念誠" })
    }

    @Test fun aNamedCardNamesItsAuthor() {
        at(1f) { ShareCardCanvas(model(named), cover = null) }
        val drawn = texts()
        assertTrue(drawn.contains("念誠"))
        assertTrue(!drawn.contains(L10n.Card.anonymousAuthor))
    }
}
