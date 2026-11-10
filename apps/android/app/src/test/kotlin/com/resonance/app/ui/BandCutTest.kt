package com.resonance.app.ui

import android.app.Application
import android.graphics.Region
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asAndroidPath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Round 24, part 4 (the owner on a tablet's notifications: 「左邊、右邊，它就要這個區塊就要切斷了」): a tablet's band is
 * cut at its frame's sides — the reading column — its corners rounded; its curves keep every swing. A phone's runs on
 * as it was. iOS's ListBandsTests pins the same.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BandCutTest {
    private val w = 720.0
    private val h = 76.0

    /** The path's pixels at density 1, in a clip well past the band. */
    private fun region(path: Path): Region =
        Region().apply { setPath(path.asAndroidPath(), Region(-20, -20, w.toInt() + 20, h.toInt() + 20)) }

    @Test fun aTabletsBandIsCutAtTheColumnWithRoundedCorners() {
        val open = region(ListBands.path(w, h, "a", "b", cut = false, density = 1f))
        val cut = region(ListBands.path(w, h, "a", "b", cut = true, density = 1f))
        // Open: the band's corners are its own (the curves meet the ends flat).
        assertTrue(open.contains(1, 2))
        // Cut: the corners are rounded away, the sides and the middle stay.
        assertFalse(cut.contains(1, 2))
        assertFalse(cut.contains(w.toInt() - 2, h.toInt() - 3))
        assertTrue(cut.contains(1, 38))
        assertTrue(cut.contains(360, 38))
        // Never past the column's sides, and every swing of the curves kept between the corners.
        val box = cut.bounds
        assertTrue(box.left >= 0 && box.right <= w.toInt() + 1)
        var differ = 0
        for (x in 40..680 step 4) for (y in -3..79) if (open.contains(x, y) != cut.contains(x, y)) differ++
        assertEquals(0, differ)
    }
}
