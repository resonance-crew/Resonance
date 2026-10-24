package com.resonance.design

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The card page's actions are one row on a phone (SegmentedActionBar.tsx): the bar spans its
 * column and its segments share it evenly; when every label no longer fits, the bookmark (step 1)
 * shows its glyph alone and takes only its own room, then the note (step 2), so only the verb keeps
 * its words — and past that the bar still never runs wider than its room (round 9 §3).
 */
class SegmentedLayoutTest {
    private val icons = listOf(true, true, true)
    /** 共振 never gives up its words, the note at step 2, the bookmark at step 1. */
    private val collapse = listOf(0, 2, 1)
    /** Each segment's own width on a phone: 2×8 + 16 + 6 + its words, and a dp to spare. */
    private fun own(label: Float) = label + 39f

    @Test fun onAPhoneTheSegmentsShareTheRowEvenly() {
        // 共振 | 寄小紙條 | 收藏 at 14: short words, room to spare.
        val labels = listOf(28f, 56f, 28f)
        assertFalse(SegmentedLayout.collapses(labels, icons, collapse, 370f, spread = true))
        assertEquals(listOf(370f / 3, 370f / 3, 370f / 3), SegmentedLayout.widths(labels, icons, collapse, 370f, spread = true))
    }

    @Test fun withNoRoomForEveryLabelTheBookmarkIsItsGlyphAlone() {
        // Resonate | Send a note | Remove bookmark.
        val labels = listOf(64f, 76f, 112f)
        val need = labels.sumOf { own(it).toDouble() }.toFloat()
        assertEquals(1, SegmentedLayout.steps(labels, icons, collapse, need - 1f, spread = true))
        val widths = SegmentedLayout.widths(labels, icons, collapse, 320f, spread = true)
        assertEquals(SegmentedLayout.ICON_ONLY, widths[2])
        assertEquals((320f - SegmentedLayout.ICON_ONLY) / 2, widths[0])
        assertEquals(widths[0], widths[1])
        // Every label that fits keeps its words.
        assertFalse(SegmentedLayout.collapses(labels, icons, collapse, need, spread = true))
    }

    @Test fun aSegmentIsNeverSharedNarrowerThanItsWords() {
        // At 276: the glyph alone 48, and 228 left for Resonate (103) and Send a note (115): the note keeps
        // its words whole, Resonate takes the rest — not 114 each, which would cut "Send a note".
        val labels = listOf(64f, 76f, 66f)
        val widths = SegmentedLayout.widths(labels, icons, collapse, 276f, spread = true)
        assertEquals(1, SegmentedLayout.steps(labels, icons, collapse, 276f, spread = true))
        assertEquals(SegmentedLayout.ICON_ONLY, widths[2])
        assertEquals(own(76f), widths[1])
        assertEquals(276f - SegmentedLayout.ICON_ONLY - own(76f), widths[0])
    }

    @Test fun stillNoRoomTheNoteIsItsGlyphAloneTooAndOnlyTheVerbKeepsItsWords() {
        // 320 wide, English at the 1.25× cap (the critique's case): "Resonated" 80, "Send a note" 95,
        // the bookmark's glyph alone — 119 + 134 + 48 = 301 > 280 of a bar inside its page's margins.
        val labels = listOf(80f, 95f, 140f)
        val room = 280f
        assertEquals(2, SegmentedLayout.steps(labels, icons, collapse, room, spread = true))
        val widths = SegmentedLayout.widths(labels, icons, collapse, room, spread = true)
        assertEquals(SegmentedLayout.ICON_ONLY, widths[1])
        assertEquals(SegmentedLayout.ICON_ONLY, widths[2])
        assertEquals(room - 2 * SegmentedLayout.ICON_ONLY, widths[0])
        assertTrue(widths.sum() <= room + 0.01f)
    }

    @Test fun pastTheLastStepTheBarNeverRunsWiderThanItsRoom() {
        // A verb whose words alone are wider than what the two glyphs leave: it takes the rest, cut.
        val labels = listOf(260f, 95f, 140f)
        val room = 280f
        val widths = SegmentedLayout.widths(labels, icons, collapse, room, spread = true)
        assertEquals(2, SegmentedLayout.steps(labels, icons, collapse, room, spread = true))
        assertEquals(room - 2 * SegmentedLayout.ICON_ONLY, widths[0], 0.01f)
        assertTrue(widths.sum() <= room + 0.01f)
        // Two segments with words, both too wide: the narrower keeps its own, the wider the rest.
        val two = SegmentedLayout.widths(listOf(40f, 300f), listOf(true, true), listOf(0, 0), 250f, spread = true)
        assertEquals(own(40f), two[0])
        assertEquals(250f - own(40f), two[1], 0.01f)
    }

    @Test fun widerTheBarStandsAtItsOwnWidth() {
        val labels = listOf(64f, 160f, 66f)
        val widths = SegmentedLayout.widths(labels, icons, collapse, 900f, spread = false)
        assertEquals(listOf(64f, 160f, 66f).map { it + 2 * SegmentedLayout.WIDE_PAD + SegmentedLayout.ICON + SegmentedLayout.GAP + 1f }, widths)
    }

    @Test fun aSegmentWithNoGlyphNeverGivesUpItsWords() {
        assertFalse(SegmentedLayout.alone(collapse = 1, icon = false, step = 2))
        assertTrue(SegmentedLayout.alone(collapse = 2, icon = true, step = 2))
        assertFalse(SegmentedLayout.alone(collapse = 2, icon = true, step = 1))
        assertFalse(SegmentedLayout.alone(collapse = 0, icon = true, step = 2))
    }
}
