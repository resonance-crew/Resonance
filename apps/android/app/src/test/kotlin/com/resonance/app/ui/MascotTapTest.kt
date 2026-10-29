package com.resonance.app.ui

import androidx.compose.ui.geometry.Offset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A tap on a puppet is the puppet's (round 20): a press where the island said one is is taken, and
 * handed over when it lifts unmoved; any other press passes to the list (or the row) under it, and so
 * does a press that turned into a scroll.
 */
class MascotTapTest {
    private val puppet = Offset(120f, 380f)
    /** A target with one puppet's hit rect at 100–140 × 360–420 (px = the island's points here). */
    private fun at(p: Offset): Offset? = if (p.x in 100f..140f && p.y in 360f..420f) p else null

    @Test fun aPressOnAPuppetIsTakenAndItsLiftIsATapThere() {
        val r = TapRouter(slop = 8f)
        assertTrue(r.down(1, puppet, at(puppet)))
        r.moved(1, puppet + Offset(3f, -2f), takenElsewhere = false)
        assertEquals(puppet, r.up(1))
        // Once only.
        assertNull(r.up(1))
    }

    @Test fun aPressBesideItPassesThrough() {
        val r = TapRouter(slop = 8f)
        val beside = Offset(300f, 380f)
        assertFalse(r.down(1, beside, at(beside)))
        assertNull(r.up(1))
    }

    @Test fun aPressThatScrollsIsNoTap() {
        val r = TapRouter(slop = 8f)
        assertTrue(r.down(1, puppet, at(puppet)))
        r.moved(1, puppet + Offset(0f, -12f), takenElsewhere = false)
        assertNull(r.up(1))
        // Or the list took its move (it began scrolling) before it went past the slop.
        assertTrue(r.down(2, puppet, at(puppet)))
        r.moved(2, puppet + Offset(0f, -4f), takenElsewhere = true)
        assertNull(r.up(2))
    }

    @Test fun anotherFingerOrACancelEndsIt() {
        val r = TapRouter(slop = 8f)
        assertTrue(r.down(1, puppet, at(puppet)))
        assertNull(r.up(2))
        r.cancel()
        assertNull(r.up(1))
    }

    @Test fun whileTheLayerIsShiftedNothingIsAPuppets() {
        // The overlay's target answers null while the list moves or the island hasn't drawn where it rests.
        val r = TapRouter(slop = 8f)
        assertFalse(r.down(1, puppet, null))
        assertNull(r.up(1))
    }
}
