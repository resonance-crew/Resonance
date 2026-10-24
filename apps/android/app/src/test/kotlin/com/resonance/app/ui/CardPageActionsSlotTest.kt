package com.resonance.app.ui

import androidx.compose.ui.unit.dp
import com.resonance.design.WindowLayout
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Where the card page's share and ⋯ sit at its top, by the window's width (round 8 §10.1): a
 * phone's bar keeps them; under a tablet's header (a medium or expanded window: the header's tabs
 * in its middle) they end the byline under the title, with the author and the read time · date,
 * and the bar has none. A page in a tablet's pane wears a phone's bar, and keeps them there.
 */
class CardPageActionsSlotTest {
    /** As the shell decides it: a tablet's header over a medium or expanded window (Navigation's `topTabs`). */
    private fun slotAt(width: Float) = cardActionsSlot(tabletHeader = WindowLayout(width.dp).cls.topTabs)

    @Test fun aPhoneKeepsThemInItsBar() {
        assertEquals(CardActionsSlot.Bar, slotAt(390f))
        assertEquals(CardActionsSlot.Bar, slotAt(412f))
        assertEquals(CardActionsSlot.Bar, slotAt(599f))
    }

    @Test fun underATabletsHeaderTheyEndTheByline() {
        // A small tablet upright, a tablet upright, a tablet on its side.
        assertEquals(CardActionsSlot.Byline, slotAt(600f))
        assertEquals(CardActionsSlot.Byline, slotAt(800f))
        assertEquals(CardActionsSlot.Byline, slotAt(1280f))
    }

    @Test fun aPageInATabletsPaneWearsAPhonesBarAndKeepsThemThere() {
        // The Messages panes give their pages no header chrome, whatever the window's width.
        assertEquals(CardActionsSlot.Bar, cardActionsSlot(tabletHeader = false))
    }
}
