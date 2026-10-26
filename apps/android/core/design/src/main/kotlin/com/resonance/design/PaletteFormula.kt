package com.resonance.design

import androidx.compose.ui.graphics.Color
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * The wallpaper's palette (Android 12+, 桌布配色): the Kotlin twin of palette.ts's
 * `wallpaperPalette(hue, chroma, scheme)` — `specForHue`, the light and dark ladders (`lightBase`,
 * `darkBase`) and the recipes every token is drawn from — pinned to it by
 * native/fixtures/palette.json's `wallpaper` samples (PaletteFormulaTest). Only the hue, and the
 * chroma held to the themes' range, come from the system; every lightness is Resonance's ladder, so
 * the paper, the ink and their contrasts stay the brand's. A wallpaper with almost no colour
 * (chroma under [WALLPAPER_MIN_CHROMA]) wears terracotta.
 *
 * The tokens no theme changes — the scheme's own (danger, pastels, scrim, grain…) and the card
 * families' — are the generated tables' (the same in every theme of a scheme), so only the ten base
 * tokens and the recipes on them are worked out here. Also [avatarFill], palette.ts's twin.
 */
object PaletteFormula {
    /** palette.ts WALLPAPER_MIN_CHROMA. */
    const val WALLPAPER_MIN_CHROMA = 0.03

    /** An OKLCH colour: L 0…1, C, H in degrees (kept in 0…360), alpha. */
    data class Lch(val l: Double, val c: Double, val h: Double, val alpha: Double = 1.0)

    private fun lch(l: Double, c: Double, h: Double, alpha: Double = 1.0) = Lch(l, c, ((h % 360) + 360) % 360, alpha)

    /** palette.ts ThemeSpec: a theme's hues and chromas, as the ladders read them. */
    private class Spec(
        val accentHue: Double,
        val accentChroma: Double,
        val neutralHue: Double,
        val neutralChroma: Double,
        val darkNeutralHue: Double,
        val darkNeutralChroma: Double,
        val darkAccent: Lch,
    )

    /** palette.ts `specForHue`. */
    private fun specForHue(hue: Double, chroma: Double): Spec {
        val accentChroma = min(0.14, max(0.06, chroma))
        return Spec(
            accentHue = hue,
            accentChroma = accentChroma,
            neutralHue = hue + 10,
            neutralChroma = 0.013,
            darkNeutralHue = hue + 10,
            darkNeutralChroma = 0.012,
            darkAccent = Lch(0.73, min(0.13, accentChroma), hue + 2),
        )
    }

    /** The wallpaper accent's palette for a system colour of [hue] and [chroma] (OKLCH). */
    fun wallpaperPalette(hue: Double, chroma: Double, dark: Boolean): ResonanceColors =
        if (chroma < WALLPAPER_MIN_CHROMA) ResonanceColors.of(PaletteTheme.Terracotta, dark) else paletteForHue(hue, chroma, dark)

    /** palette.ts `paletteForHue`. */
    fun paletteForHue(hue: Double, chroma: Double, dark: Boolean): ResonanceColors {
        val spec = specForHue(hue, chroma)
        val base = if (dark) darkBase(spec) else lightBase(spec)
        val own = base + if (dark) darkRecipes(base) else lightRecipes(base)
        // The scheme's own tokens and the families': the same in every theme of a scheme.
        val shared = ResonanceColors.of(PaletteTheme.Terracotta, dark).oklch
        val out = DoubleArray(ResonanceColors.TOKENS.size * 4)
        ResonanceColors.TOKENS.forEachIndexed { i, token ->
            val c = own[token]
            if (c == null) {
                System.arraycopy(shared, 4 * i, out, 4 * i, 4)
            } else {
                out[4 * i] = c.l
                out[4 * i + 1] = c.c
                out[4 * i + 2] = c.h
                out[4 * i + 3] = c.alpha
            }
        }
        return ResonanceColors(dark, out)
    }

    /** palette.ts `darkBase`: night paper at 20.5%, the raised card at 24%, the well at 17%, chalk ink at 88%. */
    private fun darkBase(s: Spec): Map<String, Lch> {
        val n = s.darkNeutralChroma
        val h = s.darkNeutralHue
        val k = n / 0.013
        val accent = fitGamut(lch(s.darkAccent.l, s.darkAccent.c, s.darkAccent.h))
        return mapOf(
            "color-cream" to lch(0.205, n, h),
            "color-card-bg" to lch(0.24, n * 1.08, h + 2),
            "color-cream-dark" to lch(0.17, n * 0.85, h - 2),
            "color-text" to lch(0.88, 0.02 * k, h + 14),
            "color-text-muted" to lch(0.68, 0.03 * k, h + 8),
            "field-border" to lch(0.4, 0.02 * k, h + 8),
            "field-border-hover" to lch(0.6, 0.035 * k, h + 4),
            "placeholder" to lch(0.58, 0.03 * k, h + 8),
            "color-terracotta" to accent,
            "color-terracotta-light" to fitGamut(lch(0.36, accent.c * 0.5, accent.h + 5)),
        )
    }

