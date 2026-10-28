package com.resonance.design

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wobRect
import kotlin.math.max
import kotlin.math.min

/**
 * One segment of a [SegmentedActionBar]: its words and glyph; its own face ([fill], else the
 * bar's) and label colour ([textColor]); the ink a press spreads ([press]); what a screen reader
 * calls it when that isn't its words ([contentDescription]; a segment that shows words is named
 * by them, WCAG 2.5.3); and, for a choice, whether it is the chosen option ([selected]: a radio, not a
 * button). A segment that may give up its words ([collapse]: the step at which it does, 1 or 2; 0
 * never) shows its glyph alone when the bar has no room for every label — the card page's bookmark
 * first, then its note (round 9 §3) — its words kept for a screen reader.
 */
class Segment(
    val key: String,
    val label: String,
    val icon: IconName? = null,
    val fill: Color? = null,
    /** Its label's colour; null: the tonal label's ink of the palette on screen. */
    val textColor: Color? = null,
    /** The ink a press spreads; null: the palette's wash. */
    val press: Color? = null,
    val contentDescription: String? = null,
    /** The step at which it shows its glyph alone when the labels don't fit ([SegmentedLayout.steps]): 0 never. */
    val collapse: Int = 0,
    val selected: Boolean? = null,
    /** The glyph drawn filled (a saved bookmark), and its pen. */
    val iconFill: Color? = null,
    val iconStroke: Float = Tokens.InkStrong.value,
    /** Working on its tap (design note B6): its loader in the glyph's place, its words kept, no tap; heard as busy. */
    val loading: Boolean = false,
    val onClick: () -> Unit,
)

/**
 * A segment's air over and under its words: 13, or less in a bar asked to be lower than 48 (a dialog whose
 * controls share one height, 44), so the words' line (14 at its font's own height, 20) and the air come to it.
 */
internal fun segmentPadY(minHeight: Dp): Dp = ((minHeight - SegmentLine) / 2).coerceIn(0.dp, 13.dp)

/** A segment's words' line: 14 at its font's own height. */
private val SegmentLine = 20.dp

/**
 * SegmentedActionBar.tsx: actions fused into one organic bar, split by hand-drawn wavy seams. Its
 * segments are buttons, so like every button it is a filled shape with no pen line: the bar wears
 * the tonal face ([fill]), a segment may bring its own (the verb's `--button-fill`), and the
 * seams between them are cut in the paper's colour ([divider]); the buttons' grain over all of it.
 * A press spreads its ink from the finger inside its own segment.
 *
 * On a phone (narrower than 560) the bar spans its column and the segments share it evenly; wider,
 * it stands at its own width. When every label no longer fits, the segments give up their words a
 * step at a time ([Segment.collapse]: the first step's, then the second's) and take only their own
 * room; past the last step the rest share what is left, their words cut with an ellipsis — the bar
 * never runs past the width it has ([SegmentedLayout]). Each segment is at least [minHeight] tall (48; a dialog whose
 * controls share one height asks its own). Not [enabled] (the viewer's own answer still being read), it fades to 0.6 and
 * takes no tap.
 */
