package com.resonance.design

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.generated.ResonanceColors
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * CSS `oklch(L C H [/ a])` → Display P3, the conversion scripts/native/tokens.ts
 * uses for the static tokens — for colors that arrive as data (a profile's
 * accent color is stored as its CSS string).
 */
object OklchColor {
    private val pattern = Regex("""oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*/\s*([\d.]+))?\s*\)""")

    /** The colours parsed lately, by their string (a few dozen accents and mixes repeat across every card). */
    private val parsed = object : LinkedHashMap<String, Color?>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Color?>?) = size > PARSED_KEPT
    }
    private const val PARSED_KEPT = 128

    fun parse(css: String): Color? = synchronized(parsed) {
        if (parsed.containsKey(css)) return parsed[css]
        val color = convert(css)
        parsed[css] = color
        color
    }

    private fun convert(css: String): Color? = parseOklch(css)?.let { (l, c, h, alpha) -> of(l, c, h, alpha) }

    /** `oklch(L C H [/ a])` as numbers: L (0…1), C, H, alpha; null for anything else. */
    fun parseOklch(css: String): DoubleArray? {
        val m = pattern.find(css) ?: return null
        var l = m.groupValues[1].toDouble()
        if (m.groupValues[2] == "%") l /= 100
        return doubleArrayOf(l, m.groupValues[3].toDouble(), m.groupValues[4].toDouble(), m.groupValues[5].toDoubleOrNull() ?: 1.0)
    }

    /** `oklch(L C H / alpha)` from numbers (L in 0..1), for colors computed at run time (the thought map's per-hue inks). */
    fun of(l: Double, c: Double, h: Double, alpha: Double = 1.0): Color {
        val a = c * cos(Math.toRadians(h))
        val b = c * sin(Math.toRadians(h))
        val lp = (l + 0.3963377774 * a + 0.2158037573 * b).pow(3)
        val mp = (l - 0.1055613458 * a - 0.0638541728 * b).pow(3)
        val sp = (l - 0.0894841775 * a - 1.291485548 * b).pow(3)
        val sr = 4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp
        val sg = -1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp
        val sb = -0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp
        fun enc(x: Double): Float {
            val v = x.coerceIn(0.0, 1.0)
            return (if (v <= 0.0031308) 12.92 * v else 1.055 * v.pow(1 / 2.4) - 0.055).toFloat()
        }
        return Color(
            enc(0.8224621 * sr + 0.177538 * sg),
            enc(0.0331941 * sr + 0.9668058 * sg),
            enc(0.0170827 * sr + 0.0723974 * sg + 0.9105199 * sb),
            alpha.toFloat(),
            ColorSpaces.DisplayP3,
        )
    }

    /**
     * An sRGB colour (`0xAARRGGBB`, as resources give it: the system's accent) as OKLCH — L (0…1),
     * C, H (degrees), alpha: the inverse of [of], by Björn Ottosson's matrices.
     */
    fun toOklch(argb: Int): DoubleArray {
        fun lin(channel: Int): Double {
            val v = channel / 255.0
            return if (v <= 0.04045) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
        }
        val r = lin((argb shr 16) and 0xff)
        val g = lin((argb shr 8) and 0xff)
        val b = lin(argb and 0xff)
        val l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        val m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        val s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        val okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
        val okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
        val okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
        val c = kotlin.math.sqrt(okA * okA + okB * okB)
        val h = (Math.toDegrees(kotlin.math.atan2(okB, okA)) + 360) % 360
        return doubleArrayOf(okL, c, h, ((argb ushr 24) and 0xff) / 255.0)
    }
}

/**
 * The story-card palette (StoryCard.tsx, lib/design/dominantHue): the slot
 * nearest the cover's dominant hue, or by position when there is none — a
 * card's own preference. A card in a list wears the family [palettes] gives it
 * there instead ([of]), so no card shares one with the three before it.
 */
