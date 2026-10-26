package com.resonance.design

import com.resonance.design.generated.Tokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * A card family's mixes are worked out once (A7): each is exactly the colour its CSS names
 * (`oklch(97.5% 0.012 hue)` and the rest, by StoryCard.tsx's numbers), whichever palette object asks,
 * and a parsed colour string answers the same colour every time — an unparsable one, null every time.
 */
class PaletteMixesTest {
    @Test fun everyFamilysMixesAreTheColoursTheirCssNames() {
        val fillLc = listOf(90.0 to 0.065, 94.0 to 0.032, 93.0 to 0.042, 92.0 to 0.075, 92.0 to 0.033, 89.0 to 0.047)
        for (i in CardPalette.HUES.indices) {
            val hue = CardPalette.HUES[i]
            val p = CardPalette.of(i)
            assertEquals(OklchColor.of(0.975, 0.012, hue), p.interior)
            assertEquals(OklchColor.of(0.55, 0.04, hue, 0.4), p.separator)
            assertEquals(OklchColor.of(0.44, 0.08, hue), p.noteInk)
            assertEquals(OklchColor.of((fillLc[i].first - 7) / 100, fillLc[i].second, hue), p.stripe)
            assertEquals(OklchColor.of(0.90, 0.06, hue), p.accent)
            assertEquals(Tokens.CardFills[i], p.fill)
            assertEquals(Tokens.CardBorders[i], p.border)
        }
    }

    @Test fun aFamilyIsItsIndex() {
        assertEquals(CardPalette.of(2), CardPalette.of(8))
        assertEquals(CardPalette.of(2).hashCode(), CardPalette.of(2).hashCode())
        assertEquals(CardPalette.of(4), CardPalette(215.0, 0))
        assertNotEquals(CardPalette.of(1), CardPalette.of(2))
    }

    @Test fun aParsedStringAnswersTheSameColourEveryTime() {
        val css = "oklch(62% 0.11 312 / 0.5)"
        val first = OklchColor.parse(css)
        assertEquals(OklchColor.of(0.62, 0.11, 312.0, 0.5), first)
        repeat(3) { assertEquals(first, OklchColor.parse(css)) }
        repeat(2) { assertNull(OklchColor.parse("rebeccapurple")) }
        // Far more strings than it keeps: each still parses to its own colour.
        for (h in 0 until 400) assertEquals(OklchColor.of(0.7, 0.1, h.toDouble()), OklchColor.parse("oklch(70% 0.1 $h)"))
        assertEquals(first, OklchColor.parse(css))
    }
}
