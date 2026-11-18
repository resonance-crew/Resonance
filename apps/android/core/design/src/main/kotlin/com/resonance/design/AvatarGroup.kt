package com.resonance.design

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The avatar's own outline at [size] (HandDrawnAvatar's): a lopsided rounded square, one turn a side, its corners
 * jittered and shifted. The faces' pads and the blank disc of an [AvatarGroup] wear it too, so nothing round cuts an
 * avatar's corners (round 26 §U2, M3).
 */
fun avatarShape(size: Dp, seed: Double): Shape {
    val s = size.value.toDouble()
    return WobRectShape(
        s * 0.4, seed, mag = s * 0.022,
        options = WobRectOptions(curve = 1.3, cornerJitter = 3.2, cornerOffset = s * 0.06, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0)),
    )
}

/** One face of an [AvatarGroup]: who it is ([key], kept as the faces move), and what [HandDrawnAvatar] draws. */
data class GroupFace(val key: String, val initials: String, val imageUrl: String?, val color: Color, val seed: Double)

/**
 * The web's AvatarGroup (round 26 §U2): faces overlapping, each stepping in by [AvatarGroup.OVERLAP] of its [size],
 * the first in front; at most the faces given, then — when there are [more] — a blank paper disc (the avatar's own
 * shape on `--color-cream-dark` in the faces' pen: who, never how many). Under each face (and the disc) a pad of the
 * same shape grown by [AvatarGroup.PAD] × 2, filled with the [paper] it sits on — so a face reads apart from the one
 * behind it with no stroke ring and no shadow.
 *
 * A face that comes slides in where it belongs and one that goes slides out, over [AvatarGroup.MOVE_MILLIS] (none
 * under [reducedMotion]); the others move along. What a screen reader says is the caller's: the group itself is
 * silent.
 */
@Composable
fun AvatarGroup(
    faces: List<GroupFace>,
    more: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 28.dp,
    paper: Color = Tokens.Cream,
    reducedMotion: Boolean = false,
) {
    val step = AvatarGroup.step(size)
    val pad = AvatarGroup.PAD
    val spec = if (reducedMotion) snap<Dp>() else tween(AvatarGroup.MOVE_MILLIS)
    // Faces just gone, still sliding out (their last place kept).
    var leaving by remember { mutableStateOf<List<Pair<GroupFace, Int>>>(emptyList()) }
    var before by remember { mutableStateOf(faces) }
    // The first faces drawn arrive where they are; only later changes move.
    var settled by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { settled = true }
    LaunchedEffect(faces) {
        val gone = before.withIndex().filter { (_, f) -> faces.none { it.key == f.key } }.map { it.value to it.index }
        before = faces
        if (gone.isEmpty() || reducedMotion) return@LaunchedEffect
        leaving = leaving + gone
        delay(AvatarGroup.MOVE_MILLIS.toLong())
        leaving = leaving.filter { (f, _) -> gone.none { it.first.key == f.key } }
    }
    val slots = faces.size + if (more) 1 else 0
    val width by animateDpAsState(AvatarGroup.width(slots, size), spec, label = "faces")
    Box(modifier.width(width).height(size + pad * 2).clearAndSetSemantics { }) {
        // Back to front: the disc behind every face, then the faces from the last to the first.
        if (more) {
            val x by animateDpAsState(step * faces.size, spec, label = "disc")
            Box(Modifier.offset(x = x)) { BlankAvatar(size, paper) }
        }
        for (i in faces.indices.reversed()) {
            val face = faces[i]
            key(face.key) {
                val x by animateDpAsState(step * i, spec, label = "face")
                val arriving = remember { Animatable(if (settled && !reducedMotion) 0f else 1f) }
                LaunchedEffect(Unit) { if (arriving.value < 1f) arriving.animateTo(1f, tween(AvatarGroup.MOVE_MILLIS)) }
                Box(
                    Modifier
                        .offset(x = x)
                        .graphicsLayer {
                            alpha = arriving.value
                            translationX = -step.toPx() * 0.5f * (1f - arriving.value)
                            compositingStrategy = CompositingStrategy.ModulateAlpha
                        },
                ) { PaddedFace(face, size, paper) }
            }
        }
        for ((face, at) in leaving) {
            key("leaving:" + face.key) {
                val going = remember { Animatable(1f) }
                LaunchedEffect(Unit) { launch { going.animateTo(0f, tween(AvatarGroup.MOVE_MILLIS)) } }
                Box(
                    Modifier
                        .offset(x = step * at)
                        .graphicsLayer {
                            alpha = going.value
                            translationX = -step.toPx() * 0.5f * (1f - going.value)
                            compositingStrategy = CompositingStrategy.ModulateAlpha
                        },
                ) { PaddedFace(face, size, paper) }
            }
        }
    }
}

object AvatarGroup {
    /** How far each face steps in over the one before it, as a share of its size (the web's 0.34). */
    const val OVERLAP = 0.34f

    /** How far a face's pad reaches past it on every side. */
    val PAD = 3.dp

    /** A face coming or going. */
    const val MOVE_MILLIS = 150

    /** From one face's start to the next one's. */
    fun step(size: Dp): Dp = size * (1f - OVERLAP)

    /** The group's width for [slots] places (faces and the disc), pads included; none for none. */
    fun width(slots: Int, size: Dp): Dp = if (slots <= 0) 0.dp else step(size) * (slots - 1) + size + PAD * 2
}

/** A face on its pad: the avatar's shape grown by [AvatarGroup.PAD] on every side, in the paper under the group. */
@Composable
private fun PaddedFace(face: GroupFace, size: Dp, paper: Color) {
    AvatarPad(size, face.seed, paper) {
        HandDrawnAvatar(face.initials, face.imageUrl, face.color, size = size, seed = face.seed)
    }
}

/** [content] (an avatar [size] big) on its pad: the avatar's outline at [size] + 2 × [AvatarGroup.PAD], filled with [paper]. */
@Composable
fun AvatarPad(size: Dp, seed: Double, paper: Color, content: @Composable () -> Unit) {
    val outer = size + AvatarGroup.PAD * 2
    val shape = remember(outer, seed) { avatarShape(outer, seed) }
    Box(
        Modifier
            .size(outer)
            .drawWithCache {
                val o = shape.createOutline(this.size, layoutDirection, this)
                onDrawBehind { drawOutline(o, paper) }
            },
        contentAlignment = Alignment.Center,
    ) { content() }
}

/**
 * The blank disc after the faces when there are more (round 26 §U2): the avatar's shape, the paper's darker cream,
 * the faces' pen line — never a number. On its pad, as a face is.
 */
@Composable
fun BlankAvatar(size: Dp, paper: Color, seed: Double = BLANK_SEED) {
    val fill = Tokens.CreamDark
    val rim = Tokens.AvatarStroke
    AvatarPad(size, seed, paper) {
        val shape = remember(size, seed) { avatarShape(size, seed) }
        Box(
            Modifier
                .size(size)
                .drawWithCache {
                    val o = shape.createOutline(this.size, layoutDirection, this)
                    val ink = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round)
                    onDrawBehind {
                        drawOutline(o, fill)
                        drawOutline(o, rim, style = ink)
                    }
                },
        )
    }
}

private const val BLANK_SEED = 61.0