@Composable
fun SegmentedActionBar(
    segments: List<Segment>,
    modifier: Modifier = Modifier,
    seed: Double = 71.0,
    fill: Color = Tokens.ButtonTonal,
    divider: Color = Tokens.Cream,
    enabled: Boolean = true,
    minHeight: Dp = 48.dp,
    /** The bar as the paper puppets' island knows it ([mascotMark]: the card page's response bar), at its own width. */
    mascotKey: String? = null,
) {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val style = AppFonts.body(14f, 600, lineHeight = 1f)
    BoxWithConstraints(modifier) {
        val room = maxWidth.value
        val spread = room < SegmentedLayout.SPREAD_BELOW
        val labels = segments.map { seg ->
            with(density) { measurer.measure(seg.label, style, softWrap = false, maxLines = 1).size.width.toDp().value }
        }
        val icons = segments.map { it.icon != null }
        val collapse = segments.map { it.collapse }
        val widths = SegmentedLayout.widths(labels, icons, collapse, room, spread)
        val step = SegmentedLayout.steps(labels, icons, collapse, room, spread)
        val lefts = widths.runningFold(0f) { x, w -> x + w }.dropLast(1)
        val scope = rememberCoroutineScope()
        val ink = remember { InkSpread() }
        val leftsNow by rememberUpdatedState(lefts)
        var pressed by remember { mutableStateOf<Int?>(null) }
        val label = Tokens.ButtonOnTonal
        val wash = OrganicIndication.Wash
        val grainInk = GrainInk.current
        Row(
            (if (mascotKey != null) Modifier.mascotMark(mascotKey) else Modifier)
                .fade(if (enabled) 1f else 0.6f)
                // As tall as the tallest segment (a large text size), every segment that tall.
                .height(IntrinsicSize.Min)
                .drawWithCache {
                    val w = size.width / this.density
                    val h = size.height / this.density
                    val outer = wobRect(w.toDouble(), h.toDouble(), 16.0, seed, min(w, h) * 0.05, WobRectOptions(
                        segmentsH = SegValue.Range(7, 9), segmentsV = SegValue.Range(2, 3), curve = 1.2, cornerJitter = 1.2, cornerOffset = h * 0.04,
                    )).toPath(this.density)
                    // Fills overshoot the bar by `pad` and the outline trims them, so its outward swings stay filled.
                    val pad = max(12.0, h * 0.3)
                    val boundaries = lefts.drop(1).mapIndexed { i, x -> boundaryPoints(x.toDouble(), h.toDouble(), seed + i * 37 + 11, 1.6, pad) }
                    val regions = segments.indices.map { i ->
                        Path().apply {
                            op(SegmentedLayout.regionPath(i, segments.size, boundaries, w, h, pad.toFloat(), this@drawWithCache.density), outer, PathOperation.Intersect)
                        }
                    }
                    val seams = boundaries.map { polylinePath(it, this.density) }
                    val grain = Grain.brush(GrainMode.Tile, "grain-button", size, this.density, 0.38f, grainInk)
                    val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round)
                    onDrawBehind {
                        drawPath(outer, fill)
                        segments.forEachIndexed { i, seg -> seg.fill?.let { drawPath(regions[i], it) } }
                        pressed?.let { i -> with(ink) { draw(regions[i], segments[i].press ?: wash) } }
                        clipPath(outer) { seams.forEach { drawPath(it, divider, style = pen) } }
                        grain?.let { drawPath(outer, it, alpha = 0.38f) }
                    }
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            segments.forEachIndexed { i, seg ->
                val source = remember { MutableInteractionSource() }
                LaunchedEffect(source) {
                    source.interactions.collect {
                        when (it) {
                            is PressInteraction.Press -> {
                                pressed = i
                                ink.press(scope, Offset(it.pressPosition.x + with(density) { leftsNow[i].dp.toPx() }, it.pressPosition.y))
                            }
                            is PressInteraction.Release, is PressInteraction.Cancel -> ink.release(scope)
                        }
                    }
                }
                val collapsed = SegmentedLayout.alone(seg.collapse, seg.icon != null, step)
                Row(
                    Modifier
                        .width(widths[i].dp)
                        .fillMaxHeight()
                        .heightIn(min = minHeight)
                        .clickable(source, indication = null, enabled = enabled && !seg.loading, role = if (seg.selected != null) Role.RadioButton else Role.Button, onClick = seg.onClick)
                        .semantics {
                            (seg.contentDescription ?: seg.label.takeIf { collapsed })?.let { contentDescription = it }
                            seg.selected?.let { selected = it }
                            if (seg.loading) stateDescription = L10n.App.busy
                        }
                        .padding(horizontal = if (collapsed) 16.dp else SegmentedLayout.PAD.dp, vertical = segmentPadY(minHeight)),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(SegmentedLayout.GAP.dp, Alignment.CenterHorizontally),
                ) {
                    seg.icon?.let {
                        if (seg.loading) ButtonLoader(seg.textColor ?: label, SegmentedLayout.ICON.dp, Modifier.offset(y = labelInkDrop(14f)))
                        else OrganicIcon(
                            it, Modifier.offset(y = labelInkDrop(14f)), size = SegmentedLayout.ICON.dp,
                            color = seg.textColor ?: label, strokeWidth = seg.iconStroke, fill = seg.iconFill,
                        )
                    }
                    if (!collapsed) BasicText(
                        seg.label, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis,
                        style = style.copy(color = seg.textColor ?: label),
                        // The short label stands for the full words, which are read instead; past the last step
                        // the words may be cut, never the glyph.
                        modifier = (if (seg.contentDescription != null) Modifier.clearAndSetSemantics { } else Modifier).weight(1f, fill = false),
                    )
                }
            }
        }
    }
}

/**
 * How a [SegmentedActionBar] shares its width (dp), apart from Compose so it can be tested — the
 * web's: a segment's own width is its padding, glyph, gap and label; on a phone the bar spans
 * the room and the segments share it evenly, a glyph alone taking only its own. When the labels (at
 * their own widths) need more than the room, the segments give up their words a step at a time
 * ([steps]: first those of step 1, then step 2's too), and when even the last step doesn't fit, the
 * segments still showing words share what is left — the narrowest keeping its own width, the rest
 * an even share, cut with an ellipsis — so the bar is never wider than its room (round 9 §3).
 */
object SegmentedLayout {
    /** Narrower than this the bar spans its column (the web's 560px). */
    const val SPREAD_BELOW = 560f
    /** A segment's padding a side on a phone (the web's `clamp(8px, 2vw, 14px)` at a phone's width), its glyph and the gap after it. */
    const val PAD = 8f
    const val ICON = 16f
    /** Glyph to label: 6, as every icon-and-label button (design note §7). */
    const val GAP = 6f
    /** A glyph alone: 16 a side. */
    const val ICON_ONLY = ICON + 32f
    /** Wider, a segment stands at its own width with the web's desktop padding. */
    const val WIDE_PAD = 24f

