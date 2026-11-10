package com.resonance.design

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.click
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.Strings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.io.File

/**
 * The composer's foot (round 10 §3, round 23 §2): the capsule's pen darker when written in but never another
 * colour; what rides with the message as rows inside the capsule — 44 tall, the mark over ＋, the words where the
 * field's start, a reply's media before them, the ✕ a 44 square over Send, one line of 36 in a short window; why the
 * last one didn't go with no ✕; and the paper behind it all, whose 12 of fade let a tap through to the thread while its
 * solid part takes it.
 */
@RunWith(RobolectricTestRunner::class)
class ComposerFootTest {
    @get:Rule val compose = createComposeRule()

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
    }

    @Test fun focusDarkensThePenWithoutChangingItsColour() = composed {
        assertEquals(Tokens.FieldBorder, composerPen(focused = false, Light))
        assertEquals(Tokens.FieldBorderHover, composerPen(focused = true, Light))
        assertNotEquals(Tokens.Terracotta, composerPen(focused = true, Light))
    }

    @Test fun aRowIs44ItsMarkOverPlusItsWordsWhereTheFieldsStartItsCloseOverSend() {
        var closed = 0
        var tapped = 0
        compose.setContent {
            Box(Modifier.width(360.dp)) {
                ComposerRow(
                    "回覆 bob", "那篇雨後散步寫得好好", "取消回覆", { closed++ }, Modifier.testTag("row"), onTap = { tapped++ },
                ) { ComposerReplyMark(Modifier.testTag("mark")) }
            }
        }
        val row = compose.onNodeWithTag("row").assertHeightIsEqualTo(ComposerRowHeight).getBoundsInRoot()
        // The mark — the reply arrow, 20 (round 24: no longer the wavy rule) — centred in ＋'s 48 column and in the row.
        val mark = compose.onNodeWithTag("mark", useUnmergedTree = true).getBoundsInRoot()
        assertEquals((row.left + ComposerLeadColumn / 2).value, ((mark.left + mark.right) / 2).value, 0.5f)
        assertEquals(((row.top + row.bottom) / 2).value, ((mark.top + mark.bottom) / 2).value, 0.5f)
        assertEquals(20f, (mark.right - mark.left).value, 0.5f)
        assertEquals(20f, (mark.bottom - mark.top).value, 0.5f)
        // The words start where the field's do: past ＋'s column.
        val label = compose.onNodeWithText("回覆 bob").getBoundsInRoot()
        assertEquals((row.left + ComposerLeadColumn).value, label.left.value, 0.5f)
        val close = compose.onNodeWithContentDescription("取消回覆").assertWidthIsEqualTo(44.dp).assertHeightIsEqualTo(44.dp)
        // Centred in Send's 52 column: 4 in from the row's end (52 / 2 = 4 + 44 / 2).
        assertEquals((row.right - 4.dp).value, close.getBoundsInRoot().right.value, 0.5f)
        close.performClick()
        compose.onNodeWithText("回覆 bob").performClick()
        compose.runOnIdle { assertEquals(1, closed); assertEquals(1, tapped) }
    }

    @Test fun aLabelAloneIsCentredInA44RowAndAShortWindowsRowIsOneLineOf36() {
        compose.setContent {
            Column(Modifier.width(360.dp)) {
                ComposerRow("小紙條", null, "移除小紙條", {}, Modifier.testTag("row")) { ComposerTile(IconName.Note) }
                ComposerRow("卡片", "寫給十年前的自己", "移除卡片", {}, Modifier.testTag("short"), short = true) { ComposerTile(IconName.Cards) }
            }
        }
        val row = compose.onNodeWithTag("row").assertHeightIsEqualTo(ComposerRowHeight).getBoundsInRoot()
        val label = compose.onNodeWithText("小紙條").getBoundsInRoot()
        assertEquals(((row.top + row.bottom) / 2).value, ((label.top + label.bottom) / 2).value, 1f)
        compose.onNodeWithTag("short").assertHeightIsEqualTo(ComposerShortRowHeight)
        // Label · detail on one line.
        compose.onNodeWithText("卡片 · 寫給十年前的自己").assertExists()
        // The card's or note's tile 36 in ＋'s 48 (6 clear each side, as iOS's 32 in its 44), as large as a reply's media;
        // a short window's 8 less than its row, as iOS's (round 24, the owner: 「卡片的圖片…可不可以顯示再大一點點呢」).
        assertEquals(36.dp, ComposerLeadSize)
        assertEquals(ComposerLeadColumn - 12.dp, ComposerLeadSize)
        assertEquals(36.dp, ComposerMediaSize)
        assertEquals(28.dp, ComposerShortLeadSize)
        // A reply's arrow: 20, a short window's one-line row 18.
        assertEquals(20.dp, ComposerReplyMarkSize)
        assertEquals(18.dp, ComposerShortReplyMarkSize)
    }

    @Test fun aRepliesMediaStandsAtTheWordsStartAndTheWordsAfterIt() {
        compose.setContent {
            Box(Modifier.width(360.dp)) {
                ComposerRow(
                    "回覆 bob", null, "取消回覆", {}, Modifier.testTag("row"),
                    media = { Box(Modifier.fillMaxSize().testTag("media")) },
                ) { ComposerReplyMark() }
            }
        }
        val row = compose.onNodeWithTag("row").getBoundsInRoot()
        val media = compose.onNodeWithTag("media", useUnmergedTree = true).getBoundsInRoot()
        assertEquals((row.left + ComposerLeadColumn).value, media.left.value, 0.5f)
        assertEquals(ComposerMediaSize.value, (media.right - media.left).value, 0.5f)
        val label = compose.onNodeWithText("回覆 bob").getBoundsInRoot()
        assertEquals((media.right + 8.dp).value, label.left.value, 0.5f)
    }

    @Test fun theErrorRowIsAtLeast32WithNoClose() {
        compose.setContent {
            Box(Modifier.width(360.dp)) { ComposerErrorRow("沒有送出，再試一次", Modifier.testTag("error")) }
        }
        compose.onNodeWithTag("error").assertHeightIsAtLeast(ComposerErrorRowHeight)
        val words = compose.onNodeWithText("沒有送出，再試一次").getBoundsInRoot()
        assertEquals(ComposerLeadColumn.value, words.left.value, 0.5f)
    }

    @Test fun theFadeLetsATapThroughAndTheSolidPaperTakesIt() {
        var taps = 0
        var paperTaps = 0
        compose.setContent {
            Box(Modifier.size(360.dp, 200.dp)) {
                // The thread under the foot.
                Box(Modifier.fillMaxSize().testTag("thread").clickable { taps++ })
                Column(Modifier.fillMaxSize()) {
                    Box(Modifier.height(100.dp))
                    ComposerBacking(Modifier.height(100.dp).width(360.dp).testTag("backing"), onTap = { paperTaps++ })
                }
            }
        }
        // In the fade (the backing's top 12, round 11 §3): through to the thread.
        compose.onNodeWithTag("backing", useUnmergedTree = true).performTouchInput { click(Offset(centerX, 6.dp.toPx())) }
        compose.runOnIdle { assertEquals(1, taps); assertEquals(0, paperTaps) }
        // On the solid paper from 12 down: taken — the thread never hears of it — and a tap on the blank (the keyboard goes).
        compose.onNodeWithTag("backing", useUnmergedTree = true).performTouchInput { click(Offset(centerX, 16.dp.toPx())) }
        compose.runOnIdle { assertEquals(1, taps); assertEquals(1, paperTaps) }
        // A drag over the paper is taken too, but is no tap.
        compose.onNodeWithTag("backing", useUnmergedTree = true).performTouchInput { swipeUp(startY = 90.dp.toPx(), endY = 30.dp.toPx()) }
        compose.runOnIdle { assertEquals(1, taps); assertEquals(1, paperTaps) }
        // Over the foot altogether: the thread as ever.
        compose.onNodeWithTag("thread").performTouchInput { click(Offset(centerX, 50.dp.toPx())) }
        compose.runOnIdle { assertEquals(2, taps) }
        assertEquals(12.dp, ComposerFade)
    }
}
