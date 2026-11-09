package com.resonance.app.ui

import androidx.compose.ui.input.key.KeyEvent
import com.resonance.kit.chat.ChatSticker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import android.view.KeyEvent as NativeKey

/**
 * Round 23's composer and sticker picker rules that aren't drawing: Send is the bottom-end block whenever anything
 * rides, ⤢ still only from the third line; Escape lets a reply go unless a panel is open; a grown capsule beside the
 * conversations at most 60 % of the pane; one tap sends a sticker, a second on the same one within 600 ms doesn't;
 * the 🕘 recents hold still while the panel shows; the picker's cells breathe — at most their limit at once, in
 * reading order, one start at a time, none while scrolling, resting after each play.
 */
@RunWith(RobolectricTestRunner::class)
class RoundTwentyThreeTest {
    // §2

    @Test fun anythingRidingMakesSendTheBlockButNeverBringsTheGrowToolSooner() {
        // Nothing riding, one line: the full-height segment.
        assertFalse(composerTools("", 1, expanded = false, riding = false).block)
        // A reply, a card, pictures or an error riding: the bottom-end block from the first line (the owner's).
        assertEquals(ComposerTools(sticker = true, block = true, expand = false, collapse = false), composerTools("", 1, expanded = false, riding = true))
        assertEquals(ComposerTools(sticker = false, block = true, expand = false, collapse = false), composerTools("a\nb", 2, expanded = false, riding = true))
        // ⤢ from the third line, riding or not.
        assertTrue(composerTools("a\nb\nc", 3, expanded = false, riding = true).expand)
        assertFalse(composerTools("a", 1, expanded = false, riding = true).expand)
        // ☺ only without words, riding or not.
        assertFalse(composerTools("嗨", 1, expanded = false, riding = true).sticker)
    }

    private fun key(code: Int, action: Int = NativeKey.ACTION_DOWN) = KeyEvent(NativeKey(action, code))

    @Test fun escapeLetsTheReplyGoUnlessAPanelIsOpen() {
        assertTrue(cancelsReply(key(NativeKey.KEYCODE_ESCAPE), replying = true, panelOpen = false))
        assertFalse(cancelsReply(key(NativeKey.KEYCODE_ESCAPE), replying = true, panelOpen = true))
        assertFalse(cancelsReply(key(NativeKey.KEYCODE_ESCAPE), replying = false, panelOpen = false))
        assertFalse(cancelsReply(key(NativeKey.KEYCODE_ESCAPE, NativeKey.ACTION_UP), replying = true, panelOpen = false))
        assertFalse(cancelsReply(key(NativeKey.KEYCODE_A), replying = true, panelOpen = false))
    }

    @Test fun aGrownCapsuleBesideTheConversationsTakesAtMost60PercentOfThePane() {
        // A phone: all that is free under the reserve.
        assertEquals(1500, expandedCapsule(1500, 2000, phone = true))
        // A tablet's pane: the whole capsule (rows and text) at most 60 %.
        assertEquals(1200, expandedCapsule(1500, 2000, phone = false))
        assertEquals(900, expandedCapsule(900, 2000, phone = false))
    }

    // §3

    @Test fun oneTapSendsAndASecondOnTheSameStickerWithin600msDoesNot() {
        var t = 0L
        val guard = StickerTapGuard(now = { t })
        val thanks = ChatSticker("twine", "thanks")
        val hi = ChatSticker("pip", "hi")
        assertTrue(guard.take(thanks))
        t = 300
        // The old habit: tapping twice.
        assertFalse(guard.take(thanks))
        // Another sticker goes at once.
        assertTrue(guard.take(hi))
        t = 500
        assertTrue(guard.take(thanks))
        t = 1_200
        // Past 600 ms the same sticker goes again.
        assertTrue(guard.take(thanks))
    }

