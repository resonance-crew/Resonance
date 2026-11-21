package com.resonance.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors
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
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The faces under 共振 (round 26 §U2.2, the owner's look on 2026-11-19: 「它的这个框 border 外面还有一个白色的框，所以它又会
 * 让那个重叠的区域又变更大」): each face is its own drawing, nothing under it — no pad of the page's paper round its pen
 * line — and the faces still step in by the same 0.34; the front face's fill covers the one behind, by day and at night.
 * Drawn for real and read pixel by pixel.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AvatarGroupTest {
    @get:Rule val compose = createComposeRule()

    private val density get() = RuntimeEnvironment.getApplication().resources.displayMetrics.density

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
    }

    // Two people's colours, far from any paper (a test's own, not the palette's).
    private val front = Color(0xFF2E6FD8)
    private val behind = Color(0xFFD83A2E)
    private val faces = listOf(GroupFace("a", "", null, front, 7.0), GroupFace("b", "", null, behind, 11.0))

    @Test fun aGroupIsAsBigAsItsFacesWithNothingRoundThem() {
        compose.setContent {
            Column {
                Box(Modifier.testTag("one")) { AvatarGroup(faces.take(1), size = 28.dp, reducedMotion = true) }
                Box(Modifier.testTag("three")) { AvatarGroup(faces + GroupFace("c", "", null, front, 13.0), size = 28.dp, reducedMotion = true) }
            }
        }
        compose.waitForIdle()
        val one = compose.onNodeWithTag("one").fetchSemanticsNode().boundsInRoot
        // The face itself: 28 square (on a pad it was 34).
        assertEquals(28 * density, one.width, 1f)
        assertEquals(28 * density, one.height, 1f)
        assertEquals(28f, AvatarGroup.width(1, 28.dp).value, 0.01f)
        // Three faces and nothing after them (round 29 §S5: no blank disc): two steps and the last face whole.
        val three = compose.onNodeWithTag("three").fetchSemanticsNode().boundsInRoot
        assertEquals((28 * 0.66f * 2 + 28) * density, three.width, 1f)
        assertEquals(28 * density, three.height, 1f)
    }

    @Test fun noPaperRoundAFaceAndTheFrontFaceCoversTheOneBehind() {
        val palettes = listOf(ResonanceColors.LightTerracotta, ResonanceColors.of(PaletteTheme.Terracotta, true))
        compose.setContent {
            Column {
                palettes.forEachIndexed { i, palette ->
                    CompositionLocalProvider(LocalResonanceColors provides palette) {
                        // A table far from the paper under the group (black by day, white at night), so anything the
                        // group lays down besides the faces shows.
                        Box(Modifier.background(if (palette.dark) Color.White else Color.Black).padding(12.dp)) {
                            Box(Modifier.testTag("group$i")) { AvatarGroup(faces, size = 28.dp, reducedMotion = true) }
                        }
                    }
                }
            }
        }
        compose.waitForIdle()
        val pixels = compose.onRoot().captureToImage().toPixelMap()
        palettes.forEachIndexed { i, palette ->
            val b = compose.onNodeWithTag("group$i").fetchSemanticsNode().boundsInRoot
            // Nowhere in or round the group is the page's paper: the pads (3 past each face, in the cream) are gone.
            val room = (6 * density).roundToInt()
            var paper = 0
            for (y in (b.top.toInt() - room).coerceAtLeast(0) until (b.bottom.toInt() + room).coerceAtMost(pixels.height)) {
                for (x in (b.left.toInt() - room).coerceAtLeast(0) until (b.right.toInt() + room).coerceAtMost(pixels.width)) {
                    if (near(palette.Cream, pixels[x, y])) paper++
                }
            }
            assertEquals("$palette: pixels of the paper round the faces", 0, paper)
            // Where the two overlap (the front face's 28 reaches past the second's start, 18.48 in), the front face's
            // fill covers the one behind; past the front face, the one behind shows.
            val mid = ((b.top + b.bottom) / 2).toInt()
            val overlap = (b.left + 23 * density).toInt()
            assertTrue("$palette: the front face over the overlap, ${pixels[overlap, mid]}", near(front, pixels[overlap, mid]))
            val past = (b.left + 38 * density).toInt()
            assertTrue("$palette: the face behind past the front one, ${pixels[past, mid]}", near(behind, pixels[past, mid]))
            // Right past the front face's pen line, inside the one behind: its fill, never a gap of anything else.
            val rim = (b.left + 28 * density + 3 * density).toInt()
            assertTrue("$palette: the face behind right after the front one's pen line, ${pixels[rim, mid]}", near(behind, pixels[rim, mid]))
        }
    }

    private fun srgb(c: Color) = c.convert(ColorSpaces.Srgb)

    private fun near(expected: Color, actual: Color, tolerance: Float = 0.03f): Boolean {
        val e = srgb(expected)
        val a = srgb(actual)
        return abs(e.red - a.red) <= tolerance && abs(e.green - a.green) <= tolerance && abs(e.blue - a.blue) <= tolerance
    }
}
