package com.resonance.design

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors
import com.resonance.design.generated.Tokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * ResonanceTheme is what every colour on screen reads: the chosen mode and theme (or the system's
 * mode for 跟隨系統) as a palette — Tokens, a card family, Material's scheme made from the same
 * palette — and a change is seen at once by everything under it. Images that leave the device
 * (the 9:16 share card) keep light terracotta whatever the screen wears.
 */
@RunWith(RobolectricTestRunner::class)
class ResonanceThemeTest {
    @get:Rule val compose = createComposeRule()

    private class Seen(val palette: ResonanceColors, val paper: Color, val ink: Color, val family: Color, val primary: Color, val surface: Color)

    private var scheme by mutableStateOf(AppearanceScheme.Light)
    private var accent by mutableStateOf(AppearanceAccent.Terracotta)
    private var seen: Seen? = null

    private fun show() = compose.setContent {
        ResonanceTheme(scheme, accent) {
            seen = Seen(
                LocalResonanceColors.current, Tokens.Cream, Tokens.Text, CardPalette.of(2).fill,
                MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.surface,
            )
        }
    }

    @Test fun theChosenModeAndThemeAreThePaletteEveryColourReads() {
        show()
        compose.waitForIdle()
        assertEquals(ResonanceColors.LightTerracotta, seen!!.palette)
        assertEquals(ResonanceColors.LightTerracotta.Cream, seen!!.paper)

        scheme = AppearanceScheme.Dark
        accent = AppearanceAccent.Sage
        compose.waitForIdle()
        val sageDark = ResonanceColors.of(PaletteTheme.Sage, dark = true)
        assertEquals(sageDark, seen!!.palette)
        assertTrue(seen!!.palette.dark)
        assertEquals(sageDark.Cream, seen!!.paper)
        assertEquals(sageDark.Text, seen!!.ink)
        assertEquals(sageDark.CardFill2, seen!!.family)
        // Material's own roles are the palette's, never its tonal surfaces.
        assertEquals(sageDark.Terracotta, seen!!.primary)
        assertEquals(sageDark.Cream, seen!!.surface)

        scheme = AppearanceScheme.Light
        accent = AppearanceAccent.Lavender
        compose.waitForIdle()
        assertEquals(ResonanceColors.of(PaletteTheme.Lavender, dark = false), seen!!.palette)
    }

    @Test fun matchSystemFollowsTheConfiguration() {
        scheme = AppearanceScheme.System
        show()
        compose.waitForIdle()
        // Robolectric's default configuration is light.
        assertFalse(seen!!.palette.dark)
    }

    @Test @Config(qualifiers = "night")
    fun matchSystemIsDarkWhenTheSystemIs() {
        scheme = AppearanceScheme.System
        show()
        compose.waitForIdle()
        assertTrue(seen!!.palette.dark)
        assertEquals(ResonanceColors.of(PaletteTheme.Terracotta, dark = true), seen!!.palette)
    }

    @Test @Config(sdk = [30])
    fun theWallpaperIsTerracottaBeforeAndroid12() {
        assertFalse(AppearanceAccent.wallpaperOffered)
        accent = AppearanceAccent.Wallpaper
        scheme = AppearanceScheme.Dark
        show()
        compose.waitForIdle()
        assertEquals(ResonanceColors.of(PaletteTheme.Terracotta, dark = true), seen!!.palette)
    }

    @Test @Config(sdk = [31])
    fun theWallpaperIsTheSystemAccentsHueOnTheLadder() {
        assertTrue(AppearanceAccent.wallpaperOffered)
        val context = RuntimeEnvironment.getApplication()
        val accentOklch = systemAccent(context)!!
        accent = AppearanceAccent.Wallpaper
        scheme = AppearanceScheme.Light
        show()
        compose.waitForIdle()
        assertEquals(PaletteFormula.wallpaperPalette(accentOklch[2], accentOklch[1], dark = false), seen!!.palette)
        // The paper is the ladder's, whatever the wallpaper.
        assertEquals(0.965, seen!!.palette.oklchOf("color-cream")[0], 1e-9)
    }

    @Test fun theShareCardKeepsLightTerracottaUnderAnyTheme() {
        assertEquals(ResonanceColors.LightTerracotta, ShareCardRecipe.PALETTE)
        assertEquals(ResonanceColors.LightTerracotta.CreamDark, ShareCardRecipe.Anonymous.FILL)
        assertNotEquals(ResonanceColors.of(PaletteTheme.Terracotta, dark = true).CreamDark, ShareCardRecipe.Anonymous.FILL)
    }

    @Test fun stored() {
        assertEquals(AppearanceScheme.System, AppearanceScheme.of(null))
        assertEquals(AppearanceScheme.Dark, AppearanceScheme.of("dark"))
        assertEquals(AppearanceScheme.System, AppearanceScheme.of("sepia"))
        assertEquals(AppearanceAccent.Terracotta, AppearanceAccent.of(null))
        assertEquals(AppearanceAccent.Wallpaper, AppearanceAccent.of("wallpaper"))
        assertEquals(listOf("terracotta", "sage", "lavender", "yellow", "wallpaper"), AppearanceAccent.entries.map { it.key })
    }
}
