package com.resonance.app

import android.app.Application
import android.content.Context
import android.content.res.Configuration
import com.resonance.design.AppearanceAccent
import com.resonance.design.AppearanceScheme
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * 外觀 is kept on the device, in the settings the backup takes: everyone starts on the system's mode
 * in terracotta; a choice is read back by a new store (the app opened again), said to the system as
 * the app's night mode (Android 12+: the next splash and the WebView follow it), and an unknown
 * value — a later build's, say — reads as the default.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class AppearanceStoreTest {
    private val app: Application get() = RuntimeEnvironment.getApplication()
    private val prefs get() = app.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val told = mutableListOf<AppearanceScheme>()
    private fun store() = AppearanceStore(prefs) { told += it }

    @Test fun everyoneStartsOnTheSystemsModeInTerracotta() {
        val s = store()
        assertEquals(AppearanceStore.Appearance(AppearanceScheme.System, AppearanceAccent.Terracotta), s.state.value)
        assertEquals(emptyMap<String, Any?>(), prefs.all)
    }

    @Test fun thePaperPuppetsAreOffUntilTurnedOnAndTheChoiceIsKept() {
        val s = store()
        assertFalse(s.state.value.mascots)
        s.setMascots(true)
        assertTrue(prefs.getBoolean(AppearanceStore.MASCOTS_KEY, false))
        // The app opened again; turning it on changed nothing else, nor told the system anything.
        assertEquals(AppearanceStore.Appearance(mascots = true), store().state.value)
        assertEquals(emptyList<AppearanceScheme>(), told)
        s.setMascots(false)
        assertFalse(store().state.value.mascots)
    }

    @Test fun aChoiceIsKeptAndToldToTheSystem() {
        val s = store()
        s.setScheme(AppearanceScheme.Dark)
        s.setAccent(AppearanceAccent.Lavender)
        assertEquals(listOf(AppearanceScheme.Dark), told)
        assertEquals("dark", prefs.getString(AppearanceStore.SCHEME_KEY, null))
        assertEquals("lavender", prefs.getString(AppearanceStore.ACCENT_KEY, null))
        // The app opened again.
        assertEquals(AppearanceStore.Appearance(AppearanceScheme.Dark, AppearanceAccent.Lavender), store().state.value)
        // The same choice again changes nothing.
        s.setScheme(AppearanceScheme.Dark)
        assertEquals(1, told.size)
    }

    @Test fun anUnknownValueReadsAsTheDefault() {
        prefs.edit().putString(AppearanceStore.SCHEME_KEY, "sepia").putString(AppearanceStore.ACCENT_KEY, "teal").apply()
        assertEquals(AppearanceStore.Appearance(), store().state.value)
    }

    @Test fun darkIsTheChoiceOrTheSystemsForMatchSystem() {
        val day = Configuration().apply { uiMode = Configuration.UI_MODE_NIGHT_NO or Configuration.UI_MODE_TYPE_NORMAL }
        val night = Configuration().apply { uiMode = Configuration.UI_MODE_NIGHT_YES or Configuration.UI_MODE_TYPE_NORMAL }
        val s = store()
        assertFalse(s.isDark(day))
        assertTrue(s.isDark(night))
        s.setScheme(AppearanceScheme.Light)
        assertFalse(s.isDark(night))
        s.setScheme(AppearanceScheme.Dark)
        assertTrue(s.isDark(day))
    }

    @Test fun thePaletteOutsideComposeIsTheChoicesInTheScheme() {
        val s = store()
        s.setAccent(AppearanceAccent.Sage)
        assertEquals(ResonanceColors.of(PaletteTheme.Sage, dark = true), s.palette(app, dark = true))
        assertEquals(ResonanceColors.of(PaletteTheme.Sage, dark = false), s.palette(app, dark = false))
    }

    @Test @Config(sdk = [30])
    fun theWallpaperBeforeAndroid12IsTerracotta() {
        val s = store()
        s.setAccent(AppearanceAccent.Wallpaper)
        assertEquals(ResonanceColors.of(PaletteTheme.Terracotta, dark = true), s.palette(app, dark = true))
    }
}
