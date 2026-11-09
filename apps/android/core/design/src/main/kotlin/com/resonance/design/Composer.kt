package com.resonance.design

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.CacheDrawScope
import androidx.compose.ui.draw.DrawResult
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.geometry.PathCommand
import com.resonance.geometry.Prng
import com.resonance.geometry.autoCurve
import com.resonance.geometry.autoMag
import com.resonance.geometry.autoSegments
import com.resonance.design.generated.Tokens
import com.resonance.design.generated.ResonanceColors
import com.resonance.design.generated.LocalResonanceColors
import androidx.compose.runtime.ReadOnlyComposable

/**
 * The chat composer's one-line height (round 9 §4): 48 on every platform, whatever the text size —
 * the text's padding is worked out from its real line ([composerPadding]), so a larger text size
 * never makes the capsule taller; only more lines do.
 */
val ComposerHeight = 48.dp

/** Send, the capsule's end segment: its width (the segmented bar's language). */
val ComposerSendWidth = 52.dp

/**
 * The fade at the top of the composer's foot (round 10 §3.2, round 11 §3): the page's paper going
 * from clear to opaque over these 12 — just enough to read as a fade — then solid to the screen's
 * bottom edge ([ComposerBacking]). It starts on the top edge of what the foot shows first.
 */
val ComposerFade = 12.dp

/**
 * A pane the capsule doesn't fill (2026-11-01, the owner's notes: it is at its widest, room beside it past the
 * gutter — a tablet): the thread shows beside the capsule and nowhere else — it sinks into a fade this tall at the
 * foot (from 20 over the capsule's foot down past its 8), while a column of paper exactly the capsule's width runs
 * from the capsule's middle to the screen's edge, its sides fading in over [ComposerWideSideFade] from the capsule's
 * edges, so the clear edge lies on its border ([ComposerBacking]'s `wide`). The web's `.dock` in a pane over 748,
 * iOS's twin. What rides with the message is inside the capsule (round 23 §2), so nothing stands over it.
 */
val ComposerWideFootFade = 28.dp
val ComposerWideSideFade = 12.dp

/**
 * A wide pane's foot, for its paper: how tall the foot is, where the column under the capsule starts, and the
 * capsule's column (at most [capsuleMax] wide, [gutter] inside the pane's sides).
 */
data class ComposerWideFoot(val footHeight: Dp, val columnTop: Dp, val capsuleMax: Dp, val gutter: Dp)

/**
 * What rides with the message, inside the capsule's pen line over the text (round 23 §2, Telegram's way): three
 * columns running top to bottom — the lead column (＋'s own, [ComposerLeadColumn]) holding a row's mark, the text
 * column starting where the field's words start, and Send's [ComposerSendWidth] column holding each row's ✕. The
 * rows' block starts [ComposerRowsTop] under the pen line; rows touch; the last one meets the text line, whose own
 * padding is the gap. One reply makes the capsule 6 + 44 + 48 = 98 (the foot was 124 with the rows above it).
 */
val ComposerRowsTop = 6.dp

/** A row riding with the message inside the capsule ([ComposerRow]): its height. */
val ComposerRowHeight = 44.dp

/** The lead column: ＋'s own width, so a row's mark stands over ＋. */
val ComposerLeadColumn = ComposerHeight

/** The picture strip riding with the message: [ComposerStripPad] + a [ComposerStripThumb] thumbnail + [ComposerStripPad]. */
val ComposerStripThumb = 56.dp
val ComposerStripPad = 8.dp
val ComposerStripHeight = ComposerStripPad + ComposerStripThumb + ComposerStripPad

/** Why the last message didn't go: a row at least this tall, a small terracotta mark in the lead column. */
val ComposerErrorRowHeight = 32.dp

/**
 * A short window (a phone on its side with the keyboard up: under [ComposerShortViewport] tall): every row one line
 * this tall (label · detail), the strip's thumbnails [ComposerShortThumb], the text at most three lines.
 */
val ComposerShortRowHeight = 36.dp
val ComposerShortThumb = 44.dp
val ComposerShortViewport = 480.dp

/** The capsule's pen: the field's own (FieldBorder), darker while it is written in — the same colour, never terracotta (round 10 §3.3). */
fun composerPen(focused: Boolean, palette: ResonanceColors): Color = if (focused) palette.FieldBorderHover else palette.FieldBorder

/** The text's padding above and below that centres one line [line] tall in the capsule's 48 (never less than none). */
fun composerPadding(line: Dp): Dp = ((ComposerHeight - line) / 2).coerceAtLeast(0.dp)

/** How tall one line of [style] is here (its CSS line box, at this density and text scale). */
@Composable
fun lineHeightOf(style: TextStyle): Dp {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    return remember(style, density) {
        with(density) { measurer.measure("Aa字", style, maxLines = 1).size.height.toDp() }
    }
}

