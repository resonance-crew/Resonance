package com.resonance.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.HueRole
import com.resonance.design.generated.IconName
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.GraphicsMode
import kotlin.math.abs

/**
 * Round 18 (the owner's, reversing round 17's borderless grain sheet and its paper-cut shadow): every menu is the
 * theme's menu paper inside one hand-drawn pen line — the header's grey, never the accent; a card's own menu its
 * card's paper and pen — with no grain, no dividers and no shadow. 封鎖 rests on the warning yellow, a loss on a red
 * wash, each wash cut by the sheet's outline alone so it fills its band right to the pen line, drawn over it. The
 * toast and the thread's way-back pill are made as a card is: the accent's light wash inside a pen line of the
 * accent, the toast with a card's corners — flat.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class RoundEighteenTest {
    @get:Rule val compose = createComposeRule()

    private val palettes = listOf(
        ResonanceColors.LightTerracotta,
        ResonanceColors.of(PaletteTheme.Terracotta, true),
        ResonanceColors.of(PaletteTheme.Sage, false),
        ResonanceColors.of(PaletteTheme.Lavender, true),
    )

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
    }

    // The sheet's paper and pen, per kind of menu

    @Test fun theThemesMenuIsItsMenuPaperInsideTheHeadersGreyPenNeverTheAccent() {
        for (palette in palettes) {
            val inks = MenuColors(null, palette).sheetInks(palette)
            // Flat: the menu paper itself, at night too (no raise toward the ink).
            assertEquals(palette.MenuPaper, inks.paper)
            assertEquals(palette.FieldBorderHover, inks.pen)
            assertNotEquals(palette.Terracotta, inks.pen)
        }
    }

    @Test fun aCardsOwnMenuKeepsItsCardsPaperAndWearsItsCardsPen() {
        for (palette in palettes) {
            val inks = MenuColors(210.0, palette).sheetInks(palette)
            assertEquals(palette.hue(HueRole.Menu, 210.0), inks.paper)
            assertEquals(palette.hue(HueRole.Pen, 210.0), inks.pen)
        }
    }

    // What each row rests on, and its ink

    @Test fun aWarningRestsOnTheYellowALossOnRedAndEveryOtherRowOnTheBarePaper() {
        val day = ResonanceColors.LightTerracotta
        val night = ResonanceColors.of(PaletteTheme.Terracotta, true)
        for (palette in listOf(day, night)) {
            val inks = MenuColors(null, palette).sheetInks(palette)
            assertNull(inks.rest(RowTone.Plain))
            assertEquals(palette.Danger.copy(alpha = 0.11f), inks.rest(RowTone.Danger))
            assertEquals(palette.Danger.copy(alpha = 0.15f), inks.pressOf(RowTone.Danger))
            assertEquals(inks.press, inks.pressOf(RowTone.Plain))
        }
        // The yellow see-through by day; the night yellow is a deep olive, laid on nearly whole and lightened when pressed.
        val d = MenuColors(null, day).sheetInks(day)
        assertEquals(day.Yellow.copy(alpha = 0.32f), d.rest(RowTone.Warn))
        assertEquals(day.Yellow.copy(alpha = 0.30f), d.pressOf(RowTone.Warn))
        val n = MenuColors(null, night).sheetInks(night)
        assertEquals(night.Yellow.copy(alpha = 0.90f), n.rest(RowTone.Warn))
        assertEquals(night.Text.copy(alpha = 0.08f), n.pressOf(RowTone.Warn))
    }

    @Test fun blockIsAWarningAndKeepsThePlainRowsInks() {
        // Every 封鎖 (the ban glyph, destructive) is a warning without its caller asking; 刪除 stays a loss.
        assertEquals(RowTone.Warn, OrganicMenuItem("封鎖", IconName.Ban, destructive = true) {}.tone)
        assertEquals(RowTone.Danger, OrganicMenuItem("刪除", IconName.Trash, destructive = true) {}.tone)
        assertEquals(RowTone.Plain, OrganicMenuItem("解除封鎖", IconName.UserCheck) {}.tone)
        assertEquals(RowTone.Warn, OrganicMenuItem("略過", IconName.Flag, warn = true) {}.tone)
        // Its words in the text ink and its glyph the others', pressed as any row.
        val palette = ResonanceColors.LightTerracotta
        val inks = MenuColors(null, palette).sheetInks(palette)
        val block = SheetRow("封鎖", IconName.Ban, tone = RowTone.Warn)
        assertEquals(inks.glyph to palette.Text, inks.rowInks(block, down = false, text = palette.Text))
        assertEquals(inks.glyphPressed to inks.glyphPressed, inks.rowInks(block, down = true, text = palette.Text))
    }

    // The washes fill each band right to the pen line

    @Test fun theRowsBandsReachPastTheSheetsOutlineOnEveryOuterSide() {
        val one = Density(1f, 1f)
        for ((w, rows) in listOf(168.0 to 2, 216.0 to 3, 280.0 to 6)) {
            for (footer in listOf(false, true)) {
                for (seed in listOf(7.0, 67.0, 143.0)) {
                    val h = MenuSheet.height(rows, footer).value.toDouble()
                    val outline = (WobRectShape(MenuSheet.RADIUS, seed).createOutline(Size(w.toFloat(), h.toFloat()), LayoutDirection.Ltr, one) as Outline.Generic).path.getBounds()
                    // The wobble swings out of the box, or this test proves nothing about it.
                    val bands = sheetBands(w, h, rows, footer, seed, 1f).map { it.getBounds() }
                    val what = "$w × $h, $rows rows, foot $footer, seed $seed"
                    assertTrue("$what: the first band over the outline's top", bands.first().top < outline.top)
                    if (!footer) assertTrue("$what: the last band under its foot", bands.last().bottom > outline.bottom)
                    bands.forEach { b ->
                        assertTrue("$what: a band from past the outline's start", b.left < outline.left)
                        assertTrue("$what: a band to past the outline's end", b.right > outline.right)
                    }
                }
            }
        }
        // Further past the box than the wobble ever swings (≤ 4, its handles a little more).
        assertTrue(bandOvershoot(100.0) >= 10.0)
    }

    private fun srgb(c: Color) = c.convert(ColorSpaces.Srgb)

    /** [top] laid over [under] (both opaque once converted), as the canvas composites a see-through wash. */
    private fun over(top: Color, under: Color): Color {
        val t = srgb(top)
        val u = srgb(under)
        val a = t.alpha
        return Color(t.red * a + u.red * (1 - a), t.green * a + u.green * (1 - a), t.blue * a + u.blue * (1 - a))
    }

    private fun near(expected: Color, actual: Color, tolerance: Float = 0.03f) =
        abs(expected.red - actual.red) <= tolerance && abs(expected.green - actual.green) <= tolerance && abs(expected.blue - actual.blue) <= tolerance

    private fun distance(a: Color, b: Color) = abs(a.red - b.red) + abs(a.green - b.green) + abs(a.blue - b.blue)

    private fun mean(pixels: PixelMap, x: Int, y: Int, w: Int, h: Int): Color {
        val all = (x until x + w).flatMap { i -> (y until y + h).map { j -> pixels[i, j] } }
        return Color(all.map { it.red }.average().toFloat(), all.map { it.green }.average().toFloat(), all.map { it.blue }.average().toFloat())
    }

    private fun sheet(palette: ResonanceColors, density: Density): Pair<Rect, PixelMap> {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides density, LocalResonanceColors provides palette) {
                Box(Modifier.background(Color.White).padding(12.dp)) {
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
        // Its bounds are in the panel's own dp; the test's window (320 px wide) holds the sheet whole at 1.5×.
        val b = compose.onNodeWithTag("sheet").getBoundsInRoot()
        val d = density.density
        return Rect(b.left.value * d, b.top.value * d, b.right.value * d, b.bottom.value * d) to compose.onRoot().captureToImage().toPixelMap()
    }

    private fun washesAndPen(palette: ResonanceColors) {
        val d = 1.5f
        val (box, pixels) = sheet(palette, Density(d, 1f))
        val inks = MenuColors(null, palette).sheetInks(palette)
        val paper = srgb(inks.paper)
        // A patch of each row's band past its words, well inside the wobble.
        fun band(row: Int) = mean(pixels, (box.right - 40 * d).toInt(), (box.top + (6 + row * 44 + 12) * d).toInt(), (24 * d).toInt(), (20 * d).toInt())
        // No grain: the bare paper is the paper; 封鎖 the yellow over it, 刪除對話 the red.
        assertTrue("plain row ${band(0)} vs $paper", near(paper, band(0)))
        assertTrue("warn row", near(over(inks.rest(RowTone.Warn)!!, inks.paper), band(1)))
        assertTrue("danger row", near(over(inks.rest(RowTone.Danger)!!, inks.paper), band(2)))

        // Down the last row's middle to past the foot: its red right up to the pen line (no paper between), the
        // grey line, then the page — no shadow under it.
        val x = box.center.x.toInt()
        val red = over(inks.rest(RowTone.Danger)!!, inks.paper)
        val pen = srgb(inks.pen)
        val start = (box.bottom - 10 * d).toInt()
        val ys = start until (box.bottom + 12 * d).toInt()
        val penAt = ys.firstOrNull { y -> !near(red, pixels[x, y], 0.04f) }
        assertTrue("a pen line under the red", penAt != null && penAt > start)
        // The line's own pixel (the one nearest its ink: its edges blend with the red over it and the page under it).
        val line = (penAt!! until penAt + 5).minBy { y -> distance(pen, pixels[x, y]) }
        assertTrue("the line is the sheet's pen: ${pixels[x, line]} vs $pen", near(pen, pixels[x, line], 0.06f))
        // Past the line (its half-width and its antialiasing), only the page: flat.
        ((line + 4) until ys.last).forEach { y -> assertEquals("page at $x, $y", Color.White, pixels[x, y]) }
    }

    @Test fun theWashesRunToTheGreyPenLineAndNothingLiesUnderTheSheetByDay() = washesAndPen(ResonanceColors.LightTerracotta)

    @Test fun theWashesRunToTheGreyPenLineAndNothingLiesUnderTheSheetAtNight() =
        washesAndPen(ResonanceColors.of(PaletteTheme.Terracotta, true))

    // The toast, made as a card is

    @Test fun theToastIsTheAccentsWashInsideTheAccentsPenWithACardsCorners() {
        assertEquals(16.0, PillSize.Toast.radius, 0.0)
        val palette = ResonanceColors.LightTerracotta
        val d = 1.5f
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(d, 1f), LocalResonanceColors provides palette) {
                Box(Modifier.background(Color.White).padding(horizontal = 12.dp, vertical = 24.dp)) {
                    Box(Modifier.testTag("toast")) { OrganicPill("已移到垃圾桶", size = PillSize.Toast) }
                }
            }
        }
        compose.waitForIdle()
        val b = compose.onNodeWithTag("toast").getBoundsInRoot()
        val pixels = compose.onRoot().captureToImage().toPixelMap()
        // Its bounds are in the pill's own dp.
        val y = ((b.top + b.bottom).value / 2 * d).toInt()
        val left = (b.left.value * d).toInt()
        // Inside, past the words' start: the accent's light wash.
        assertTrue(near(srgb(palette.TerracottaLight), mean(pixels, left + 8, y - 2, 6, 4)))
        // Across its start edge: the accent's line.
        val accent = srgb(palette.Terracotta)
        val line = (left - 6 until left + 6).minBy { x -> distance(accent, pixels[x, y]) }
        assertTrue("${pixels[line, y]} vs $accent", near(accent, pixels[line, y], 0.06f))
        // Under it, only the page: no shadow.
        val x = ((b.left + b.right).value / 2 * d).toInt()
        val bottom = (b.bottom.value * d).toInt()
        (bottom + 8 until bottom + 34).forEach { yy -> assertEquals("page at $x, $yy", Color.White, pixels[x, yy]) }
    }
}
