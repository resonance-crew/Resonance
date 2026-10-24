package com.resonance.design

import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import com.resonance.design.generated.IconName
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * The organic menu opened from a trigger of the caller's own (the writer's 更換封面 on a cover, the
 * composer's ＋): its panel hangs under the trigger, or over it for one at the foot of the screen —
 * on the other side when there is no room, and inside the window either way — lined up with the
 * trigger's trailing edge, or its leading one. A row that can't be chosen now (生成圖片 with no
 * story) keeps its place, faded, and takes no tap; TalkBack hears it as unavailable.
 */
@RunWith(RobolectricTestRunner::class)
class OrganicMenuTest {
    @get:Rule val compose = createComposeRule()

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
    }

    @Test fun aRowThatCantBeChosenNowTakesNoTap() {
        val chosen = mutableListOf<String>()
        compose.setContent {
            OrganicMenuPanel(
                listOf(
                    OrganicMenuItem("換一張圖片", IconName.Image) {},
                    OrganicMenuItem("生成圖片", IconName.Sparkle, enabled = false) {},
                    OrganicMenuItem("移除圖片", IconName.Trash, destructive = true) {},
                ),
                seed = 7.0,
            ) { chosen += it.title }
        }
        compose.onNodeWithText("生成圖片").performClick()
        compose.onNodeWithText("移除圖片").performClick()
        assertEquals(listOf("移除圖片"), chosen)
    }

    @Test fun theTriggersOwnTapOpensItAndARowThenDoesItsWork() {
        val done = mutableListOf<String>()
        compose.setContent {
            OrganicMenuFrom(
                listOf(
                    OrganicMenuItem("換一張圖片", IconName.Image) { done += "replace" },
                    OrganicMenuItem("生成圖片", IconName.Sparkle, enabled = false) { done += "generate" },
                ),
            ) { _, toggle -> OrganicButton("更換封面", variant = ButtonVariant.Paper, small = true, onClick = toggle) }
        }
        compose.onNodeWithText("更換封面").performClick()
        compose.onNodeWithText("生成圖片").assertIsNotEnabled()
        compose.onNodeWithText("換一張圖片").assertHasClickAction().performClick()
        compose.mainClock.advanceTimeBy(400)
        compose.waitForIdle()
        assertEquals(listOf("replace"), done)
        compose.onNodeWithText("換一張圖片").assertDoesNotExist()
    }

    private val window = IntSize(1000, 2000)
    private val panel = IntSize(200, 150)

    private fun place(anchor: IntRect, above: Boolean = false, alignStart: Boolean = false, inset: Int = 0) =
        MenuPlacement(gap = 8, inset = inset, above = above, alignStart = alignStart).calculatePosition(anchor, window, LayoutDirection.Ltr, panel)

    @Test fun thePanelHangsUnderItsTriggerTrailingEdgesLinedUp() {
        assertEquals(IntOffset(700 - 200, 548), place(IntRect(600, 500, 700, 540)))
        // A chip drawn inside its hit box: the panel hangs from the chip.
        assertEquals(IntOffset(700 - 3 - 200, 548 - 3), place(IntRect(600, 500, 700, 540), inset = 3))
    }

    @Test fun overItsTriggerAtTheFootOfTheScreenItsLeadingEdgeLinedUp() {
        // The composer's ＋ at the start of its row.
        assertEquals(IntOffset(20, 1900 - 8 - 150), place(IntRect(20, 1900, 64, 1944), above = true, alignStart = true))
    }

    @Test fun onTheOtherSideWhenThereIsNoRoomAndInsideTheWindow() {
        // Under a trigger near the bottom: over it instead.
        assertEquals(1850 - 8 - 150, place(IntRect(600, 1850, 700, 1890)).y)
        // Over a trigger near the top: under it instead.
        assertEquals(140 + 8, place(IntRect(600, 100, 700, 140), above = true).y)
        // Past either edge across: kept in.
        assertEquals(0, place(IntRect(0, 500, 60, 540)).x)
        assertEquals(1000 - 200, place(IntRect(900, 500, 990, 540), alignStart = true).x)
    }
}
