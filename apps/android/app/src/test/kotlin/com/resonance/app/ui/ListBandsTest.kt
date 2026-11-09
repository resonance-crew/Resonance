package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.resonance.design.LayoutClass
import com.resonance.geometry.PathCommand
import com.resonance.geometry.Pt
import com.resonance.geometry.rowBoundary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.junit.runners.model.Statement
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.math.abs

/**
 * A list's rows as bands (round 23 §4/§5): each row the paper between two hand-drawn curves it shares with its
 * neighbours, seeded by the row below — never by a place in the list —, seen only while pressed (12 %, from 80 ms
 * in, never while the list scrolls) or under a pointer (6 %); and the conversations list's phone-only frame.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class ListBandsTest {
    private val compose = createComposeRule()

    @get:Rule val rules: RuleChain = RuleChain.outerRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                val app = RuntimeEnvironment.getApplication()
                shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
                base.evaluate()
            }
        }
    }.around(compose)

    /** The points a band's path passes through, in order (each command's end point). */
    private fun ends(path: List<PathCommand>): List<Pt> = path.mapNotNull {
        when (it) {
            is PathCommand.Move -> Pt(it.x, it.y)
            is PathCommand.Line -> Pt(it.x, it.y)
            is PathCommand.Cubic -> Pt(it.x, it.y)
            else -> null
        }
    }

    @Test fun aBandTurnsAboutEveryHundredAndNeverLessThanAMenusFour() {
        assertEquals(4, ListBands.steps(390.0))
        assertEquals(4, ListBands.steps(411.0))
        assertEquals(4, ListBands.steps(449.0))
        // Math.round's half: up, as the web's.
        assertEquals(5, ListBands.steps(450.0))
        assertEquals(8, ListBands.steps(800.0))
        assertEquals(13, ListBands.steps(1280.0))
        assertEquals(4, ListBands.steps(120.0))
    }

    @Test fun theMenusBoundaryKeepsItsFourTurnsByDefault() {
        // The fixtures' rowBoundary (the menu sheets) is unchanged: 4 turns, and the padded ends.
        val menu = rowBoundary(10.0, 300.0, 7.0, 2.0, 3.0)
        assertEquals(rowBoundary(10.0, 300.0, 7.0, 2.0, 3.0, steps = 4), menu)
        assertEquals(4 + 3, menu.size)
        val wide = rowBoundary(10.0, 1280.0, 7.0, 2.0, 0.0, steps = 13)
        assertEquals(13 + 3, wide.size)
        // Flat where it meets the ends; the turns within the swing.
        assertEquals(10.0, wide[1].y, 0.0)
        assertEquals(10.0, wide[wide.size - 2].y, 0.0)
        assertTrue(wide.all { abs(it.y - 10.0) <= 2.0 + 1e-9 })
        assertTrue(wide.any { it.y != 10.0 })
    }

    @Test fun neighboursShareOneCurveSoTheBandsTileWithoutAGapOrAnOverlap() {
        val w = 411.0
        val upper = ends(ListBands.region(w, 88.0, "a", "b"))
        val lower = ends(ListBands.region(w, 72.0, "b", "c"))
        // The upper band's bottom runs back along "b"'s curve at 88; the lower band's top is that same curve at 0.
        val curve = ListBands.curve(0.0, w, "b")
        val upperBottom = upper.subList(curve.size, curve.size * 2).reversed()
        val lowerTop = lower.subList(0, curve.size)
        assertEquals(curve, lowerTop)
        upperBottom.zip(lowerTop).forEach { (u, l) ->
            assertEquals(l.x, u.x, 1e-9)
            assertEquals(l.y + 88.0, u.y, 0.011)
        }
        // A band's own top is its key's curve, which no other key draws the same.
        assertNotEquals(ListBands.curve(0.0, w, "a"), curve)
        // Within the swing of its edges, and edge to edge.
        assertTrue(upper.all { it.y >= -ListBands.Amp - 1e-9 && it.y <= 88.0 + ListBands.Amp + 1e-9 })
        assertEquals(0.0, upper.minOf { it.x }, 0.0)
        assertEquals(w, upper.maxOf { it.x }, 0.0)
    }

    @Test fun aRowArrivingOnTopMovesNoOtherCurve() {
        val before = bandsBelow(listOf("a", "b", "c"), ListBands.EndKey)
        assertEquals(listOf("b", "c", ListBands.EndKey), before)
        // A new row above them: theirs stay as they were (a curve is the lower row's, not a place in the list).
        val after = bandsBelow(listOf("z", "a", "b", "c"), ListBands.EndKey)
        assertEquals(listOf("a") + before, after)
        assertEquals(emptyList<String>(), bandsBelow(emptyList(), ListBands.EndKey))
    }

    @Test fun theBandsAreSeenOnlyPressedOrUnderAPointer() {
        assertEquals(80L, ListBands.PressDelayMs)
        assertEquals(0.12f, ListBands.PressAlpha)
        assertEquals(0.06f, ListBands.HoverAlpha)
        // The rows touch: 12 above and below their content; a title 6 from a band (its swing and 4 of bare paper).
        assertEquals(12.dp, ListBands.RowPad)
        assertEquals(6.dp, ListBands.TitleToBand)
        assertEquals(20.dp, ListBands.ContentInset)
    }

    @Test fun onlyAPhonesConversationListTakesTheBandsAndTheTwentyEdges() {
        val phone = ConversationsFrame.of(LayoutClass.Compact)
        assertTrue(phone.bands)
        // The band edge to edge, the content 20 from each side, the first row 4 under the bar's foot (its avatar at 16).
        assertEquals(0.dp, phone.start)
        assertEquals(0.dp, phone.end)
        assertEquals(20.dp, phone.start + phone.rowInset)
        assertEquals(20.dp, phone.end + phone.rowInset)
        assertEquals(4.dp, phone.headGap)
        assertEquals(16.dp, phone.headGap!! + ListBands.RowPad)
        // A tablet's and the panes': as they were — the page's 16 / 18 and the pane's 14, the tab's own gap, the blob.
        for (cls in listOf(LayoutClass.Medium, LayoutClass.Expanded)) {
            val wide = ConversationsFrame.of(cls)
            assertFalse(wide.bands)
            assertEquals(30.dp, wide.start + wide.rowInset)
            assertEquals(32.dp, wide.end + wide.rowInset)
            assertNull(wide.headGap)
        }
    }

    private val pressed = mutableListOf<Boolean>()
    private var taps = 0

    private fun list() {
        compose.setContent {
            val state = rememberLazyListState()
            LazyColumn(Modifier.fillMaxSize().testTag("list"), state = state) {
                items(40) { i ->
                    Box(
                        Modifier.fillMaxWidth().height(72.dp).testTag("row$i")
                            .delayedPress({ state.isScrollInProgress }) { pressed += it }
                            .clickable { taps++ },
                    )
                }
            }
        }
    }

    @Test fun aHeldFingerShowsTheBandFromEightyMillisecondsAndLiftingTakesItAway() {
        list()
        compose.mainClock.autoAdvance = false
        compose.onNodeWithTag("row1").performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(64)
        assertEquals(emptyList<Boolean>(), pressed)
        compose.mainClock.advanceTimeBy(32)
        assertEquals(listOf(true), pressed)
        compose.onNodeWithTag("row1").performTouchInput { up() }
        compose.mainClock.advanceTimeBy(16)
        assertEquals(listOf(true, false), pressed)
        assertEquals(1, taps)
    }

    @Test fun aScrollStartingSoonerShowsNothing() {
        list()
        compose.mainClock.autoAdvance = false
        compose.onNodeWithTag("row2").performTouchInput {
            down(center)
            moveBy(androidx.compose.ui.geometry.Offset(0f, -60.dp.toPx()))
            moveBy(androidx.compose.ui.geometry.Offset(0f, -60.dp.toPx()))
        }
        compose.mainClock.advanceTimeBy(200)
        assertTrue("never shown while the list takes the finger", pressed.none { it })
        compose.onNodeWithTag("row2").performTouchInput { up() }
        compose.mainClock.advanceTimeBy(200)
        assertTrue(pressed.none { it })
        assertEquals(0, taps)
    }

    @Test fun aQuickTapStillShowsTheBandForAMoment() {
        list()
        compose.mainClock.autoAdvance = false
        compose.onNodeWithTag("row3").performTouchInput {
            down(center)
            advanceEventTime(30)
            up()
        }
        compose.mainClock.advanceTimeBy(16)
        assertEquals(listOf(true), pressed)
        compose.mainClock.advanceTimeBy(96)
        assertEquals(listOf(true, false), pressed)
        assertEquals(1, taps)
    }
}