    @Test fun theRecentsHoldStillWhileThePanelShowsAndMoveOnItsNextOpening() {
        val recents = FrozenWhileOpen<List<String>>()
        assertEquals(listOf("a"), recents.shown(false, listOf("a")))
        // Opened: as it was then.
        assertEquals(listOf("a"), recents.shown(true, listOf("a")))
        // A sticker sent meanwhile is kept at once, but the row doesn't move under the finger.
        assertEquals(listOf("a"), recents.shown(true, listOf("b", "a")))
        // Closed, then opened again: the new order.
        assertEquals(listOf("b", "a"), recents.shown(false, listOf("b", "a")))
        assertEquals(listOf("b", "a"), recents.shown(true, listOf("b", "a")))
    }

    @Test fun thePickersCellsBreatheWithinTheirLimitInReadingOrderOneStartAtATime() {
        var t = 0L
        val breath = PickerBreath(max = 3, now = { t }, rest = { 2_000L })
        val cells = (1..6).map { "c$it" }
        // One start a step, 80 ms apart: a ripple, not a screenful in one frame.
        breath.step(cells, scrolling = false)
        assertEquals(listOf("c1"), breath.playing.toList())
        breath.step(cells, scrolling = false)
        assertEquals(listOf("c1"), breath.playing.toList())
        t += PickerBreath.STAGGER_MILLIS
        breath.step(cells, scrolling = false)
        t += PickerBreath.STAGGER_MILLIS
        breath.step(cells, scrolling = false)
        assertEquals(listOf("c1", "c2", "c3"), breath.playing.toList())
        // At its limit: no more, however long.
        t += 1_000
        breath.step(cells, scrolling = false)
        assertEquals(3, breath.playing.size)
        // A play runs out: its turn goes to the next waiting in reading order, and it rests.
        breath.ended("c1")
        breath.step(cells, scrolling = false)
        assertEquals(listOf("c2", "c3", "c4"), breath.playing.toList())
        breath.ended("c2")
        breath.ended("c3")
        t += PickerBreath.STAGGER_MILLIS
        breath.step(cells, scrolling = false)
        t += PickerBreath.STAGGER_MILLIS
        breath.step(cells, scrolling = false)
        // c1 still rests (2 s from its end): c5 and c6 come first.
        assertEquals(listOf("c4", "c5", "c6"), breath.playing.toList())
        breath.ended("c4")
        t += 2_000
        breath.step(cells, scrolling = false)
        assertTrue("c1" in breath.playing)
    }

    @Test fun noCellStartsWhileTheGridScrollsAndACellOutOfViewStops() {
        var t = 0L
        val breath = PickerBreath(max = 8, now = { t })
        breath.step(listOf("a", "b"), scrolling = true)
        assertTrue(breath.playing.isEmpty())
        breath.step(listOf("a", "b"), scrolling = false)
        assertEquals(listOf("a"), breath.playing.toList())
        // Scrolled away from a: it stops at once (and its end, if one comes, ends nothing).
        t += 1_000
        breath.step(listOf("b", "c"), scrolling = true)
        assertTrue(breath.playing.isEmpty())
        breath.ended("a")
        breath.step(listOf("b", "c"), scrolling = false)
        assertEquals(listOf("b"), breath.playing.toList())
    }

    @Test fun aCellPlaysOnlyWhenAtLeast60PercentInView() {
        assertTrue(inViewEnough(100, 60))
        assertFalse(inViewEnough(100, 59))
        assertFalse(inViewEnough(0, 0))
        // A phone's eight at once, a tablet's twelve.
        assertEquals(8, PICKER_PLAYING_PHONE)
        assertEquals(12, PICKER_PLAYING_WIDE)
    }

    @Test fun theGridsMeasuresAreOneRule() {
        assertEquals(8f, StickerGridInset.value)
        assertEquals(4f, StickerGridGap.value)
        assertEquals(2f, StickerCellInset.value)
        // A 411 phone's four columns: (411 − 16 − 12) / 4 a cell, its art 4 less.
        val cell = (411f - StickerGridInset.value * 2 - StickerGridGap.value * 3) / 4
        assertEquals(95.75f, cell, 0.01f)
        assertEquals(91.75f, cell - StickerCellInset.value * 2, 0.01f)
    }
}
