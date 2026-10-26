package com.resonance.design

import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.text.LineBreaker
import android.os.Build
import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.style.CharacterStyle
import android.text.style.ForegroundColorSpan
import android.text.style.MetricAffectingSpan
import android.text.style.StrikethroughSpan
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.layout.layout
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.CollectionItemInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.collectionItemInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.resonance.design.generated.Tokens
import com.resonance.geometry.penWave
import com.resonance.geometry.wavyVertical
import com.resonance.kit.chat.LinkPreview
import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.ProseMetrics
import com.resonance.kit.l10n.L10n
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryScripts
import java.util.Locale
import com.resonance.geometry.seedFromString
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * How a run of story text looks — the reader's `.story-prose` (src/styles/story.css), from the
 * story's type ([StoryType]: by its script and the window): [body] for its words, quotes and
 * lists, [heading] for its h2–h6, [title] for the card's title.
 */
data class ProseStyle(
    val family: AppFonts.Family,
    val size: Float,
    val weight: Int,
    val lineHeight: Float,
    val color: Color,
    val italic: Boolean = false,
    /** CSS letter-spacing in em. */
    val tracking: Float = 0f,
    /** Inside a quote: its pictures and cards keep to the quote's edge instead of centring in the column. */
    val inQuote: Boolean = false,
    /** Justified between characters where the device can (a CJK story's words: [StoryType.justificationMode]); else ragged. */
    val justified: Boolean = false,
    /** Lines evened out (`text-wrap: balance`): the title and the headings. */
    val balanced: Boolean = false,
    /** `**bold**`'s weight (`--story-bold`). */
    val boldWeight: Int = 700,
    /** Lining figures (`font-variant-numeric: lining-nums`): 「2400 公尺」 stands level in a Playfair title. */
    val lining: Boolean = false,
    /** A CJK story's apostrophe inside a Latin word (don’t) in [AppFonts.Family.latin] (story.css `.story-latin-mark`). */
    val latinMarks: Boolean = false,
    /** The story's language (a BCP 47 tag, or none): its line breaking, its glyphs' regional forms and TalkBack's voice. */
    val lang: String? = null,
    /** Inline code's size, × the text around it (`--story-code`). */
    val codeScale: Float = 1f,
    /** Where its lines sit in their box: the start, as running text does; a table's column may centre them or end them. */
    val align: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL,
    /** Tabular figures (`font-variant-numeric: tabular-nums`): a table's numbers stand in columns. */
    val tabular: Boolean = false,
) {
    /** A quote's words: muted and upright (no slanted Chinese), still the body's size and type. */
    val quoted get() = copy(color = Tokens.TextMuted, italic = false, inQuote = true)

    companion object {
        /** The story's words in [type], in [lang]. */
        fun body(type: StoryType, lang: String? = null) = ProseStyle(
            type.bodyFamily, type.bodySize, type.bodyWeight, type.bodyLeading, Tokens.Text,
            tracking = type.bodyTracking, justified = type.justified, boldWeight = type.boldWeight,
            latinMarks = type.cjk, lang = lang, codeScale = Tokens.StoryCode,
        )

        /** A heading of the story (`#` and `##` as the reader's h2, the rest as its h3), in the ink of what holds it. */
        fun heading(type: StoryType, level: Int, lang: String? = null, color: Color = Tokens.Text) = ProseStyle(
            type.headingFamily, type.headingSize(level), type.headingWeight, type.headingLeading, color,
            tracking = type.headingTracking, balanced = true, boldWeight = type.boldWeight, lining = true,
            latinMarks = type.cjk, lang = lang, codeScale = Tokens.StoryCode,
        )

        /** The card's title over its story. */
        fun title(type: StoryType, lang: String? = null) = ProseStyle(
            type.headingFamily, type.titleSize, type.headingWeight, type.titleLeading, Tokens.Text,
            tracking = type.headingTracking, balanced = true, boldWeight = type.headingWeight, lining = true,
            latinMarks = type.cjk, lang = lang,
        )
    }
}

/** Browsers slant upright glyphs for italics when a face has none (the site loads none): AppFonts' one shear. */
private class SyntheticItalicSpan : MetricAffectingSpan() {
    override fun updateDrawState(tp: TextPaint) { tp.textSkewX = -ITALIC_SHEAR }
    override fun updateMeasureState(tp: TextPaint) { tp.textSkewX = -ITALIC_SHEAR }
}

/** The shear of a synthetic italic: AppFonts.oblique's, iOS's and the browser's. */
private const val ITALIC_SHEAR = 0.25f

private class TypefaceWeightSpan(private val typeface: Typeface) : MetricAffectingSpan() {
    override fun updateDrawState(tp: TextPaint) { tp.typeface = typeface }
    override fun updateMeasureState(tp: TextPaint) { tp.typeface = typeface }
}

/** Inline code: monospace at [scale] of the text around it, never tracked (story.css `code`). */
private class CodeSpan(private val scale: Float) : MetricAffectingSpan() {
    private fun apply(tp: TextPaint) {
        tp.typeface = Typeface.MONOSPACE
        tp.textSize *= scale
        tp.letterSpacing = 0f
    }
    override fun updateDrawState(tp: TextPaint) = apply(tp)
    override fun updateMeasureState(tp: TextPaint) = apply(tp)
}

/**
 * A link in running text: terracotta, with no straight underline — [RichCssText]
 * draws the pen's wave under each line the link covers — and taps resolved there.
 */