    /** palette.ts `lightBase`: terracotta's lightness at every step, the accent as light as a cream label on its button allows. */
    private fun lightBase(s: Spec): Map<String, Lch> {
        val n = s.neutralChroma
        val h = s.neutralHue
        val cream = lch(0.965, n, h)
        var accent = fitGamut(lch(0.62, s.accentChroma, s.accentHue))
        while (accent.l > 0.4 && contrast(cream, mixWithBlack(accent, 0.12)) < 4.6) accent = fitGamut(accent.copy(l = accent.l - 0.01))
        return mapOf(
            "color-cream" to cream,
            "color-cream-dark" to lch(0.93, n * 1.2, h),
            "color-card-bg" to lch(0.975, n * 0.67, h + 5),
            "color-text" to lch(0.26, n * 2, h),
            "color-text-muted" to lch(0.51, n * 2.67, h),
            "field-border" to lch(0.8, n * 1.33, h),
            "field-border-hover" to lch(0.6, n * 2.67, h),
            "placeholder" to lch(0.64, n * 2, h),
            "color-terracotta" to accent,
            "color-terracotta-light" to fitGamut(lch(0.87, s.accentChroma * 0.53, s.accentHue + 5)),
        )
    }

    /** palette.ts `over(a, p, b)`: a mixed over b with a's share p. */
    private fun over(a: Lch, p: Double, b: Lch) = mix(a, b, p)

    /** palette.ts `deepenUntil`. */
    private fun deepenUntil(c: Lch, share: Double, other: Lch, min: Double): Lch {
        var k = share
        while (k < 0.6 && contrast(mixWithBlack(c, k), other) < min) k += 0.01
        return mixWithBlack(c, k)
    }

    /** palette.ts RECIPES.light. */
    private fun lightRecipes(b: Map<String, Lch>): Map<String, Lch> {
        val accent = b.getValue("color-terracotta")
        val wash = b.getValue("color-terracotta-light")
        val cream = b.getValue("color-cream")
        val well = b.getValue("color-cream-dark")
        val text = b.getValue("color-text")
        val muted = b.getValue("color-text-muted")
        return mapOf(
            "bubble-mine" to over(wash, 0.62, cream),
            "bubble-theirs" to over(text, 0.07, cream),
            "bubble-quote" to over(text, 0.11, cream),
            "link-card-muted" to over(text, 0.27, muted),
            "reading-progress" to fitGamut(lch(accent.l + 0.08, accent.c + 0.03, accent.h + 5)),
            "button-fill" to deepenUntil(accent, 0.12, cream, 4.6),
            "button-tonal" to over(wash, 0.75, well),
            "button-on-tonal" to deepenUntil(accent, 0.22, over(wash, 0.75, well), 4.6),
            "terracotta-ink" to mixWithBlack(accent, 0.35),
            "terracotta-deep" to mixWithBlack(accent, 0.25),
            "terracotta-outline" to mixWithBlack(accent, 0.15),
            "auth-interior" to over(wash, 0.14, b.getValue("color-card-bg")),
            "auth-border" to mixWithBlack(accent, 0.18),
            "toggle-off" to lch(0.86, cream.c * 1.33, cream.h),
            "toggle-off-stroke" to lch(0.7, muted.c * 0.75, muted.h),
            "ghost-stroke" to lch(0.44, muted.c, muted.h),
            "modal-border" to lch(0.4, text.c * 2, text.h),
            "segment-idle-ink" to mixWithBlack(muted, 0.1),
            "link-wave" to lch(accent.l + 0.03, accent.c * 0.6, accent.h),
            "story-code-tint" to text.copy(alpha = 0.06),
            "footer-bg" to text,
            "footer-ink" to cream,
            "cta-band" to accent,
            "cta-ink" to cream,
        )
    }

