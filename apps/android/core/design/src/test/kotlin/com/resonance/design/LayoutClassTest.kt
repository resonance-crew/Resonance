package com.resonance.design

import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The width classes (design note §8): the shared table every platform answers the same way. */
class LayoutClassTest {
    @Test fun classesFollowTheWebsBreakpoints() {
        assertEquals(LayoutClass.Compact, LayoutClass.of(390f))
        assertEquals(LayoutClass.Compact, LayoutClass.of(599f))
        assertEquals(LayoutClass.Medium, LayoutClass.of(600f))
        assertEquals(LayoutClass.Medium, LayoutClass.of(899f))
        assertEquals(LayoutClass.Expanded, LayoutClass.of(900f))
        // The tabs move into the header from medium on; they carry their labels only when expanded.
        assertFalse(LayoutClass.Compact.topTabs)
        assertTrue(LayoutClass.Medium.topTabs)
        assertTrue(LayoutClass.Expanded.topTabs)
        assertFalse(LayoutClass.Medium.tabLabels)
        assertTrue(LayoutClass.Expanded.tabLabels)
    }

    @Test fun theWriterSplitsFrom1200() {
        assertFalse(LayoutClass.writerSplit(1199f))
        assertTrue(LayoutClass.writerSplit(1200f))
    }

    @Test fun pagePaddingIsFourPercentBetween20And48() {
        assertEquals(20f, LayoutClass.pad(390f), 1e-4f)
        assertEquals(32f, LayoutClass.pad(800f), 1e-4f)
        assertEquals(48f, LayoutClass.pad(1366f), 1e-4f)
    }

    @Test fun theBorderedFeedHasTwoOrThreeColumnsOnlyWhenExpanded() {
        assertEquals(2, LayoutClass.feedColumns(LayoutClass.Expanded, 959f))
        assertEquals(3, LayoutClass.feedColumns(LayoutClass.Expanded, 960f))
        assertEquals(1, LayoutClass.feedColumns(LayoutClass.Medium, 1000f))
        assertEquals(1, LayoutClass.feedColumns(LayoutClass.Compact, 1000f))
    }

    @Test fun bubblesAre72PercentOfTheListCappedAt520() {
        assertEquals(257.76f, LayoutClass.bubbleMax(390f), 1e-3f)
        assertEquals(516.96f, LayoutClass.bubbleMax(750f), 1e-3f)
        assertEquals(520f, LayoutClass.bubbleMax(1000f), 1e-3f)
    }

    @Test fun aReadingColumnIsCentredButNeverCloserThanThePad() {
        assertEquals(32f, LayoutClass.columnInset(712f, 32f), 1e-4f)
        assertEquals(256f, LayoutClass.columnInset(1192f, 48f), 1e-4f)
    }

    @Test fun theWindowsGridFollowsItsWidth() {
        // Pixel Tablet: 800 portrait is medium (one column of bands); 1280 landscape has three columns.
        val portrait = WindowLayout(800.dp)
        assertEquals(LayoutClass.Medium, portrait.cls)
        assertEquals(1, portrait.feedColumns)
        // The 680 reading column in the middle of 800.
        assertEquals(60f, portrait.columnInset().value, 1e-4f)
        val landscape = WindowLayout(1280.dp)
        assertEquals(LayoutClass.Expanded, landscape.cls)
        assertEquals(1104f, landscape.gridWidth.value, 1e-3f)
        assertEquals(3, landscape.feedColumns)
        assertTrue(landscape.writerSplit)
        // iPad Pro 13" portrait, for the record: 1032 − 2 × 41.28 = 949 is two columns; 1376 landscape is three.
        assertEquals(2, WindowLayout(1032.dp).feedColumns)
        assertEquals(3, WindowLayout(1376.dp).feedColumns)
        // A phone has no inset column, whatever it measures.
        assertEquals(0f, WindowLayout.Phone.columnInset().value, 1e-4f)
    }

