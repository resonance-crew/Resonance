package com.resonance.design

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.ReactionId
import com.resonance.design.generated.ResonanceColors
import com.resonance.kit.chat.LinkPreview
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryScript
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
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
 * Round 16's design review, on Android's design language: a chosen tag's ✕ is named for its tag (N6) and
 * its pill is the quiet one (S2); a reaction chip takes a finger's 44 × 44 (S7); the chosen reaction's disc
 * shows at night (F4); and a standalone link with no preview stored is still drawn as a card — its host
 * over its address — where the server would fetch its page, the paragraph as written where it never would (S3).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ReviewFixesTest {
    @get:Rule val compose = createComposeRule()

    private val one = Density(1f, 1f)

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    // N6: each ✕ says which tag it takes away, with a finger's room round it

    @Test fun aTagsCrossIsNamedForItsTagAndTakesItAway() {
        var removed: String? = null
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.padding(40.dp)) {
                    TagPill("日常", size = TagSize.Lg, quiet = true, removeLabel = L10n.Write.tagsRemoveLabel("日常"), onRemove = { removed = "日常" })
                }
            }
        }
        val cross = compose.onNodeWithContentDescription("移除標籤：日常")
        val box = cross.getBoundsInRoot()
        assertEquals(TagRemoveTarget.value, (box.right - box.left).value, 0.5f)
        assertEquals(TagRemoveTarget.value, (box.bottom - box.top).value, 0.5f)
        cross.performClick()
        assertEquals("日常", removed)
        // No pill keeps the plain name once it can say more.
        compose.onAllNodesWithContentDescription(L10n.Write.removeTag).assertCountEquals(0)
    }

    // S7: a 24-tall chip is tapped in 44 × 44, centred on it

    @Test fun aReactionChipIsTappedInAFingersRoomCentredOnIt() {
        var tapped = 0
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.padding(60.dp)) {
                    ReactionChips(
                        listOf(ReactionChipItem(ReactionId.Heart, 1)), outward = 1, ring = androidx.compose.ui.graphics.Color.White,
                        label = "你回應了愛心", onTap = { tapped++ },
                    )
                }
            }
        }
        val target = compose.onNodeWithContentDescription("你回應了愛心")
        val box = target.getBoundsInRoot()
        assertEquals(ReactionChipTarget.value, (box.right - box.left).value, 0.5f)
        assertEquals(ReactionChipTarget.value, (box.bottom - box.top).value, 0.5f)
        // Centred on the 24 chip (60 in): the box reaches 10 past its top and bottom.
        assertEquals(60f - (ReactionChipTarget.value - ReactionChipHeight.value) / 2, box.top.value, 0.5f)
        target.performClick()
        assertEquals(1, tapped)
    }

    // F4, S2: the night disc and the quiet pill

    @Test fun theChosenReactionsDiscShowsAtNightAndTheQuietPillIsHalfTheWash() = composed {
        val day = PaletteMixes.of(ResonanceColors.LightTerracotta)
        val night = PaletteMixes.of(ResonanceColors.of(com.resonance.design.generated.PaletteTheme.Terracotta, true))
        // By day the light wash, as before.
        assertEquals(ResonanceColors.LightTerracotta.TerracottaLight, day.reactionChosen)
        // At night the accent at 30 % over the raised sheet: no longer the light wash, and lighter than the sheet.
        assertNotEquals(ResonanceColors.of(com.resonance.design.generated.PaletteTheme.Terracotta, true).TerracottaLight, night.reactionChosen)
        assertTrue(luminance(night.reactionChosen) > luminance(night.reactionSheet) * 1.3f)
        // The quiet pill: half the light wash on the paper, between the two.
        val light = ResonanceColors.LightTerracotta
        assertTrue(luminance(day.quietTag) > luminance(light.TerracottaLight))
        assertTrue(luminance(day.quietTag) < luminance(light.Cream))
    }

    /** A rough lightness for comparing two colours (sRGB, weighted). */
    private fun luminance(c: androidx.compose.ui.graphics.Color): Float {
        val srgb = c.convert(androidx.compose.ui.graphics.colorspace.ColorSpaces.Srgb)
        return 0.2126f * srgb.red + 0.7152f * srgb.green + 0.0722f * srgb.blue
    }

    // S3: 卡片 always looks like a card

    private val address = "https://example.com/rain-walk"

    private fun story(unfurlable: Boolean, previews: Map<String, LinkPreview> = emptyMap()) {
        val blocks = listOf(StoryBlock.Paragraph(listOf(InlineRun("雨停了。"))), StoryBlock.SoleLink(address, listOf(InlineRun(address, link = address))))
        val cards = StoryLinkCards(
            previews,
            host = { it.url.substringAfter("://").substringBefore('/').removePrefix("www.") },
            label = { "開啟連結：$it" },
            open = {},
            unfurlable = { unfurlable },
        )
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.width(360.dp)) { StoryMarkdown(blocks, StoryType(StoryScript.Cjk, compact = true), "zh-TW", onOpenUrl = {}, links = cards) { _, _, _ -> } }
            }
        }
    }

    @Test fun aLinkWithNoPreviewYetIsStillACardItsHostOverItsAddress() {
        story(unfurlable = true)
        compose.onNodeWithContentDescription("開啟連結：example.com").assertExists()
        // The host where the title goes, the address in the foot.
        compose.onNodeWithText("example.com").assertExists()
        compose.onNodeWithText(address).assertExists()
    }

    @Test fun aLinkTheServerWouldNeverFetchStaysTheParagraphAsWritten() {
        story(unfurlable = false)
        compose.onAllNodesWithContentDescription("開啟連結：example.com").assertCountEquals(0)
        compose.onAllNodesWithText("example.com").assertCountEquals(0)
    }

    @Test fun aStoredPreviewIsDrawnAsBefore() {
        story(unfurlable = true, previews = mapOf(address to LinkPreview(address, "雨後散步", "走一走", null, null)))
        compose.onNodeWithText("雨後散步").assertExists()
        compose.onNodeWithContentDescription("開啟連結：example.com").assertExists()
    }
}