/**
 * The composer as one floating field with its tools inside (round 9 §4): the field's own wobble on
 * cream with its pen at INK, darker while it has the focus ([focused], read while drawing:
 * [composerPen]) — no halo, no shadow, no alpha: the foot's paper behind it ([ComposerBacking]) keeps
 * the thread from showing round it (round 10 §3). In it: [leading] (the ＋ ghost button, a 48 square at its start),
 * the [field] (the text, given the padding that centres one line in 48: [composerPadding] of
 * [textStyle]'s real line), and Send as the capsule's end segment — a wavy seam in the paper's colour
 * cut across it, [ComposerSendWidth] wide and as tall as the capsule, the plane on the last line's row.
 * At rest (nothing to send) the segment wears the tonal face with a terracotta plane, so the seam and
 * the two parts show; with something to send ([canSend]) the solid terracotta with a cream plane, in
 * 140 ms. Not able to send is said to TalkBack as disabled, never drawn faded.
 */
@Composable
fun ComposerCapsule(
    canSend: Boolean,
    sendLabel: String,
    onSend: () -> Unit,
    focused: () -> Boolean,
    textStyle: TextStyle,
    modifier: Modifier = Modifier,
    seed: Double = 17.0,
    /** What the end segment does (round 22 §4.1): send, or — the sticker panel open with nothing to send — ↑ / ↓. */
    segment: ComposerSegment = ComposerSegment.Send,
    /**
     * The field past one line, grown to the thread (round 22 §4.3, the owner's notes 2), or with something riding
     * (round 23 §2): the segment a 52 × 48 block on the last row, its top start corner rounded.
     */
    block: Boolean = false,
    /** What stands in the block's column at the text's top end — the column the full-height strip filled (⤢ / ⤡). */
    overSegment: (@Composable () -> Unit)? = null,
    /** A 48 square at the field's end, before Send, on the last line's row — [leading]'s twin (the composer's ☺ / ⌨). */
    trailing: (@Composable () -> Unit)? = null,
    /** What rides with the message (round 23 §2), inside the pen line over the text, the capsule's whole width ([CapsuleField]'s `header`). */
    header: (@Composable () -> Unit)? = null,
    leading: @Composable () -> Unit,
    field: @Composable BoxScope.(vertical: Dp) -> Unit,
) = CapsuleField(
    ready = canSend && segment == ComposerSegment.Send,
    segmentWidth = ComposerSendWidth,
    segmentLabel = sendLabel,
    onSegment = onSend,
    focused = focused,
    textStyle = textStyle,
    modifier = modifier,
    seed = seed,
    segmentEnabled = canSend || segment != ComposerSegment.Send,
    block = block,
    overSegment = overSegment,
    trailing = trailing,
    header = header,
    // A row coming or going moves the capsule's sides and top only: its foot, ＋ / ☺ and Send's corner stay put.
    steadyEdges = true,
    leading = leading,
    segment = { ink ->
        // ˄ / ˅ is one chevron turning as the panel grows (never an arrow, which reads as sending the sticker). Its
        // turn lives in this branch alone, so coming from Send it starts where it should instead of spinning there.
        if (segment == ComposerSegment.Send) {
            OrganicIcon(IconName.Send, size = 20.dp, color = ink)
        } else {
            val turn by animateFloatAsState(if (segment == ComposerSegment.Expand) 180f else 0f, tween(220), label = "chevron")
            OrganicIcon(IconName.ChevronDown, Modifier.graphicsLayer { rotationZ = turn }, size = 20.dp, color = ink)
        }
    },
    field = field,
)

/** What the composer's end segment does (round 22 §4.1). */
enum class ComposerSegment { Send, Expand, Collapse }

/**
 * The capsule the composer is (round 9 §4), for any one-line-or-more field with a verb at its end
 * (round 16 §1: the publish step's tags). The field's own wobble (R16) on cream, its pen at INK,
 * darker while it has the focus ([focused], read while drawing: [composerPen]), never terracotta;
 * one line exactly [ComposerHeight] tall whatever the text size ([composerPadding] of [textStyle]'s
 * real line). [leading] (a 48 square at its start, the composer's ＋) or, without one, the field's
 * own start padding; the [field]; and the end segment behind a wavy seam cut in the paper's colour,
 * [segmentWidth] wide and as tall as the capsule, its [segment] content on the last line's row in
 * the ink it is handed. At rest ([ready] false) the tonal face with the deep terracotta ink, so the
 * seam and the two parts show; [ready], the solid accent with cream ink, in 140 ms. The segment
 * takes a tap while [segmentEnabled] (the composer's Send only when it can send; the tag field's
 * at rest too, where it asks the model); not taking one is said to TalkBack as disabled, never
 * drawn faded. [segmentState] is its state for TalkBack (busy while the model thinks).
 */