class LinkSpan(val url: String, private val color: Int) : CharacterStyle() {
    override fun updateDrawState(tp: TextPaint) {
        tp.color = color
    }
}

/** One line's share of a link: where its stroke runs, in layout pixels. */
data class LinkFragment(val left: Float, val right: Float, val baseline: Float)

/**
 * The line fragments of the text range [start, end): one per line it touches
 * (a link that wraps gets a stroke under each part). [lineOf], [lineStart] and
 * [lineVisibleEnd] (the line's end without its trailing space), [xStart],
 * [xEnd] (told the line, since an offset on a line break sits on two) and [baselineOf] are a text Layout's own answers, so this stays testable
 * without a Layout.
 */
fun linkFragments(
    start: Int,
    end: Int,
    lineOf: (Int) -> Int,
    lineStart: (Int) -> Int,
    lineVisibleEnd: (Int) -> Int,
    xStart: (Int) -> Float,
    xEnd: (line: Int, offset: Int) -> Float,
    baselineOf: (Int) -> Float,
): List<LinkFragment> {
    if (end <= start) return emptyList()
    return (lineOf(start)..lineOf(end - 1)).mapNotNull { line ->
        val a = max(start, lineStart(line))
        val b = min(end, lineVisibleEnd(line))
        if (b <= a) return@mapNotNull null
        val left = xStart(a)
        val right = xEnd(line, b)
        if (right <= left) null else LinkFragment(min(left, right), max(left, right), baselineOf(line))
    }
}

/**
 * How far under the baseline a story link's wave runs (its centre line), in em — the web reader's
 * WAVE_DEPTH_EM (lib/design/storyLinkWave), and iOS's: deep enough that its upper crests clear the
 * feet of CJK glyphs (the ideographic box ends 0.12em down) and the wave never cuts a descender
 * (it is drawn under the letters, as the web's background is).
 */
const val WAVE_DEPTH_EM = 0.29f

/** Where a story link's wave runs under a line whose baseline is at [baseline] (px), at a font size of [sizePx]. */
fun linkWaveY(baseline: Float, sizePx: Float): Float = baseline + sizePx * WAVE_DEPTH_EM

/** A link's strokes, ready to draw: its url (for the press state), wave paths and where they sit. */
internal class LinkStroke(val url: String, val x: Float, val y: Float, val wave: androidx.compose.ui.graphics.Path)

internal fun linkStrokes(layout: Layout, spanned: Spanned, sizePx: Float, density: Float): List<LinkStroke> =
    spanned.getSpans(0, spanned.length, LinkSpan::class.java).flatMap { span ->
        val frags = linkFragments(
            spanned.getSpanStart(span), spanned.getSpanEnd(span),
            layout::getLineForOffset, layout::getLineStart, layout::getLineVisibleEnd,
            { layout.getPrimaryHorizontal(it) },
            { line, o -> if (o == layout.getLineEnd(line)) layout.getLineRight(line) else layout.getPrimaryHorizontal(o) },
            { layout.getLineBaseline(it).toFloat() },
        )
        frags.mapIndexed { i, f ->
            // Seeded by the link, and by the fragment so a wrapped link's parts don't repeat.
            val wave = penWave(((f.right - f.left) / density).toDouble(), (seedFromString(span.url) + i).toDouble()).toPath(density)
            LinkStroke(span.url, f.left, linkWaveY(f.baseline, sizePx), wave)
        }
    }

/**
 * A run of story text as a StaticLayout in exact CSS line boxes: its marks as spans (bold at the
 * story's weight, the synthetic italic, strikethrough, inline code, links in the deep terracotta
 * labels wear), a CJK story's apostrophes inside Latin words in the Latin face, the story's
 * language on the paint (line breaking, regional glyph forms), and its breaking — justified CJK on
 * API 35+, strict CJK breaks on API 33+, balanced lines for a title or a heading — as story.css
 * sets them. [breakAt] are offsets a line must start at (a title's clauses, [TitleClauses]).
 */
internal fun buildRichLayout(runs: List<InlineRun>, style: ProseStyle, widthPx: Int, density: Density): Pair<StaticLayout, Spanned> =
    layoutProse(richText(runs, style), runs, style, widthPx, density)

