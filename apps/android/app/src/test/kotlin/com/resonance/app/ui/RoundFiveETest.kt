package com.resonance.app.ui

import androidx.compose.ui.unit.dp
import com.resonance.app.thoughtmap.ThoughtMapStore
import com.resonance.design.LayoutClass
import com.resonance.design.WindowLayout
import com.resonance.geometry.MapCamera
import com.resonance.geometry.mapNodeRect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Round 5 part E on Android: the reading progress's motion, a tablet's spacing, where a conversation opens, the workspace's divider. */
class RoundFiveETest {
    // E1

    @Test fun theReadingProgressFollowsTheScrollAndEasesOnlyAJumpOnItsOwn() {
        // A drag or a fling (the finger still down included): every frame put straight on the bar.
        assertFalse(easesProgress(0.3f, scrolling = true, interrupted = false, reduced = false))
        assertFalse(easesProgress(0.004f, scrolling = true, interrupted = false, reduced = false))
        // A still page whose story changed height: the one jump eases there.
        assertTrue(easesProgress(0.3f, scrolling = false, interrupted = false, reduced = false))
        // …but a change that lands while that ease still runs snaps (restarting it every frame never moved it).
        assertFalse(easesProgress(0.3f, scrolling = false, interrupted = true, reduced = false))
        // A nudge too small to ease, and anything with the system's animations off, is put there at once.
        assertFalse(easesProgress(PROGRESS_JUMP / 2, scrolling = false, interrupted = false, reduced = false))
        assertFalse(easesProgress(0.3f, scrolling = false, interrupted = false, reduced = true))
    }

    // E2

    @Test fun aTabletsTitledTabsStartUnderThePenLineByItsWidthButMessagesKeepsItsPanes() {
        val penLine = 1.4f + 1.8f
        assertEquals(16f, titledBarGap(WindowLayout(400.dp), tabletAir = true).value, 0.001f)
        for ((width, air) in listOf(700f to 32f, 1000f to 40f, 1280f to 51.2f)) {
            assertEquals(air - penLine, titledBarGap(WindowLayout(width.dp), tabletAir = true).value, 0.001f)
            assertEquals(16f, titledBarGap(WindowLayout(width.dp), tabletAir = false).value, 0.001f)
        }
    }

    @Test fun whatFloatsOverTheMapStandsWhereAPushedPagesBarPutsItsOwn() {
        // The bar's row line: the 72 row's middle, 6 lower; the ← glyph's centre, its 48 hit box hanging 16 into the pad.
        assertEquals(42f, com.resonance.design.TabletBarRowLine.value, 0.001f)
        // On a wide tablet as far in as the row line lies under the status bar (the pad would put it 56 in); 8 past a narrow one's pad.
        assertEquals(42f, com.resonance.design.tabletBackCentre(48.dp).value, 0.001f)
        assertEquals(32f, com.resonance.design.tabletBarGlyphInset(24.dp).value, 0.001f)
        // A tab root's lockup and pen keep the edge where those glyphs end: 33 in on a wide tablet, the pad's 23–24 on a narrow one.
        assertEquals(33f, com.resonance.design.tabletBarEdge(48.dp).value, 0.001f)
        assertEquals(23f, com.resonance.design.tabletBarEdge(24.dp).value, 0.001f)
    }

    @Test fun aTabletsSettingsStartUnderThePenLineAsItsTabsDo() {
        assertEquals(16f, settingsTop(WindowLayout(400.dp)).value, 0.001f)
        for (width in listOf(700f, 1000f, 1280f)) {
            assertEquals(titledBarGap(WindowLayout(width.dp), tabletAir = true), settingsTop(WindowLayout(width.dp)))
        }
        // A landscape tablet's settings start lower than an upright one's: the air follows the sides.
        assertTrue(settingsTop(WindowLayout(1280.dp)) > settingsTop(WindowLayout(800.dp)))
    }

    @Test fun aCardPagesListHeadingsHaveTheSameRoomOnATablet() {
        assertEquals(SectionAir(32, 40), cardSectionAir(LayoutClass.Compact, phoneBelow = 40))
        assertEquals(SectionAir(32, 56), cardSectionAir(LayoutClass.Compact, phoneBelow = 56))
        assertEquals(SectionAir(0, 24), cardSectionAir(LayoutClass.Compact, phoneTop = 0, phoneBelow = 24))
        for (cls in listOf(LayoutClass.Medium, LayoutClass.Expanded)) {
            assertEquals(SectionAir(64, 56), cardSectionAir(cls, phoneBelow = 40))
            assertEquals(SectionAir(64, 56), cardSectionAir(cls, phoneBelow = 56))
            assertEquals(SectionAir(64, 56), cardSectionAir(cls, phoneTop = 0, phoneBelow = 24))
        }
    }