@Composable
fun CapsuleField(
    ready: Boolean,
    segmentWidth: Dp,
    segmentLabel: String,
    onSegment: () -> Unit,
    focused: () -> Boolean,
    textStyle: TextStyle,
    modifier: Modifier = Modifier,
    seed: Double = 17.0,
    segmentEnabled: Boolean = ready,
    segmentState: String? = null,
    /** The segment a [segmentWidth] × [ComposerHeight] block on the last row, its wavy seam round its top start corner (round 22 §4.3). */
    block: Boolean = false,
    /** Drawn in the block's column at the top of the text ([block]), under [header]: the composer's ⤢ / ⤡. */
    overSegment: (@Composable () -> Unit)? = null,
    /** A square as big as [leading]'s at the field's end, on the last line's row (round 22, the owner's: every tool in the capsule one size). */
    trailing: (@Composable () -> Unit)? = null,
    leading: (@Composable () -> Unit)? = null,
    /**
     * Over the text, inside the pen line, the capsule's whole width (round 23 §2: the composer's riding rows, each ✕
     * in the segment's column). None by default: the publish step's tag field has none.
     */
    header: (@Composable () -> Unit)? = null,
    /**
     * The outline drawn edge by edge from seeds of their own ([steadyCapsuleOutline]): the foot keeps its wobble
     * however tall the capsule grows, only the sides and the top changing. Off by default (the tag field's wobble
     * is the field's own, as it was).
     */
    steadyEdges: Boolean = false,
    segment: @Composable (ink: Color) -> Unit,
    field: @Composable BoxScope.(vertical: Dp) -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val haptic = LocalHapticFeedback.current
    val face by animateColorAsState(if (ready) Tokens.ButtonFill else Tokens.ButtonTonal, tween(SEND_FADE_MILLIS), label = "segmentFace")
    val ink by animateColorAsState(if (ready) Tokens.Cream else Tokens.ButtonOnTonal, tween(SEND_FADE_MILLIS), label = "segmentInk")
    val shape = remember(seed, steadyEdges) { if (steadyEdges) SteadyCapsuleShape(Tokens.RadiusMd.toDouble(), seed) else WobRectShape(Tokens.RadiusMd.toDouble(), seed) }
    val vertical = composerPadding(lineHeightOf(textStyle))
    val palette = LocalResonanceColors.current
    // A press on the solid face darkens it as the primary button does; on the tonal one, the accent's wash.
    val press = if (ready) OrganicIndication.OnFill else OrganicIndication.Wash
    val grainInk = GrainInk.current
    Box(
        modifier
            .fillMaxWidth()
            .drawWithCache {
                val o = shape.createOutline(size, layoutDirection, this)
                val outline = (o as? Outline.Generic)?.path ?: Path().apply { addOutline(o) }
                val w = size.width / density
                val h = size.height / density
                val pad = 12.0
                val (regionShape, seamPath) = if (block && h > ComposerHeight.value + 1) {
                    blockSegment(w, h, segmentWidth.value, ComposerHeight.value, seed, pad.toFloat(), density)
                } else {
                    val seam = boundaryPoints((w - segmentWidth.value).toDouble(), h.toDouble(), seed + 11, 1.6, pad)
                    SegmentedLayout.regionPath(1, 2, listOf(seam), w, h, pad.toFloat(), density) to polylinePath(seam, density)
                }
                val region = Path().apply { op(regionShape, outline, PathOperation.Intersect) }
                val grain = Grain.brush(GrainMode.Tile, "grain-button", size, density, 0.38f, grainInk)
                val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawBehind {
                    drawOutline(o, palette.Cream)
                    drawPath(region, face)
                    if (pressed && segmentEnabled) drawPath(region, press)
                    grain?.let { drawPath(region, it, alpha = 0.38f) }
                    clipPath(outline) { drawPath(seamPath, palette.Cream, style = pen) }
                    drawOutline(o, composerPen(focused(), palette), style = pen)
                }
            },
    ) {
        Column(Modifier.fillMaxWidth()) {
            header?.invoke()
            // The text: ＋, the field and ☺ on its last line's row; ⤢ / ⤡ at its top in the segment's column — under
            // what rides, never on a row's ✕ (with nothing riding, the capsule's top end as before).
            Box(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().heightIn(min = ComposerHeight).padding(end = segmentWidth), verticalAlignment = Alignment.Bottom) {
                    if (leading != null) Box(Modifier.width(ComposerHeight).height(ComposerHeight), contentAlignment = Alignment.Center) { leading() }
                    Box(Modifier.weight(1f).padding(start = if (leading != null) 0.dp else Tokens.FieldPadX.dp, end = if (trailing != null) 0.dp else 10.dp)) { field(vertical) }
                    if (trailing != null) Box(Modifier.width(ComposerHeight).height(ComposerHeight), contentAlignment = Alignment.Center) { trailing() }
                }
                if (block && overSegment != null) {
                    // In the send column at the text's top (the owner: where a finger finds it, and it reads as "the whole
                    // screen"): a square as wide as the block and as tall, inset from the top as the block is from the foot —
                    // its glyph as far from the top pen line (or the rows) as Send's from the bottom one.
                    Box(
                        Modifier.align(Alignment.TopEnd).width(segmentWidth).height(ComposerHeight),
                        contentAlignment = Alignment.Center,
                    ) { overSegment() }
                }
            }
        }
        Box(Modifier.matchParentSize()) {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .width(segmentWidth)
                    .then(if (block) Modifier.height(ComposerHeight) else Modifier.fillMaxHeight())
                    .clickable(source, indication = null, enabled = segmentEnabled, role = Role.Button, onClickLabel = segmentLabel) {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSegment()
                    }
                    // The clickable's role, action and enabled state stay; the glyph and words inside are said as one name.
                    .clearAndSetSemantics {
                        contentDescription = segmentLabel
                        if (segmentState != null) stateDescription = segmentState
                    },
                contentAlignment = Alignment.BottomCenter,
            ) {
                // The segment's content on the last line's row, level with ＋, however many lines the field has.
                Box(Modifier.fillMaxWidth().height(ComposerHeight), contentAlignment = Alignment.Center) { segment(ink) }
            }
        }
    }
}

