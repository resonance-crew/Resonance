package com.resonance.design

import com.resonance.design.generated.HueRole
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors
import androidx.compose.ui.graphics.luminance
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.abs

/**
 * The app's palettes are palette.ts's (native/fixtures/palette.json, written from it): the four
 * themes' generated tables in both schemes, every token; the wallpaper's palette (Android 12+),
 * which the app works out at run time with [PaletteFormula], at each sampled system colour, a grey
 * one wearing terracotta; and the avatar fills. Within the fixture's own tolerance: 0.002 L, 0.002
 * C, 0.5° H (and 0.002 alpha).
 */
class PaletteFormulaTest {
    private val fixture: JsonObject = Json.parseToJsonElement(File("../../../../native/fixtures/palette.json").readText()).jsonObject

    private fun close(where: String, css: String, actual: DoubleArray) {
        val want = OklchColor.parseOklch(css) ?: error("$where: $css is no oklch()")
        assertEquals("$where L ($css)", want[0], actual[0], 0.002)
        assertEquals("$where C ($css)", want[1], actual[1], 0.002)
        // A hue means nothing without chroma.
        if (want[1] > 0.002) {
            val dh = abs(((want[2] - actual[2]) % 360 + 540) % 360 - 180)
            assertTrue("$where H ($css, got ${actual[2]})", dh <= 0.5)
        }
        assertEquals("$where alpha ($css)", want[3], actual[3], 0.002)
    }

    private fun matches(where: String, table: JsonObject, palette: ResonanceColors) {
        assertEquals("$where: every token", fixture["tokens"]!!.jsonArray.map { it.jsonPrimitive.content }, ResonanceColors.TOKENS)
        for (token in ResonanceColors.TOKENS) close("$where $token", table[token]!!.jsonPrimitive.content, palette.oklchOf(token))
    }

    @Test fun theFourThemesTablesAreThePalettes() {
        val accents = fixture["accents"]!!.jsonObject
        assertEquals(PaletteTheme.entries.map { it.key }, accents.keys.toList())
        for (theme in PaletteTheme.entries) for (dark in listOf(false, true)) {
            val scheme = if (dark) "dark" else "light"
            matches("${theme.key} $scheme", accents[theme.key]!!.jsonObject[scheme]!!.jsonObject, ResonanceColors.of(theme, dark))
            assertEquals(dark, ResonanceColors.of(theme, dark).dark)
        }
    }

    @Test fun theWallpapersPaletteIsWorkedOutAsPaletteTsWorksItOut() {
        assertEquals(fixture["wallpaperMinChroma"]!!.jsonPrimitive.double, PaletteFormula.WALLPAPER_MIN_CHROMA, 0.0)
        val samples = fixture["wallpaper"]!!.jsonArray.map { it.jsonObject }
        assertTrue(samples.size >= 8)
        for (sample in samples) {
            val hue = sample["hue"]!!.jsonPrimitive.double
            val chroma = sample["chroma"]!!.jsonPrimitive.double
            val dark = sample["scheme"]!!.jsonPrimitive.content == "dark"
            matches("wallpaper $hue/$chroma ${if (dark) "dark" else "light"}", sample["palette"]!!.jsonObject, PaletteFormula.wallpaperPalette(hue, chroma, dark))
        }
    }

    @Test fun theHueRolesArePaletteTsAndDrawAnyHue() {
        // A card's own hue (an embed, a picker's thumbnail, a thought-map group, a card's menu): each role's lightness and chroma per scheme.
        val roles = fixture["hueRoles"]!!.jsonObject
        assertEquals(roles.keys.toList(), HueRole.entries.map { it.key })
        for (role in HueRole.entries) {
            val want = roles[role.key]!!.jsonObject
            assertEquals(role.key, want["light"]!!.jsonArray.map { it.jsonPrimitive.double }, role.light)
            assertEquals(role.key, want["dark"]!!.jsonArray.map { it.jsonPrimitive.double }, role.dark)
        }
        val dark = ResonanceColors.of(PaletteTheme.Sage, dark = true)
        assertEquals(OklchColor.of(0.72, 0.0825, 200.0, 0.55), dark.hue(HueRole.Pen, 200.0, 0.55))
        assertEquals(OklchColor.of(0.975, 0.012, 20.0), ResonanceColors.LightTerracotta.hue(HueRole.Interior, 380.0))
    }

