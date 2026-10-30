package com.resonance.design

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.Spacer
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.WobCircleOptions

/**
 * One path of a hand-drawn icon: its commands (see generated/Icons.kt),
 * whether it is filled with the icon's color instead of stroked, and its pen
 * width relative to the icon's.
 */
/** `evenOdd`: a filled path whose inner rings are holes (a selected tab's solid twin, its details knocked out). */
class IconStroke(val filled: Boolean, val evenOdd: Boolean = false, val width: Float, val commands: FloatArray) {
    fun path(scale: Float): Path {
        val p = Path()
        if (evenOdd) p.fillType = PathFillType.EvenOdd
        val c = commands
        var i = 0
        while (i < c.size) {
            when (c[i].toInt()) {
                0 -> { p.moveTo(c[i + 1] * scale, c[i + 2] * scale); i += 3 }
                1 -> { p.lineTo(c[i + 1] * scale, c[i + 2] * scale); i += 3 }
                2 -> { p.cubicTo(c[i + 1] * scale, c[i + 2] * scale, c[i + 3] * scale, c[i + 4] * scale, c[i + 5] * scale, c[i + 6] * scale); i += 7 }
                else -> { p.close(); i += 1 }
            }
        }
        return p
    }
}

/** A glyph in its own square box; `fillable` ones take an interior fill (the bookmark). */
class IconGlyph(val viewBox: Float, val fillable: Boolean, val strokes: List<IconStroke>)

/**
 * The web's `<Icon>`: one of its hand-drawn glyphs, generated from
 * src/components/atoms/Icon so both stay the same drawing. `strokeWidth` is
 * in the glyph's own 24-unit box, like the web's prop (default INK_STRONG).
 */
@Composable
fun OrganicIcon(
    name: IconName,
    modifier: Modifier = Modifier,
    size: Dp = 22.dp,
    color: Color = Tokens.Text,
    strokeWidth: Float = Tokens.InkStrong.value,
    fill: Color? = null,
    mirrored: Boolean = false,
    /** Degrees clockwise (the chevron pointing right is chevron-down turned -90). */
    rotation: Float = 0f,
) = OrganicIcon(name.glyph, modifier, size, color, strokeWidth, fill, mirrored, rotation)

/** [OrganicIcon] for a glyph of the apps' own ([ComposerGlyphs]), drawn the same way. */
@Composable
fun OrganicIcon(
    glyph: IconGlyph,
    modifier: Modifier = Modifier,
    size: Dp = 22.dp,
    color: Color = Tokens.Text,
    strokeWidth: Float = Tokens.InkStrong.value,
    fill: Color? = null,
    mirrored: Boolean = false,
    rotation: Float = 0f,
) {
    Box(
        modifier
            .size(size)
            .clearAndSetSemantics { }
            .drawWithCache {
                val scale = this.size.width / glyph.viewBox
                val paths = glyph.strokes.map { it.path(scale) }
                val pen = strokeWidth * scale
                onDrawBehind {
                    rotate(rotation) { scale(if (mirrored) -1f else 1f, 1f) {
                        glyph.strokes.forEachIndexed { i, s ->
                            if (s.filled) {
                                drawPath(paths[i], color)
                            } else {
                                if (glyph.fillable && fill != null) drawPath(paths[i], fill)
                                drawPath(paths[i], color, style = Stroke(pen * s.width, cap = StrokeCap.Round, join = StrokeJoin.Round))
                            }
                        }
                    } }
                }
            },
    )
}

/**
 * A hand-drawn radio: a wobbly ring, and an inked dot when chosen. The web
 * has no radio (it uses its organic select), so this pairs the ring of
 * `OrganicIconButton` with the knob of the organic toggle.
 */
@Composable
fun OrganicRadio(selected: Boolean, seed: Double = 21.0, modifier: Modifier = Modifier) {
    val dot by animateFloatAsState(if (selected) 1f else 0f, spring(dampingRatio = 0.7f, stiffness = 600f), label = "radio")
    val ring = if (selected) Tokens.TerracottaDeep else Tokens.ToggleOffStroke
    val inked = Tokens.Terracotta
    // Canvas's own Spacer + drawBehind, with the ring's outline built when the size changes, not on every draw.
    Spacer(modifier.size(22.dp).clearAndSetSemantics { }.drawWithCache {
        val ringOutline = WobCircleShape(seed, WobCircleOptions(segments = 7, mag = 0.7, cpJitter = 0.4))
            .createOutline(size, layoutDirection, this)
        val ringPen = Stroke(Tokens.Ink.toPx())
        onDrawBehind {
            drawOutline(ringOutline, ring, style = ringPen)
            if (dot > 0.01f) {
                val inset = 5.5.dp.toPx()
                val d = (size.width - inset * 2) * (0.2f + 0.8f * dot)
                val o = WobCircleShape(seed + 5, WobCircleOptions(segments = 6, mag = 0.5, cpJitter = 0.3))
                    .createOutline(androidx.compose.ui.geometry.Size(d, d), layoutDirection, this)
                val off = (size.width - d) / 2
                drawContext.transform.translate(off, off)
                drawOutline(o, inked, alpha = dot)
                drawContext.transform.translate(-off, -off)
            }
        }
    })
}