/**
 * The composer capsule's outline when it grows (round 23, the critique's 9): [wobRect]'s recipe, but each edge drawn
 * from a seed of its own and the top and foot with the one-line capsule's wobble whatever the height — so a row coming
 * or going (or a line) moves the sides and the top only, and the foot under the thumb, ＋, ☺ and Send's corner keep
 * theirs. The tag field and every other outline keep [WobRectShape].
 */
internal data class SteadyCapsuleShape(private val radius: Double, private val seed: Double) : Shape {
    override fun createOutline(size: androidx.compose.ui.geometry.Size, layoutDirection: androidx.compose.ui.unit.LayoutDirection, density: androidx.compose.ui.unit.Density): Outline {
        val d = density.density
        val w = (size.width / d).toDouble()
        val h = (size.height / d).toDouble()
        if (w <= 0 || h <= 0) return Outline.Rectangle(androidx.compose.ui.geometry.Rect.Zero)
        return Outline.Generic(steadyCapsuleOutline(w, h, radius, seed).toPath(d))
    }
}

/**
 * [SteadyCapsuleShape]'s path, in dp: the top edge and its corners from `seed`, the end side from `seed + 101`, the foot
 * and its corners from `seed + 202`, the start side from `seed + 303`. The top and the foot take their wobble (its swing,
 * bow and turns) from a capsule [line] tall, the sides from the real height. Pure, for the tests.
 */
internal fun steadyCapsuleOutline(w: Double, h: Double, radius: Double, seed: Double, line: Double = ComposerHeight.value.toDouble()): List<PathCommand> {
    val K = 0.552
    val hl = kotlin.math.min(h, line)
    fun perp(edgeH: Double): Double {
        val m = autoMag(w, edgeH)
        val curve = autoCurve(w, edgeH)
        return kotlin.math.min(m * 0.95 * curve, kotlin.math.min(w, edgeH) * 0.032 * kotlin.math.max(1.0, curve))
    }
    val perpH = perp(hl)
    val perpV = perp(h)
    val segH = autoSegments(w)
    val segV = autoSegments(h)
    val top = Prng(seed)
    val end = Prng(seed + 101)
    val foot = Prng(seed + 202)
    val start = Prng(seed + 303)
    val r = kotlin.math.min(radius, kotlin.math.min(w, hl) / 2)
    val rVar = kotlin.math.min(r * 0.07, kotlin.math.max(0.0, kotlin.math.min(w, hl) / 2 - r) * 0.4)
    fun corner(rnd: Prng) = r + (rnd.next() - 0.5) * 2 * rVar
    val rtl = corner(top)
    val rtr = corner(top)
    val rbr = corner(foot)
    val rbl = corner(foot)
    fun cubic(p0: Pair<Double, Double>, p1: Pair<Double, Double>, horizontal: Boolean): PathCommand {
        return if (horizontal) {
            val k = kotlin.math.abs(p1.first - p0.first) / 3
            val dir = if (p1.first >= p0.first) 1.0 else -1.0
            PathCommand.Cubic(p0.first + dir * k, p0.second, p1.first - dir * k, p1.second, p1.first, p1.second)
        } else {
            val k = kotlin.math.abs(p1.second - p0.second) / 3
            val dir = if (p1.second >= p0.second) 1.0 else -1.0
            PathCommand.Cubic(p0.first, p0.second + dir * k, p1.first, p1.second - dir * k, p1.first, p1.second)
        }
    }
    fun edge(p0: Pair<Double, Double>, p1: Pair<Double, Double>, horizontal: Boolean, segs: Int, amp: Double, rnd: Prng): List<PathCommand> {
        val len = if (horizontal) kotlin.math.abs(p1.first - p0.first) else kotlin.math.abs(p1.second - p0.second)
        if (segs < 2 || len < amp * 4) return listOf(cubic(p0, p1, horizontal))
        val jitter = kotlin.math.min(0.08, 0.4 / segs)
        val out = ArrayList<PathCommand>(segs)
        var prev = p0
        for (i in 1 until segs) {
            val t = i.toDouble() / segs + (rnd.next() - 0.5) * jitter
            val x = p0.first + (p1.first - p0.first) * t
            val y = p0.second + (p1.second - p0.second) * t
            val a = if (horizontal) x to y + (rnd.next() - 0.5) * 2 * amp else x + (rnd.next() - 0.5) * 2 * amp to y
            out += cubic(prev, a, horizontal)
            prev = a
        }
        out += cubic(prev, p1, horizontal)
        return out
    }
    // The foot's anchors are laid out from the start, so it reads the same however its points are walked.
    val footEdge = edge(rbl to h, w - rbr to h, true, segH, perpH, foot)
    val tla = 0.0 to rtl
    val tlb = rtl to 0.0
    val tra = w - rtr to 0.0
    val trb = w to rtr
    val bra = w to h - rbr
    val brb = w - rbr to h
    val bla = rbl to h
    val blb = 0.0 to h - rbl
    val path = ArrayList<PathCommand>()
    path += PathCommand.Move(tla.first, tla.second)
    path += PathCommand.Cubic(0.0, tla.second * (1 - K) + tlb.second * K, tlb.first * (1 - K) + tla.first * K, 0.0, tlb.first, tlb.second)
    path += edge(tlb, tra, true, segH, perpH, top)
    path += PathCommand.Cubic(tra.first + (w - tra.first) * K, 0.0, w, trb.second * (1 - K), trb.first, trb.second)
    path += edge(trb, bra, false, segV, perpV, end)
    path += PathCommand.Cubic(w, bra.second + (h - bra.second) * K, brb.first + (w - brb.first) * K, h, brb.first, brb.second)
    path += reversedEdge(footEdge, bla)
    path += PathCommand.Cubic(bla.first * (1 - K), h, 0.0, blb.second + (h - blb.second) * K, blb.first, blb.second)
    path += edge(blb, tla, false, segV, perpV, start)
    path += PathCommand.Close
    return path
}

