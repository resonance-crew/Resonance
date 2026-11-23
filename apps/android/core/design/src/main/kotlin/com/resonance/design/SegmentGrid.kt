package com.resonance.design

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wobRect
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * The grid's geometry (dp), the web's `lib/design/segmentGrid` to the point: which column counts it tries, the seeds
 * its seams take (the first row's are the bar's own, `seed + i·37 + 11`), each cell's region — its inner sides the
 * seams it shares with its neighbours, each wobbling only between the cells' corners, its outer sides pushed past
 * the grid (the outline trims them) — and every seam to cut.
 */
object SegmentGrid {
    /** A cell's padding a side, its glyph and the gap after it (the web's 12 · 16 · 6 at a phone's width). */
    const val PAD = 12f
    const val ICON = 16f
    const val GAP = 6f

    /** 4 → 2 → 1 for four cells (3 → 2 → 1 for three …). */
    fun columnSteps(count: Int): List<Int> {
        val steps = mutableListOf<Int>()
        var cols = count
        while (cols >= 1) {
            if (cols !in steps) steps += cols
            cols = if (cols > 2) ceil(cols / 2.0).toInt() else cols - 1
        }
        return steps
    }

    /** A cell's own width: its padding, glyph, gap and whole words — a dp to spare, so rounding never cuts them. */
    fun natural(label: Float, icon: Boolean): Float = 2 * PAD + label + (if (icon) ICON + GAP else 0f) + 1f

    /** The first column count in which the widest cell fits an equal share of [room]; one column whatever it measures. */
    fun columns(room: Float, naturals: List<Float>): Int {
        val widest = naturals.maxOrNull() ?: return 1
        for (cols in columnSteps(naturals.size)) if (cols == 1 || widest * cols <= room + 0.5f) return cols
        return 1
    }

    fun downSeed(seed: Double, cols: Int, r: Int, c: Int): Double = seed + (r * (cols - 1) + (c - 1)) * 37 + 11
    fun acrossSeed(seed: Double, cols: Int, r: Int, c: Int): Double = seed + 1000 + ((r - 1) * cols + c) * 37 + 23
    fun pad(rowHeight: Float): Float = max(12f, rowHeight * 0.3f)

    /** The bar's wave down at [x] from [y0] to [y1], its ends unmoved. */
    fun down(x: Float, y0: Float, y1: Float, seed: Double): List<Offset> =
        boundaryPoints(x.toDouble(), (y1 - y0).toDouble(), seed, 1.6, 0.0).drop(1).dropLast(1).map { Offset(it.x, it.y + y0) }

    /** The same wave on its side: across at [y] from [x0] to [x1]. */
    fun across(y: Float, x0: Float, x1: Float, seed: Double): List<Offset> =
        boundaryPoints(y.toDouble(), (x1 - x0).toDouble(), seed, 1.6, 0.0).drop(1).dropLast(1).map { Offset(it.y + x0, it.x) }

    /** Cell (r, c)'s region in a [w] × [h] grid of [cols] × [rows], clockwise. */
    fun region(r: Int, c: Int, cols: Int, rows: Int, w: Float, h: Float, seed: Double): List<Offset> {
        val cw = w / cols
        val rh = h / rows
        val pad = pad(rh)
        val x0 = c * cw
        val x1 = (c + 1) * cw
        val y0 = r * rh
        val y1 = (r + 1) * rh
        val l = c == 0
        val rt = c == cols - 1
        val t = r == 0
        val b = r == rows - 1
        val ox0 = if (l) -pad else x0
        val ox1 = if (rt) w + pad else x1
        val oy0 = if (t) -pad else y0
        val oy1 = if (b) h + pad else y1
        val top = if (t) listOf(Offset(ox0, oy0), Offset(ox1, oy0))
        else listOf(Offset(ox0, y0)) + across(y0, x0, x1, acrossSeed(seed, cols, r, c)) + Offset(ox1, y0)
        val right = if (rt) listOf(Offset(ox1, oy0), Offset(ox1, oy1))
        else listOf(Offset(x1, oy0)) + down(x1, y0, y1, downSeed(seed, cols, r, c + 1)) + Offset(x1, oy1)
        val bottom = if (b) listOf(Offset(ox1, oy1), Offset(ox0, oy1))
        else (listOf(Offset(ox0, y1)) + across(y1, x0, x1, acrossSeed(seed, cols, r + 1, c)) + Offset(ox1, y1)).reversed()
        val left = if (l) listOf(Offset(ox0, oy1), Offset(ox0, oy0))
        else (listOf(Offset(x0, oy0)) + down(x0, y0, y1, downSeed(seed, cols, r, c)) + Offset(x0, oy1)).reversed()
        return top + right + bottom + left
    }

    /** Every seam to cut: between columns row by row, then between rows column by column; an outer end runs past. */
    fun seams(cols: Int, rows: Int, w: Float, h: Float, seed: Double): List<List<Offset>> {
        val cw = w / cols
        val rh = h / rows
        val pad = pad(rh)
        val out = mutableListOf<List<Offset>>()
        for (r in 0 until rows) for (c in 1 until cols) {
            val x = c * cw
            out += listOf(Offset(x, if (r == 0) -pad else r * rh)) + down(x, r * rh, (r + 1) * rh, downSeed(seed, cols, r, c)) +
                Offset(x, if (r == rows - 1) h + pad else (r + 1) * rh)
        }
        for (r in 1 until rows) for (c in 0 until cols) {
            val y = r * rh
            out += listOf(Offset(if (c == 0) -pad else c * cw, y)) + across(y, c * cw, (c + 1) * cw, acrossSeed(seed, cols, r, c)) +
                Offset(if (c == cols - 1) w + pad else (c + 1) * cw, y)
        }
        return out
    }
}

