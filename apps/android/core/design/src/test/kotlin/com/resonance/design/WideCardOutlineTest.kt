package com.resonance.design

import com.resonance.geometry.SegValue
import com.resonance.geometry.wobRect
import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.min

/** The wide card's outline (the feed's picks invite on a tablet): a story card's turns per dp along its long edges. */
class WideCardOutlineTest {
    @Test fun storyCardsAreDrawnAsBefore() {
        // borderedCardOutline is the story cards' own: wobRect at R 22, 2.5 % of the short side, BorderedCardWob.
        for ((w, h) in listOf(430.0 to 530.0, 360.0 to 610.0, 520.0 to 480.0)) {
            val seed = 3 * 77.0 + 13
            assertEquals(
                wobRect(w, h, min(22.0, min(w, h) / 2), seed, min(w, h) * 0.025, BorderedCardWob),
                borderedCardOutline(w, h, seed),
            )
        }
    }

    @Test fun aWiderCardTurnsMoreOftenAlongItsLongEdges() {
        val h = 150.0
        // A story card's width gets a story card's 3–4; two and three widths, two and three times as many.
        val one = wideCardOutline(430.0, h, 191.0)
        val two = wideCardOutline(860.0, h, 191.0)
        val three = wideCardOutline(1290.0, h, 191.0)
        assertEquals(wobRect(430.0, h, 22.0, 191.0, 420 * 0.025, BorderedCardWob.copy(segmentsH = SegValue.Count(3.0), segmentsV = SegValue.Count(2.0))), one)
        assertEquals(wobRect(860.0, h, 22.0, 191.0, 420 * 0.025, BorderedCardWob.copy(segmentsH = SegValue.Count(7.0), segmentsV = SegValue.Count(2.0))), two)
        assertEquals(wobRect(1290.0, h, 22.0, 191.0, 420 * 0.025, BorderedCardWob.copy(segmentsH = SegValue.Count(10.0), segmentsV = SegValue.Count(2.0))), three)
        // The short edges by length too, at least 2: a taller one gets more.
        assertEquals(wobRect(1290.0, 380.0, 22.0, 191.0, 420 * 0.025, BorderedCardWob.copy(segmentsH = SegValue.Count(10.0), segmentsV = SegValue.Count(3.0))), wideCardOutline(1290.0, 380.0, 191.0))
    }
}
