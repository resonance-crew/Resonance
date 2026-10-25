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
 * The composer's foot (round 10 §3): the capsule's pen darker when written in but never another
 * colour; what rides with the message as rows in the reply's style — 52 at least, a label alone
 * centred, the ✕ a 44 square at the row's end; and the paper behind it all, whose 24 of fade let a
 * tap through to the thread while its solid part takes it.
 */
@RunWith(RobolectricTestRunner::class)
class ComposerFootTest {
    @get:Rule val compose = createComposeRule()

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
    }

    @Test fun focusDarkensThePenWithoutChangingItsColour() {
        assertEquals(Tokens.FieldBorder, composerPen(focused = false))
        assertEquals(Tokens.FieldBorderHover, composerPen(focused = true))
        assertNotEquals(Tokens.Terracotta, composerPen(focused = true))
    }

    @Test fun aRowIsAtLeast52WithItsCloseA44SquareAtTheEnd() {
        var closed = 0
        compose.setContent {
            Box(Modifier.width(360.dp)) {
                ComposerRow("回覆 bob", "那篇雨後散步寫得好好", "取消回覆", { closed++ }, Modifier.testTag("row")) { ReplyRule(Modifier.height(32.dp)) }
            }
        }
        compose.onNodeWithTag("row").assertHeightIsAtLeast(ComposerRowHeight)
        val row = compose.onNodeWithTag("row").getBoundsInRoot()
        val close = compose.onNodeWithContentDescription("取消回覆").assertWidthIsEqualTo(44.dp).assertHeightIsEqualTo(44.dp)
        // Trailing, 4 in from the row's end: over Send's middle (52 / 2 = 4 + 44 / 2).
        assertEquals((row.right - 4.dp).value, close.getBoundsInRoot().right.value, 0.5f)
        close.performClick()
        assertEquals(1, closed)
    }

    @Test fun aLabelAloneIsCentredInA52Row() {
        compose.setContent {
            Box(Modifier.width(360.dp)) {
                ComposerRow("圖片", null, "移除圖片", {}, Modifier.testTag("row")) { ComposerTile(IconName.Image) }
            }
        }
        val row = compose.onNodeWithTag("row").assertHeightIsEqualTo(ComposerRowHeight).getBoundsInRoot()
        val label = compose.onNodeWithText("圖片").getBoundsInRoot()
        assertEquals(((row.top + row.bottom) / 2).value, ((label.top + label.bottom) / 2).value, 1f)
    }

    @Test fun theFadeLetsATapThroughAndTheSolidPaperTakesIt() {
        var taps = 0
        compose.setContent {
            Box(Modifier.size(360.dp, 200.dp)) {
                // The thread under the foot.
                Box(Modifier.fillMaxSize().testTag("thread").clickable { taps++ })
                Column(Modifier.fillMaxSize()) {
                    Box(Modifier.height(100.dp))
                    ComposerBacking(Modifier.height(100.dp).width(360.dp).testTag("backing"))
                }
            }
        }
        // In the fade (the backing's top 24): through to the thread.
        compose.onNodeWithTag("backing", useUnmergedTree = true).performTouchInput { click(Offset(centerX, 12.dp.toPx())) }
        compose.runOnIdle { assertEquals(1, taps) }
        // On the solid paper: taken, the thread never hears of it.
        compose.onNodeWithTag("backing", useUnmergedTree = true).performTouchInput { click(Offset(centerX, 70.dp.toPx())) }
        compose.runOnIdle { assertEquals(1, taps) }
        // Over the foot altogether: the thread as ever.
        compose.onNodeWithTag("thread").performTouchInput { click(Offset(centerX, 50.dp.toPx())) }
        compose.runOnIdle { assertEquals(2, taps) }
        assertEquals(24.dp, ComposerFade)
    }
}
