package com.resonance.design

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Round 17 addendum A2: the phone's tab bar keeps a little room over the gesture handle — its glyphs' centre 55 above
 * the screen's foot under gesture navigation (50 before, on a 24 handle), the three buttons' bar right over them as
 * before.
 */
class TabBarFootTest {
    @Test fun underGestureNavigationTheGlyphsStand55AboveTheScreensFoot() {
        // A phone's gesture handle (24, as on the project's phones): the row's foot is 29 up, its centre 29 + 52 / 2.
        val foot = tabBarFoot(24.dp, gestures = true)
        assertEquals(29f, foot.value, 0.01f)
        assertEquals(TabBarGestureCentre.value, (foot + TabBarHeight / 2).value, 0.01f)
        assertEquals(55f, TabBarGestureCentre.value, 0f)
        // Whatever the handle's inset, as long as it leaves the room: a thinner one (16) puts the glyphs no lower.
        assertEquals(55f, (tabBarFoot(16.dp, gestures = true) + TabBarHeight / 2).value, 0.01f)
        // Never into a deeper inset than that.
        assertEquals(40f, tabBarFoot(40.dp, gestures = true).value, 0.01f)
    }

    @Test fun withTheThreeButtonsTheRowStaysRightOverThem() {
        assertEquals(48f, tabBarFoot(48.dp, gestures = false).value, 0.01f)
        // No navigation bar at all (a landscape or immersive window): nothing under it.
        assertEquals(0f, tabBarFoot(0.dp, gestures = false).value, 0.01f)
    }
}
