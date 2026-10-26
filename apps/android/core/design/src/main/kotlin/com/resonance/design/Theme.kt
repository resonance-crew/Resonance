package com.resonance.design

import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import com.resonance.design.generated.Tokens
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.ReadOnlyComposable
import android.content.Context
import android.os.Build
import androidx.annotation.ChecksSdkIntAtLeast
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors

/** 顯示模式: the system's (the default), or the reader's own. [key] is what the app's preferences keep. */
enum class AppearanceScheme(val key: String) {
    System("system"),
    Light("light"),
    Dark("dark");

    companion object {
        fun of(key: String?): AppearanceScheme = entries.firstOrNull { it.key == key } ?: System
    }
}

/**
 * 主題色: one of the four themes (赤陶 the default), or — Android 12 and later only — the wallpaper's
 * colour ([Wallpaper], the system accent through [PaletteFormula]). [key] is what the preferences keep.
 */
enum class AppearanceAccent(val key: String, val theme: PaletteTheme?) {
    Terracotta("terracotta", PaletteTheme.Terracotta),
    Sage("sage", PaletteTheme.Sage),
    Lavender("lavender", PaletteTheme.Lavender),
    Yellow("yellow", PaletteTheme.Yellow),
    Wallpaper("wallpaper", null);

    companion object {
        fun of(key: String?): AppearanceAccent = entries.firstOrNull { it.key == key } ?: Terracotta

        /** The wallpaper's colour is offered from Android 12 (its system palette). */
        @get:ChecksSdkIntAtLeast(api = Build.VERSION_CODES.S)
        val wallpaperOffered: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    }
}

/**
 * The whole app's colours: [scheme] resolved against the system (what the configuration says — on
 * Android 12+ the app's own night mode, set from the same choice, so it already agrees), [accent]
 * to a palette, provided as [LocalResonanceColors] (what every Tokens colour reads) with
 * Material's scheme built from the same palette, never Material's own tonal surfaces.
 */
@Composable
fun ResonanceTheme(scheme: AppearanceScheme, accent: AppearanceAccent, content: @Composable () -> Unit) {
    val dark = when (scheme) {
        AppearanceScheme.System -> isSystemInDarkTheme()
        AppearanceScheme.Light -> false
        AppearanceScheme.Dark -> true
    }
    ResonanceTheme(rememberPalette(accent, dark), content)
}

/** [colors] for everything below: the Tokens' palette and Material's scheme made from it. */
@Composable
fun ResonanceTheme(colors: ResonanceColors, content: @Composable () -> Unit) {
    val material = remember(colors) { materialColors(colors) }
    val selection = remember(colors) { selectionColors(colors) }
    CompositionLocalProvider(LocalResonanceColors provides colors) {
        MaterialTheme(colorScheme = material) {
            CompositionLocalProvider(LocalTextSelectionColors provides selection, content = content)
        }
    }
}

/**
 * The palette [accent] wears in the scheme: a theme's table, or the wallpaper's, read again when the
 * configuration changes (a new wallpaper, the system's theme) — terracotta's before Android 12.
 */
@Composable
fun rememberPalette(accent: AppearanceAccent, dark: Boolean): ResonanceColors {
    val theme = accent.theme
    if (theme != null || !AppearanceAccent.wallpaperOffered) return ResonanceColors.of(theme ?: PaletteTheme.Terracotta, dark)
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    return remember(configuration, dark) { wallpaperColors(context, dark) }
}

/** The system's accent as a palette ([PaletteFormula.wallpaperPalette]); terracotta's before Android 12. */
fun wallpaperColors(context: Context, dark: Boolean): ResonanceColors {
    val accent = systemAccent(context) ?: return ResonanceColors.of(PaletteTheme.Terracotta, dark)
    return PaletteFormula.wallpaperPalette(accent[2], accent[1], dark)
}

/** The wallpaper's accent (`system_accent1_500`, the middle of Material You's accent ramp) as OKLCH, Android 12+. */
fun systemAccent(context: Context): DoubleArray? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
    return runCatching { OklchColor.toOklch(context.getColor(android.R.color.system_accent1_500)) }.getOrNull()
}

/**
 * A profile's stored avatar colour as the screen's scheme draws it (palette.ts `avatarFill`): the
 * pastel itself in light, the same hue deep enough for the chalk initials in dark — a person keeps
 * their colour across schemes. [fallback] when there is none (or none that reads): `avatar-wait`, a
 * disc raised off the paper, not a hole in it.
 */
@Composable @ReadOnlyComposable
fun avatarFill(stored: String?, fallback: Color = Tokens.AvatarWait): Color =
    stored?.let { PaletteFormula.avatarFill(it, LocalResonanceColors.current.dark) } ?: fallback

/** Selected words in a field: the accent's handles over a see-through wash of it (the web's ::selection, 30%). */
fun selectionColors(c: ResonanceColors) = TextSelectionColors(handleColor = c.Terracotta, backgroundColor = c.Terracotta.copy(alpha = 0.3f))

/** Material 3's roles, from the palette (what a Material component — pull to refresh, a selection handle — reads). */
fun materialColors(c: ResonanceColors): ColorScheme {
    val scheme = if (c.dark) darkColorScheme() else lightColorScheme()
    return scheme.copy(
        primary = c.Terracotta, onPrimary = c.Cream, primaryContainer = c.TerracottaLight, onPrimaryContainer = c.Text,
        secondary = c.TextMuted, onSecondary = c.Cream, tertiary = c.TerracottaDeep, onTertiary = c.Cream,
        background = c.Cream, onBackground = c.Text, surface = c.Cream, onSurface = c.Text,
        surfaceVariant = c.CreamDark, onSurfaceVariant = c.TextMuted, surfaceContainer = c.CardBg, surfaceContainerHigh = c.CardBg,
        surfaceContainerLow = c.Cream, surfaceContainerLowest = c.Cream, surfaceContainerHighest = c.CardBg, inverseSurface = c.Text,
        inverseOnSurface = c.Cream, outline = c.FieldBorderHover, outlineVariant = c.FieldBorder, error = c.Danger, onError = c.Cream,
        scrim = c.Scrim,
    )
}