/** [cubics] (a run of cubics from some start to its last point) walked backwards, ending at [to]. */
private fun reversedEdge(cubics: List<PathCommand>, to: Pair<Double, Double>): List<PathCommand> {
    val cs = cubics.map { it as PathCommand.Cubic }
    val out = ArrayList<PathCommand>(cs.size)
    for (i in cs.indices.reversed()) {
        val c = cs[i]
        val (sx, sy) = if (i == 0) to else cs[i - 1].let { it.x to it.y }
        out += PathCommand.Cubic(c.x2, c.y2, c.x1, c.y1, sx, sy)
    }
    return out
}

/** The block's top start corner (round 22, the owner's notes 2: it turned too sharply). */
private const val BLOCK_CORNER = 14.0

/** How long Send takes to turn from its resting face to the verb's. */
private const val SEND_FADE_MILLIS = 140

/**
 * The end segment as a block on the last row (round 22 §4.3, the owner's notes 2: the field past one line, or grown;
 * its segment [segW] × [segH] in its bottom end corner): the region it fills (running past the box on its outer
 * sides, for the capsule's outline to end) and its seam — a gentle wave up its start side, round a [radius] corner,
 * then along its top to the capsule's end. All dp in, px out.
 */
internal fun blockSegment(
    w: Float,
    h: Float,
    segW: Float,
    segH: Float,
    seed: Double,
    pad: Float,
    density: Float,
    radius: Double = BLOCK_CORNER,
): Pair<Path, Path> {
    val x0 = (w - segW).toDouble()
    val y0 = (h - segH).toDouble()
    val r = radius.coerceIn(0.0, minOf(segW, segH).toDouble() / 2)
    // Up the start side, from past the foot to where the corner begins (a boundary as tall as that, its overshoot above dropped).
    val side = boundaryPoints(x0, segH - r, seed + 11, 1.2, pad.toDouble()).drop(1).map { Offset(it.x, (it.y + y0 + r).toFloat()) }
        .filter { it.y >= y0 + r - 0.01 }
    // Round the corner: a quarter circle from the side's top to the top's start.
    val arc = (1 until CORNER_STEPS).map { k ->
        val a = Math.PI + Math.PI / 2 * k / CORNER_STEPS
        Offset((x0 + r + r * Math.cos(a)).toFloat(), (y0 + r + r * Math.sin(a)).toFloat())
    }
    // Along the top, from the corner's end to past the capsule's end (a boundary laid on its side, its overshoot before the corner dropped).
    val top = boundaryPoints(0.0, segW - r, seed + 23, 1.0, pad.toDouble()).drop(1).map { Offset((x0 + r + it.y).toFloat(), (y0 + it.x).toFloat()) }
    val seam = side.reversed() + arc + top
    val region = Path().apply {
        seam.forEachIndexed { i, p -> if (i == 0) moveTo(p.x * density, p.y * density) else lineTo(p.x * density, p.y * density) }
        lineTo((w + pad) * density, (h + pad) * density)
        close()
    }
    return region to polylinePath(seam, density)
}

/** How many straight steps the block's round corner is drawn in. */
private const val CORNER_STEPS = 8

/**
 * A list's edges fading where more of it lies beyond (the web's `[data-edge-fade-top]` / `[data-edge-fade-bottom]`,
 * 16): [top] and [bottom] say whether it can still scroll that way, read while drawing. No line, no card. Put it
 * outside the scroller, so the mask stays on its viewport.
 */
fun Modifier.edgeFades(top: () -> Boolean, bottom: () -> Boolean, edge: Dp = EdgeFade): Modifier =
    graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }.drawWithContent {
        drawContent()
        val up = top()
        val down = bottom()
        if (!up && !down) return@drawWithContent
        val t = kotlin.math.min(edge.toPx(), size.height / 3) / size.height
        drawRect(
            Brush.verticalGradient(
                0f to if (up) Color.Transparent else Color.Black,
                t to Color.Black,
                1f - t to Color.Black,
                1f to if (down) Color.Transparent else Color.Black,
            ),
            blendMode = BlendMode.DstIn,
        )
    }