/** [runs] as one text with their marks as spans (bold, italic, strikethrough, code, links), before [layoutProse] lays it out. */
private fun richText(runs: List<InlineRun>, style: ProseStyle): SpannableStringBuilder {
    val text = SpannableStringBuilder()
    for (run in runs) {
        val start = text.length
        text.append(run.text)
        val end = text.length
        if (start == end) continue
        val face = when {
            run.code -> null
            run.bold -> AppFonts.typeface(style.family, style.boldWeight)
            else -> null
        }
        face?.let { text.setSpan(TypefaceWeightSpan(it), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
        if (run.code) text.setSpan(CodeSpan(style.codeScale), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (style.italic || run.italic) text.setSpan(SyntheticItalicSpan(), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (run.strikethrough) text.setSpan(StrikethroughSpan(), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        run.link?.let { text.setSpan(LinkSpan(it, Mixes.ButtonOnTonal.toArgb()), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
        if (run.code) text.setSpan(ForegroundColorSpan(style.color.toArgb()), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
    return text
}

/**
 * How wide [runs] lie in [style] on lines of their own (px): the widest of their lines unbroken —
 * a table cell's max-content, which its column is measured from ([StoryTable]).
 */
internal fun richDesiredWidth(runs: List<InlineRun>, style: ProseStyle, density: Density): Float {
    val text = richText(runs, style)
    if (style.latinMarks) markLatin(text, runs, style)
    return Layout.getDesiredWidth(text, prosePaint(style, density))
}

/** [text] (with its runs' spans already on it) laid out in [style]'s CSS line boxes and breaking. */
private fun layoutProse(text: SpannableStringBuilder, runs: List<InlineRun>, style: ProseStyle, widthPx: Int, density: Density): Pair<StaticLayout, Spanned> {
    val paint = prosePaint(style, density)
    if (style.latinMarks) markLatin(text, runs, style)
    text.setSpan(CssLineHeightSpan(paint.textSize * style.lineHeight, paint.fontMetrics), 0, text.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
    val b = StaticLayout.Builder.obtain(text, 0, text.length, paint, max(1, widthPx))
        .setAlignment(style.align)
        .setIncludePad(false)
        .setUseLineSpacingFromFallbacks(false)
        .setBreakStrategy(if (style.balanced) LineBreaker.BREAK_STRATEGY_BALANCED else LineBreaker.BREAK_STRATEGY_SIMPLE)
        .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
    StoryType.applyBreaking(b, justified = style.justified)
    if (Build.VERSION.SDK_INT >= 35) b.setUseBoundsForWidth(false)
    return b.build() to text
}

/** The paint a story's text in [style] starts from: its face, size, ink, tracking, figures and language. */
internal fun prosePaint(style: ProseStyle, density: Density): TextPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = AppFonts.typeface(style.family, style.weight)
    textSize = density.cssFontPx(style.size)
    color = style.color.toArgb()
    letterSpacing = style.tracking
    val features = listOfNotNull(StoryType.LINING_FIGURES.takeIf { style.lining }, TABULAR_FIGURES.takeIf { style.tabular })
    if (features.isNotEmpty()) fontFeatureSettings = features.joinToString(", ") { "'$it'" }
    style.lang?.let { textLocale = Locale.forLanguageTag(it) }
}

/**
 * A CJK story's apostrophes inside Latin words (don’t, rock’n’roll — StoryScripts.latinMarks) set
 * in the Latin face of the text they sit in (DM Sans in the words, Playfair in a heading or the
 * title), at the weight of their run: the CJK face draws ‘ ’ full-width, a half-em hole inside a
 * word. Code keeps its own face.
 */
private fun markLatin(text: SpannableStringBuilder, runs: List<InlineRun>, style: ProseStyle) {
    val marks = StoryScripts.latinMarks(text.toString())
    if (marks.isEmpty()) return
    // Where each run starts in the text, to find the run a mark is in.
    val starts = IntArray(runs.size)
    var at = 0
    runs.forEachIndexed { i, r -> starts[i] = at; at += r.text.length }
    for (m in marks) {
        val run = runs.getOrNull(starts.indexOfLast { it <= m }) ?: continue
        if (run.code) continue
        val weight = if (run.bold) style.boldWeight else style.weight
        text.setSpan(TypefaceWeightSpan(AppFonts.typeface(style.family.latin, weight)), m, m + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
}

/** What TalkBack reads for a run of story text: its words, in the story's language when it has one. */
internal fun proseSemantics(plain: String, lang: String?): AnnotatedString =
    if (lang == null || plain.isEmpty()) AnnotatedString(plain)
    else AnnotatedString(plain, listOf(AnnotatedString.Range(SpanStyle(localeList = LocaleList(lang)), 0, plain.length)))

/** OpenType's tabular figures: every digit one width, so a column of numbers lines up. */
private const val TABULAR_FIGURES = "tnum"

/** Rich story text in exact CSS line boxes, with tappable links. */
@Composable
fun RichCssText(runs: List<InlineRun>, style: ProseStyle, onOpenUrl: (String) -> Unit, modifier: Modifier = Modifier) {
    val open by rememberUpdatedState(onOpenUrl)
    val scaled = LocalDensity.current
    val density = scaled.density
    val plain = remember(runs, style.lang) { proseSemantics(runs.joinToString("") { it.text }, style.lang) }
    // Laid out while measured, for the width offered (no subcomposition: [builtForWidth]); a tap reads what was laid out.
    val built = remember { WidthBuilt<RichTextLayout>() }
    val pressedUrl = remember { mutableStateOf<String?>(null) }
    // Whether its words hold a link at all; one whose strokes came out empty (only spaces) takes no tap, as before.
    val linked = remember(runs) { runs.any { it.link != null && it.text.isNotEmpty() } }
    Box(modifier.fillMaxWidth()) {
        Box(
            Modifier
                .builtForWidth(
                    key = RichTextKey(runs, style, density, scaled.fontScale),
                    built = built,
                    build = { widthPx ->
                        val (layout, spanned) = buildRichLayout(runs, style, widthPx, scaled)
                        RichTextLayout(layout, spanned, linkStrokes(layout, spanned, scaled.cssFontPx(style.size), density))
                    },
                    size = { IntSize(it.layout.width, it.layout.height) },
                ) { (layout, _, strokes) ->
                    // The waves first, under the letters (the web paints them as the link's background):
                    // a descender's foot rests in its arch rather than being crossed by it.
                    val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    strokes.forEach { s ->
                        translate(s.x, s.y) { drawPath(s.wave, Tokens.Terracotta, alpha = if (s.url == pressedUrl.value) 1f else 0.7f, style = pen) }
                    }
                    drawIntoCanvas { layout.draw(it.nativeCanvas) }
                }
                .semantics { this.text = plain }
                .then(if (!linked) Modifier else Modifier.pointerInput(built) {
                    fun linkAt(p: androidx.compose.ui.geometry.Offset): LinkSpan? {
                        val laid = built.value?.takeIf { it.strokes.isNotEmpty() } ?: return null
                        val line = laid.layout.getLineForVertical(p.y.roundToInt())
                        val offset = laid.layout.getOffsetForHorizontal(line, p.x)
                        return laid.spanned.getSpans(offset, offset, LinkSpan::class.java).firstOrNull()
                    }
                    detectTapGestures(
                        onPress = { p ->
                            // The pen presses harder while the finger is down: the web's hover.
                            pressedUrl.value = linkAt(p)?.url
                            tryAwaitRelease()
                            pressedUrl.value = null
                        },
                    ) { p -> linkAt(p)?.let { open(it.url) } }
                }),
        )
    }
}

/** A run of story text laid out for a width: the layout, its spanned text and its links' strokes. */
internal data class RichTextLayout(val layout: StaticLayout, val spanned: Spanned, val strokes: List<LinkStroke>)

/** Everything a [RichCssText]'s layout comes from but the width. */
private data class RichTextKey(val runs: List<InlineRun>, val style: ProseStyle, val density: Float, val fontScale: Float)

/**
 * Where a title breaks between its clauses (LatinMarkText on the web): Chinese breaks between any
 * two characters, so a balanced title wraps mid-phrase (「湖中央，我看／見了知行合一」). A CJK title
 * of two or more clauses — each ending just after a full-width stop or pause — keeps each clause
 * whole on a line when it fits, its lines as even as the clauses allow (the browser's
 * `text-wrap: balance` over the clauses' inline blocks), so it breaks after its punctuation
 * (「湖中央，／我看見了知行合一」). Pure, on widths: the layout measures the clauses.
 */
object TitleClauses {
    private val ClauseEnd = Regex("(?<=[，、；：。！？…—）」』》])")

    /** The title's clauses, in order (one: a title with no stop or pause inside, or only at its end). */
    fun split(title: String): List<String> = title.split(ClauseEnd).filter { it.isNotEmpty() }

    /**
     * The clauses that start a line after the first (indices into [widths]), for clauses
     * [widths] wide in a line [width] wide: as few lines as the clauses fit in, then the narrowest
     * widest line among those breaks (the browser's balance: the least width at which that many
     * lines still hold them, filled greedily). Null when a clause is wider than the line — it
     * wraps inside itself, and the whole title is balanced as one text.
     */
    fun breaks(widths: List<Float>, width: Float): List<Int>? {
        if (widths.size < 2 || widths.any { it > width }) return if (widths.size < 2) emptyList() else null
        val lines = greedy(widths, width).size + 1
        if (lines == 1) return emptyList()
        // The least line width that still holds the clauses in that many lines: some run of whole clauses is exactly it.
        val candidates = widths.indices.flatMap { i -> (i until widths.size).map { j -> widths.subList(i, j + 1).sum() } }
            .filter { it <= width }.distinct().sorted()
        val fit = candidates.firstOrNull { greedy(widths, it).size + 1 == lines } ?: width
        return greedy(widths, fit)
    }

    /** Clauses filled into lines [width] wide, each line taking what fits: where each line after the first starts. */
    private fun greedy(widths: List<Float>, width: Float): List<Int> {
        val starts = ArrayList<Int>()
        var line = 0f
        widths.forEachIndexed { i, w ->
            if (i > 0 && line + w > width + 0.5f) {
                starts += i
                line = w
            } else {
                line += w
            }
        }
        return starts
    }
}

/**
 * A card's title over its story (story.css `.story-title`): the story's title type — a CJK story's
 * Noto Serif TC 600 at +0.02em, a Latin story's Playfair 700, lining figures both — in exact CSS
 * line boxes, balanced, a CJK title kept whole clause by clause where it fits ([TitleClauses]),
 * its apostrophes inside Latin words in Playfair, and read out in the story's language. Put it
 * inside [ReadingTextScale] (the title follows the system's text size up to 2×).
 */
@Composable
fun StoryTitle(text: String, type: StoryType, lang: String?, modifier: Modifier = Modifier) {
    val scaled = LocalDensity.current
    val density = scaled.density
    val style = remember(type, lang) { ProseStyle.title(type, lang) }
    val read = remember(text, lang) { proseSemantics(text, lang) }
    // Laid out while measured, for the width offered (no subcomposition: [builtForWidth]).
    val built = remember { WidthBuilt<StaticLayout>() }
    Box(modifier.fillMaxWidth()) {
        Box(
            Modifier
                .builtForWidth(
                    key = TitleKey(text, style, density, scaled.fontScale, AppFonts.useBundledCJK, type.cjk),
                    built = built,
                    build = { widthPx -> titleLayout(text, style, widthPx, scaled, clauses = type.cjk) },
                    size = { IntSize(it.width, it.height) },
                ) { layout -> drawIntoCanvas { layout.draw(it.nativeCanvas) } }
                .semantics { this.text = read },
        )
    }
}

/** Everything a [StoryTitle]'s layout comes from but the width. */
private data class TitleKey(val text: String, val style: ProseStyle, val density: Float, val fontScale: Float, val bundledCJK: Boolean, val clauses: Boolean)

/** The title's layout: broken between its clauses when [clauses] and they all fit their lines, else balanced as one text. */
internal fun titleLayout(title: String, style: ProseStyle, widthPx: Int, density: Density, clauses: Boolean): StaticLayout {
    val parts = if (clauses) TitleClauses.split(title) else listOf(title)
    val starts = if (parts.size < 2) null else {
        val paint = prosePaint(style, density)
        // Each clause as it is drawn (its apostrophes in the Latin face): a clause's width carries its tracking.
        val widths = parts.map { part ->
            val t = SpannableStringBuilder(part)
            if (style.latinMarks) markLatin(t, listOf(InlineRun(part)), style)
            Layout.getDesiredWidth(t, paint)
        }
        TitleClauses.breaks(widths, widthPx.toFloat())
    }
    val text = if (starts.isNullOrEmpty()) title else parts.mapIndexed { i, p -> if (i in starts) "\n$p" else p }.joinToString("")
    // Lines already chosen are kept as they are; a title left to the breaker is balanced.
    val shaped = if (starts.isNullOrEmpty()) style else style.copy(balanced = false)
    return layoutProse(SpannableStringBuilder(text), listOf(InlineRun(text)), shaped, widthPx, density).first
}

/**
 * The cards a story's standalone links are drawn as: the previews the card page brought, by the
 * key a paragraph names them by ([StoryBlock.SoleLink]); [host] names a link's real host as the
 * card shows it, [label] what a screen reader says a card does, and [open] takes a pressed card
 * to its link.
 */
class StoryLinkCards(
    val previews: Map<String, LinkPreview>,
    val host: (LinkPreview) -> String,
    val label: (host: String) -> String,
    val open: (LinkPreview) -> Unit,
)

/**
 * A story, laid out like the web reader's `.story-prose` (src/styles/story.css) in its [type] —
 * by its script and the window: a CJK story's Noto Sans TC words, tracked and justified, under Noto
 * Serif TC headings; a Latin story's DM Sans under Playfair — headings h2–h6 (`#` drawn as h2),
 * the curved quote rail beside upright muted words, lists in a 1.6em gutter, photos in organic
 * clips, card links as embedded cards, a link standing alone as its page's card when [links] has
 * a preview for it, tables as rules rather than boxes ([StoryTable]), blank-line markers as air;
 * vertical rhythm from story.css's margins,
 * collapsing between blocks ([ProseMetrics]). [lang] is the story's language (StoryScripts).
 *
 * Put it inside [ReadingTextScale]: its words, and the room between them, follow the system's
 * text size up to 2×, while the cards it embeds keep the interface's 1.25 ([CappedTextScale]).
 * The twin of iOS's StoryMarkdownView.
 */
@Composable
fun StoryMarkdown(
    blocks: List<StoryBlock>,
    type: StoryType,
    lang: String?,
    onOpenUrl: (String) -> Unit,
    links: StoryLinkCards? = null,
    /** On each heading (in a quote or a list too): where the table of contents finds it ([StoryAnchors]). */
    headingAnchor: ((StoryBlock.Heading) -> Modifier)? = null,
    /** A card link standing alone, drawn by the page in the story's [ProseStyle] (for when it has no card to show). */
    embed: @Composable (href: String, title: String, style: ProseStyle) -> Unit,
) {
    val story = remember(type, lang, onOpenUrl, links, embed, headingAnchor) { Story(type, lang, onOpenUrl, links, embed, headingAnchor) }
    BlockColumn(blocks, story.body, story, nested = false)
}

/** What every block of one story is drawn with: its type, its taps, its link cards, its card embeds and its headings' anchors. */
private class Story(
    val type: StoryType,
    val lang: String?,
    val onOpenUrl: (String) -> Unit,
    val links: StoryLinkCards?,
    val embed: @Composable (String, String, ProseStyle) -> Unit,
    val headingAnchor: ((StoryBlock.Heading) -> Modifier)?,
) {
    val body = ProseStyle.body(type, lang)
    val spacing = type.spacing()

    /** Whether a standalone link is drawn as its page's card (a preview came with the page), for the room around it. */
    fun drawnAsCard(link: StoryBlock.SoleLink): Boolean = links?.previews?.containsKey(link.key) == true
}

/**
 * How much the story's text size has grown the room between its blocks: the body's size in dp at
 * the text scale in force over its size at the normal one (1 at the system's normal size, up to 2
 * inside [ReadingTextScale]) — so margins, indents and gaps the web measures in ems, and the px
 * ones around pictures and cards, stay in proportion to the words they sit beside.
 */
@Composable
private fun grown(type: StoryType): Float = with(LocalDensity.current) { cssFontPx(type.bodySize) / density } / type.bodySize

@Composable
private fun BlockColumn(blocks: List<StoryBlock>, style: ProseStyle, story: Story, nested: Boolean) {
    val gaps = remember(blocks, story) { ProseMetrics.gaps(blocks, story.spacing, nested, story::drawnAsCard) }
    val grown = grown(story.type)
    Column(Modifier.fillMaxWidth()) {
        blocks.forEachIndexed { i, block ->
            if (gaps[i] > 0) Spacer(Modifier.height((gaps[i] * grown).dp))
            Block(block, style, story)
        }
    }
}

@Composable
private fun Block(block: StoryBlock, style: ProseStyle, story: Story) {
    val grown = grown(story.type)
    val em = (story.type.bodySize * grown).dp
    val onOpenUrl = story.onOpenUrl
    when (block) {
        is StoryBlock.Paragraph -> RichCssText(block.runs, style, onOpenUrl)
        // h2–h6 at their start, balanced; inside a quote in its muted ink.
        is StoryBlock.Heading -> RichCssText(
            block.runs, ProseStyle.heading(story.type, block.level, story.lang, style.color).copy(inQuote = style.inQuote), onOpenUrl,
            Modifier.semantics { heading() }.then(story.headingAnchor?.invoke(block) ?: Modifier),
        )
        StoryBlock.Blank -> Spacer(Modifier.height((story.spacing.blank * grown).dp).clearAndSetSemantics { })
        is StoryBlock.Image -> StoryImage(block.url, block.alt, atStart = style.inQuote)
        // A card sets its own type: the interface's text size, not the story's.
        is StoryBlock.CardEmbed -> Centred(style.inQuote) { story.embed(block.href, block.title, style) }
        // The page's card when the server made one for this link; otherwise the paragraph as written.
        is StoryBlock.SoleLink -> {
            val links = story.links
            val preview = links?.previews?.get(block.key)
            if (links != null && preview != null) {
                val host = links.host(preview)
                Centred(style.inQuote) { CappedTextScale { StoryLinkCard(preview, host, links.label(host), onOpen = { links.open(preview) }) } }
            } else {
                RichCssText(block.runs, style, onOpenUrl)
            }
        }
        // The rail is drawn behind the quote's own box (its height is the
        // content's), not a sibling sized by intrinsics — the story text is
        // built on BoxWithConstraints, which cannot answer intrinsic queries.
        // The web's vertical Divider (seed 5): trimmed 6 at each end (18% for a
        // very short quote), a turn every ~34px, the light pen, centred in its
        // 5.2px-wide strip, 1em before the text.
        is StoryBlock.Quote -> Box(
            Modifier
                .fillMaxWidth()
                .drawBehind {
                    val h = size.height / density
                    val trim = min(0.18f * h, 6f)
                    val run = h - trim * 2
                    val path = wavyVertical(run.toDouble(), 5.0, 1.4, max(2, (run / 34).roundToInt()))
                        .toPath(density, QuoteRailWidth.toPx() / 2, trim * density)
                    drawPath(path, Tokens.TerracottaLight, style = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round))
                }
                .padding(start = QuoteRailWidth + em),
        ) { BlockColumn(block.children, style.quoted, story, nested = true) }
        // Each item's marker in the muted ink at the start of the 1.6em gutter, the items 0.3em apart.
        is StoryBlock.ListBlock -> {
            val itemGaps = remember(block, story) { ProseMetrics.itemGaps(block.items, story.spacing, story::drawnAsCard) }
            val marker = style.copy(color = Tokens.TextMuted, justified = false, latinMarks = false)
            Column {
                block.items.forEachIndexed { i, item ->
                    if (itemGaps[i] > 0) Spacer(Modifier.height((itemGaps[i] * grown).dp))
                    Row {
                        Box(Modifier.width((story.type.listIndent * grown).dp)) {
                            RichCssText(listOf(InlineRun(if (block.ordered) "${block.start + i}." else "•")), marker, onOpenUrl, Modifier.clearAndSetSemantics { })
                        }
                        Box(Modifier.weight(1f)) { BlockColumn(item, style, story, nested = false) }
                    }
                }
            }
        }
        StoryBlock.Rule -> WavyDivider(seed = 23.0)
        is StoryBlock.Table -> StoryTable(block, style, onOpenUrl)
        // A block of code: monospace at the inline code's size, 1.6 apart, on the code tint, never justified or tracked.
        is StoryBlock.CodeBlock -> BasicText(
            block.code,
            style = AppFonts.style(story.type.bodyFamily, story.type.codeSize, lineHeight = CODE_LEADING, color = style.color)
                .copy(fontFamily = FontFamily.Monospace),
            modifier = Modifier
                .fillMaxWidth()
                .background(CodeTint, RoundedCornerShape(Tokens.RadiusSm.dp))
                .padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
}

/** A code block's line height (story.css `pre`). */
private const val CODE_LEADING = 1.6f

/** `--story-code-tint`: the text's ink at 6 %. */
private val CodeTint = Tokens.Text.copy(alpha = 0.06f)

/**
 * OrganicStoryImage: a photo at its own proportions (≤ 520dp or 62% of the
 * screen tall), centred (at a quote's edge inside one), in a gentle clip (R 12, 2.5% wobble). Like the
 * cover, the photo overflows its box by the clip's outward swing so the
 * bulges land on pixels instead of being cut flat.
 */
@Composable
private fun StoryImage(url: String, alt: String, atStart: Boolean = false) {
    var aspect by remember(url) { mutableFloatStateOf(1.5f) }
    val maxH = min(520f, LocalConfiguration.current.screenHeightDp * 0.62f)
    BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = if (atStart) Alignment.CenterStart else Alignment.Center) {
        val w = min(maxWidth.value, maxH * aspect)
        val seed = seedFromString(url).toDouble()
        BoxWithConstraints(Modifier.widthIn(max = w.dp).aspectRatio(aspect).heightIn(min = 40.dp)) {
            val bleed = imageBleed(maxWidth.value, maxHeight.value, 0.025)
            AsyncImage(
                model = url,
                contentDescription = alt,
                contentScale = ContentScale.Crop,
                onSuccess = { s ->
                    val d = s.result.image
                    if (d.height > 0) aspect = d.width.toFloat() / d.height
                },
                modifier = Modifier
                    .requiredSize(maxWidth + bleed * 2, maxHeight + bleed * 2)
                    .clip(remember(seed, bleed) { BledShape(seed, bleed.value.toDouble(), radius = 12.0, magFactor = 0.025) }),
            )
        }
    }
}

/** A card (≤ 520 wide) centred in the column, as a picture is (the web's embedBlock); inside a quote, at its edge. */
@Composable
private fun Centred(atStart: Boolean, content: @Composable () -> Unit) {
    Box(Modifier.fillMaxWidth(), contentAlignment = if (atStart) Alignment.TopStart else Alignment.TopCenter) { content() }
}

/** The quote rail's strip: the web Divider's width (amplitude and pen, twice each). */
private val QuoteRailWidth = 5.2.dp

/**
 * A story's table, quietly (round 8 §5.2; story.css `.story-table`): rules, not boxes — no frame and
 * no lines between columns — drawn by hand with a light pen (round 9 §6, [tableRule]): the head row's
 * rule (INK_LIGHT, the muted ink at 0.6, ±1.0, overshooting the table 1.5 at each end) and a rule
 * between body rows (1, the muted ink at 0.3, ±0.7, stopping 2 short at each end), nothing after the
 * last; one turn per ~90, seeded by the table and the row, so a story's rules keep their wobble. Its
 * words are the story's at 0.94 em, 1.6 apart, set and not justified, the head row in the story's
 * bold, numbers in tabular figures, every cell at its start edge — the head's too, whatever the
 * delimiter row's colons say (round 9 §6; the source keeps them). A cell pads 8 × 14 — the first column's start and the last column's end flush
 * with the text column — and a column is its cells' widest words, at least 4 em and at most 18 em
 * before they wrap ([tableColumns]). Wider than the column, it scrolls sideways inside it (never the
 * page), the side with more fading into the paper over 24 until scrolled to that end; TalkBack meets
 * it as 表格, a table of its rows and columns.
 */
@Composable
private fun StoryTable(table: StoryBlock.Table, style: ProseStyle, onOpenUrl: (String) -> Unit) {
    val columns = table.align.size
    if (columns == 0) return
    val density = LocalDensity.current
    // Every cell at its start edge (round 9 §6): the delimiter's colons are the source's, not the reader's.
    val body = remember(style) { tableBodyStyle(style) }
    val head = remember(body) { body.copy(weight = body.boldWeight) }
    val bodyStyles = remember(body, columns) { List(columns) { body } }
    val headStyles = remember(head, columns) { List(columns) { head } }
    // The table's own seed: its head's words (stable for the story, different from its neighbour's).
    val tableSeed = remember(table) { tableSeedOf(table) }
    val em = density.cssFontPx(body.size)
    val widths = remember(table, body, head, density, density.fontScale) {
        tableColumns(
            columns,
            natural = { row, col ->
                val cell = if (row < 0) table.head.getOrNull(col) else table.rows[row].getOrNull(col)
                cell?.let { richDesiredWidth(it, if (row < 0) headStyles[col] else bodyStyles[col], density) } ?: 0f
            },
            rows = table.rows.size,
            min = TABLE_COLUMN_MIN_EM * em,
            max = TABLE_COLUMN_MAX_EM * em,
        )
    }
    val padX = with(density) { TABLE_CELL_PAD_X.toPx() }
    val padY = with(density) { TABLE_CELL_PAD_Y.toPx() }
    val scroll = rememberScrollState()
    val headPen = with(density) { TABLE_HEAD_RULE.toPx() }
    val rowPen = with(density) { TABLE_ROW_RULE.toPx() }
    Box(
        Modifier
            .fillMaxWidth()
            // The scroller reaches 2 past the text column at each side, so the head's rule can run past the
            // table's ends; the cells stay where they were (the padding inside gives the 2 back).
            .layout { measurable, constraints ->
                val reach = TABLE_REACH.roundToPx()
                val wide = if (constraints.hasBoundedWidth) constraints.maxWidth + 2 * reach else constraints.maxWidth
                val placeable = measurable.measure(constraints.copy(minWidth = wide, maxWidth = wide))
                layout(constraints.maxWidth, placeable.height) { placeable.place(-reach, 0) }
            }
            .tableFade(scroll, TABLE_FADE)
            .semantics {
                contentDescription = L10n.Card.table
                collectionInfo = CollectionInfo(rowCount = table.rows.size + 1, columnCount = columns)
            }
            .horizontalScroll(scroll),
    ) {
        Column(Modifier.padding(horizontal = TABLE_REACH)) {
            val rows = listOf(table.head) + table.rows
            rows.forEachIndexed { r, cells ->
                Row(
                    Modifier.drawWithCache {
                        // The head's pen line under it; a lighter one above each body row after the first — the
                        // table's whole width (inside the sideways scroll, so they move with the columns).
                        val d = this.density
                        val w = size.width / d
                        val rule = when {
                            r == 0 -> tableRule(w, tableSeed, r, head = true).toPath(d, -TABLE_HEAD_OVERSHOOT * d, size.height - headPen / 2)
                            r >= 2 -> tableRule(w, tableSeed, r, head = false).toPath(d, TABLE_ROW_INSET * d, rowPen / 2)
                            else -> null
                        }
                        val pen = Stroke(if (r == 0) headPen else rowPen, cap = StrokeCap.Round, join = StrokeJoin.Round)
                        val ink = if (r == 0) TableHeadRuleInk else TableRowRuleInk
                        onDrawBehind { rule?.let { drawPath(it, ink, style = pen) } }
                    },
                    verticalAlignment = Alignment.Top,
                ) {
                    for (c in 0 until columns) {
                        val start = if (c == 0) 0f else padX
                        val end = if (c == columns - 1) 0f else padX
                        Box(
                            Modifier
                                .width(with(density) { (widths[c] + start + end).toDp() })
                                .padding(
                                    start = with(density) { start.toDp() }, end = with(density) { end.toDp() },
                                    top = with(density) { padY.toDp() }, bottom = with(density) { padY.toDp() },
                                )
                                .semantics { collectionItemInfo = CollectionItemInfo(rowIndex = r, rowSpan = 1, columnIndex = c, columnSpan = 1) },
                        ) {
                            RichCssText(cells.getOrNull(c).orEmpty(), if (r == 0) headStyles[c] else bodyStyles[c], onOpenUrl)
                        }
                    }
                }
            }
        }
    }
}

/**
 * A table cell's words (round 9 §6): the story's at 0.94 em, 1.6 apart, set and not justified, tabular
 * figures — and always at the cell's start edge, whatever the delimiter row asked for.
 */
internal fun tableBodyStyle(style: ProseStyle): ProseStyle =
    style.copy(size = style.size * TABLE_SIZE, lineHeight = TABLE_LEADING, justified = false, balanced = false, tabular = true, align = Layout.Alignment.ALIGN_NORMAL)

/** A table's words, × the story's (`font-size: 0.94em`), and their leading. */
private const val TABLE_SIZE = 0.94f
private const val TABLE_LEADING = 1.6f
/** A column's least and most width before its words wrap, in the table's em. */
internal const val TABLE_COLUMN_MIN_EM = 4f
internal const val TABLE_COLUMN_MAX_EM = 18f
private val TABLE_CELL_PAD_X = 14.dp
private val TABLE_CELL_PAD_Y = 8.dp
private val TABLE_HEAD_RULE = Tokens.InkLight
private val TABLE_ROW_RULE = 1.dp
/** How far a table's side with more fades into the paper. */
private val TABLE_FADE = 24.dp
private val TableHeadRuleInk = Tokens.TextMuted.copy(alpha = 0.6f)
private val TableRowRuleInk = Tokens.TextMuted.copy(alpha = 0.3f)

/** How far past the text column a table's scroller reaches at each side: room for the head's rule to overshoot. */
private val TABLE_REACH = 2.dp

/** The head's rule runs this far past the table at each end; a row's rule stops this short (dp). */
internal const val TABLE_HEAD_OVERSHOOT = 1.5f
internal const val TABLE_ROW_INSET = 2f
/** How far a rule wobbles (dp): the head's, a row's — never past ±1.2. */
internal const val TABLE_HEAD_AMP = 1.0
internal const val TABLE_ROW_AMP = 0.7
/** One turn of a rule per this much of its length (dp). */
internal const val TABLE_RULE_TURN = 90.0

/**
 * One of a table's hand-drawn rules (round 9 §6), as a pen path from its own start (dp): the head's
 * ([head]) is the table's width [w] and 1.5 more at each end, wobbling ±1.0; a body row's stops 2
 * short of each end, ±0.7 — both one turn per ~90 (at least 3), seeded by the table ([seed]) and the
 * row ([row]), so redrawing the story draws the same rules.
 */
internal fun tableRule(w: Float, seed: Double, row: Int, head: Boolean): List<com.resonance.geometry.PathCommand> {
    val length = if (head) w + 2 * TABLE_HEAD_OVERSHOOT else (w - 2 * TABLE_ROW_INSET).coerceAtLeast(0f)
    val steps = maxOf(3, kotlin.math.round(length / TABLE_RULE_TURN).toInt())
    return com.resonance.geometry.wavyLine(length.toDouble(), seed + row * 31, if (head) TABLE_HEAD_AMP else TABLE_ROW_AMP, steps)
}

/** A table's seed: its head's words, so it is stable for the story and differs from the table beside it. */
internal fun tableSeedOf(table: StoryBlock.Table): Double =
    (kotlin.math.abs(seedFromString(table.head.joinToString("|") { cell -> cell.joinToString("") { it.text } }) % 9973) + 1).toDouble()

/**
 * A table's column widths (px, the cells' content without their padding): each column its cells'
 * widest unbroken words ([natural] of the head, row -1, and each body row), at least [min] and at most
 * [max] — past it the words wrap (CSS's max-content table, `.story-cell`'s 4–18 em).
 */
internal fun tableColumns(columns: Int, natural: (row: Int, col: Int) -> Float, rows: Int, min: Float, max: Float): List<Float> =
    List(columns) { c ->
        val widest = (-1 until rows).maxOfOrNull { r -> natural(r, c) } ?: 0f
        kotlin.math.ceil(widest.coerceIn(min, max))
    }

/** The side of a sideways-scrolling table with more to see fades into the paper over [width] (story.css `data-more`). */
private fun Modifier.tableFade(scroll: ScrollState, width: Dp): Modifier =
    graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }.drawWithContent {
        drawContent()
        val w = width.toPx()
        if (scroll.canScrollForward) drawRect(
            Brush.horizontalGradient(listOf(Color.Transparent, Color.Black), startX = size.width - w, endX = size.width),
            topLeft = Offset(size.width - w, 0f), size = Size(w, size.height), blendMode = BlendMode.DstOut,
        )
        if (scroll.canScrollBackward) drawRect(
            Brush.horizontalGradient(listOf(Color.Black, Color.Transparent), startX = 0f, endX = w),
            size = Size(w, size.height), blendMode = BlendMode.DstOut,
        )
    }