@Immutable
class CardPalette private constructor(val index: Int) {
    constructor(accentHue: Double?, position: Int) : this(preferred(accentHue, position))
    val hue: Double get() = HUES[index]
    /** The family's colours as the screen's palette draws them (the scheme and theme on screen). */
    val colors: CardFamily @Composable @ReadOnlyComposable get() = CardFamily(LocalResonanceColors.current, index)
    /** The family in [palette]: an image that leaves the device draws in ResonanceColors.LightTerracotta. */
    fun colorsIn(palette: ResonanceColors): CardFamily = CardFamily(palette, index)
    val fill: Color @Composable @ReadOnlyComposable get() = colors.fill
    val border: Color @Composable @ReadOnlyComposable get() = colors.border
    /** The family's stronger pen (`card-border-deep`): the face of the writer's cover buttons (round 9 §8). */
    val deep: Color @Composable @ReadOnlyComposable get() = colors.deep
    /** `card-interior` — the card's paper. */
    val interior: Color @Composable @ReadOnlyComposable get() = colors.interior
    /** `card-separator` — the wavy rule above the byline. */
    val separator: Color @Composable @ReadOnlyComposable get() = colors.separator
    /** `card-note-ink` — Resonance's handwritten margin note. */
    val noteInk: Color @Composable @ReadOnlyComposable get() = colors.noteInk
    /** `card-stripe` — the cover placeholder's hatching (StoryCard's `stripeFill`), drawn at 0.28. */
    val stripe: Color @Composable @ReadOnlyComposable get() = colors.stripe
    /** `card-accent` — MiniStoryCard's cover fallback and avatar when the author has no accent. */
    val accent: Color @Composable @ReadOnlyComposable get() = colors.accent
    /** `card-hover` — a card's paper while pressed (StoryCard's hover wash). */
    val hover: Color @Composable @ReadOnlyComposable get() = colors.hover

    /** A family is its index: two palettes of one family are the same palette. */
    override fun equals(other: Any?): Boolean = other is CardPalette && other.index == index
    override fun hashCode(): Int = index

    companion object {
        /** CARD_HUES, in palette order. */
        val HUES = listOf(55.0, 290.0, 140.0, 88.0, 215.0, 18.0)
        /**
         * A card's own family before it has a cover (round 9 §8): from its id, by the bubbles' hash
         * ([seedFromId] % 6, twinned on the web and iOS), so the writer's preview of a coverless card
         * — and its cover buttons — wear one stable family of the six, not always the first; a card
         * with no id yet keeps family 0. A cover's hue, when it has one, still wins ([preferred]).
         */
        fun ofId(id: String?): Int = if (id.isNullOrEmpty()) 0 else seedFromId(id).toInt() % HUES.size
        private fun distance(a: Double, b: Double): Double {
            val d = abs(a - b) % 360
            return min(d, 360 - d)
        }

        fun nearest(hue: Double): Int = HUES.indices.minBy { distance(hue, HUES[it]) }

        /** The palette of family [index] (0…5, in [HUES] order): a card coloured by its list ([palettes]). */
        fun of(index: Int): CardPalette = CardPalette(Math.floorMod(index, HUES.size))

        /** A card's own family (cardColours.ts `preferredPalette`): nearest its cover's hue, else its position's. */
        fun preferred(accentHue: Double?, position: Int): Int = accentHue?.let(::nearest) ?: Math.floorMod(position, HUES.size)

        /** How many cards before a card its family must differ from (`CARD_COLOUR_WINDOW`). */
        const val WINDOW = 3

        /**
         * For each family, the other five, nearest hue first, equally near the lower index first
         * (`CARD_FAMILY_ORDER`): where a clash moves a card.
         */
        val ORDER: List<List<Int>> = HUES.indices.map { family ->
            HUES.indices.filter { it != family }.sortedWith(compareBy<Int>({ distance(HUES[family], HUES[it]) }, { it }))
        }

        /**
         * The family of every card of a list, in display order, from the cards' cover hues (null:
         * none) — cardColours.ts `cardPalettes`, pinned by native/fixtures/card-colours.json. A card
         * keeps its preference unless one of the [WINDOW] cards before it wears it, then takes the
         * first family of [ORDER] none of them wears. Colour the list as it is shown (after blocks,
         * across every loaded page, skeletons after the cards as hue-less cards): each card depends
         * only on those before it, so appending a page recolours nothing, and one rule serves one
         * column, two and three (row-major) alike.
         */
        fun palettes(hues: List<Double?>): List<Int> {
            val out = ArrayList<Int>(hues.size)
            for (i in hues.indices) {
                val near = out.subList(maxOf(0, i - WINDOW), i)
                val own = preferred(hues[i], i)
                out.add(if (own in near) ORDER[own].first { it !in near } else own)
            }
            return out
        }
    }
}

