package com.resonance.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The reply row's mark (round 24, the owner: the reply arrow in place of the wavy rule) is the held message's 回覆 glyph
 * drawn with that row's pen — INK (1.8), as the menu sheet draws it, web INK and iOS `Tokens.ink` — not the icon's
 * INK_STRONG default: in terracotta, 20 (a short window's 18). Drawn here for real and compared pixel for pixel.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "xxhdpi")
class ComposerReplyMarkTest {
    @get:Rule val compose = createComposeRule()

    private fun pixels(tag: String): List<Int> =
        compose.onNodeWithTag(tag).captureToImage().toPixelMap().let { map -> (0 until map.height).flatMap { y -> (0 until map.width).map { x -> map[x, y].hashCode() } } }

    private fun inked(tag: String): Int =
        compose.onNodeWithTag(tag).captureToImage().toPixelMap().let { map -> (0 until map.height).sumOf { y -> (0 until map.width).count { x -> map[x, y] != Color.White } } }

    @Test fun theMarkIsTheMenusReplyGlyphWithItsPenNotTheHeavierDefault() {
        assertEquals(Tokens.Ink, ComposerReplyMarkPen)
        compose.setContent {
            Column(Modifier.background(Color.White)) {
                Box(Modifier.testTag("mark")) { ComposerReplyMark() }
                Box(Modifier.testTag("menu")) { OrganicIcon(IconName.Reply, size = 20.dp, color = Tokens.Terracotta, strokeWidth = Tokens.Ink.value) }
                Box(Modifier.testTag("strong")) { OrganicIcon(IconName.Reply, size = 20.dp, color = Tokens.Terracotta) }
                Box(Modifier.testTag("short")) { ComposerReplyMark(short = true) }
                Box(Modifier.testTag("menuShort")) { OrganicIcon(IconName.Reply, size = 18.dp, color = Tokens.Terracotta, strokeWidth = Tokens.Ink.value) }
            }
        }
        assertEquals(pixels("menu"), pixels("mark"))
        assertEquals(pixels("menuShort"), pixels("short"))
        // The icon's own default pen would ink more of it.
        assertNotEquals(pixels("strong"), pixels("mark"))
        assertTrue("INK inks less than INK_STRONG", inked("mark") < inked("strong"))
    }
}
