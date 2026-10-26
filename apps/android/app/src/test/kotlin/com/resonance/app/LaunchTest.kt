package com.resonance.app

import androidx.compose.ui.graphics.toArgb
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

/** How the app opens: the splash only on a launch, and the paper's bars kept as it hands off. */
class LaunchTest {
    @Test fun anActivityComingBackOnAndroid10Or11AsksForNoSplash() {
        // The library would lay its own splash over the screen restored under it (a rotation, a font size).
        assertFalse(handsOff(fresh = false, sdk = 29))
        assertFalse(handsOff(fresh = false, sdk = 30))
        assertTrue(handsOff(fresh = true, sdk = 29))
        // From 12 the system shows a splash or doesn't, and hands off only its own.
        assertTrue(handsOff(fresh = false, sdk = 31))
        assertTrue(handsOff(fresh = true, sdk = 36))
    }

    @Test fun thePostSplashThemeKeepsTheBarsSeeThroughWithDarkGlyphs() {
        // Android 12 and 12L copy these onto the window as the splash hands off: Theme.Material's
        // own would put a grey band over the status bar and a black one under the page.
        val items = items("values", "Theme.Resonance")
        assertEquals("@android:color/transparent", items["android:statusBarColor"])
        assertEquals("@android:color/transparent", items["android:navigationBarColor"])
        assertEquals("true", items["android:windowLightStatusBar"])
        assertEquals("true", items["android:windowLightNavigationBar"])
        assertEquals("false", items["android:enforceStatusBarContrast"])
        assertEquals("false", items["android:enforceNavigationBarContrast"])
        assertEquals("@color/paper", items["android:windowBackground"])
    }

    @Test fun inDarkModeTheLaunchAndTheHandOffAreOnTheNightPaperWithLightGlyphs() {
        // values-night: the system's dark mode, or (Android 12+) the app's own night mode that 外觀 sets.
        val theme = items("values-night", "Theme.Resonance")
        assertEquals("@android:color/transparent", theme["android:statusBarColor"])
        assertEquals("@android:color/transparent", theme["android:navigationBarColor"])
        assertEquals("false", theme["android:windowLightStatusBar"])
        assertEquals("false", theme["android:windowLightNavigationBar"])
        assertEquals("@color/paper", theme["android:windowBackground"])
        val splash = items("values-night", "Base.Theme.Resonance.Starting")
        assertEquals("@color/paper", splash["windowSplashScreenBackground"])
        assertEquals("false", splash["android:windowLightStatusBar"])
        // The night paper is the palette's (dark terracotta's color-cream), as the day's is light terracotta's.
        assertEquals(srgb(ResonanceColors.of(PaletteTheme.Terracotta, dark = true).Cream), paper("values-night"))
        assertEquals(srgb(ResonanceColors.LightTerracotta.Cream), paper("values"))
    }

    @Test fun eachThemeHasItsOwnPaperAndAccentOutsideTheScreens() {
        // The launch's paper per theme (Android 13+ wears the chosen one) and the accent the system's own
        // controls take (the writer WebView's selection handles), light and night, as the palette has them.
        for (theme in PaletteTheme.entries) {
            val name = if (theme == PaletteTheme.Terracotta) "paper" else "paper_${theme.key}"
            near(theme.key, srgb(ResonanceColors.of(theme, dark = false).Cream), color("values", name))
            near(theme.key, srgb(ResonanceColors.of(theme, dark = true).Cream), color("values-night", name))
            near(theme.key, srgb(ResonanceColors.of(theme, dark = false).Terracotta), color("values", "accent_${theme.key}"))
            near(theme.key, srgb(ResonanceColors.of(theme, dark = true).Terracotta), color("values-night", "accent_${theme.key}"))
            if (theme != PaletteTheme.Terracotta) {
                val splash = items("values", "Theme.Resonance.Starting.${theme.name}")
                assertEquals("@color/paper_${theme.key}", splash["windowSplashScreenBackground"])
            }
            val overlay = items("values", "ThemeOverlay.Resonance.${theme.name}")
            assertEquals("@color/accent_${theme.key}", overlay["android:colorAccent"])
            assertEquals("@color/accent_${theme.key}", overlay["android:colorControlActivated"])
        }
        // Not Material's teal on the app's own theme either.
        assertEquals("@color/accent_terracotta", items("values", "Theme.Resonance")["android:colorControlActivated"])
        assertEquals("@color/accent_terracotta", items("values-night", "Theme.Resonance")["android:colorControlActivated"])
    }

    private fun items(folder: String, style: String): Map<String, String> {
        val styles = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File("src/main/res/$folder/themes.xml"))
            .documentElement.getElementsByTagName("style")
        val theme = (0 until styles.length).map { styles.item(it) as Element }.single { it.getAttribute("name") == style }
        return theme.getElementsByTagName("item").let { list ->
            (0 until list.length).map { list.item(it) as Element }.associate { it.getAttribute("name") to it.textContent.trim() }
        }
    }

    private fun paper(folder: String): String = color(folder, "paper")

    /** Two #RRGGBB within a step a channel (the generator rounds from OKLCH, the app from Display P3). */
    private fun near(what: String, want: String, got: String) {
        val channels = { hex: String -> (0 until 3).map { hex.substring(1 + it * 2, 3 + it * 2).toInt(16) } }
        assertTrue("$what: $want vs $got", channels(want).zip(channels(got)).all { (a, b) -> kotlin.math.abs(a - b) <= 1 })
    }

    private fun color(folder: String, name: String): String {
        val colors = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File("src/main/res/$folder/colors.xml"))
            .documentElement.getElementsByTagName("color")
        return (0 until colors.length).map { colors.item(it) as Element }.single { it.getAttribute("name") == name }.textContent.trim().uppercase()
    }

    private fun srgb(c: androidx.compose.ui.graphics.Color): String =
        "#%06X".format(c.convert(androidx.compose.ui.graphics.colorspace.ColorSpaces.Srgb).toArgb() and 0xFFFFFF)
}