    /** palette.ts RECIPES.dark. */
    private fun darkRecipes(b: Map<String, Lch>): Map<String, Lch> {
        val accent = b.getValue("color-terracotta")
        val paper = b.getValue("color-cream")
        val wash = b.getValue("color-terracotta-light")
        val text = b.getValue("color-text")
        val muted = b.getValue("color-text-muted")
        return mapOf(
            "bubble-mine" to over(wash, 0.8, paper),
            "bubble-theirs" to over(text, 0.1, paper),
            "bubble-quote" to lch(0.24, paper.c * 0.85, paper.h + 4),
            "link-card-muted" to over(text, 0.35, muted),
            "reading-progress" to fitGamut(lch(accent.l + 0.07, accent.c + 0.015, accent.h + 7)),
            "button-fill" to accent,
            "button-tonal" to over(wash, 0.75, b.getValue("color-cream-dark")),
            "button-on-tonal" to fitGamut(lch(accent.l + 0.1, accent.c * 0.75, accent.h + 7)),
            "terracotta-ink" to over(accent, 0.65, text),
            "terracotta-deep" to over(accent, 0.75, text),
            "terracotta-outline" to over(accent, 0.85, text),
            "auth-interior" to over(wash, 0.14, b.getValue("color-card-bg")),
            "auth-border" to over(accent, 0.82, text),
            "toggle-off" to lch(0.32, paper.c * 1.33, paper.h + 8),
            "toggle-off-stroke" to lch(0.52, muted.c * 0.75, muted.h),
            "ghost-stroke" to lch(0.78, muted.c, muted.h),
            "modal-border" to lch(0.8, text.c * 2, text.h),
            "segment-idle-ink" to over(text, 0.1, muted),
            "link-wave" to lch(accent.l - 0.06, accent.c * 0.6, accent.h),
            "story-code-tint" to text.copy(alpha = 0.08),
            "footer-bg" to lch(0.15, paper.c * 0.75, paper.h),
            "footer-ink" to text,
            "cta-band" to fitGamut(lch(0.44, accent.c * 0.78, accent.h - 2)),
            "cta-ink" to lch(0.93, text.c, text.h),
        )
    }

    /**
     * An avatar's stored colour as the scheme draws it (palette.ts `avatarFill`): the stored pastel in
     * light; in dark the same hue at the ladder's avatar step, so the chalk initials read on it and a
     * person keeps their colour across schemes. Null when [stored] is no oklch() colour.
     */
    fun avatarFill(stored: String, dark: Boolean): Color? {
        if (!dark) return OklchColor.parse(stored)
        synchronized(darkAvatars) { darkAvatars[stored]?.let { return it } }
        val c = OklchColor.parseOklch(stored) ?: return null
        val fill = fitGamut(lch(0.4, c[1] * 0.85, c[2], c[3]))
        return OklchColor.of(fill.l, fill.c, fill.h, fill.alpha).also { synchronized(darkAvatars) { darkAvatars[stored] = it } }
    }

    /** The dark fills worked out lately, by their stored colour (a few people's repeat down every list). */
    private val darkAvatars = object : LinkedHashMap<String, Color>(32, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Color>?) = size > 64
    }

    // ── colour maths (palette.ts / oklch.ts) ─────────────────────────────────────

    /** CSS Color 5 `color-mix(in oklch, c, black share)`: black has no hue, so c's carries. */
    private fun mixWithBlack(c: Lch, share: Double): Lch {
        val k = 1 - share
        return Lch(c.l * k, c.c * k, c.h, c.alpha)
    }

    /** CSS Color 5 `color-mix(in oklch, a p, b)`: shorter-arc hue interpolation. */
    private fun mix(a: Lch, b: Lch, p: Double): Lch {
        var dh = b.h - a.h
        if (dh > 180) dh -= 360
        if (dh < -180) dh += 360
        val h = ((a.h + dh * (1 - p)) % 360 + 360) % 360
        return Lch(a.l * p + b.l * (1 - p), a.c * p + b.c * (1 - p), h, a.alpha * p + b.alpha * (1 - p))
    }

    private fun linearSrgb(c: Lch): DoubleArray {
        val a = c.c * cos(Math.toRadians(c.h))
        val b = c.c * sin(Math.toRadians(c.h))
        val l = (c.l + 0.3963377774 * a + 0.2158037573 * b).pow(3)
        val m = (c.l - 0.1055613458 * a - 0.0638541728 * b).pow(3)
        val s = (c.l - 0.0894841775 * a - 1.291485548 * b).pow(3)
        return doubleArrayOf(
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
        )
    }

    /** Inside Display P3 (the app's gamut). */
    private fun inP3(c: Lch): Boolean {
        val (r, g, b) = linearSrgb(c).let { Triple(it[0], it[1], it[2]) }
        val p3 = doubleArrayOf(0.8224621 * r + 0.177538 * g, 0.0331941 * r + 0.9668058 * g, 0.0170827 * r + 0.0723974 * g + 0.9105199 * b)
        return p3.all { it >= -1e-4 && it <= 1 + 1e-4 }
    }

    /** palette.ts `fitGamut`: chroma lowered until the colour fits Display P3 (lightness and hue kept). */
    private fun fitGamut(c: Lch): Lch {
        if (inP3(c)) return c
        var lo = 0.0
        var hi = c.c
        repeat(24) {
            val mid = (lo + hi) / 2
            if (inP3(c.copy(c = mid))) lo = mid else hi = mid
        }
        return c.copy(c = lo)
    }

    /** WCAG 2 relative luminance as sRGB shows the colour (clamped), alpha ignored. */
    private fun luminance(c: Lch): Double {
        val v = linearSrgb(c).map { it.coerceIn(0.0, 1.0) }
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
    }

    /** WCAG 2 contrast of two opaque colours. */
    private fun contrast(a: Lch, b: Lch): Double {
        val x = luminance(a)
        val y = luminance(b)
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }
}