/** The web's list edge fade (globals.css): 16. */
val EdgeFade = 16.dp

/**
 * The composer's text, scrolled in its box (round 22 §4.3): a [ComposerFadeEdge] alpha mask on the box's inner
 * top and bottom edges, each shown only while there is text beyond it ([scroll]) — the field's words fading into
 * its paper, never cut by a hard edge. Put it outside the scroll modifier, so the mask stays on the box.
 */
fun Modifier.composerFades(scroll: androidx.compose.foundation.ScrollState): Modifier =
    graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }.drawWithContent {
        drawContent()
        val max = scroll.maxValue
        if (max <= 0 || max == Int.MAX_VALUE) return@drawWithContent
        val e = kotlin.math.min(ComposerFadeEdge.toPx(), size.height / 3)
        if (e <= 0f) return@drawWithContent
        val above = scroll.value > 0
        val below = scroll.value < max
        if (!above && !below) return@drawWithContent
        val t = e / size.height
        drawRect(
            Brush.verticalGradient(
                0f to if (above) Color.Transparent else Color.Black,
                t to Color.Black,
                1f - t to Color.Black,
                1f to if (below) Color.Transparent else Color.Black,
            ),
            blendMode = BlendMode.DstIn,
        )
    }

/** The composer's fades: 14 at the text's inner top and bottom edges (round 22 §4.3). */
val ComposerFadeEdge = 14.dp

/**
 * A panel's grip (round 22 §4.2): one short wavy pen mark — the writer's divider's — in the muted pen at INK,
 * centred on the panel's top line; darker while held ([active]).
 */
@Composable
fun PanelGripMark(active: Boolean, modifier: Modifier = Modifier, seed: Double = 41.0) {
    val ink = if (active) Tokens.FieldBorderHover else Tokens.FieldBorder
    Box(
        modifier
            .size(40.dp, 8.dp)
            .clearAndSetSemantics { }
            .drawWithCache {
                val line = wavyLinePath(size.width, size.height, density, seed, 1.6, 3)
                val pen = Stroke(Tokens.InkStrong.toPx(), cap = StrokeCap.Round)
                onDrawBehind { drawPath(line, ink, style = pen) }
            },
    )
}

/**
 * A flat paper sheet (round 18's menus): the theme's menu paper inside one hand-drawn pen line, the header's quiet
 * grey at INK — no grain, no shadow. The sticker preview stands on one (round 22 §4.1), its [outline] its cell's.
 */
@Composable
fun Modifier.paperSheet(seed: Double = 31.0, radius: Double = MenuSheet.RADIUS, outline: Shape? = null): Modifier {
    val palette = LocalResonanceColors.current
    return drawWithCacheOf(FloatingSlip(seed, radius, palette.FieldBorderHover, palette.MenuPaper, Tokens.Ink.value, outline))
}

/**
 * A notice floating in the composer's place (round 9 §4): opaque cream, its pen INK_LIGHT in the
 * muted ink, the field's wobble at radius 14. No halo, shadow or alpha: the foot's paper is behind it
 * ([ComposerBacking]), as behind the capsule (round 10 §3.1).
 */
@Composable
fun Modifier.floatingSlip(seed: Double = 29.0, radius: Double = 14.0, pen: Color = Tokens.TextMuted): Modifier = drawWithCacheOf(FloatingSlip(seed, radius, pen, Tokens.Cream, Tokens.InkLight.value))

/**
 * [floatingSlip]'s drawing, as a value ([drawWithCacheOf]): recomposed with equal inputs it is an equal modifier,
 * which keeps what it cached (outline, paths, grain) instead of building it again at the next draw.
 */
