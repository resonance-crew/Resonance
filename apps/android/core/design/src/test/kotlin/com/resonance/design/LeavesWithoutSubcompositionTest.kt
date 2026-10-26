package com.resonance.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.StoryScript
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * The text and picture leaves lay out for the width offered without a subcomposition (A3), and come
 * out exactly as the BoxWithConstraints ones did (kept in ReferenceLeaves.kt): the same pixels and
 * the same size, in a fixed column, under a stretching parent, left to right and right to left, at
 * the reading scale — and still read their words to TalkBack and take a tap on a link.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
// A window wide and tall enough (in pixels) for everything compared to be on it, at every density tried.
@Config(qualifiers = "w1000dp-h3000dp-mdpi")
class LeavesWithoutSubcompositionTest {
    @get:Rule val compose = createComposeRule()

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
    }

    private var reference by mutableStateOf(true)
    private var direction by mutableStateOf(LayoutDirection.Ltr)
    private var density by mutableStateOf(Density(2.625f, 1.15f))

    /** [leaf] drawn as before ([reference]) and as now on a white page, each way and at each density: the captures. */
    private fun assertSameEachWay(densities: List<Density> = listOf(Density(2.625f, 1.15f)), leaf: @Composable (reference: Boolean) -> Unit) {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides density, LocalLayoutDirection provides direction) {
                Box(Modifier.width(320.dp).background(Color.White)) { leaf(reference) }
            }
        }
        for (d in densities) for (way in LayoutDirection.entries) {
            density = d
            direction = way
            reference = true
            compose.waitForIdle()
            val before = capture()
            // Something was drawn on the page to compare (not a blank white sheet).
            assertTrue(before.dropLast(2).count { it != WHITE } > 500)
            reference = false
            compose.waitForIdle()
            assertArrayEquals("$way at ${d.density}", before, capture())
        }
    }

    private fun capture(): IntArray {
        val map = compose.onRoot().captureToImage().toPixelMap()
        // The page must end on the window, not past it: its bottom row is the page's (white), drawn.
        check(map.height < 3000 && map.width < 1000) { "the page runs off the window: ${map.width}×${map.height}" }
        return IntArray(map.width * map.height + 2).also { out ->
            map.buffer.copyInto(out)
            out[out.size - 2] = map.width
            out[out.size - 1] = map.height
        }
    }

    private val WHITE = Color.White.toArgb()

    private val words = "Resonance 共振：寫下一張卡片，讓另一個人用他的故事回應。A card answers a card."

    @Test fun cssTextLaysOutAsBefore() {
        run {
            assertSameEachWay { ref ->
                Column(Modifier.padding(12.dp)) {
                    for (fits in listOf(false, true)) {
                        // Hugging its words under a parent that stretches it, and filling a narrow column.
                        if (ref) RefCssText(words, AppFonts.Family.Body, 15f, 600, 1.4f, Tokens.Text, Modifier.fillMaxWidth(), 0.01f, fits)
                        else CssText(words, AppFonts.Family.Body, 15f, 600, 1.4f, Tokens.Text, Modifier.fillMaxWidth(), 0.01f, fits)
                        if (ref) RefCssText("短", AppFonts.Family.Heading, 22f, 700, 1.25f, Tokens.Terracotta, Modifier.widthIn(max = 140.dp), fitsContent = fits)
                        else CssText("短", AppFonts.Family.Heading, 22f, 700, 1.25f, Tokens.Terracotta, Modifier.widthIn(max = 140.dp), fitsContent = fits)
                    }
                }
            }
        }
        compose.onAllNodesWithText(words, useUnmergedTree = true).assertCountEquals(2)
    }

    @Test fun chatTextLaysOutAsBefore() {
        val text = "Look at https://resonance.channel/card/abc and 共振的故事 again and again"
        val link = text.indexOf("https")..text.indexOf(" and")
        val hit = text.indexOf("共振")..(text.indexOf("共振") + 1)
        run {
            assertSameEachWay { ref ->
                Column(Modifier.padding(16.dp).width(220.dp)) {
                    if (ref) RefChatText(text, links = listOf(link), highlights = listOf(hit), highlightWeight = 700, onTap = {})
                    else ChatText(text, links = listOf(link), highlights = listOf(hit), highlightWeight = 700, onTap = {})
                    if (ref) RefChatText(text, sizeSp = 13.5f, color = Tokens.TextMuted, maxLines = 2) else ChatText(text, sizeSp = 13.5f, color = Tokens.TextMuted, maxLines = 2)
                }
            }
        }
    }

    @Test fun storyTextAndTitleLayOutAsBefore() {
        val type = StoryType(StoryScript.Cjk, compact = true)
        val runs = listOf(InlineRun("湖中央，我看見了"), InlineRun("知行合一", bold = true), InlineRun("，"), InlineRun("一個連結", link = "https://example.com/a"), InlineRun(" and don’t stop."))
        run {
            assertSameEachWay { ref ->
                ReadingTextScale {
                    Column(Modifier.padding(20.dp)) {
                        if (ref) RefStoryTitle("湖中央，我看見了知行合一", type, "zh-TW") else StoryTitle("湖中央，我看見了知行合一", type, "zh-TW")
                        if (ref) RefRichCssText(runs, ProseStyle.body(type, "zh-TW"), {}) else RichCssText(runs, ProseStyle.body(type, "zh-TW"), {})
                        if (ref) RefRichCssText(listOf(InlineRun("1.")), ProseStyle.body(type).copy(color = Tokens.TextMuted, justified = false), {}, Modifier.width(30.dp))
                        else RichCssText(listOf(InlineRun("1.")), ProseStyle.body(type).copy(color = Tokens.TextMuted, justified = false), {}, Modifier.width(30.dp))
                    }
                }
            }
        }
    }

    @Test fun aLinkInTheStoryStillOpens() {
        val type = StoryType(StoryScript.Latin, compact = true)
        val opened = mutableListOf<String>()
        compose.setContent {
            RichCssText(listOf(InlineRun("open "), InlineRun("this link here", link = "https://example.com/x")), ProseStyle.body(type, "en"), { opened += it })
        }
        compose.onNodeWithText("open this link here", useUnmergedTree = true).performClick()
        assertEquals(listOf("https://example.com/x"), opened)
    }

    @Test fun anOrganicImageBleedsAndClipsAsBefore() {
        val p = CardPalette.of(3)
        run {
            run {
                assertSameEachWay(listOf(Density(2.625f), Density(3f), Density(2f))) { ref ->
                    Column(Modifier.padding(10.dp)) {
                        val ph: @Composable () -> Unit = { StoryImagePlaceholder(p.fill, p.stripe, "a cover") }
                        if (ref) RefOrganicImage(null, 4.0, Modifier.fillMaxWidth().aspectRatio(1.6f), grain = StoryGrain.Cover, placeholder = ph)
                        else OrganicImage(null, 4.0, Modifier.fillMaxWidth().aspectRatio(1.6f), grain = StoryGrain.Cover, placeholder = ph)
                        if (ref) RefOrganicImage(null, 9.0, Modifier.padding(top = 8.dp).size(73.dp, 51.dp), radius = 12.0, magFactor = 0.025, placeholder = ph)
                        else OrganicImage(null, 9.0, Modifier.padding(top = 8.dp).size(73.dp, 51.dp), radius = 12.0, magFactor = 0.025, placeholder = ph)
                    }
                }
            }
        }
    }

    @Test fun aRadioAndAFlagDrawAsBefore() {
        assertSameEachWay(listOf(Density(2.625f), Density(3f))) { ref ->
            androidx.compose.foundation.layout.Row(Modifier.padding(8.dp), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                for (selected in listOf(false, true)) {
                    if (ref) RefOrganicRadio(selected, seed = 21.0) else OrganicRadio(selected, seed = 21.0)
                }
                for (code in listOf("tw", "jp")) {
                    if (ref) RefSquareFlag(code, 24.dp) else SquareFlag(code, 24.dp)
                }
            }
        }
    }
}