    @Test fun aPhonesCardBoxHasMoreAirAroundItsShelves() {
        assertEquals(CardBoxAir(28.dp, 36.dp), CardBoxAir.of(LayoutClass.Compact))
        assertEquals(CardBoxAir(20.dp, 28.dp), CardBoxAir.of(LayoutClass.Medium))
        assertEquals(CardBoxAir(20.dp, 28.dp), CardBoxAir.of(LayoutClass.Expanded))
    }

    // E3

    @Test fun onATabletAConversationOpenedOutsideMessagesGoesToMessages() {
        val thread = Route.Thread("bob", uid = "u-bob")
        for (cls in listOf(LayoutClass.Medium, LayoutClass.Expanded)) {
            for (tab in listOf(Tab.Feed, Tab.Notifications, Tab.CardBox)) assertTrue(opensInMessages(thread, tab, cls))
            // Already on Messages: on its own stack (a profile pushed there, its message action).
            assertFalse(opensInMessages(thread, Tab.Messages, cls))
            // Anything else stays where it was opened.
            assertFalse(opensInMessages(Route.Card("a-walk"), Tab.Notifications, cls))
            assertFalse(opensInMessages(Route.Author("bob"), Tab.Feed, cls))
        }
        // A phone pushes it where it was opened.
        for (tab in Tab.entries) assertFalse(opensInMessages(thread, tab, LayoutClass.Compact))
    }

    @Test fun theChosenConversationsRowIsFoundAmongTheConversationsOrThePeopleToStartWith() {
        val conversations = listOf("ana", "bob")
        val starters = listOf("cyd", "dan")
        assertEquals(1, rowIndex(conversations, starters) { it == "bob" })
        // After the conversations and the starters' label.
        assertEquals(4, rowIndex(conversations, starters) { it == "dan" })
        assertNull(rowIndex(conversations, starters) { it == "eve" })
    }

    // E5

    @Test fun theDividerResizesTheEditorBetween32And50PercentAndHidesItFromUnder18() {
        val w = 1000f
        // Toward the map grows it, past half over the map, never past the window; toward the trailing edge the pane follows the finger.
        assertEquals(0.7f, PaneDrag.follow(0.4f, -300f, w), 0.0001f)
        assertEquals(1f, PaneDrag.follow(0.4f, -900f, w), 0.0001f)
        assertEquals(0.36f, PaneDrag.follow(0.4f, 40f, w), 0.0001f)
        assertEquals(0.1f, PaneDrag.follow(0.4f, 300f, w), 0.0001f)
        assertEquals(0f, PaneDrag.follow(0.4f, 900f, w), 0.0001f)
        // The hide zone.
        assertTrue(PaneDrag.inHideZone(0.179f))
        assertFalse(PaneDrag.inHideZone(0.18f))
        // Let go: hidden under 18 %, sprung back to 32 % between, left where it is from 32 %.
        assertEquals(PaneDrag.Release.Hide, PaneDrag.release(0.1f))
        assertEquals(0f, PaneDrag.settle(0.1f))
        assertEquals(PaneDrag.Release.SpringBack, PaneDrag.release(0.18f))
        assertEquals(PaneDrag.Release.SpringBack, PaneDrag.release(0.319f))
        assertEquals(0.32f, PaneDrag.settle(0.25f))
        assertEquals(PaneDrag.Release.Stay, PaneDrag.release(0.32f))
        assertEquals(0.41f, PaneDrag.settle(0.41f))
        // Docked: drawn far enough toward the map, it shows again.
        assertTrue(PaneDrag.reveals(20f, 16f))
        assertFalse(PaneDrag.reveals(10f, 16f))
    }

