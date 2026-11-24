package com.resonance.app.ui

import com.resonance.geometry.PathCommand
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wobRect
import java.io.File
import kotlin.math.min
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Round 35 (3) (the owner: 这个变色的区块…没有完全填充满这个区块，它的左边、右边有点露出来…在深色模式下看到的): a row's band in
 * the tap dialogs is drawn past the paper's box at both sides, so the paper — whose wobble bulges past that box — cuts
 * it on its pen line; the curves between the row's sides, the rules on them and the words stay where they were.
 */
class TapBandBleedTest {
    private val keys = listOf("passage:14fecaaf", "passage:8b3a1c4d", "tap:dora")

    /** The x of every point a path's commands name (a cubic lies inside its control points' hull). */
    private fun xs(path: List<PathCommand>): List<Double> = path.flatMap { c -> c.numbers.filterIndexed { i, _ -> i % 2 == 0 } }

    @Test fun theBandsDrawnExtentGoesPastTheBoxOnBothSides() {
        val bleed = TapListBandBleed.value.toDouble()
        // The lead's measure of the web (2026-11-25): its band runs 10 past the paper's box each side.
        assertTrue("at least the web's 10 (is $bleed)", bleed >= 10.0)
        for (w in listOf(343.0, 400.0, 480.0)) for (key in keys) {
            val band = xs(ListBands.region(w, 87.0, key, ListBands.EndKey, bleed))
            assertEquals(-bleed, band.min(), 0.0)
            assertEquals(w + bleed, band.max(), 0.0)
            // Without it, the box's own width, as every other list (the bell's, the conversations').
            val flush = xs(ListBands.region(w, 87.0, key, ListBands.EndKey))
            assertEquals(0.0, flush.min(), 0.0)
            assertEquals(w, flush.max(), 0.0)
        }
    }

    @Test fun theCurvesBetweenTheSidesAreUnchangedSoTheRulesStillLieOnTheBandsEdge() {
        val bleed = TapListBandBleed.value.toDouble()
        for (key in keys) {
            val flush = ListBands.curve(0.0, 400.0, key)
            val bled = ListBands.curve(0.0, 400.0, key, bleed)
            assertEquals(flush.size, bled.size)
            // The same turns from 0 to the width; only the pads at the two ends reach further, flat.
            assertEquals(flush.subList(1, flush.size - 1), bled.subList(1, bled.size - 1))
            assertEquals(-bleed, bled.first().x, 0.0)
            assertEquals(400.0 + bleed, bled.last().x, 0.0)
            assertEquals(bled[1].y, bled.first().y, 0.0)
            assertEquals(bled[bled.size - 2].y, bled.last().y, 0.0)
        }
    }

    @Test fun thePapersWobbleNeverReachesPastTheBleedSoItCutsTheBandAtEveryHeight() {
        // OrganicModal's paper: wobRect(w, h, 26, seed, min(w, h) × 0.025, …) — the tap dialogs' seeds 41, 43, 47 and more.
        val bleed = TapListBandBleed.value.toDouble()
        var bulges = 0
        for (w in listOf(300.0, 343.0, 400.0, 480.0)) for (h in listOf(240.0, 480.0, 640.0, 900.0)) for (seed in listOf(41.0, 43.0, 47.0, 17.0, 3.0)) {
            val paper = wobRect(w, h, 26.0, seed, min(w, h) * 0.025, WobRectOptions(
                curve = 0.6, cornerJitter = 0.9, cornerOffset = 5.0, segmentsH = SegValue.Range(3, 4), segmentsV = SegValue.Range(5, 6),
            ))
            val x = xs(paper)
            if (x.min() < -0.5 || x.max() > w + 0.5) bulges++
            // Never as far as the band is drawn (plus the pen's 1.5): the clip always ends the band on the line.
            assertTrue("left ${x.min()} at w $w h $h seed $seed", x.min() > -bleed + 1.5)
            assertTrue("right ${x.max()} at w $w h $h seed $seed", x.max() < w + bleed - 1.5)
        }
        // It does bulge past the box (the sliver the owner saw at the band's ends).
        assertTrue("the paper bulges past its box ($bulges)", bulges > 0)
    }

    @Test fun everyRowOfTheFamilyIsDrawnPastTheBox() {
        // The passages' rest and press ink, and the people lists' press ink (who resonated — the reader's, the author's —
        // and who picked this sentence: one TapRow).
        val passages = File("src/main/kotlin/com/resonance/app/ui/TapPassages.kt").readText()
        assertTrue(passages.contains("bleed = PassageBand.bleed)"))
        assertEquals(TapListBandBleed, PassageBand.bleed)
        val people = File("src/main/kotlin/com/resonance/app/ui/TapFaces.kt").readText()
        assertTrue(people.contains(".listBand(topKey, bottomKey, source, { false }, cut = false, bleed = TapListBandBleed)"))
        // The region's layer is as wide, the scroll and the rows keep the box.
        val modal = File("src/main/kotlin/com/resonance/app/ui/TapListModal.kt").readText()
        assertTrue(modal.contains(".toModalPaperEdges(TapListInset + TapListBandBleed)"))
        assertTrue(modal.contains(".padding(horizontal = TapListBandBleed)\n                    .verticalScroll(scroll)"))
    }
}
