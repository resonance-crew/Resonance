package com.resonance.kit.chat

import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The composer's foot (round 22 §4.1–4.2): ☺ and ＋ swap the keyboard for their panels and back, the
 * keyboard comes back over a panel's kept room, back closes a panel, the end segment grows the sticker
 * panel only when there is nothing to send; the keyboard's height per orientation; at most three
 * stickers playing; the pictures chosen, numbered and capped at ten; the gallery read a page at a time.
 */
class ComposerPanelsTest {
    @Test fun theStickerButtonSwapsTheKeyboardForThePanelAndBackKeepingItsRoomWhileTheKeyboardRises() {
        var s = PanelState(ComposerPanel.Keyboard)
        s = PanelMachine.stickerButton(s)
        assertEquals(ComposerPanel.Stickers, s.panel)
        assertTrue(s.keepsRoom)
        // ⌨: the keyboard comes back, rising over the panel's room.
        s = PanelMachine.stickerButton(s)
        assertEquals(PanelState(ComposerPanel.Keyboard, holding = true), s)
        assertTrue(s.keepsRoom)
        assertFalse(s.panelOpen)
        s = PanelMachine.keyboardSettled(s)
        assertEquals(PanelState(ComposerPanel.Keyboard), s)
        assertFalse(s.keepsRoom)
    }

    @Test fun aTapOnTheFieldOrTheKeyboardComingUpOtherwiseClosesAPanelAndBackClosesOne() {
        var s = PanelMachine.attachButton(PanelState())
        assertEquals(ComposerPanel.Attach, s.panel)
        s = PanelMachine.keyboardShown(s)
        assertEquals(PanelState(ComposerPanel.Keyboard, holding = true), s)
        assertEquals(PanelState(ComposerPanel.Keyboard), PanelMachine.keyboardShown(PanelState()))
        val (closed, taken) = PanelMachine.back(PanelState(ComposerPanel.Stickers, expanded = true))
        assertEquals(PanelState(), closed)
        assertTrue(taken)
        assertFalse(PanelMachine.back(PanelState(ComposerPanel.Keyboard)).second)
        // The keyboard's own hide key: nothing under the capsule — unless a panel shows.
        assertEquals(PanelState(), PanelMachine.keyboardHidden(PanelState(ComposerPanel.Keyboard)))
        assertEquals(ComposerPanel.Stickers, PanelMachine.keyboardHidden(PanelState(ComposerPanel.Stickers)).panel)
        // ＋ then ☺: one panel for the other.
        assertEquals(ComposerPanel.Stickers, PanelMachine.stickerButton(PanelState(ComposerPanel.Attach)).panel)
        assertEquals(PanelState(ComposerPanel.Keyboard, holding = true), PanelMachine.attachButton(PanelState(ComposerPanel.Attach)))
    }

    @Test fun theSegmentGrowsTheStickerPanelOnlyWithNothingToSend() {
        val open = PanelState(ComposerPanel.Stickers)
        assertEquals(SegmentRole.Expand, PanelMachine.segment(open, hasSomethingToSend = false))
        assertEquals(SegmentRole.Send, PanelMachine.segment(open, hasSomethingToSend = true))
        val grown = PanelMachine.setExpanded(open, true)
        assertEquals(SegmentRole.Collapse, PanelMachine.segment(grown, false))
        assertEquals(SegmentRole.Send, PanelMachine.segment(PanelState(ComposerPanel.Attach), false))
        assertEquals(SegmentRole.Send, PanelMachine.segment(PanelState(ComposerPanel.Keyboard), false))
        // Only an open panel grows.
        assertFalse(PanelMachine.setExpanded(PanelState(ComposerPanel.Keyboard), true).expanded)
    }

    private class Prefs : KeyboardHeights.Storage {
        val values = HashMap<String, Float>()
        override fun read(key: String): Float? = values[key]
        override fun write(key: String, value: Float) {
            values[key] = value
        }
    }

    @Test fun theKeyboardsHeightIsRememberedPerOrientationWithAFallbackAndCaps() {
        val prefs = Prefs()
        val heights = KeyboardHeights(prefs)
        assertEquals(300f, heights.panelHeight(landscape = false, windowHeight = 800f))
        heights.note(landscape = false, height = 336f)
        // A floating or hardware keyboard is no measure.
        heights.note(landscape = false, height = 40f)
        assertEquals(336f, KeyboardHeights(prefs).panelHeight(false, 800f))
        // On its side a phone keeps it low; never more than 60 % of the window.
        heights.note(landscape = true, height = 260f)
        assertEquals(200f, heights.panelHeight(true, 400f))
        assertEquals(240f, heights.panelHeight(true, 400f, phone = false), 0.01f)
        assertEquals(300f, KeyboardHeights(Prefs()).panelHeight(false, 900f))
    }

    @Test fun atMostThreeStickersPlayTheOneLongestPlayingStopsForANewOne() {
        val limiter = PlaybackLimiter(3)
        assertEquals(emptyList(), limiter.start("a"))
        limiter.start("b")
        limiter.start("c")
        assertEquals(listOf("a"), limiter.start("d"))
        assertEquals(listOf("b", "c", "d"), limiter.now)
        limiter.stop("c")
        assertEquals(emptyList(), limiter.start("e"))
        // Replayed: it plays again as the newest, nothing stops.
        assertEquals(emptyList(), limiter.start("b"))
        assertEquals(listOf("d", "e", "b"), limiter.now)
    }

    @Test fun picturesAreNumberedInTheOrderChosenAndCappedAtTenCountingOthers() {
        var chosen = emptyList<Long>()
        for (k in 1L..9L) chosen = PictureSelection.toggle(chosen, k).first
        assertEquals(3, PictureSelection.number(chosen, 3L))
        // A pasted picture rides too: the tenth is refused.
        val (same, refused) = PictureSelection.toggle(chosen, 10L, others = 1)
        assertTrue(refused)
        assertEquals(chosen, same)
        chosen = PictureSelection.toggle(chosen, 2L).first
        assertEquals(2, PictureSelection.number(chosen, 3L))
        assertNull(PictureSelection.number(chosen, 2L))
        assertEquals(4, PictureSelection.number(chosen, 3L, before = 2))
    }

    private data class Photo(val id: Long)

    @Test fun theGalleryIsReadAPageAtATimeAndItsFirstPageReadAgainKeepsTheRest() = runBlocking {
        var library = (1L..300L).reversed().map(::Photo)
        val asked = ArrayList<Pair<Int, Int>>()
        val pager = GalleryPager(120, keyOf = Photo::id) { offset, limit ->
            asked += offset to limit
            library.drop(offset).take(limit)
        }
        assertFalse(pager.loaded)
        pager.loadMore()
        assertEquals(120, pager.items.size)
        assertEquals(300L, pager.items.first().id)
        pager.loadMore()
        pager.loadMore()
        assertEquals(300, pager.items.size)
        assertTrue(pager.end)
        assertEquals(listOf(0 to 120, 120 to 120, 240 to 120), asked)
        // Two pictures taken, one deleted from the first page: it leads with the new ones, and nothing read before is lost.
        library = listOf(Photo(302), Photo(301)) + library.filter { it.id != 299L }
        pager.refreshHead()
        assertEquals(listOf(302L, 301L, 300L, 298L), pager.items.take(4).map { it.id })
        assertEquals(301, pager.items.size)
        assertEquals(pager.items.map { it.id }.distinct(), pager.items.map { it.id })
        assertFalse(pager.items.any { it.id == 299L })
    }
}
