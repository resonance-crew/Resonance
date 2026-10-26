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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens

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
fun composerPen(focused: Boolean): Color = if (focused) Tokens.FieldBorderHover else Tokens.FieldBorder

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
    leading: @Composable () -> Unit,
    field: @Composable BoxScope.(vertical: Dp) -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val haptic = LocalHapticFeedback.current
    val face by animateColorAsState(if (canSend) Mixes.ButtonFill else Mixes.ButtonTonal, tween(SEND_FADE_MILLIS), label = "sendFace")
    val plane by animateColorAsState(if (canSend) Tokens.Cream else Mixes.ButtonOnTonal, tween(SEND_FADE_MILLIS), label = "sendPlane")
    val shape = remember(seed) { WobRectShape(Tokens.RadiusMd.toDouble(), seed) }
    val vertical = composerPadding(lineHeightOf(textStyle))
    Box(
        modifier
            .fillMaxWidth()
            .drawWithCache {
                val o = shape.createOutline(size, layoutDirection, this)
                val outline = (o as? Outline.Generic)?.path ?: Path().apply { addOutline(o) }
                val w = size.width / density
                val h = size.height / density
                val pad = 12.0
                val seam = boundaryPoints((w - ComposerSendWidth.value).toDouble(), h.toDouble(), seed + 11, 1.6, pad)
                val region = Path().apply {
                    op(SegmentedLayout.regionPath(1, 2, listOf(seam), w, h, pad.toFloat(), density), outline, PathOperation.Intersect)
                }
                val seamPath = polylinePath(seam, density)
                val grain = Grain.brush(GrainMode.Tile, "grain-button", size, density, 0.38f)
                val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawBehind {
                    drawOutline(o, Tokens.Cream)
                    drawPath(region, face)
                    if (pressed && canSend) drawPath(region, OrganicIndication.OnFill)
                    grain?.let { drawPath(region, it, alpha = 0.38f) }
                    clipPath(outline) { drawPath(seamPath, Tokens.Cream, style = pen) }
                    drawOutline(o, composerPen(focused()), style = pen)
                }
            },
    ) {
        Row(Modifier.fillMaxWidth().heightIn(min = ComposerHeight).padding(end = ComposerSendWidth), verticalAlignment = Alignment.Bottom) {
            Box(Modifier.width(ComposerHeight).height(ComposerHeight), contentAlignment = Alignment.Center) { leading() }
            Box(Modifier.weight(1f).padding(end = 10.dp)) { field(vertical) }
        }
        Box(Modifier.matchParentSize()) {
            Box(
                Modifier
                    .align(Alignment.CenterEnd)
                    .width(ComposerSendWidth)
                    .fillMaxHeight()
                    .clickable(source, indication = null, enabled = canSend, role = Role.Button, onClickLabel = sendLabel) {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSend()
                    }
                    .semantics { contentDescription = sendLabel },
                contentAlignment = Alignment.BottomCenter,
            ) {
                // The plane on the last line's row, level with ＋, however many lines the field has.
                Box(Modifier.fillMaxWidth().height(ComposerHeight), contentAlignment = Alignment.Center) {
                    OrganicIcon(IconName.Send, size = 20.dp, color = plane)
                }
            }
        }
    }
}

/** How long Send takes to turn from its resting face to the verb's. */
private const val SEND_FADE_MILLIS = 140

/**
 * A notice floating in the composer's place (round 9 §4): opaque cream, its pen INK_LIGHT in the
 * muted ink, the field's wobble at radius 14. No halo, shadow or alpha: the foot's paper is behind it
 * ([ComposerBacking]), as behind the capsule (round 10 §3.1).
 */
fun Modifier.floatingSlip(seed: Double = 29.0, radius: Double = 14.0, pen: Color = Tokens.TextMuted): Modifier = drawWithCacheOf(FloatingSlip(seed, radius, pen))

/**
 * [floatingSlip]'s drawing, as a value ([drawWithCacheOf]): recomposed with equal inputs it is an equal modifier,
 * which keeps what it cached (outline, paths, grain) instead of building it again at the next draw.
 */
private data class FloatingSlip(val seed: Double, val radius: Double, val pen: Color) : (CacheDrawScope) -> DrawResult {
    override fun invoke(scope: CacheDrawScope): DrawResult = with(scope) {
        val o = WobRectShape(radius, seed).createOutline(size, layoutDirection, this)
        val line = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        onDrawBehind {
            drawOutline(o, Tokens.Cream)
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
        Box(Modifier.fillMaxWidth().height(ComposerFade).background(remember { Brush.verticalGradient(listOf(Tokens.Cream.copy(alpha = 0f), Tokens.Cream)) }))
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
    lead: @Composable () -> Unit,
) {
    Row(
        modifier.fillMaxWidth().heightIn(min = ComposerRowHeight).padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        lead()
        Column(Modifier.weight(1f).padding(start = 10.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            BasicText(label, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12f, 600, lineHeight = 1.35f, color = Tokens.Text))
            if (!detail.isNullOrEmpty()) BasicText(detail, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12.5f, lineHeight = 1.35f, color = Tokens.TextMuted))
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
val ComposerTileFace = Tokens.TerracottaLight.copy(alpha = 0.4f).compositeOver(Tokens.Cream)

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