private data class FloatingSlip(
    val seed: Double,
    val radius: Double,
    val pen: Color,
    val paper: Color,
    val width: Float,
    /** Its outline, when it is not the slip's own wobble (the sticker preview: its cell's outline grown). */
    val outline: Shape? = null,
) : (CacheDrawScope) -> DrawResult {
    override fun invoke(scope: CacheDrawScope): DrawResult = with(scope) {
        val o = (outline ?: WobRectShape(radius, seed)).createOutline(size, layoutDirection, this)
        val line = Stroke(width.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        onDrawBehind {
            drawOutline(o, paper)
            drawOutline(o, pen, style = line)
        }
    }
}

/**
 * The paper at the thread's foot, behind the composer (round 10 §3.2, round 11 §3): the page's cream
 * across the whole pane, down to the screen's bottom edge — through the navigation bar, to the
 * keyboard's top when it is up — its top [ComposerFade] a fade from clear paper to opaque, starting
 * on the top edge of what the foot shows first. Laid behind the foot at its size: the fade covers the
 * capsule's top 12 (solid from there down) — what rides with the message is inside the capsule (round
 * 23 §2), so there is no fade over rows any more (the owner's: 「不用做這個漸層」). The solid paper takes
 * every touch, so nothing under it can be tapped or dragged — a tap on it ([onTap]) is a tap on the
 * thread's blank (the keyboard goes away); the fade lets touches through to the thread. Not read by
 * TalkBack.
 */
@Composable
fun ComposerBacking(modifier: Modifier = Modifier, onTap: () -> Unit = {}, wide: ComposerWideFoot? = null) {
    val paper = Tokens.Cream
    val fade = remember(paper) { Brush.verticalGradient(listOf(paper.copy(alpha = 0f), paper)) }
    if (wide == null) {
        Column(modifier.clearAndSetSemantics { }) {
            Box(Modifier.fillMaxWidth().height(ComposerFade).background(fade))
            Box(Modifier.fillMaxWidth().weight(1f).background(paper).paperTouches(onTap))
        }
        return
    }
    // A wide pane: clear beside the capsule but for a fade over the foot's last [ComposerWideFootFade], solid below the
    // foot; and the column of paper under the capsule, from `columnTop` to the screen's edge.
    BoxWithConstraints(modifier.clearAndSetSemantics { }) {
        Column(Modifier.fillMaxSize()) {
            Spacer(Modifier.height((wide.footHeight - ComposerWideFootFade).coerceAtLeast(0.dp)))
            Box(Modifier.fillMaxWidth().height(ComposerWideFootFade).background(fade))
            Box(Modifier.fillMaxWidth().weight(1f).background(paper).paperTouches(onTap))
        }
        val capsule = minOf(maxWidth, wide.capsuleMax) - wide.gutter * 2
        ComposerColumnPaper(
            onTap = onTap,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = wide.columnTop)
                .width(capsule)
                .fillMaxHeight(),
        )
    }
}

/**
 * The column of paper under a wide pane's capsule ([ComposerBacking]'s `wide`): exactly as wide as the capsule,
 * fading in over [ComposerWideSideFade] from each side, from the capsule's middle down (it is opaque above that).
 * Its touches are the paper's ([onTap]).
 */
@Composable
fun ComposerColumnPaper(onTap: () -> Unit, modifier: Modifier = Modifier) {
    val paper = Tokens.Cream
    val density = LocalDensity.current
    val side = with(density) { ComposerWideSideFade.toPx() }
    Box(
        modifier
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawRect(paper)
                val w = size.width.coerceAtLeast(side * 2 + 1f)
                drawRect(
                    Brush.horizontalGradient(0f to Color.Transparent, side / w to Color.Black, 1f - side / w to Color.Black, 1f to Color.Transparent),
                    blendMode = BlendMode.DstIn,
                )
            }
            .paperTouches(onTap),
    )
}

/** Every touch is the paper's (nothing under it is pressed); one that stays a tap is the blank's ([onTap]). */
@Composable
private fun Modifier.paperTouches(onTap: () -> Unit): Modifier {
    val tap by rememberUpdatedState(onTap)
    return pointerInput(Unit) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false)
            down.consume()
            var moved = false
            while (true) {
                val event = awaitPointerEvent()
                event.changes.forEach { it.consume() }
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                if ((change.position - down.position).getDistance() > viewConfiguration.touchSlop) moved = true
                if (!change.pressed) {
                    if (!moved) tap()
                    break
                }
            }
        }
    }
}

/**
 * One thing riding with the message, inside the capsule over the text (round 23 §2, Telegram's way), in three
 * columns: its [lead] mark (the reply's rule, a glyph or cover on a 32 tile) centred in ＋'s column
 * ([ComposerLeadColumn]); then — where the field's words start — a reply's [media] (a 36 thumbnail: a sticker's pose,
 * a picture, a card's cover) and its [label] (12 / 600) over one line of [detail] (12.5, muted; none: the label alone,
 * centred); and a 44 ✕ in Send's column, named [closeLabel]. [ComposerRowHeight] tall; [short] (a short window) one
 * line [ComposerShortRowHeight] tall, label · detail. A tap on the words is [onTap] (the reply: to the message it
 * answers; a note or a card: the field), named [tapLabel]; nothing in a row takes the field's focus away.
 */