    /** A segment's own width: its padding, glyph, gap and label — and a dp to spare, so rounding to pixels never cuts the label. */
    private fun natural(label: Float, icon: Boolean, pad: Float) = 2 * pad + label + (if (icon) ICON + GAP else 0f) + 1f

    /** Whether a segment that gives up its words at [collapse] shows its glyph alone at [step] (it has a glyph to show). */
    fun alone(collapse: Int, icon: Boolean, step: Int): Boolean = icon && collapse in 1..step

    /** What the segments need at [step], each at its own width or its glyph alone. */
    private fun need(labels: List<Float>, icons: List<Boolean>, collapse: List<Int>, step: Int, pad: Float): Float =
        labels.indices.sumOf { (if (alone(collapse[it], icons[it], step)) ICON_ONLY else natural(labels[it], icons[it], pad)).toDouble() }.toFloat()

    /**
     * How many steps the bar takes to fit [room]: 0, every label; 1, step 1's segments their glyph
     * alone; 2, step 2's too — the last step there is, when even that doesn't fit.
     */
    fun steps(labels: List<Float>, icons: List<Boolean>, collapse: List<Int>, room: Float, spread: Boolean): Int {
        val pad = if (spread) PAD else WIDE_PAD
        val last = collapse.maxOrNull() ?: 0
        for (step in 0..last) if (need(labels, icons, collapse, step, pad) <= room + 0.5f) return step
        return last
    }

    /** Whether any segment shows its glyph alone ([steps] past 0). */
    fun collapses(labels: List<Float>, icons: List<Boolean>, collapse: List<Int>, room: Float, spread: Boolean): Boolean =
        steps(labels, icons, collapse, room, spread) > 0

    fun widths(labels: List<Float>, icons: List<Boolean>, collapse: List<Int>, room: Float, spread: Boolean): List<Float> {
        val step = steps(labels, icons, collapse, room, spread)
        val alone = labels.indices.map { alone(collapse[it], icons[it], step) }
        val pad = if (spread) PAD else WIDE_PAD
        val own = labels.indices.map { if (alone[it]) ICON_ONLY else natural(labels[it], icons[it], pad) }
        // Wider, each at its own width — unless even that runs past the room, when it shares as a phone's does.
        if (!spread && own.sum() <= room + 0.5f) return own
        val widths = labels.indices.map { if (alone[it]) ICON_ONLY else 0f }.toMutableList()
        val open = labels.indices.filter { !alone[it] }.toMutableList()
        var rest = room - alone.count { it } * ICON_ONLY
        val naturalPad = if (spread) PAD else WIDE_PAD
        if (open.sumOf { natural(labels[it], icons[it], naturalPad).toDouble() } > rest + 0.5) {
            // Past the last step: the narrowest keep their own width while an even share holds them, the rest
            // share what is left (their words cut) — never more than the room.
            for (i in open.sortedBy { natural(labels[it], icons[it], naturalPad) }) {
                val share = (rest / open.size).coerceAtLeast(0f)
                widths[i] = minOf(natural(labels[i], icons[i], naturalPad), share)
                rest -= widths[i]
                open.remove(i)
            }
            return widths
        }
        // Shared evenly (the web's `flex: 1`), but never narrower than a segment's own words (its min-content):
        // one that needs more than an even share keeps its own width, and the rest is shared again.
        while (open.isNotEmpty()) {
            val share = rest / open.size
            val wide = open.filter { natural(labels[it], icons[it], naturalPad) > share }
            if (wide.isEmpty()) {
                open.forEach { widths[it] = share }
                break
            }
            wide.forEach {
                widths[it] = natural(labels[it], icons[it], naturalPad)
                rest -= widths[it]
                open.remove(it)
            }
        }
        return widths
    }

    /**
     * Segment [i]'s region (px): between its two seams, straight outer edges pushed [pad] past the
     * bar (the outline trims them) — the web's segmentRegion, so a fill's edge lies under its seam.
     */
    fun regionPath(i: Int, count: Int, boundaries: List<List<Offset>>, w: Float, h: Float, pad: Float, density: Float): Path {
        val left = if (i == 0) listOf(Offset(-pad, -pad), Offset(-pad, h + pad)) else boundaries[i - 1]
        val right = if (i == count - 1) listOf(Offset(w + pad, -pad), Offset(w + pad, h + pad)) else boundaries[i]
        val points = left + right.reversed()
        return Path().apply {
            points.forEachIndexed { k, p -> if (k == 0) moveTo(p.x * density, p.y * density) else lineTo(p.x * density, p.y * density) }
            close()
        }
    }
}
