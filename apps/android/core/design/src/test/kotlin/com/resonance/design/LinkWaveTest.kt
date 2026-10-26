package com.resonance.design

import org.robolectric.RobolectricTestRunner
import org.junit.runner.RunWith
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.autoCurve
import com.resonance.geometry.autoMag
import com.resonance.geometry.autoSegments
import com.resonance.geometry.penWavePoints
import com.resonance.geometry.wobRect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/**
 * A story link's pen wave runs at the depth the web and iOS share (WAVE_DEPTH_EM, 0.29em under the
 * baseline): its upper crests stay clear of a CJK glyph's foot (the ideographic box ends 0.12em
 * down) at the story's 17, its headings' 22 and on any screen.
 */
// A composition of its own answers the palette's getters (composed): Compose's runtime wants Android's Trace.
@RunWith(RobolectricTestRunner::class)
class LinkWaveTest {
    @Test fun theWaveRunsTwentyNineHundredthsOfAnEmUnderTheBaseline() {
        assertEquals(0.29f, WAVE_DEPTH_EM, 0f)
        assertEquals(100f + 17f * 0.29f, linkWaveY(100f, 17f), 1e-4f)
    }

    @Test fun itLiesFlatterThanThePenInItsQuieterInk() = composed {
        // tokens.css --link-wave-amp and --link-wave, the web's WAVE_AMP and WAVE_INK (#ba7f64).
        assertEquals(0.75, LINK_WAVE_AMP, 0.0)
        val swing = (1..200).maxOf { seed -> penWavePoints(120.0, seed.toDouble(), amp = LINK_WAVE_AMP).maxOf { abs(it.y) } }
        assertTrue(swing <= 1.35 * 0.75 + 1e-9)
        val srgb = Tokens.LinkWave.convert(androidx.compose.ui.graphics.colorspace.ColorSpaces.Srgb)
        assertEquals(186f, srgb.red * 255, 1.5f)
        assertEquals(127f, srgb.green * 255, 1.5f)
        assertEquals(100f, srgb.blue * 255, 1.5f)
    }

    @Test fun itsCrestsNeverTouchTheFeetOfChineseGlyphs() {
        // The highest a crest reaches above the wave's centre, in dp: the pen's swing and half its stroke.
        val swing = (1..200).maxOf { seed -> penWavePoints(120.0, seed.toDouble(), amp = LINK_WAVE_AMP).maxOf { abs(it.y) } }
        val reach = swing + Tokens.Ink.value / 2
        for (density in listOf(1f, 2f, 2.625f, 3.5f)) {
            for (size in listOf(17f, 18f, 22f)) {
                val sizePx = size * density
                val top = linkWaveY(0f, sizePx) - reach.toFloat() * density
                assertTrue("$size at $density: the crest reaches ${top / sizePx}em", top > sizePx * 0.12f)
            }
        }
    }

    @Test fun theStoryLinkCardIsTheChatCardBubblesFillPressedTheQuotes() = composed {
        assertEquals(Tokens.BubbleTheirs, StoryLinkCardLook.fill)
        assertEquals(Tokens.BubbleQuote, StoryLinkCardLook.wash)
    }

    @Test fun itsDescriptionAndHostAreTheWebsLinkCardInkReadableOnItsFill() = composed {
        // --link-card-muted: the page's text-muted is 4.3:1 on the card's fill, short of the 4.5 small words need.
        assertEquals(Tokens.LinkCardMuted, StoryLinkCardLook.muted)
        fun contrast(a: Color, b: Color): Float {
            val (hi, lo) = listOf(a.luminance(), b.luminance()).sortedDescending()
            return (hi + 0.05f) / (lo + 0.05f)
        }
        assertTrue(contrast(StoryLinkCardLook.muted, StoryLinkCardLook.fill) >= 4.5f)
        assertTrue(contrast(Tokens.TextMuted, StoryLinkCardLook.fill) < 4.5f)
    }

    @Test fun itsPictureReachesPastEveryOutwardSwingOfItsOutline() {
        // The card's outline (radius 16, the size's own wobble) swings out past its box at the top and the
        // sides by less than the picture bleeds there, so the outline, not the picture, ends it.
        for ((w, h) in listOf(280.0 to 300.0, 360.0 to 420.0, 520.0 to 460.0, 320.0 to 120.0)) {
            for (seed in 1..60) {
                val o = WobRectOptions(curve = autoCurve(w, h), segmentsH = SegValue.Count(autoSegments(w).toDouble()), segmentsV = SegValue.Count(autoSegments(h).toDouble()))
                val points = wobRect(w, h, StoryLinkCardLook.RADIUS, seed.toDouble(), autoMag(w, h), o).flatMap { it.numbers.toList().chunked(2) }
                val out = points.maxOf { (x, y) -> maxOf(-x, x - w, -y) }
                assertTrue("$w×$h seed $seed swings out $out", out < StoryLinkCardLook.BLEED)
            }
        }
    }
}