/** One card family's colours in one palette (palette.ts's `card-*-{i}` tokens). */
@Immutable
class CardFamily(palette: ResonanceColors, index: Int) {
    val fill: Color = palette.CardFills[index]
    val border: Color = palette.CardBorders[index]
    val deep: Color = palette.CardBorderDeeps[index]
    val interior: Color = palette.CardInteriors[index]
    val separator: Color = palette.CardSeparators[index]
    val noteInk: Color = palette.CardNoteInks[index]
    val stripe: Color = palette.CardStripes[index]
    val accent: Color = palette.CardAccents[index]
    val hover: Color = palette.CardHovers[index]
    val skeleton: Color = palette.CardSkeletons[index]
}

/**
 * Colours the web mixes from its palette in CSS (`color-mix(in oklch, …)`) that are no palette
 * token, mixed here from the screen's palette — so they follow the scheme and theme as the CSS
 * does. Each is worked out once per palette ([PaletteMixes]).
 */
object Mixes {
    /** OrganicMenu's destructive-row wash: color-mix(yellow 25%, the paper); 45% while pressed. */
    val MenuDangerWash: Color @Composable @ReadOnlyComposable get() = PaletteMixes.of(LocalResonanceColors.current).menuDangerWash
    val MenuDangerWashPressed: Color @Composable @ReadOnlyComposable get() = PaletteMixes.of(LocalResonanceColors.current).menuDangerWashPressed
    /** Skeleton's sand: color-mix(color-mix(cream-dark 94%, text) 85%, transparent) in light; in dark the ink at a whisper on the paper, as a bubble of theirs. */
    val SkeletonBase: Color @Composable @ReadOnlyComposable get() = PaletteMixes.of(LocalResonanceColors.current).skeletonBase

    /** Skeleton's shimmer for a card of [hue] (the theme's accent family's, 55, by default). */
    @Composable @ReadOnlyComposable
    fun skeletonHighlight(hue: Double = 55.0): Color = PaletteMixes.of(LocalResonanceColors.current).skeletonHighlight(hue)

    /** HandDrawnImage's ✕ chip: over a picture, the same in either scheme ([OverPicture]). */
    val ImageRemoveFill: Color get() = OverPicture.ChipFill
    val ImageRemoveStroke: Color get() = OverPicture.ChipRim

    /**
     * A card family's tint ([token] without its index: `card-accent`, `card-hover`…) at any [hue], not
     * only the six families' — a card's own cover hue: the family tokens' lightness and chroma (the
     * same in every family) at that hue.
     */
    @Composable @ReadOnlyComposable
    fun atHue(token: String, hue: Double): Color = PaletteMixes.of(LocalResonanceColors.current).atHue(token, hue)

    /** [PaletteMixes.skeletonHighlight] in light terracotta, as OKLCH numbers (L 0…1, C, H in degrees). */
    internal fun skeletonHighlightOklch(hue: Double): Triple<Double, Double, Double> = PaletteMixes.skeletonHighlightOklch(ResonanceColors.LightTerracotta, hue)
}

/**
 * What is drawn over a photo — a chip's pebble, a crop's dimmed outside, a ring round the avatar to
 * be — reads against the picture, not the paper: the same in either scheme, as the picture viewer's
 * dark is.
 */
object OverPicture {
    /** A dark translucent pebble (HandDrawnImage's ✕ chip). */
    val ChipFill: Color = OklchColor.of(0.3, 0.02, 70.0, 0.7)
    /** Its pale rim. */
    val ChipRim: Color = OklchColor.of(0.96, 0.02, 75.0, 0.75)
    /** The crop's photo outside the avatar's outline. */
    val Scrim: Color = OklchColor.of(0.3, 0.02, 70.0, 0.5)
    /** The ring round the avatar to be: light terracotta's paper at 0.9. */
    val Rim: Color = ResonanceColors.LightTerracotta.Cream.copy(alpha = 0.9f)
}