/**
 * The composer's own glyphs (round 22) that the web's registry has no twin of yet: the keyboard (☺ turned
 * ⌨), ⤢ and ⤡ (the field grown and back), and the clock of the sticker panel's recents. Drawn in the
 * registry's hand — a 24 box, wobbly cubic strokes at the icon's pen.
 */
object ComposerGlyphs {
    private fun stroke(vararg c: Float) = IconStroke(filled = false, width = 1f, commands = c)

    /** ⌨: the keyboard's outline, two rows of keys and the space bar. */
    val Keyboard = IconGlyph(24f, fillable = false, strokes = listOf(
        stroke(0f, 4.6f, 6.4f, 2f, 9.5f, 6.1f, 14.6f, 6.2f, 19.5f, 6.5f, 2f, 20.6f, 6.6f, 21.1f, 7.3f, 21.1f, 8.4f, 2f, 21.2f, 11f, 21.1f, 13.6f, 20.9f, 16.2f,
            2f, 20.8f, 17.2f, 20.2f, 17.7f, 19.2f, 17.7f, 2f, 14.2f, 17.9f, 9.3f, 17.9f, 4.5f, 17.6f, 2f, 3.5f, 17.5f, 2.9f, 16.9f, 2.9f, 15.9f,
            2f, 2.8f, 13.3f, 2.9f, 10.6f, 3.1f, 8.1f, 2f, 3.2f, 7f, 3.7f, 6.4f, 4.6f, 6.4f, 3f),
        stroke(0f, 6.5f, 9.9f, 1f, 6.6f, 10f),
        stroke(0f, 10.2f, 9.8f, 1f, 10.3f, 9.9f),
        stroke(0f, 13.8f, 9.9f, 1f, 13.9f, 10f),
        stroke(0f, 17.4f, 9.8f, 1f, 17.5f, 9.9f),
        stroke(0f, 8.4f, 14.3f, 2f, 10.8f, 14.1f, 13.3f, 14.2f, 15.7f, 14.4f),
    ))

    /** ⤢: two arrows pointing out to the top end and the bottom start corners. */
    val Expand = IconGlyph(24f, fillable = false, strokes = listOf(
        stroke(0f, 14.3f, 4.2f, 2f, 16.2f, 4f, 18.1f, 4.1f, 19.9f, 4.1f, 2f, 20f, 5.9f, 19.9f, 7.8f, 19.8f, 9.7f),
        stroke(0f, 19.6f, 4.4f, 2f, 17.4f, 6.5f, 15.4f, 8.6f, 13.4f, 10.6f),
        stroke(0f, 9.7f, 19.8f, 2f, 7.8f, 20f, 5.9f, 19.9f, 4.1f, 19.9f, 2f, 4f, 18.1f, 4.1f, 16.2f, 4.2f, 14.3f),
        stroke(0f, 4.4f, 19.6f, 2f, 6.5f, 17.5f, 8.5f, 15.5f, 10.6f, 13.4f),
    ))

    /** ⤡: the same two arrows pointing back in. */
    val Collapse = IconGlyph(24f, fillable = false, strokes = listOf(
        stroke(0f, 14.1f, 4.8f, 2f, 14f, 6.6f, 14.1f, 8.3f, 14.2f, 9.9f, 2f, 15.9f, 9.9f, 17.6f, 9.8f, 19.3f, 9.9f),
        stroke(0f, 14.5f, 9.5f, 2f, 16.4f, 7.6f, 18.2f, 5.8f, 20f, 4f),
        stroke(0f, 9.9f, 19.2f, 2f, 10f, 17.5f, 9.9f, 15.8f, 9.8f, 14.1f, 2f, 8.1f, 14f, 6.4f, 14.1f, 4.7f, 14.2f),
        stroke(0f, 9.5f, 14.5f, 2f, 7.6f, 16.4f, 5.8f, 18.2f, 4f, 20f),
    ))

    /** 🕘: a clock, its two hands. */
    val Clock = IconGlyph(24f, fillable = false, strokes = listOf(
        stroke(0f, 12.2f, 3.6f, 2f, 16.9f, 3.5f, 20.6f, 7.2f, 20.5f, 12f, 2f, 20.6f, 16.8f, 16.8f, 20.5f, 12f, 20.5f, 2f, 7.2f, 20.6f, 3.4f, 16.7f, 3.5f, 11.9f,
            2f, 3.5f, 7.3f, 7.3f, 3.7f, 12.2f, 3.6f, 3f),
        stroke(0f, 12f, 7.4f, 2f, 12.1f, 8.9f, 12f, 10.5f, 12f, 12.1f, 2f, 13.2f, 12.9f, 14.4f, 13.7f, 15.6f, 14.5f),
    ))
}