private fun closed(points: List<Offset>, density: Float): Path = Path().apply {
    points.forEachIndexed { k, p -> if (k == 0) moveTo(p.x * density, p.y * density) else lineTo(p.x * density, p.y * density) }
    close()
}

/**
 * SegmentedGrid.tsx: a segmented choice as one fused grid — the bar's track ([fill]), its seams cut in the paper
 * ([divider]), the chosen cell in its own face — one row while every glyph beside its whole words fits an equal
 * share of the column, else two to a row (2×2), else one (the largest text sizes on the narrowest phone). A cell
 * never cuts, shrinks or wraps its words and never drops its glyph; each is at least [minHeight] tall. Its cells
 * are buttons (radio buttons, for a choice), so it has no pen line. Not [enabled], it fades to 0.6 and takes no tap.
 */
@Composable
fun SegmentedGrid(
    segments: List<Segment>,
    modifier: Modifier = Modifier,
    seed: Double = 71.0,
    fill: Color = Tokens.ButtonTonal,
    divider: Color = Tokens.Cream,
    enabled: Boolean = true,
    minHeight: Dp = 48.dp,
) {
    val density = LocalDensity.current
    val labelWidths = segmentLabelWidths(segments)
    BoxWithConstraints(modifier) {
        val room = maxWidth.value
        val cols = SegmentGrid.columns(room, segments.mapIndexed { i, s -> SegmentGrid.natural(labelWidths[i], s.icon != null) })
        val rows = ceil(segments.size / cols.toDouble()).toInt().coerceAtLeast(1)
        val scope = rememberCoroutineScope()
        val ink = remember { InkSpread() }
        var pressed by remember { mutableStateOf<Int?>(null) }
        val label = Tokens.ButtonOnTonal
        val wash = OrganicIndication.Wash
        val grainInk = GrainInk.current
        val style = AppFonts.body(14f, 600, lineHeight = 1f)
        Layout(
            content = {
                segments.forEachIndexed { i, seg ->
                    val source = remember { MutableInteractionSource() }
                    LaunchedEffect(source, cols) {
                        source.interactions.collect {
                            when (it) {
                                is PressInteraction.Press -> {
                                    pressed = i
                                    val cw = with(density) { (maxWidth / cols).toPx() }
                                    ink.press(scope, Offset(it.pressPosition.x + (i % cols) * cw, it.pressPosition.y))
                                }
                                is PressInteraction.Release, is PressInteraction.Cancel -> ink.release(scope)
                            }
                        }
                    }
                    Row(
                        Modifier
                            .clickable(source, indication = null, enabled = enabled, role = if (seg.selected != null) Role.RadioButton else Role.Button, onClick = seg.onClick)
                            .semantics { seg.selected?.let { selected = it } }
                            .padding(horizontal = SegmentGrid.PAD.dp, vertical = segmentPadY(minHeight)),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(SegmentGrid.GAP.dp, Alignment.CenterHorizontally),
                    ) {
                        seg.icon?.let {
                            OrganicIcon(it, Modifier.offset(y = labelInkDrop(14f)), size = SegmentGrid.ICON.dp, color = seg.textColor ?: label, strokeWidth = seg.iconStroke)
                        }
                        BasicText(seg.label, maxLines = 1, softWrap = false, style = style.copy(color = seg.textColor ?: label))
                    }
                }
            },
            modifier = Modifier
                .fade(if (enabled) 1f else 0.6f)
                .drawWithCache {
                    val w = size.width / this.density
                    val h = size.height / this.density
                    val rowH = h / rows
                    val outer = wobRect(w.toDouble(), h.toDouble(), 16.0, seed, min(w, rowH) * 0.05, WobRectOptions(
                        segmentsH = SegValue.Range(7, 9), segmentsV = SegValue.Range(2 * rows, 3 * rows), curve = 1.2, cornerJitter = 1.2, cornerOffset = rowH * 0.04,
                    )).toPath(this.density)
                    val regions = segments.indices.map { i ->
                        Path().apply {
                            op(closed(SegmentGrid.region(i / cols, i % cols, cols, rows, w, h, seed), this@drawWithCache.density), outer, PathOperation.Intersect)
                        }
                    }
                    val seams = SegmentGrid.seams(cols, rows, w, h, seed).map { polylinePath(it, this.density) }
                    val grain = Grain.brush(GrainMode.Tile, "grain-button", size, this.density, 0.38f, grainInk)
                    val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    onDrawBehind {
                        drawPath(outer, fill)
                        segments.forEachIndexed { i, seg -> seg.fill?.let { drawPath(regions[i], it) } }
                        pressed?.let { i -> with(ink) { draw(regions[i], segments[i].press ?: wash) } }
                        clipPath(outer) { seams.forEach { drawPath(it, divider, style = pen) } }
                        grain?.let { drawPath(outer, it, alpha = 0.38f) }
                    }
                },
        ) { measurables, constraints ->
            val width = constraints.maxWidth
            val cw = width / cols
            val minH = minHeight.roundToPx()
            val tallest = measurables.maxOfOrNull { it.minIntrinsicHeight(cw) } ?: 0
            val rowH = max(minH, tallest)
            val placeables = measurables.mapIndexed { i, m ->
                val w = if (i % cols == cols - 1) width - cw * (cols - 1) else cw
                m.measure(Constraints.fixed(w, rowH))
            }
            layout(width, rowH * rows) {
                placeables.forEachIndexed { i, p -> p.place((i % cols) * cw, (i / cols) * rowH) }
            }
        }
    }
}
