package com.resonance.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode
import kotlin.math.abs

/**
 * Round 26 §U2.2: the blank "more" disc after an [AvatarGroup]'s faces stands 3 : 1 off the night page, as the web's
 * `.disc path` (the muted ink at 66 % over the cream) and iOS's FaceStack.discFill do (TapFacesTests
 * .theBlankDiscStandsOffTheNightPage, its twin). The night's cream-dark it wore sat about 1.07 : 1 there, and the disc
 * read as a bare ring. By day it is the waiting disc's paper, the cream-dark, as before.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BlankAvatarTest {
    @get:Rule val compose = createComposeRule()

    @Test fun theBlankDiscStandsOffTheNightPage() {
        for (theme in PaletteTheme.entries) {
            val night = ResonanceColors.of(theme, true)
            val day = ResonanceColors.of(theme, false)
            val disc = PaletteMixes.of(night).blankDisc
            assertTrue("$theme: ${contrast(disc, night.Cream)}", contrast(disc, night.Cream) >= 3f)
            // The web's mix, exactly: color-mix(in oklch, var(--color-text-muted) 66%, var(--color-cream)).
            assertEquals(PaletteMixes.mixed(night.oklchOf("color-text-muted"), night.oklchOf("color-cream"), 0.66), disc)
            // By day the cream-dark (the waiting disc's paper, which is it).
            assertEquals(day.CreamDark, PaletteMixes.of(day).blankDisc)
            assertEquals(day.AvatarWait, PaletteMixes.of(day).blankDisc)
        }
        // Android's own accents too: a wallpaper's palette (Material You), every 30° at a lively and a quiet chroma.
        for (h in 0 until 360 step 30) for (c in listOf(0.04, 0.16)) {
            val night = PaletteFormula.wallpaperPalette(h.toDouble(), c, true)
            val disc = PaletteMixes.of(night).blankDisc
            assertTrue("wallpaper $h/$c: ${contrast(disc, night.Cream)}", contrast(disc, night.Cream) >= 3f)
        }
    }

    @Test fun theDrawnDiscWearsItAtNightAndTheCreamDarkByDay() {
        val palettes = listOf(ResonanceColors.of(PaletteTheme.Terracotta, true), ResonanceColors.of(PaletteTheme.Sage, true), ResonanceColors.LightTerracotta)
        val d = 2f
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(d, 1f)) {
                Column {
                    palettes.forEachIndexed { i, palette ->
                        CompositionLocalProvider(LocalResonanceColors provides palette) {
                            Box(Modifier.background(palette.Cream).padding(12.dp)) {
                                Box(Modifier.testTag("disc$i")) { BlankAvatar(28.dp) }
                            }
                        }
                    }
                }
            }
        }
        compose.waitForIdle()
        val pixels = compose.onRoot().captureToImage().toPixelMap()
        palettes.forEachIndexed { i, palette ->
            // The disc's middle, well inside its pen line (its bounds are in dp).
            val b = compose.onNodeWithTag("disc$i").getBoundsInRoot()
            val middle = pixels[((b.left + b.right).value / 2 * d).toInt(), ((b.top + b.bottom).value / 2 * d).toInt()]
            val want = srgb(PaletteMixes.of(palette).blankDisc)
            assertTrue("$palette: $middle vs $want", near(want, middle))
            if (palette.dark) assertTrue("$palette: ${contrast(middle, palette.Cream)}", contrast(middle, palette.Cream) >= 3f)
            else assertTrue(near(srgb(palette.CreamDark), middle))
        }
    }

    private fun srgb(c: Color) = c.convert(ColorSpaces.Srgb)

    private fun near(expected: Color, actual: Color, tolerance: Float = 0.02f): Boolean {
        val a = srgb(actual)
        return abs(expected.red - a.red) <= tolerance && abs(expected.green - a.green) <= tolerance && abs(expected.blue - a.blue) <= tolerance
    }

    /** WCAG contrast of two opaque colours, as sRGB shows them. */
    private fun contrast(a: Color, b: Color): Float {
        val x = srgb(a).luminance()
        val y = srgb(b).luminance()
        return (maxOf(x, y) + 0.05f) / (minOf(x, y) + 0.05f)
    }
}