@Composable
fun ComposerRow(
    label: String,
    detail: String?,
    closeLabel: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    short: Boolean = false,
    onTap: (() -> Unit)? = null,
    tapLabel: String? = null,
    /** At the words' start, before them (a reply's sticker, picture or card cover): [ComposerMediaSize] square. */
    media: (@Composable () -> Unit)? = null,
    lead: @Composable () -> Unit,
) {
    val height = if (short) ComposerShortRowHeight else ComposerRowHeight
    Row(
        modifier.fillMaxWidth().height(height).padding(end = ComposerSendWidth / 2 - ComposerCloseSize / 2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(ComposerLeadColumn).fillMaxHeight(), contentAlignment = Alignment.Center) { lead() }
        Row(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .then(if (onTap == null) Modifier else Modifier.clickable(interactionSource = null, indication = null, role = Role.Button, onClickLabel = tapLabel, onClick = onTap)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (media != null) {
                Box(Modifier.size(if (short) ComposerShortMediaSize else ComposerMediaSize), contentAlignment = Alignment.Center) { media() }
                Spacer(Modifier.width(ComposerMediaGap))
            }
            val labelStyle = AppFonts.body(if (short) 12.5f else 12f, 600, lineHeight = 1.35f, color = Tokens.Text)
            val detailStyle = AppFonts.body(12.5f, lineHeight = 1.35f, color = Tokens.TextMuted)
            if (short) {
                // One line: label · detail.
                val line = androidx.compose.ui.text.buildAnnotatedString {
                    pushStyle(labelStyle.toSpanStyle()); append(label); pop()
                    if (!detail.isNullOrEmpty()) {
                        pushStyle(detailStyle.toSpanStyle()); append(" · "); append(detail); pop()
                    }
                }
                BasicText(line, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, style = labelStyle)
            } else {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    BasicText(label, maxLines = 1, overflow = TextOverflow.Ellipsis, style = labelStyle)
                    if (!detail.isNullOrEmpty()) BasicText(detail, maxLines = 1, overflow = TextOverflow.Ellipsis, style = detailStyle)
                }
            }
        }
        Box(
            Modifier
                .width(ComposerCloseSize)
                .height(minOf(ComposerCloseSize, height))
                .clickable(interactionSource = null, indication = OrganicIndication(inset = 4.dp), role = Role.Button, onClickLabel = closeLabel, onClick = onClose)
                .semantics { contentDescription = closeLabel },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(IconName.Close, size = 16.dp, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value) }
    }
}

/**
 * Why the last message didn't go (the apps' riding line, round 23 §2): no ✕ — it goes with the next try — a small
 * terracotta mark in the lead column and [text] in 12.5 terracotta where the words start, at least
 * [ComposerErrorRowHeight] tall.
 */
@Composable
fun ComposerErrorRow(text: String, modifier: Modifier = Modifier) {
    val ink = Tokens.Terracotta
    Row(
        modifier.fillMaxWidth().heightIn(min = ComposerErrorRowHeight).padding(end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(ComposerLeadColumn), contentAlignment = Alignment.Center) {
            Box(
                Modifier.size(ComposerErrorMark).clearAndSetSemantics { }.drawWithCache {
                    val o = WobCircleShape(5.0).createOutline(size, layoutDirection, this)
                    onDrawBehind { drawOutline(o, ink) }
                },
            )
        }
        BasicText(text, Modifier.weight(1f).padding(vertical = 6.dp), style = AppFonts.body(12.5f, lineHeight = 1.3f, color = ink))
    }
}

/** The error row's mark: a small terracotta dot. */
private val ComposerErrorMark = 8.dp

/** A reply's media at the words' start (a sticker's pose, a picture, a card's cover); in a short window, smaller. */
val ComposerMediaSize = 36.dp
val ComposerShortMediaSize = 28.dp
private val ComposerMediaGap = 8.dp

/**
 * A row's sideways strip fading at its start and end where more of it lies beyond ([start] / [end], read while drawing):
 * [edgeFades] laid on its side. Put it outside the scroller, so the mask stays on its viewport.
 */
fun Modifier.sideFades(start: () -> Boolean, end: () -> Boolean, edge: Dp = EdgeFade): Modifier =
    graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }.drawWithContent {
        drawContent()
        val before = start()
        val after = end()
        if (!before && !after) return@drawWithContent
        val t = kotlin.math.min(edge.toPx(), size.width / 3) / size.width
        drawRect(
            Brush.horizontalGradient(
                0f to if (before) Color.Transparent else Color.Black,
                t to Color.Black,
                1f - t to Color.Black,
                1f to if (after) Color.Transparent else Color.Black,
            ),
            blendMode = BlendMode.DstIn,
        )
    }

/** A riding row's ✕: the bare icon button's hit box. */
val ComposerCloseSize = 44.dp

/** A riding row's mark when it is a tile (a note's glyph, a card's cover): 32 square, 8 clear each side in the lead column. */
val ComposerLeadSize = 32.dp

/** The rounding of a riding row's thumbnail and tile (the attachment chips' 12 / 14). */
val ComposerLeadShape = RoundedCornerShape(topStart = 12.dp, topEnd = 14.dp, bottomEnd = 12.dp, bottomStart = 14.dp)

/** The tonal tile's face: the light terracotta at 0.4 laid on the cream, opaque (the chips' old face). */
val ComposerTileFace: Color @Composable @ReadOnlyComposable get() = Tokens.TerracottaLight.copy(alpha = 0.4f).compositeOver(Tokens.Cream)

/**
 * A riding row's mark as a [ComposerLeadSize] tile: [icon] (16) on the tonal face, and over it [content] (a cover),
 * clipped to the same rounding, once there is one.
 */
@Composable
fun ComposerTile(icon: IconName?, modifier: Modifier = Modifier, content: (@Composable BoxScope.() -> Unit)? = null) {
    Box(modifier.size(ComposerLeadSize).clip(ComposerLeadShape).background(ComposerTileFace), contentAlignment = Alignment.Center) {
        icon?.let { OrganicIcon(it, size = 16.dp, color = Tokens.Text) }
        content?.invoke(this)
    }
}
