package com.resonance.app.ui

import android.graphics.Region
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.unit.dp
import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.TopBarRow
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Round 17 review D2: a message held in the thread pane beside the conversations dims the thread from the rule
 * between the panes, not from the pane's own edge 12 past it — no undimmed strip between the rule and the scrim.
 * Beside the pane the scrim starts at the pane bar's line (the bar, the conversations and the rule stay sharp) and
 * its edge is the rule's own wave, so it meets the line wherever the wave swings.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PaneScrimTest {
    private val d = 2f
    private val status = 24.dp
    private val header = TopBarRow + HeaderEdgeHeight
    /** The thread pane's frame: 800 × 700 dp. */
    private val pane = Size(800f * d, 700f * d)
    private val region = Region().apply {
        setPath(PaneScrimEdge(status, header).region(pane, d).asAndroidPath(), Region(-200, -200, 2000, 2000))
    }

    /** Whether the scrim covers the point ([x], [y]) dp of the pane's frame. */
    private fun dims(x: Float, y: Float) = region.contains((x * d).roundToInt(), (y * d).roundToInt())

    /** The pane bar's line in the pane's frame: the rule's junction, less the header's row the pane starts under. */
    private val line = paneRuleGeometry(status.value, pane.height / d + header.value).junction - header.value

    @Test fun thePaneItselfIsDimmedToItsTopForItsBarsPaperLiesOverIt() {
        assertTrue(dims(400f, 300f))
        assertTrue(dims(1f, 1f))
        assertTrue(dims(799f, 699f))
    }

    @Test fun besideThePaneTheScrimReachesBackToTheRuleFromTheBarsLineDown() {
        // Halfway between the rule (12 back from the pane) and the pane: dimmed under the bar's line, not over it.
        assertTrue(dims(-6f, line + 4f))
        assertTrue(dims(-6f, 690f))
        assertFalse(dims(-6f, line - 4f))
        // Past the rule's farthest swing: the conversations' side stays sharp.
        assertFalse(dims(-15f, 400f))
    }

    @Test fun itsEdgeIsTheRulesWaveLeavingNoStrip() {
        var y = line + 1f
        while (y < 699f) {
            // The first dimmed point from the conversations' side: on the rule, within its wave (2 either way).
            val first = generateSequence(-16f) { it + 0.25f }.takeWhile { it <= 0f }.first { dims(it, y) }
            assertTrue("y $y: the scrim starts at $first", abs(first + 12f) <= 2.25f)
            // And from there to the pane it is all dimmed: no strip.
            assertTrue("y $y: a strip", generateSequence(first + 0.5f) { it + 0.5f }.takeWhile { it < 0f }.all { dims(it, y) })
            y += 7f
        }
    }
}
