package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.graphics.Region
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.ComposerHeight
import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.LocalWindowLayout
import com.resonance.design.TopBarRow
import com.resonance.design.WindowLayout
import com.resonance.design.generated.Tokens
import com.resonance.design.readableColumn
import com.resonance.geometry.PathCommand
import com.resonance.geometry.wavyVertical
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
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
import org.robolectric.annotation.GraphicsMode

/**
 * The composer's panels on a tablet (round 24 part 3, the owner's: 「只留最底下的那個漸層，就像普通的輸入的模式下這樣子」,
 * and the line over the pictures 「沒有接在這個兩側」). §B: in a pane the capsule doesn't fill, a panel in the keyboard's
 * place leaves the thread showing beside the capsule as the keyboard does — the fade over the capsule's part of the foot
 * ending where the panel begins, the panel's paper across the pane from there. §C2: the attach panel's top pen line runs
 * across the whole pane, back to the rule between the panes beside the conversations (meeting its wave), while the
 * pictures, the cards and the floating bar keep to the column. Drawn for real and read back pixel by pixel.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = Application::class, qualifiers = "w1100dp-h900dp-xxhdpi")
class WidePanelFootTest {
    private val compose = createComposeRule()

    @get:Rule val rules: RuleChain = RuleChain.outerRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                val app = RuntimeEnvironment.getApplication()
                shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
                Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
                base.evaluate()
            }
        }
    }.around(compose)

    // §B ---------------------------------------------------------------------------------------------------------------

    @Test fun aWidePaneKeepsTheThreadBesideTheCapsuleWhateverLiesUnderIt() {
        // At its widest the thread shows beside the capsule: the fade over the capsule's part alone — the capsule and its 8.
        val wide = threadWideFoot(phone = false, footWidth = 900.dp, capsule = ComposerHeight)
        assertNotNull(wide)
        assertEquals(ComposerHeight + ComposerGap, wide!!.footHeight)
        assertEquals(ComposerHeight / 2, wide.columnTop)
        // A pane the capsule fills, and a phone: the paper across it.
        assertNull(threadWideFoot(phone = false, footWidth = 720.dp, capsule = ComposerHeight))
        assertNull(threadWideFoot(phone = true, footWidth = 900.dp, capsule = ComposerHeight))
    }

    @Test fun withAPanelOpenAWidePaneShowsTheThreadBesideTheCapsuleAndThePanelsPaperAcrossThePane() {
        val drawn = drawFoot(phone = false, width = 900.dp)
        val footTop = Screen - Panel - ComposerHeight - ComposerGap
        // Beside the capsule, over its part's last 28: the thread (as with the keyboard up), on either side.
        assertThread(drawn, 30.dp, footTop + 14.dp, "beside the capsule at its start")
        assertThread(drawn, 870.dp, footTop + 14.dp, "beside the capsule at its end")
        // Under the capsule's middle: its column of paper.
        assertCream(drawn, 450.dp, footTop + ComposerHeight / 2 + 6.dp, "the column under the capsule")
        // From the panel's top down: its paper, across the whole pane, to the foot.
        for (x in listOf(1.dp, 450.dp, 898.dp)) {
            assertCream(drawn, x, Screen - Panel + 2.dp, "the panel's top at $x")
            assertCream(drawn, x, Screen - 2.dp, "the panel's foot at $x")
        }
        // The fade ends where the panel begins: nearly the paper just over it, still the thread at the fade's top.
        assertTrue("the fade's foot", distance(drawn.at(30.dp, Screen - Panel - 1.dp), drawn.cream) < 0.12f)
        assertThread(drawn, 30.dp, Screen - Panel - 27.dp, "the fade's top")
    }

    @Test fun aPhonesFootKeepsThePaperAcrossItWithAPanelOpen() = assertPaperAcross(phone = true, width = 400.dp)

    @Test fun aPaneTheCapsuleFillsKeepsThePaperAcrossItWithAPanelOpen() = assertPaperAcross(phone = false, width = 700.dp)

    private fun assertPaperAcross(phone: Boolean, width: Dp) {
        val drawn = drawFoot(phone, width)
        val footTop = Screen - Panel - ComposerHeight - ComposerGap
        // Past the 12 of fade at the foot's top: the paper beside the capsule, and the panel's.
        assertCream(drawn, 6.dp, footTop + 20.dp, "beside the capsule")
        assertCream(drawn, 6.dp, Screen - Panel + 2.dp, "the panel")
    }

    // §C2 --------------------------------------------------------------------------------------------------------------

    @Test fun theAttachPanelsPenLineRunsAcrossThePaneWhileWhatItShowsKeepsToTheColumn() {
        val drawn = drawAttach(pane = 1000.dp)
        val grip = compose.onNodeWithContentDescription(L10n.Messages.panelGrip).fetchSemanticsNode().boundsInRoot
        val content = compose.onNodeWithTag("content").fetchSemanticsNode().boundsInRoot
        val bar = compose.onNodeWithTag("bar").fetchSemanticsNode().boundsInRoot
        // The grip band from edge to edge of the pane …
        assertEquals(0f, grip.left, 1f)
        assertEquals(px(1000.dp), grip.width, 1f)
        // … the pictures in the 720 column in its middle, the floating bar in the middle of that.
        assertEquals(px(720.dp), content.width, 1f)
        assertEquals(px(140.dp), content.left, 1f)
        assertEquals(content.center.x, bar.center.x, 1f)
        // The pen line drawn at both ends of the pane, not only over the column.
        for (x in listOf(2.dp, 60.dp, 500.dp, 940.dp, 997.dp)) assertTrue("the line at $x", inked(drawn, x, grip))
    }

    @Test fun besideTheConversationsTheLineReachesBackToTheRule() {
        val lead = 12.dp
        val asked = mutableListOf<Float>()
        val drawn = drawAttach(pane = 900.dp, before = 40.dp, lineLead = PanelLineLead { y -> asked += y; px(lead) })
        val grip = compose.onNodeWithContentDescription(L10n.Messages.panelGrip).fetchSemanticsNode().boundsInRoot
        // Asked for the line's own height under the panel's top.
        assertTrue(asked.isNotEmpty())
        assertEquals(px(GripLineY), asked.last(), 0.5f)
        // Straight back across the gap, as far as asked: inked 6 before the pane, the conversations' side clear past it.
        assertTrue("the lead-in", inked(drawn, 34.dp, grip))
        assertTrue("past the lead-in", !inked(drawn, 24.dp, grip))
        assertTrue("the pane's start", inked(drawn, 41.dp, grip))
    }

    @Test fun inOnePaneTheLineStartsAtThePanesEdge() {
        val drawn = drawAttach(pane = 900.dp, before = 40.dp)
        val grip = compose.onNodeWithContentDescription(L10n.Messages.panelGrip).fetchSemanticsNode().boundsInRoot
        assertTrue("before the pane", !inked(drawn, 34.dp, grip))
        assertTrue("the pane's start", inked(drawn, 41.dp, grip))
    }

    @Test fun theRulesSwingAtAHeightIsTheCurveItDraws() {
        val from = 120f
        val to = 900f
        val h = (to - from).toDouble()
        val run = wavyVertical(h, 71.0, 2.0, max(2, (h / 34).roundToInt()))
        var x0 = 0.0
        var y0 = 0.0
        var widest = 0f
        for (c in run) {
            if (c is PathCommand.Move) { x0 = c.x; y0 = c.y; continue }
            c as PathCommand.Cubic
            for (i in 0..8) {
                val t = i / 8.0
                val u = 1 - t
                val x = u * u * u * x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x
                val y = u * u * u * y0 + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y
                val swing = paneRuleSwing(from, to, 71.0, from + y.toFloat())
                assertEquals("at ${from + y}", x.toFloat(), swing, 2e-3f)
                widest = maxOf(widest, abs(swing))
            }
            x0 = c.x
            y0 = c.y
        }
        // It does swing (within its 2), and settles on the centre past either end.
        assertTrue(widest > 0.5f && widest <= 2f)
        assertEquals(0f, paneRuleSwing(from, to, 71.0, from - 30f), 1e-6f)
        assertEquals(0f, paneRuleSwing(from, to, 71.0, to + 30f), 1e-6f)
    }

    @Test fun aLineAcrossThePaneStartsOnTheRulesWaveWhereverItCrossesIt() {
        val d = 2f
        val status = 24.dp
        val header = TopBarRow + HeaderEdgeHeight
        val pane = Size(800f * d, 700f * d)
        val edge = PaneScrimEdge(status, header)
        // The scrim's edge is the rule's centre line (PaneScrimTest): the line starts half a dp past it, at every height.
        val region = Region().apply { setPath(edge.region(pane, d).asAndroidPath(), Region(-200, -200, 2000, 2000)) }
        val line = paneRuleGeometry(status.value, pane.height / d + header.value).junction - header.value
        val leads = mutableListOf<Float>()
        var y = line + 1f
        while (y < 699f) {
            val first = generateSequence(-16f) { it + 0.25f }.takeWhile { it <= 0f }
                .first { region.contains((it * d).roundToInt(), (y * d).roundToInt()) }
            val lead = edge.lineLead(y * d, pane, d) / d
            assertEquals("y $y", first + 0.5f, -lead, 0.75f)
            leads += lead
            y += 7f
        }
        // Following the wave, not a fixed 11.5.
        assertTrue(leads.max() - leads.min() > 1f)
        assertTrue(leads.all { it in 9.5f..14.5f })
        assertEquals(PaneScrimEdge(status, header).reach, 14.dp)
    }

    // Drawing ----------------------------------------------------------------------------------------------------------

    private class Drawn(val pixels: PixelMap, val density: Float, val cream: Color) {
        fun at(x: Dp, y: Dp): Color = pixels[(x.value * density).roundToInt(), (y.value * density).roundToInt()].convert(ColorSpaces.Srgb)
    }

    private fun px(dp: Dp): Float = dp.value * compose.density.density

    /** The thread's foot over a red thread: a capsule 48 tall, a panel 300 tall in the keyboard's place. */
    private fun drawFoot(phone: Boolean, width: Dp): Drawn {
        var cream = Color.Unspecified
        compose.setContent {
            cream = Tokens.Cream
            val density = LocalDensity.current
            val panel = with(density) { Panel.roundToPx() }
            val room = remember { ComposerRoom({ panel }, density) }
            Box(Modifier.size(width, Screen).background(ThreadRed)) {
                ThreadFootFrame(
                    phone, room, keyboardPlace = { panel }, panelContent = { panel }, onPaperTap = {},
                    modifier = Modifier.align(Alignment.BottomCenter),
                    composer = { Box(Modifier.fillMaxWidth().height(ComposerHeight)) },
                ) { Box(Modifier.fillMaxSize()) }
            }
        }
        compose.waitForIdle()
        return Drawn(compose.onRoot().captureToImage().toPixelMap(), compose.density.density, cream.convert(ColorSpaces.Srgb))
    }

    /** The attach panel's frame in a tablet's pane [pane] wide, [before] into the window (the gap and the rule there). */
    private fun drawAttach(pane: Dp, before: Dp = 0.dp, lineLead: PanelLineLead? = null): Drawn {
        var cream = Color.Unspecified
        compose.setContent {
            cream = Tokens.Cream
            CompositionLocalProvider(LocalWindowLayout provides WindowLayout(pane + before)) {
                val scope = rememberCoroutineScope()
                val room = remember { PanelRoom(scope, still = true) }
                Box(Modifier.size(pane + before, 400.dp).background(Tokens.Cream)) {
                    Box(Modifier.padding(start = before).size(pane, 400.dp)) {
                        AttachPanelFrame(
                            room, onGrip = {}, column = Modifier.readableColumn(720.dp), lineLead = lineLead,
                            bar = { Box(Modifier.align(Alignment.BottomCenter).size(232.dp, 40.dp).testTag("bar")) },
                        ) { Box(Modifier.fillMaxSize().testTag("content")) }
                    }
                }
            }
        }
        compose.waitForIdle()
        return Drawn(compose.onRoot().captureToImage().toPixelMap(), compose.density.density, cream.convert(ColorSpaces.Srgb))
    }

    /** Whether the pen line inks the column at [x] (dp from the window's start) round its height in the [grip] band. */
    private fun inked(drawn: Drawn, x: Dp, grip: Rect): Boolean {
        val top = grip.top / drawn.density
        val paper = drawn.cream.luminance()
        return generateSequence(GripLineY.value - 2.5f) { it + 0.25f }.takeWhile { it <= GripLineY.value + 2.5f }
            .any { y -> drawn.at(x, (top + y).dp).luminance() < paper - 0.12f }
    }

    private fun distance(a: Color, b: Color): Float = maxOf(abs(a.red - b.red), abs(a.green - b.green), abs(a.blue - b.blue))

    private fun assertCream(drawn: Drawn, x: Dp, y: Dp, what: String) {
        val c = drawn.at(x, y)
        assertTrue("$what: $c, not the paper ${drawn.cream}", distance(c, drawn.cream) < 0.02f)
    }

    private fun assertThread(drawn: Drawn, x: Dp, y: Dp, what: String) {
        val c = drawn.at(x, y)
        assertTrue("$what: $c, not the thread", c.red > 0.9f && c.green < 0.15f && c.blue < 0.15f)
    }

    private companion object {
        val Screen = 600.dp
        val Panel = 300.dp
        val ThreadRed = Color(0xFFFF0000)
    }
}
