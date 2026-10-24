package com.resonance.design

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
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

/** The paper halo round a floating object's pen line, so it reads as cut-out paper over any bubble. */
val FloatHalo = 4.dp

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
 * cream with its pen at INK, terracotta while it has the focus ([focused], read while drawing), drawn
 * with a [FloatHalo] of the page's paper under the pen so it stands clear of whatever bubble it lies
 * over — no shadow, no alpha; inside a [floatingGroup] with its slip. In it: [leading] (the ＋ ghost button, a 48 square at its start),
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
                val halo = Stroke((Tokens.Ink + FloatHalo * 2).toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawBehind {
                    // Under whatever floats beside it in its group ([floatingGroup]): never over the slip's pen.
                    drawOutline(o, Tokens.Cream, style = halo, blendMode = BlendMode.DstOver)
                    drawOutline(o, Tokens.Cream)
                    drawPath(region, face)
                    if (pressed && canSend) drawPath(region, OrganicIndication.OnFill)
                    grain?.let { drawPath(region, it, alpha = 0.38f) }
                    clipPath(outline) { drawPath(seamPath, Tokens.Cream, style = pen) }
                    drawOutline(o, if (focused()) Tokens.Terracotta else Tokens.FieldBorder, style = pen)
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
 * A secondary surface floating over the thread (round 9 §4): what rides with the message above the
 * capsule (the reply quote, the attached chips), or a notice in the composer's place — opaque
 * cream, its pen INK_LIGHT in the muted ink, the field's wobble at radius 14, and the same paper
 * [FloatHalo] as the capsule. No shadow, no alpha. Drawn inside a [floatingGroup].
 */
fun Modifier.floatingSlip(seed: Double = 29.0, radius: Double = 14.0, pen: Color = Tokens.TextMuted): Modifier = drawWithCache {
    val o = WobRectShape(radius, seed).createOutline(size, layoutDirection, this)
    val halo = Stroke((Tokens.InkLight + FloatHalo * 2).toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
    val line = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
    onDrawBehind {
        drawOutline(o, Tokens.Cream, style = halo, blendMode = BlendMode.DstOver)
        drawOutline(o, Tokens.Cream)
        drawOutline(o, pen, style = line)
    }
}

/**
 * The floating objects drawn together (the slip over the capsule, or a notice alone): one layer of
 * their own, reaching [FloatHaloReach] past its edges, in which each one's paper halo goes under the
 * others' pen lines (they draw it beneath what is already there) — so two halos 6 apart never cut
 * into each other's edge, while the layer still lays paper over the bubbles behind it. Its size and
 * place are what it wraps.
 */
fun Modifier.floatingGroup(): Modifier = this
    .layout { measurable, constraints ->
        val r = FloatHaloReach.roundToPx()
        val wider = constraints.copy(
            minWidth = constraints.minWidth + 2 * r,
            maxWidth = if (constraints.hasBoundedWidth) constraints.maxWidth + 2 * r else constraints.maxWidth,
            minHeight = constraints.minHeight + 2 * r,
            maxHeight = if (constraints.hasBoundedHeight) constraints.maxHeight + 2 * r else constraints.maxHeight,
        )
        val placeable = measurable.measure(wider)
        layout((placeable.width - 2 * r).coerceAtLeast(0), (placeable.height - 2 * r).coerceAtLeast(0)) { placeable.place(-r, -r) }
    }
    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .padding(FloatHaloReach)

/** How far a floating group's layer reaches past it: the halo, the pen and the shapes' wobble. */
private val FloatHaloReach = FloatHalo + 4.dp
