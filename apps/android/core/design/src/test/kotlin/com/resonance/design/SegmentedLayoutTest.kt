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

    // The publish step's four card types (2026-11-23): 公開 · 連結的人 · 匿名公開 · 私人卡 as a grid (SegmentGrid) — one
    // row while each glyph and its whole words fit an equal share, else 2×2, else one to a row; never cut or shrunk.

    @Test fun fourCardTypesStandInOneRowWhileAnEqualShareHoldsTheWidest() {
        val naturals = listOf(28f, 56f, 56f, 42f).map { SegmentGrid.natural(it, icon = true) }
        assertEquals(listOf(4, 2, 1), SegmentGrid.columnSteps(4))
        assertEquals(4, SegmentGrid.columns(4 * naturals.max(), naturals))
        assertEquals(4, SegmentGrid.columns(640f, naturals))
    }

    @Test fun onAPhoneTheyStandTwoByTwoEveryGlyphAndWordKept() {
        // English on a 360 phone (328 of room): Public · Connections · Anonymous · Private.
        val en = listOf(45f, 82f, 74f, 50f).map { SegmentGrid.natural(it, icon = true) }
        assertEquals(2, SegmentGrid.columns(328f, en))
        // Each cell, half the room, holds its glyph and words whole.
        en.forEach { assertTrue(it <= 328f / 2) }
        // 連結的人 at the owner's 1.5 text size: still 2×2, nothing smaller.
        val zh = listOf(42f, 84f, 84f, 63f).map { SegmentGrid.natural(it, icon = true) }
        assertEquals(2, SegmentGrid.columns(328f, zh))
    }

    @Test fun atTheLargestTextTheyStackOneToARow() {
        // 2× text on a 320 phone (288 of room): 連結的人 at 112 is wider than half.
        val zh = listOf(56f, 112f, 112f, 84f).map { SegmentGrid.natural(it, icon = true) }
        assertEquals(1, SegmentGrid.columns(288f, zh))
        zh.forEach { assertTrue(it <= 288f) }
    }

    @Test fun theGridsSeamsMeetAtTheCellsCorners() {
        // One row is the bar's seams, seeded seed + i·37 + 11.
        assertEquals(71.0 + 11, SegmentGrid.downSeed(71.0, 4, 0, 1), 0.0)
        assertEquals(71.0 + 37 + 11, SegmentGrid.downSeed(71.0, 4, 0, 2), 0.0)
        // 2×2: a cell's right side and its neighbour's left are one wave, and the cell below shares the seam across.
        val a = SegmentGrid.region(0, 0, 2, 2, 340f, 96f, 71.0)
        val b = SegmentGrid.region(0, 1, 2, 2, 340f, 96f, 71.0)
        val seam = SegmentGrid.down(170f, 0f, 48f, SegmentGrid.downSeed(71.0, 2, 0, 1))
        seam.forEach { assertTrue(it in a && it in b) }
        val across = SegmentGrid.across(48f, 0f, 170f, SegmentGrid.acrossSeed(71.0, 2, 1, 0))
        val below = SegmentGrid.region(1, 0, 2, 2, 340f, 96f, 71.0)
        across.forEach { assertTrue(it in a && it in below) }
        assertEquals(4, SegmentGrid.seams(2, 2, 340f, 96f, 71.0).size)
    }
}
