package com.resonance.design

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.ResonanceColors
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.Strings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlin.math.abs

/**
 * Round 17 on Android's design language: every menu is the one sheet (§1) — rows 44 tall, their content 20 in
 * from either side, the glyph 17 and 12 before the words, the sheet as wide as its longest row, 6 over the first
 * row and the quiet foot's 24-tall line right under the last, its words at the end, 10 under it (§2.3); the
 * sheet's shadow (light two, night one) and the room a popup keeps round it; the bar's pen (§7); and a writer's
 * bar that grows to hold its title and save state at a large text size instead of cutting the second line (§8).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class RoundSeventeenTest {
    @get:Rule val compose = createComposeRule()

    private val one = Density(1f, 1f)

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    private fun near(expected: Float, actual: Float, what: String) =
        assertTrue("$what: expected $expected, was $actual", abs(expected - actual) <= 1.01f)

    // §1, §2.3: the sheet's measures

    @Test fun aSheetIsItsRowsTallAndItsLongestRowWide() {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.testTag("sheet")) {
                    OrganicMenuPanel(
                        listOf(
                            OrganicMenuItem("回覆", IconName.Reply) {},
                            OrganicMenuItem("檢舉這則訊息並且封鎖", IconName.Flag) {},
                        ),
                        seed = 7.0,
                    ) {}
                }
            }
        }
        compose.mainClock.advanceTimeBy(400)
        val sheet = compose.onNodeWithTag("sheet").getBoundsInRoot()
        // 6 over the first row, two of 44, 6 under the last.
        near(MenuSheet.height(2, footer = false).value, (sheet.bottom - sheet.top).value, "height")
        assertEquals(100f, MenuSheet.height(2, footer = false).value, 0.01f)
        // The longest row's words end 20 short of the sheet's end: the sheet hugs them.
        val long = compose.onNodeWithText("檢舉這則訊息並且封鎖", useUnmergedTree = true).getBoundsInRoot()
        near(sheet.right.value - 20f, long.right.value, "the longest words' end")
        // Every row's words start 20 + the 17 glyph + 12 in.
        val short = compose.onNodeWithText("回覆", useUnmergedTree = true).getBoundsInRoot()
        near(sheet.left.value + 49f, short.left.value, "the words' start")
        near(sheet.left.value + 49f, long.left.value, "the words' start")
    }

    @Test fun twoShortRowsStillMakeASheetNotABlob() {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.testTag("sheet")) {
                    OrganicMenuPanel(
                        listOf(
                            OrganicMenuItem("圖片", IconName.Reply) {},
                            OrganicMenuItem("卡片", IconName.Flag) {},
                        ),
                        seed = 7.0,
                    ) {}
                }
            }
        }
        compose.mainClock.advanceTimeBy(400)
        val sheet = compose.onNodeWithTag("sheet").getBoundsInRoot()
        near(MenuSheet.MinWidth.value, (sheet.right - sheet.left).value, "the narrowest sheet")
    }

    @Test fun theQuietFootIsAtTheEndRightUnderTheLastRow() {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.testTag("sheet")) {
                    MessageActionSheet(
                        listOf(MessageAction("回覆", IconName.Reply) {}, MessageAction("檢舉這則訊息", IconName.Flag) {}),
                        footer = "10月27日 下午8:36",
                        onChoose = {},
                    )
                }
            }
        }
        val sheet = compose.onNodeWithTag("sheet").getBoundsInRoot()
        near(messageActionsHeight(2).value, (sheet.bottom - sheet.top).value, "height")
        // 6 + 2 × 44 + the foot's 24 + 10.
        assertEquals(128f, messageActionsHeight(2).value, 0.01f)
        val foot = compose.onNodeWithText("10月27日 下午8:36").getBoundsInRoot()
        // At the end of the line, 20 in, as the rows' words keep from either side.
        near(sheet.right.value - 20f, foot.right.value, "the foot's end")
        // Its 24-tall line starts where the last row ends: centred in it, the words sit inside it.
        val line = sheet.top.value + 6f + 2 * 44f
        assertTrue(foot.top.value >= line && foot.bottom.value <= line + 24f + 0.5f)
    }

    // §1: the shadow, and the room a popup keeps for it

    @Test fun theSheetCastsTwoSoftShadowsByDayAndOneDeeperAtNight() {
        val day = SheetShadow.of(ResonanceColors.LightTerracotta)
        val night = SheetShadow.of(ResonanceColors.of(com.resonance.design.generated.PaletteTheme.Terracotta, true))
        assertEquals(listOf(8f to 24f, 1f to 3f), day.map { it.dy.value to it.blur.value })
        assertEquals(0.16f, day[0].color.alpha, 0.005f)
        assertEquals(0.10f, day[1].color.alpha, 0.005f)
        assertEquals(listOf(10f to 28f), night.map { it.dy.value to it.blur.value })
        assertEquals(0.45f, night.single().color.alpha, 0.01f)
        // The CSS blur (a Gaussian of half its radius) in Skia's terms: 24 css px at 1× is a deviation of 12.
        assertEquals(12f, SheetShadow.skiaRadius(24.dp, 1f) * 0.57735f + 0.5f, 0.01f)
        // The room round a popup's sheet holds the deepest shadow's offset and two of its deviations.
        assertTrue(SheetShadow.Room.value >= 10f + 28f)
    }

    @Test fun aPopupPlacesItsSheetAndHangsTheShadowsRoomRoundIt() {
        val window = IntSize(1000, 2000)
        val room = 40
        // The popup's content is the sheet and its room on every side.
        val content = IntSize(200 + 2 * room, 150 + 2 * room)
        fun place(anchor: IntRect, alignStart: Boolean = false) =
            MenuPlacement(gap = 8, inset = 0, alignStart = alignStart, room = room).calculatePosition(anchor, window, LayoutDirection.Ltr, content)
        // Under its trigger, trailing edges lined up: the sheet where it always was, the room round it.
        assertEquals(IntOffset(700 - 200 - room, 548 - room), place(IntRect(600, 500, 700, 540)))
        // Kept inside the window by the sheet, not the room (which may run past the edge).
        assertEquals(-room, place(IntRect(0, 500, 60, 540)).x)
        assertEquals(1000 - 200 - room, place(IntRect(900, 500, 990, 540), alignStart = true).x)
    }

    // §7: the bar's one pen

    @Test fun theTabBarsGlyphsAreDrawnWithTheStrongPen() {
        assertEquals(Tokens.InkStrong.value, TabGlyphPen, 0f)
        assertTrue(TabGlyphPen > Tokens.Ink.value)
    }

    // §8: the writer's bar at a large text size

    @Test fun theBarGrowsToHoldItsTitleAndSaveStateAtTheLargestTextSize() {
        // The app caps everything but a story at 1.25 of the system's text size (CappedTextScale).
        val large = Density(1f, 1.25f)
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides large) {
                Box(Modifier.testTag("bar")) {
                    OrganicInlineBar("返回", {}, title = "編輯卡片", hasStatus = true, status = BarStatus("修改已暫存"))
                }
            }
        }
        compose.mainClock.advanceTimeBy(400)
        val bar = compose.onNodeWithTag("bar").getBoundsInRoot()
        val status = compose.onNodeWithText("修改已暫存", useUnmergedTree = true).getBoundsInRoot()
        val title = compose.onNodeWithText("編輯卡片", useUnmergedTree = true).getBoundsInRoot()
        // Both lines whole, above the bar's wavy band.
        assertTrue("status ${status.bottom} in bar ${bar.bottom}", status.bottom.value <= bar.bottom.value - HeaderEdgeHeight.value + 0.5f)
        assertTrue(title.top.value >= bar.top.value)
        // Taller than its usual row: it grew for them.
        assertTrue((bar.bottom - bar.top).value > (InlineBarHeight + HeaderEdgeHeight).value)
    }

    @Test fun atTheUsualTextSizeTheBarKeepsItsHeight() {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.testTag("bar")) {
                    OrganicInlineBar("返回", {}, title = "編輯卡片", hasStatus = true, status = BarStatus("修改已暫存"))
                }
            }
        }
        val bar = compose.onNodeWithTag("bar").getBoundsInRoot()
        near((InlineBarHeight + HeaderEdgeHeight).value, (bar.bottom - bar.top).value, "the bar's height")
    }
}