    @Test fun aGreyWallpaperWearsTerracotta() {
        for (dark in listOf(false, true)) {
            assertEquals(ResonanceColors.of(PaletteTheme.Terracotta, dark), PaletteFormula.wallpaperPalette(200.0, 0.01, dark))
            assertTrue(PaletteFormula.wallpaperPalette(200.0, 0.1, dark) != ResonanceColors.of(PaletteTheme.Terracotta, dark))
        }
    }

    @Test fun anyHueKeepsTheLadderAndItsContrasts() {
        // Every 10° of the wheel, at a lively and at a quiet chroma: the paper and the ink are the ladder's, and the ink reads on the paper.
        for (h in 0 until 360 step 10) for (c in listOf(0.04, 0.16)) for (dark in listOf(false, true)) {
            val p = PaletteFormula.wallpaperPalette(h.toDouble(), c, dark)
            assertEquals(if (dark) 0.205 else 0.965, p.oklchOf("color-cream")[0], 1e-9)
            assertTrue("$h/$c ink on paper", contrast(p.Text, p.Cream) >= 7f)
            assertTrue("$h/$c label on the solid button", contrast(p.Cream, p.ButtonFill) >= 4.5f)
        }
    }

    @Test fun anAvatarsStoredColourIsDrawnPerScheme() {
        for (entry in fixture["avatars"]!!.jsonArray.map { it.jsonObject }) {
            val stored = entry["stored"]!!.jsonPrimitive.content
            val dark = entry["scheme"]!!.jsonPrimitive.content == "dark"
            val want = OklchColor.parse(entry["fill"]!!.jsonPrimitive.content)
            val got = PaletteFormula.avatarFill(stored, dark)
            assertNotNull(got)
            assertTrue("$stored ${if (dark) "dark" else "light"}: $want vs $got", near(want!!, got!!))
        }
        // Not a colour at all: none (the caller's fallback).
        assertEquals(null, PaletteFormula.avatarFill("#ffcc00", dark = true))
    }

    @Test fun theSystemAccentIsReadBackAsItsOklch() {
        // sRGB → OKLCH, the inverse of OklchColor.of: terracotta's accent, #c96736, is oklch(62% 0.14 45).
        val (l, c, h, a) = OklchColor.toOklch(0xFFC96736.toInt())
        assertEquals(0.62, l, 0.005)
        assertEquals(0.14, c, 0.005)
        assertEquals(45.0, h, 1.0)
        assertEquals(1.0, a, 0.0)
        // A grey has no chroma to speak of (and so wears terracotta).
        assertTrue(OklchColor.toOklch(0xFF808080.toInt())[1] < PaletteFormula.WALLPAPER_MIN_CHROMA)
    }

    private fun near(a: androidx.compose.ui.graphics.Color, b: androidx.compose.ui.graphics.Color) =
        abs(a.red - b.red) < 0.004f && abs(a.green - b.green) < 0.004f && abs(a.blue - b.blue) < 0.004f && abs(a.alpha - b.alpha) < 0.004f

    /** WCAG contrast of two opaque colours, as sRGB shows them. */
    private fun contrast(a: androidx.compose.ui.graphics.Color, b: androidx.compose.ui.graphics.Color): Float {
        fun lum(c: androidx.compose.ui.graphics.Color) = c.convert(androidx.compose.ui.graphics.colorspace.ColorSpaces.Srgb).luminance()
        val x = lum(a)
        val y = lum(b)
        return (maxOf(x, y) + 0.05f) / (minOf(x, y) + 0.05f)
    }
}
