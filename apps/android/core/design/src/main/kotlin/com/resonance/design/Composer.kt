package com.resonance.design

import androidx.compose.animation.animateColorAsState
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
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
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
 * With rows riding over the capsule, the foot starts this far over the topmost one (round 11 §3):
 * a row's first ink (the reply's rule, a thumbnail, the label) starts about 6 into it, so the
 * [ComposerFade] that starts here ends where that ink starts — the paper solid behind every row.
 */
val ComposerRowsLead = 6.dp

/** A row riding with the message over the capsule ([ComposerRow]): its least height. */
val ComposerRowHeight = 52.dp

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
     * The field past one line, or grown to the thread (round 22 §4.3, the owner's notes 2): the segment a 52 × 48
     * block on the last row, its top start corner rounded.
     */
    block: Boolean = false,
    /** What stands in the block's column at the capsule's top end — the column the full-height strip filled (⤢ / ⤡). */
    overSegment: (@Composable () -> Unit)? = null,
    /** A 48 square at the field's end, before Send, on the last line's row — [leading]'s twin (the composer's ☺ / ⌨). */
    trailing: (@Composable () -> Unit)? = null,
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
    leading = leading,
    segment = { ink ->
        when (segment) {
            ComposerSegment.Send -> OrganicIcon(IconName.Send, size = 20.dp, color = ink)
            ComposerSegment.Expand -> OrganicIcon(IconName.ArrowUp, size = 20.dp, color = ink)
            ComposerSegment.Collapse -> OrganicIcon(IconName.ChevronDown, size = 20.dp, color = ink)
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
    /** Drawn in the block's column at the capsule's top ([block]): the composer's ⤢ / ⤡. */
    overSegment: (@Composable () -> Unit)? = null,
    /** A square as big as [leading]'s at the field's end, on the last line's row (round 22, the owner's: every tool in the capsule one size). */
    trailing: (@Composable () -> Unit)? = null,
    leading: (@Composable () -> Unit)? = null,
    segment: @Composable (ink: Color) -> Unit,
    field: @Composable BoxScope.(vertical: Dp) -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val haptic = LocalHapticFeedback.current
    val face by animateColorAsState(if (ready) Tokens.ButtonFill else Tokens.ButtonTonal, tween(SEND_FADE_MILLIS), label = "segmentFace")
    val ink by animateColorAsState(if (ready) Tokens.Cream else Tokens.ButtonOnTonal, tween(SEND_FADE_MILLIS), label = "segmentInk")
    val shape = remember(seed) { WobRectShape(Tokens.RadiusMd.toDouble(), seed) }
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
        Row(Modifier.fillMaxWidth().heightIn(min = ComposerHeight).padding(end = segmentWidth), verticalAlignment = Alignment.Bottom) {
            if (leading != null) Box(Modifier.width(ComposerHeight).height(ComposerHeight), contentAlignment = Alignment.Center) { leading() }
            Box(Modifier.weight(1f).padding(start = if (leading != null) 0.dp else Tokens.FieldPadX.dp, end = if (trailing != null) 0.dp else 10.dp)) { field(vertical) }
            if (trailing != null) Box(Modifier.width(ComposerHeight).height(ComposerHeight), contentAlignment = Alignment.Center) { trailing() }
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
            if (block && overSegment != null) {
                // In the send column at the capsule's top (the owner: where a finger finds it, and it reads as "the whole
                // screen"): a square as wide as the block and as tall, inset from the top as the block is from the foot —
                // its glyph as far from the top pen line as Send's from the bottom one.
                Box(
                    Modifier.align(Alignment.TopEnd).width(segmentWidth).height(ComposerHeight),
                    contentAlignment = Alignment.Center,
                ) { overSegment() }
            }
        }
    }
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
 * grey at INK — no grain, no shadow. The sticker preview stands on one (round 22 §4.1).
 */
@Composable
fun Modifier.paperSheet(seed: Double = 31.0, radius: Double = MenuSheet.RADIUS): Modifier {
    val palette = LocalResonanceColors.current
    return drawWithCacheOf(FloatingSlip(seed, radius, palette.FieldBorderHover, palette.MenuPaper, Tokens.Ink.value))
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
private data class FloatingSlip(val seed: Double, val radius: Double, val pen: Color, val paper: Color, val width: Float) : (CacheDrawScope) -> DrawResult {
    override fun invoke(scope: CacheDrawScope): DrawResult = with(scope) {
        val o = WobRectShape(radius, seed).createOutline(size, layoutDirection, this)
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
 * on the top edge of what the foot shows first. Laid behind the foot at its size: with nothing
 * riding, the fade covers the capsule's top 12 (solid from there down); with rows riding the foot
 * starts [ComposerRowsLead] over them, so the fade ends where their ink starts. The solid paper takes
 * every touch, so nothing under it can be tapped or dragged — a tap on it ([onTap]) is a tap on the
 * thread's blank (the keyboard goes away); the fade lets touches through to the thread. Not read by
 * TalkBack.
 */
@Composable
fun ComposerBacking(modifier: Modifier = Modifier, onTap: () -> Unit = {}) {
    val tap by rememberUpdatedState(onTap)
    Column(modifier.clearAndSetSemantics { }) {
        val paper = Tokens.Cream
        Box(Modifier.fillMaxWidth().height(ComposerFade).background(remember(paper) { Brush.verticalGradient(listOf(paper.copy(alpha = 0f), paper)) }))
        Box(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(Tokens.Cream)
                .pointerInput(Unit) {
                    // Every touch is the paper's (nothing under it is pressed); one that stays a tap is the blank's.
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
                },
        )
    }
}

/**
 * One thing riding with the message over the capsule (round 10 §3.4), in the reply's style: its
 * [lead] (the reply's rule, a 40 thumbnail, a glyph on a tonal tile), 10, its [label] (12 / 600) over
 * one line of [detail] (12.5, muted — none: the label alone, centred), and a 44 ✕ at the row's end,
 * named [closeLabel]. No frame: it lies straight on the foot's paper in the capsule's column, its
 * content 12 from the capsule's start edge and the ✕ over Send. Rows riding together touch.
 */
@Composable
fun ComposerRow(
    label: String,
    detail: String?,
    closeLabel: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    /** Drawn in [detail]'s place, under the label (a replied sticker's key pose: no words). */
    detailContent: (@Composable () -> Unit)? = null,
    lead: @Composable () -> Unit,
) {
    Row(
        modifier.fillMaxWidth().heightIn(min = ComposerRowHeight).padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        lead()
        Column(Modifier.weight(1f).padding(start = 10.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            BasicText(label, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12f, 600, lineHeight = 1.35f, color = Tokens.Text))
            if (detailContent != null) detailContent()
            else if (!detail.isNullOrEmpty()) BasicText(detail, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12.5f, lineHeight = 1.35f, color = Tokens.TextMuted))
        }
        Box(
            Modifier
                .size(ComposerCloseSize)
                .clickable(interactionSource = null, indication = OrganicIndication(inset = 4.dp), role = Role.Button, onClickLabel = closeLabel, onClick = onClose)
                .semantics { contentDescription = closeLabel },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(IconName.Close, size = 16.dp, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value) }
    }
}

/** A riding row's ✕: the bare icon button's hit box. */
val ComposerCloseSize = 44.dp

/** A riding row's lead when it is a picture or a tile: 40 square. */
val ComposerLeadSize = 40.dp

/** The rounding of a riding row's thumbnail and tile (the attachment chips' 12 / 14). */
val ComposerLeadShape = RoundedCornerShape(topStart = 12.dp, topEnd = 14.dp, bottomEnd = 12.dp, bottomStart = 14.dp)

/** The tonal tile's face: the light terracotta at 0.4 laid on the cream, opaque (the chips' old face). */
val ComposerTileFace: Color @Composable @ReadOnlyComposable get() = Tokens.TerracottaLight.copy(alpha = 0.4f).compositeOver(Tokens.Cream)

/**
 * A riding row's lead as a 40 tile: [icon] (18) on the tonal face, and over it [content] (a cover,
 * a picture), clipped to the same rounding, once there is one.
 */
@Composable
fun ComposerTile(icon: IconName?, modifier: Modifier = Modifier, content: (@Composable BoxScope.() -> Unit)? = null) {
    Box(modifier.size(ComposerLeadSize).clip(ComposerLeadShape).background(ComposerTileFace), contentAlignment = Alignment.Center) {
        icon?.let { OrganicIcon(it, size = 18.dp, color = Tokens.Text) }
        content?.invoke(this)
    }
}
