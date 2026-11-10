package com.resonance.design

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.kit.l10n.Strings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.io.File

/**
 * The chat composer's capsule (round 9 §4): one line is exactly 48 tall at every text size up to the
 * interface's 1.25 cap — its padding worked out from the line's real height — and only more lines make
 * it taller; Send is its end segment, named, and disabled (not faded) with nothing to send.
 */
@RunWith(RobolectricTestRunner::class)
class ComposerCapsuleTest {
    @get:Rule val compose = createComposeRule()

    private val style by lazy { composed { AppFonts.body(16f, lineHeight = 1.5f) } }

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
    }

    /** The text scale in force (what CappedTextScale hands down), on the screen's own density. */
    private var scale by mutableFloatStateOf(1f)

    private fun capsule(lines: Int = 1, canSend: Boolean = false) = compose.setContent {
        val screen = LocalDensity.current.density
        CompositionLocalProvider(LocalDensity provides Density(screen, scale)) {
            Box(Modifier.width(360.dp)) {
                ComposerCapsule(
                    canSend = canSend, sendLabel = "傳送", onSend = {}, focused = { false }, textStyle = style,
                    modifier = Modifier.testTag("capsule"),
                    leading = {},
                ) { vertical ->
                    BasicText("字\n".repeat(lines).trimEnd(), style = style, minLines = lines, modifier = Modifier.fillMaxWidth().padding(vertical = vertical))
                }
            }
        }
    }

    private fun height(): Float = compose.onNodeWithTag("capsule").getBoundsInRoot().let { (it.bottom - it.top).value }

    @Test fun oneLineIs48AtEveryTextSizeUpToTheCap() {
        capsule()
        for (s in listOf(0.85f, 1f, textScale(1.3f), textScale(2f))) {
            scale = s
            compose.waitForIdle()
            assertEquals("text scale $s", ComposerHeight.value, height(), 1f)
        }
    }

    @Test fun onlyMoreLinesMakeItTaller() {
        scale = textScale(2f)
        capsule(lines = 3)
        assertTrue(height() > ComposerHeight.value + 40f)
    }

    @Test fun thePaddingCentresTheLineAndNeverGoesNegative() {
        assertEquals(12f, composerPadding(24.dp).value, 1e-4f)
        assertEquals(9f, composerPadding(30.dp).value, 1e-4f)
        assertEquals(0f, composerPadding(60.dp).value, 1e-4f)
    }

    @Test fun sendIsDisabledNotFadedWithNothingToSend() {
        capsule(canSend = false)
        compose.onNodeWithContentDescription("傳送").assertIsNotEnabled()
    }

    @Test fun sendTakesATapWithSomethingToSend() {
        capsule(canSend = true)
        compose.onNodeWithContentDescription("傳送").assertIsEnabled()
    }

    /** The round-22 capsule: ＋ at its start, ☺ at the field's end, and (past one line) ⤢ over the send block. */
    private fun tools(lines: Int) = compose.setContent {
        Box(Modifier.width(360.dp)) {
            ComposerCapsule(
                canSend = true, sendLabel = "傳送", onSend = {}, focused = { false }, textStyle = style,
                modifier = Modifier.testTag("capsule"),
                block = lines > 1,
                overSegment = { Box(Modifier.testTag("expand").matchParentSize()) },
                trailing = { Box(Modifier.testTag("sticker").matchParentSize()) },
                leading = { Box(Modifier.testTag("attach").matchParentSize()) },
            ) { vertical ->
                BasicText("字\n".repeat(lines).trimEnd(), style = style, minLines = lines, modifier = Modifier.fillMaxWidth().padding(vertical = vertical))
            }
        }
    }

    @Test fun theCapsulesToolsAreOneSquareSizeTheStickerToggleAsTheAttachButton() {
        tools(lines = 1)
        val attach = compose.onNodeWithTag("attach").getBoundsInRoot()
        val sticker = compose.onNodeWithTag("sticker").getBoundsInRoot()
        assertEquals(ComposerHeight.value, (attach.right - attach.left).value, 0.5f)
        assertEquals(ComposerHeight.value, (attach.bottom - attach.top).value, 0.5f)
        // The owner's: ☺ the same square as ＋ (it was flatter and wider), on the same row.
        assertEquals((attach.right - attach.left).value, (sticker.right - sticker.left).value, 0.5f)
        assertEquals((attach.bottom - attach.top).value, (sticker.bottom - sticker.top).value, 0.5f)
        assertEquals(attach.top.value, sticker.top.value, 0.5f)
        // Right against Send, as ＋ is against the capsule's start.
        val capsule = compose.onNodeWithTag("capsule").getBoundsInRoot()
        assertEquals((capsule.right - ComposerSendWidth).value, sticker.right.value, 0.5f)
    }

    @Test fun pastOneLineTheGrowToolIsASquareAtTheTopOfTheSendColumn() {
        tools(lines = 3)
        val capsule = compose.onNodeWithTag("capsule").getBoundsInRoot()
        val expand = compose.onNodeWithTag("expand").getBoundsInRoot()
        assertEquals(ComposerSendWidth.value, (expand.right - expand.left).value, 0.5f)
        assertEquals(ComposerHeight.value, (expand.bottom - expand.top).value, 0.5f)
        assertEquals(capsule.top.value, expand.top.value, 0.5f)
        assertEquals(capsule.right.value, expand.right.value, 0.5f)
    }

    /** Round 23 §2: what rides inside the capsule, over the text — here one reply row, as the thread's composer lays it. */
    private fun riding(lines: Int = 1, rows: Int = 1, grow: Boolean = lines >= 3) = compose.setContent {
        Box(Modifier.width(360.dp)) {
            ComposerCapsule(
                canSend = true, sendLabel = "傳送", onSend = {}, focused = { false }, textStyle = style,
                modifier = Modifier.testTag("capsule"),
                block = true,
                overSegment = if (grow) { { Box(Modifier.testTag("expand").matchParentSize()) } } else null,
                header = {
                    androidx.compose.foundation.layout.Column(Modifier.testTag("rows").fillMaxWidth().padding(top = ComposerRowsTop)) {
                        repeat(rows) { i ->
                            ComposerRow("回覆 bob", "那篇雨後散步", "取消回覆 $i", {}) { ComposerReplyMark() }
                        }
                    }
                },
                leading = { Box(Modifier.testTag("attach").matchParentSize()) },
            ) { vertical ->
                BasicText("字\n".repeat(lines).trimEnd(), style = style, minLines = lines, modifier = Modifier.fillMaxWidth().padding(vertical = vertical))
            }
        }
    }

    @Test fun oneReplyRidingMakesTheCapsule98AndNothingStandsOverIt() {
        riding()
        // 6 under the pen line, the 44 row, the 48 text line: the foot was 124 with the row over the capsule.
        assertEquals((ComposerRowsTop + ComposerRowHeight + ComposerHeight).value, height(), 1f)
        assertEquals(98f, height(), 1f)
        val capsule = compose.onNodeWithTag("capsule").getBoundsInRoot()
        val rows = compose.onNodeWithTag("rows").getBoundsInRoot()
        assertEquals(capsule.top.value, rows.top.value, 0.5f)
        // The rows span the capsule's whole width: each ✕ over Send's column.
        assertEquals((capsule.right - capsule.left).value, (rows.right - rows.left).value, 0.5f)
        val close = compose.onNodeWithContentDescription("取消回覆 0").getBoundsInRoot()
        assertEquals((capsule.right - ComposerSendWidth / 2).value, ((close.left + close.right) / 2).value, 0.5f)
    }

    @Test fun withRowsRidingSendIsTheBottomEndBlockAndPlusStaysOnTheTextLine() {
        riding()
        val capsule = compose.onNodeWithTag("capsule").getBoundsInRoot()
        val send = compose.onNodeWithContentDescription("傳送").getBoundsInRoot()
        assertEquals(ComposerSendWidth.value, (send.right - send.left).value, 0.5f)
        assertEquals(ComposerHeight.value, (send.bottom - send.top).value, 0.5f)
        assertEquals(capsule.bottom.value, send.bottom.value, 0.5f)
        assertEquals(capsule.right.value, send.right.value, 0.5f)
        val attach = compose.onNodeWithTag("attach").getBoundsInRoot()
        assertEquals(capsule.bottom.value, attach.bottom.value, 0.5f)
    }

    @Test fun theGrowToolStandsUnderTheRowsNeverOnARowsClose() {
        riding(lines = 3, rows = 2)
        val rows = compose.onNodeWithTag("rows").getBoundsInRoot()
        val expand = compose.onNodeWithTag("expand").getBoundsInRoot()
        val capsule = compose.onNodeWithTag("capsule").getBoundsInRoot()
        // At the text's top, in Send's column: right under the rows.
        assertEquals(rows.bottom.value, expand.top.value, 0.5f)
        assertEquals(capsule.right.value, expand.right.value, 0.5f)
        val lastClose = compose.onNodeWithContentDescription("取消回覆 1").getBoundsInRoot()
        assertTrue(expand.top.value >= lastClose.bottom.value - 0.5f)
        // And clear of Send's block at the foot.
        val send = compose.onNodeWithContentDescription("傳送").getBoundsInRoot()
        assertTrue(expand.bottom.value <= send.top.value + 0.5f)
    }

    @Test fun theCapsulesFootKeepsItsWobbleAsRowsComeAndGo() {
        val segH = com.resonance.geometry.autoSegments(360.0)
        // One line is the very outline the field's wobble draws (nothing at rest changes).
        val r = 16.0
        val one = steadyCapsuleOutline(360.0, 48.0, r, 17.0)
        val options = com.resonance.geometry.WobRectOptions(
            curve = com.resonance.geometry.autoCurve(360.0, 48.0),
            segmentsH = com.resonance.geometry.SegValue.Count(segH.toDouble()),
            segmentsV = com.resonance.geometry.SegValue.Count(com.resonance.geometry.autoSegments(48.0).toDouble()),
        )
        assertEquals(com.resonance.geometry.wobRect(360.0, 48.0, r, 17.0, com.resonance.geometry.autoMag(360.0, 48.0), options), one)
        // Taller: the foot (its end corner, its turns, its start corner) is the one line's, moved down; the top is the one line's.
        fun foot(h: Double): List<List<Double>> {
            val cmds = steadyCapsuleOutline(360.0, h, r, 17.0)
            val at = 2 + segH + 1 + com.resonance.geometry.autoSegments(h)
            return cmds.subList(at, at + 1 + segH + 1).map { c ->
                (c as com.resonance.geometry.PathCommand.Cubic).let { listOf(it.x1, it.y1 - h, it.x2, it.y2 - h, it.x, it.y - h) }
            }
        }
        for (h in listOf(98.0, 48.0 + 44 + 72, 240.0)) {
            foot(48.0).zip(foot(h)).forEach { (a, b) -> a.zip(b).forEach { (x, y) -> assertEquals("height $h", x, y, 1e-9) } }
        }
        fun top(h: Double) = steadyCapsuleOutline(360.0, h, r, 17.0).take(2 + segH)
        assertEquals(top(48.0), top(98.0))
        assertEquals(top(48.0), top(240.0))
        // The sides are drawn for the real height.
        assertTrue(steadyCapsuleOutline(360.0, 98.0, r, 17.0) != one)
    }
}