    @Test fun letGoFrom75PercentTheWriterTakesTheWholeWindowAndBetweenHalfAnd75ItSpringsBackToHalf() {
        val w = 1000f
        // Half stays half; past it, short of the full zone, it springs back to half.
        assertEquals(PaneDrag.Release.Stay, PaneDrag.release(0.5f))
        assertEquals(0.5f, PaneDrag.settle(0.5f))
        assertEquals(PaneDrag.Release.SpringToHalf, PaneDrag.release(0.501f))
        assertEquals(PaneDrag.Release.SpringToHalf, PaneDrag.release(0.749f))
        assertEquals(0.5f, PaneDrag.settle(0.6f))
        // The full zone: from 75 % it takes the whole window.
        assertFalse(PaneDrag.inFullZone(0.749f))
        assertTrue(PaneDrag.inFullZone(0.75f))
        assertEquals(PaneDrag.Release.Full, PaneDrag.release(0.75f))
        assertEquals(1f, PaneDrag.settle(0.75f))
        assertEquals(1f, PaneDrag.settle(1f))
        // From the whole window, dragged back toward the trailing side by the same rules.
        assertEquals(PaneDrag.Release.Full, PaneDrag.release(PaneDrag.follow(1f, 200f, w)))
        assertEquals(0.5f, PaneDrag.settle(PaneDrag.follow(1f, 400f, w)))
        assertEquals(0.45f, PaneDrag.settle(PaneDrag.follow(1f, 550f, w)), 0.0001f)
        assertEquals(PaneDrag.Release.Hide, PaneDrag.release(PaneDrag.follow(1f, 900f, w)))
        // The grip docks 22 in from whichever edge the boundary has reached, and stands on the boundary between.
        assertEquals(22f, PaneDrag.gripCentre(1f, w, 22f))
        assertEquals(978f, PaneDrag.gripCentre(0f, w, 22f))
        assertEquals(500f, PaneDrag.gripCentre(0.5f, w, 22f))
        assertEquals(22f, PaneDrag.gripCentre(0.99f, w, 22f))
    }

    @Test fun hiddenFromTheWholeWindowThePaneShowsAgainAtHalf() {
        assertEquals(0.5f, PaneDrag.showsAgainAt(1f))
        assertEquals(0.4f, PaneDrag.showsAgainAt(0.4f))
        assertEquals(0.32f, PaneDrag.showsAgainAt(0f))
        // The writer alone is the whole window left open, held or not; covering the map once drawn all the way over it.
        val alone = PaneState(PaneCard(ROUTE_SLOT, null, "c1", null, fromMap = true), open = true, frac = 1f)
        assertTrue(alone.full)
        assertTrue(alone.covers)
        alone.drag = 0.8f
        assertTrue(alone.full)
        assertFalse(alone.covers)
        assertTrue(alone.inFullZone)
        alone.drag = 0.6f
        assertFalse(alone.inFullZone)
        assertFalse(PaneState(PaneCard(ROUTE_SLOT, null, "c1", null, fromMap = false), open = true, frac = 0.5f).full)
        assertFalse(PaneState(PaneCard(ROUTE_SLOT, null, "c1", null, fromMap = false), open = false, frac = 1f).full)
    }

    @Test fun theWorkspacesPaneKeepsWhatItShowsAndWhereItWasLeft() {
        val state = PaneState(PaneCard(ROUTE_SLOT, null, null, "words", fromMap = false), open = true, frac = 0.4f)
        state.settled += 2
        val saved = with(PaneState.Saver) { androidx.compose.runtime.saveable.SaverScope { true }.save(state) }!!
        val back = PaneState.Saver.restore(saved)!!
        assertEquals(state.card, back.card)
        assertTrue(back.open)
        assertEquals(0.4f, back.frac)
        assertEquals(0.4f, back.drawn)
        // The settlings the map has centred on come back with it: returning to the page moves nothing.
        assertEquals(3, back.settled)
        // Nothing to show: never open.
        assertFalse(PaneState(null, open = true, frac = 0.5f).open)
        assertEquals(0f, PaneState(null, open = true, frac = 0.5f).drawn)
        // Opened with the writer, the map's width has settled once beside it; the map come into, not yet.
        assertEquals(1, PaneState(PaneCard(ROUTE_SLOT, null, "c1", null, fromMap = false), open = true, frac = 0.5f).settled)
        assertEquals(0, PaneState(null, open = false, frac = 0.5f).settled)
    }

    @Test fun theMapCentresThePanesCardInWhatItShowsAtTheZoomItIsAt() {
        val cam = MapCamera(-40.0, 25.0, 0.8)
        val card = mapNodeRect(300.0, 120.0)
        // The map 600 wide beside the pane, 800 high: the card's middle lands at (300, 400).
        val centred = ThoughtMapStore.centredOn(cam, card, 600.0, 800.0)
        assertEquals(0.8, centred.s, 0.0)
        assertEquals(300.0, (card.x + card.w / 2) * centred.s + centred.x, 1e-9)
        assertEquals(400.0, (card.y + card.h / 2) * centred.s + centred.y, 1e-9)
        // Already there: it stays.
        assertEquals(centred, ThoughtMapStore.centredOn(centred, card, 600.0, 800.0))
    }
}