    /** The story's column (x from the content area's start to its end) and the rail's start, as reading-type §4 works them out. */
    private fun columns(width: Float): Triple<Float, Float, Float?> {
        val c = WindowLayout(width.dp).cardPage()
        return Triple(c.start.value, width - c.end.value, c.railStart?.value)
    }

    @Test fun theCardPageHasItsRailOnlyWhenExpanded() {
        // A phone: 20 a side, the column all the rest (390 − 40).
        assertEquals(CardPageColumns(20.dp, 20.dp, null), WindowLayout(390.dp).cardPage())
        // Medium (800, pad 32): the 680 measure centred — 60 a side.
        assertEquals(CardPageColumns(60.dp, 60.dp, null), WindowLayout(800.dp).cardPage())
        // Medium (640, pad 25.6): narrower than the measure, so the pad each side.
        assertEquals(25.6f, WindowLayout(640.dp).cardPage().start.value, 1e-3f)
    }

    @Test fun anExpandedCardPageCentresTheStoryAndKeepsTheRail48PastIt() {
        // 1440 (pad 48): the text from 380 to 1060, centred; the rail from 1108 (to 1368).
        val (a, b, rail) = columns(1440f)
        assertEquals(380f, a, 1e-3f)
        assertEquals(1060f, b, 1e-3f)
        assertEquals(1108f, rail!!, 1e-3f)
        assertEquals(Tokens.Measure, b - a, 1e-3f)
        assertEquals(Tokens.StoryRailGap, rail - b, 1e-3f)
        // 1392: the narrowest window that still centres it exactly (308 left over on each side of the text).
        val (c, d, _) = columns(1392f)
        assertEquals(1392f - d, c, 1e-3f)
        // 1280: the rail would no longer fit centred: the text slides to 244–924.
        val (e, f, rail2) = columns(1280f)
        assertEquals(244f, e, 1e-3f)
        assertEquals(924f, f, 1e-3f)
        assertEquals(972f, rail2!!, 1e-3f)
        // 1024 (pad 40.96): the text gives way to the rail — 41 to 675, the rail 723 to 983.
        val (g, h, rail3) = columns(1024f)
        assertEquals(40.96f, g, 1e-2f)
        assertEquals(675.04f, h, 1e-2f)
        assertEquals(723.04f, rail3!!, 1e-2f)
        assertEquals(1024f - 40.96f, rail3 + Tokens.CardRailW, 1e-2f)
        // Just expanded (900, pad 36): what is left beside the rail and its 48.
        val (i, j, _) = columns(900f)
        assertEquals(900f - 2 * 36f - Tokens.CardRailW - Tokens.StoryRailGap, j - i, 1e-2f)
    }

    @Test fun aTabletsPagesStart32UnderTheHeadersPenLineAndAPhonesKeepTheirOwn() {
        // Round 5 E2: measured from the bar's foot, its pen line 1.4 + INK above it.
        assertEquals(16f, LayoutClass.Compact.firstContentGap(16.dp).value, 0.001f)
        assertEquals(20f, LayoutClass.Compact.firstContentGap(20.dp).value, 0.001f)
        for (cls in listOf(LayoutClass.Medium, LayoutClass.Expanded)) {
            assertEquals(32f - 1.4f - Tokens.Ink.value, cls.firstContentGap(16.dp).value, 0.001f)
            assertEquals(cls.firstContentGap(16.dp), cls.firstContentGap(20.dp))
        }
        // The feed's grid (an expanded window, its list starting under the bar's wave band): 32 under the line too.
        assertEquals(HeaderEdgeHeight.value + 32f - BarLineInset.value, GridUnderBar.value, 0.001f)
    }

    @Test fun aTabletsPullIsHalfAsBigAgain() {
        assertEquals(1f, LayoutClass.Compact.pullScale())
        assertEquals(1.5f, LayoutClass.Medium.pullScale())
        assertEquals(1.5f, LayoutClass.Expanded.pullScale())
    }
}