/** [Mixes] for one palette, mixed once. */
class PaletteMixes private constructor(private val palette: ResonanceColors) {
    private fun lch(token: String) = palette.oklchOf(token)

    val menuDangerWash: Color = mixed(lch("color-yellow"), lch("color-cream"), 0.25)
    val menuDangerWashPressed: Color = mixed(lch("color-yellow"), lch("color-cream"), 0.45)
    val skeletonBase: Color = if (palette.dark) {
        mixed(lch("color-text"), lch("color-cream"), 0.1).copy(alpha = 0.85f)
    } else {
        val sand = mix(lch("color-cream-dark"), lch("color-text"), 0.94)
        OklchColor.of(sand[0], sand[1], sand[2], 0.85)
    }

    private val highlights = HashMap<Double, Color>()
    private val tints = HashMap<String, Color>()

    /** [Mixes.atHue]. */
    fun atHue(token: String, hue: Double): Color = synchronized(tints) {
        tints.getOrPut("$token|$hue") { lch("$token-0").let { t -> OklchColor.of(t[0], t[1], hue, t[3]) } }
    }

    /**
     * The shimmer's highlight for a card of [hue]: the family's skeleton tint (`card-skeleton`'s
     * lightness and chroma at that hue) — in light mixed halfway to the paper in OKLab (the web's
     * `color-mix(in oklab, highlight 50%, cream)`: the average of L, a and b, not round the hue
     * circle, where a lavender card's light swung through red to pink); in dark as it is, a sweep of
     * light over the [skeletonBase].
     */
    fun skeletonHighlight(hue: Double): Color = synchronized(highlights) {
        highlights.getOrPut(hue) { skeletonHighlightOklch(palette, hue).let { (l, c, h) -> OklchColor.of(l, c, h) } }
    }

    companion object {
        private val made = HashMap<ResonanceColors, PaletteMixes>()

        fun of(palette: ResonanceColors): PaletteMixes = synchronized(made) {
            made.getOrPut(palette) { PaletteMixes(palette) }.also { if (made.size > 16) made.keys.retainAll(setOf(palette)) }
        }

        internal fun skeletonHighlightOklch(palette: ResonanceColors, hue: Double): Triple<Double, Double, Double> {
            val tint = palette.oklchOf("card-skeleton-0")
            if (palette.dark) return Triple(tint[0], tint[1], hue)
            fun lab(l: Double, c: Double, h: Double) = Triple(l, c * cos(Math.toRadians(h)), c * sin(Math.toRadians(h)))
            val cream = palette.oklchOf("color-cream")
            val (l1, a1, b1) = lab(tint[0], tint[1], hue)
            val (l2, a2, b2) = lab(cream[0], cream[1], cream[2])
            val l = (l1 + l2) / 2
            val a = (a1 + a2) / 2
            val b = (b1 + b2) / 2
            val h = (Math.toDegrees(kotlin.math.atan2(b, a)) + 360) % 360
            return Triple(l, kotlin.math.sqrt(a * a + b * b), h)
        }

        /** CSS Color 5 `color-mix(in oklch, a p, b)`: shorter-arc hue (palette.ts `mix`). */
        internal fun mix(a: DoubleArray, b: DoubleArray, p: Double): DoubleArray {
            var dh = b[2] - a[2]
            if (dh > 180) dh -= 360
            if (dh < -180) dh += 360
            val h = ((a[2] + dh * (1 - p)) % 360 + 360) % 360
            return doubleArrayOf(a[0] * p + b[0] * (1 - p), a[1] * p + b[1] * (1 - p), h, a[3] * p + b[3] * (1 - p))
        }

        private fun mixed(a: DoubleArray, b: DoubleArray, p: Double): Color = mix(a, b, p).let { OklchColor.of(it[0], it[1], it[2], it[3]) }
    }
}
