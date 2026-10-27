package com.resonance.design

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.click
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.LocalResonanceColors
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
 * From the round's review: a row that ends or removes something is told by the danger ink alone — no wash under it,
 * the paper's grain through its band as through any other, by day and at night — its pressed ink the danger hue at
 * the others' strength (D1); a pressed row's words take the pressed pen with its glyph (A8); and the lift of the
 * hold that brought a sheet up under the finger chooses nothing (D4).
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

    // Round 17 review D1, A8: a loss is told by its ink alone, and a pressed row's words take the pressed pen

    /** The mean colour and the spread of luminance of the [w]×[h] patch at ([x], [y]) of [pixels]. */
    private fun patch(pixels: PixelMap, x: Int, y: Int, w: Int, h: Int): Pair<FloatArray, Float> {
        val all = (x until x + w).flatMap { i -> (y until y + h).map { j -> pixels[i, j] } }
        val mean = floatArrayOf(all.map { it.red }.average().toFloat(), all.map { it.green }.average().toFloat(), all.map { it.blue }.average().toFloat())
        val lum = all.map { (it.red + it.green + it.blue) / 3f }
        val m = lum.average().toFloat()
        return mean to kotlin.math.sqrt(lum.map { (it - m) * (it - m) }.average().toFloat())
    }

    private fun aLossRestsOnThePaperItself(palette: ResonanceColors) {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one, LocalResonanceColors provides palette) {
                Box(Modifier.background(Color.White).padding(40.dp)) {
                    Box(Modifier.testTag("sheet")) {
                        OrganicMenuPanel(
                            listOf(
                                OrganicMenuItem("回覆", IconName.Reply) {},
                                OrganicMenuItem("封鎖", IconName.Ban, destructive = true) {},
                                OrganicMenuItem("刪除對話", IconName.Trash, destructive = true) {},
                            ),
                            seed = 7.0,
                        ) {}
                    }
                }
            }
        }
        compose.mainClock.advanceTimeBy(400)
        val sheet = compose.onNodeWithTag("sheet").getBoundsInRoot()
        val pixels = compose.onRoot().captureToImage().toPixelMap()
        // A patch of each row's band past its words, well inside the wobble.
        fun band(row: Int) = patch(pixels, sheet.right.value.toInt() - 40, sheet.top.value.toInt() + 6 + row * 44 + 12, 24, 20)
        val (plain, grain) = band(0)
        assertTrue("the paper's grain shows", grain > 0.002f)
        for (row in 1..2) {
            val (mean, spread) = band(row)
            // The same paper and grain as a plain row's — every loss, not only the first — with nothing laid over it.
            for (c in 0..2) assertEquals("row $row, channel $c", plain[c], mean[c], 2.5f / 255)
            assertEquals("row $row's grain", grain, spread, 0.01f)
        }
    }

    @Test fun aLossIsToldByItsInkAloneWithNothingUnderItAtRestByDay() = aLossRestsOnThePaperItself(ResonanceColors.LightTerracotta)

    @Test fun aLossIsToldByItsInkAloneWithNothingUnderItAtRestAtNight() =
        aLossRestsOnThePaperItself(ResonanceColors.of(com.resonance.design.generated.PaletteTheme.Terracotta, true))

    @Test fun aLossWearsTheDangerInkPressedOrNotAndItsInkSpreadsAtTheRowsStrength() {
        for (palette in listOf(ResonanceColors.LightTerracotta, ResonanceColors.of(com.resonance.design.generated.PaletteTheme.Terracotta, true))) {
            // The theme's menu and a card's own (its hue): a loss is the palette's danger ink either way.
            for (hue in listOf(null, 210.0)) {
                val inks = MenuColors(hue, palette).sheetInks()
                assertEquals(palette.Danger, inks.danger)
                assertEquals(palette.Danger.copy(alpha = SheetPressAlpha), inks.dangerPress)
                assertEquals(inks.press.alpha, inks.dangerPress.alpha, 0f)
                val loss = SheetRow("封鎖", IconName.Ban, danger = true)
                assertEquals(inks.danger to inks.danger, inks.rowInks(loss, down = false, text = palette.Text))
                assertEquals(inks.danger to inks.danger, inks.rowInks(loss, down = true, text = palette.Text))
            }
        }
    }

    @Test fun aPressedRowsWordsTakeThePressedPenWithItsGlyph() {
        val inks = MenuColors(null, ResonanceColors.LightTerracotta).sheetInks()
        val row = SheetRow("回覆", IconName.Reply)
        val text = ResonanceColors.LightTerracotta.Text
        assertEquals(inks.glyph to text, inks.rowInks(row, down = false, text = text))
        assertEquals(inks.glyphPressed to inks.glyphPressed, inks.rowInks(row, down = true, text = text))
    }

    // Round 17 review D4: a sheet that comes up under the finger that is still down takes nothing from its lift

    @Test fun theLiftOfTheHoldThatOpenedTheSheetChoosesNothing() {
        var open by mutableStateOf(false)
        val chosen = mutableListOf<String>()
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(
                    Modifier.size(400.dp).pointerInput(Unit) {
                        awaitEachGesture {
                            awaitFirstDown()
                            // The hold opens the sheet while the finger stays down, its first row right under it.
                            open = true
                            waitForUpOrCancellation()
                        }
                    },
                ) {
                    if (open) MessageActionSheet(
                        listOf(MessageAction("回覆", IconName.Reply) {}, MessageAction("複製", IconName.Copy) {}),
                        footer = "10月27日 下午8:36",
                        onChoose = { chosen += it.title },
                    )
                }
            }
        }
        val onFirstRow = Offset(100f, 6f + 22f)
        compose.onRoot().performTouchInput { down(onFirstRow) }
        compose.mainClock.advanceTimeBy(600)
        compose.onNodeWithText("回覆").assertExists()
        compose.onRoot().performTouchInput { up() }
        compose.waitForIdle()
        assertEquals(emptyList<String>(), chosen)
        // A tap of its own still chooses the row.
        compose.onRoot().performTouchInput { click(onFirstRow) }
        compose.waitForIdle()
        assertEquals(listOf("回覆"), chosen)
    }

    // Round 17 review D5: 移除連結 is a quiet word, no face; the link editor's controls share one height

    @Test fun aQuietButtonIsItsWordsAloneAFingersHeightTall() {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.background(Color.White).padding(20.dp)) {
                    QuietButton("移除連結", Modifier.testTag("quiet")) {}
                }
            }
        }
        val quiet = compose.onNodeWithTag("quiet").getBoundsInRoot()
        assertEquals(44f, (quiet.bottom - quiet.top).value, 0.5f)
        val words = compose.onNodeWithText("移除連結", useUnmergedTree = true).getBoundsInRoot()
        // Its words QuietButtonPadX in from its start (a caller pulls it out that much to line them up with its column).
        assertEquals(quiet.left.value + QuietButtonPadX.value, words.left.value, 0.5f)
        // No face round them: the paper under the button, beside its words and over and under them, is the page's own.
        val pixels = compose.onRoot().captureToImage().toPixelMap()
        listOf(quiet.left.value + 4f to quiet.top.value + 22f, words.left.value + 10f to quiet.top.value + 3f, words.right.value + 6f to quiet.bottom.value - 3f)
            .forEach { (x, y) -> assertEquals("at $x, $y", Color.White, pixels[x.toInt(), y.toInt()]) }
    }

    @Test fun aChoiceBarTakesTheHeightItsDialogAsks() {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.testTag("bar")) {
                    SegmentedActionBar(
                        listOf(Segment("card", "卡片", IconName.Frame) {}, Segment("text", "文字", IconName.Link) {}),
                        Modifier.width(300.dp),
                        minHeight = 44.dp,
                    )
                }
            }
        }
        val bar = compose.onNodeWithTag("bar").getBoundsInRoot()
        assertEquals(44f, (bar.bottom - bar.top).value, 0.5f)
    }

    // Round 17 review A10: a bare trigger's open state, as the web's composer ＋ — a soft disc of the text ink under it

    @Test fun aBareTriggerOpenLiesOnASoftDiscOfTheTextInkAndClosedOnNothing() {
        var open by mutableStateOf(false)
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.background(Color.White).size(48.dp).bareMenuOpen(open, seed = 17.0, inset = 2.dp).testTag("plus"))
            }
        }
        fun centre() = compose.onRoot().captureToImage().toPixelMap()[24, 24]
        fun corner() = compose.onRoot().captureToImage().toPixelMap()[1, 1]
        assertEquals(Color.White, centre())
        open = true
        compose.mainClock.advanceTimeBy(400)
        val ink = ResonanceColors.LightTerracotta.Text
        val c = centre()
        // The text ink at 8 % over the paper.
        assertEquals(1f - 0.08f * (1f - ink.red), c.red, 2f / 255)
        assertEquals(1f - 0.08f * (1f - ink.green), c.green, 2f / 255)
        assertEquals(1f - 0.08f * (1f - ink.blue), c.blue, 2f / 255)
        // A disc, not the box: its corners stay the paper.
        assertEquals(Color.White, corner())
        open = false
        compose.mainClock.advanceTimeBy(400)
        assertEquals(Color.White, centre())
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
