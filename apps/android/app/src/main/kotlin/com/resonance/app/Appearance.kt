package com.resonance.app

import android.app.UiModeManager
import android.content.Context
import android.content.SharedPreferences
import android.content.res.Configuration
import android.os.Build
import com.resonance.design.AppearanceAccent
import com.resonance.design.AppearanceScheme
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors
import com.resonance.design.wallpaperColors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * 外觀 (Settings → 外觀): the reader's 顯示模式 (system · light · dark) and 主題色 (a theme, or the
 * wallpaper's colour on Android 12+), kept on this device in the app's settings
 * (`appearance.scheme`, `appearance.accent`; the backup takes them with the language). Everyone starts
 * on the system's mode in terracotta, and nothing tells them it can change: it is there for whoever
 * opens 外觀. A change applies at once, everywhere — the root's ResonanceTheme reads [state] — and
 * keeps the reader where they are.
 *
 * On Android 12+ the choice of mode is also the app's own night mode
 * ([UiModeManager.setApplicationNightMode]): the system then draws the next launch's splash and
 * the editor's WebView in it, and the configuration says it, so the app's `values-night` and the
 * system bars follow. Before 12 there is no such switch: the screens follow the choice (Compose),
 * the splash the system's mode.
 */
class AppearanceStore(private val prefs: SharedPreferences, private val nightMode: (AppearanceScheme) -> Unit = {}) {
    /** What the reader chose. */
    data class Appearance(val scheme: AppearanceScheme = AppearanceScheme.System, val accent: AppearanceAccent = AppearanceAccent.Terracotta)

    private val _state = MutableStateFlow(read())
    val state: StateFlow<Appearance> = _state.asStateFlow()

    private fun read(): Appearance = Appearance(
        AppearanceScheme.of(prefs.getString(SCHEME_KEY, null)),
        AppearanceAccent.of(prefs.getString(ACCENT_KEY, null)),
    )

    fun setScheme(scheme: AppearanceScheme) {
        if (scheme == _state.value.scheme) return
        prefs.edit().putString(SCHEME_KEY, scheme.key).apply()
        _state.value = _state.value.copy(scheme = scheme)
        nightMode(scheme)
    }

    fun setAccent(accent: AppearanceAccent) {
        if (accent == _state.value.accent) return
        prefs.edit().putString(ACCENT_KEY, accent.key).apply()
        _state.value = _state.value.copy(accent = accent)
    }

    /** Whether the screens are dark now: the choice, or for 跟隨系統 what [configuration] says. */
    fun isDark(configuration: Configuration): Boolean = when (_state.value.scheme) {
        AppearanceScheme.Light -> false
        AppearanceScheme.Dark -> true
        AppearanceScheme.System -> configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    }

    /**
     * The palette the screens wear now, for what draws outside Compose (the in-app browser's bars):
     * in the scheme [dark], the theme chosen — the wallpaper's read again from [context].
     */
    fun palette(context: Context, dark: Boolean = isDark(context.resources.configuration)): ResonanceColors {
        val accent = _state.value.accent
        val theme = accent.theme
        return if (theme != null) ResonanceColors.of(theme, dark)
        else if (AppearanceAccent.wallpaperOffered) wallpaperColors(context, dark)
        else ResonanceColors.of(PaletteTheme.Terracotta, dark)
    }

    companion object {
        const val SCHEME_KEY = "appearance.scheme"
        const val ACCENT_KEY = "appearance.accent"

        /** The process's store (ResonanceApp makes it before any screen). */
        lateinit var shared: AppearanceStore
            private set

        fun init(context: Context) {
            val app = context.applicationContext
            shared = AppearanceStore(app.getSharedPreferences("settings", Context.MODE_PRIVATE)) { applyNightMode(app, it) }
            // Said again at each start: the system keeps it, but a backup restored onto a new phone brings only the choice.
            applyNightMode(app, shared.state.value.scheme)
        }

        /** Android 12+: the app's night mode, the system's own record of the choice (the next splash, WebView, values-night). */
        fun applyNightMode(context: Context, scheme: AppearanceScheme) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
            val mode = when (scheme) {
                AppearanceScheme.System -> UiModeManager.MODE_NIGHT_AUTO
                AppearanceScheme.Light -> UiModeManager.MODE_NIGHT_NO
                AppearanceScheme.Dark -> UiModeManager.MODE_NIGHT_YES
            }
            runCatching { context.getSystemService(UiModeManager::class.java)?.setApplicationNightMode(mode) }
        }
    }
}
