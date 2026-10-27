package com.resonance.app.ui

import androidx.compose.ui.unit.dp
import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.LayoutClass
import com.resonance.design.TabBarHeight
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Where the shell's one toast sits (trash.spec §6): over the foot of the window, clear of the tab
 * bar while a phone shows it — so 已移到垃圾桶 · 復原 never hides a tab, nor a tab the toast — and as
 * the web's toast sits once the bar is gone or the tabs are in the header.
 */
class ToastPlacementTest {
    @Test fun onAPhonesTabRootItSitsTwelveAboveTheTabBarsWavyEdge() {
        assertEquals(TabBarHeight + HeaderEdgeHeight + 12.dp, toastClearance(LayoutClass.Compact, tabBarShown = true))
        // Round 16 §2: the bar is 52 now (icons only).
        assertEquals(74.dp, toastClearance(LayoutClass.Compact, tabBarShown = true))
    }

    @Test fun underGestureNavigationItRisesWithTheTabBar() {
        // Round 17 addendum A2: the bar stands higher than the navigation bar's inset under gesture navigation; the
        // toast keeps its 12 over the bar's wavy edge.
        assertEquals(79.dp, toastClearance(LayoutClass.Compact, tabBarShown = true, barLift = 5.dp))
        // Nothing to rise by once the bar has gone.
        assertEquals(16.dp, toastClearance(LayoutClass.Compact, tabBarShown = false, barLift = 5.dp))
    }

    @Test fun overAPushedPageItSitsWhereTheWebsDoes() {
        // A card, the writer, a profile: the bar has gone, 16 from the foot as on a phone's web.
        assertEquals(16.dp, toastClearance(LayoutClass.Compact, tabBarShown = false))
        // A tablet's tabs are in the header: 24 from the foot, as on a wider window's web.
        assertEquals(24.dp, toastClearance(LayoutClass.Medium, tabBarShown = false))
        assertEquals(24.dp, toastClearance(LayoutClass.Expanded, tabBarShown = false))
    }
}
