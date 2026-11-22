package com.resonance.design

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The avatar's own outline at [size] (HandDrawnAvatar's): a lopsided rounded square, one turn a side, its corners
 * jittered and shifted.
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
 * the first in front; the faces given and nothing after them — no blank disc, no number, no "+" (round 29 §S5, the
 * owner: 「不要把當有第四、第五個的時候顯示成灰色」: who else there is, the list says). Each face is its own drawing — its fill,
 * its initials or picture, its pen outline — with nothing under it (the owner, round 26: the paper pad each face sat on
 * read as a white frame outside the border, and made the overlap look bigger): the front face's fill covers the one
 * behind, and its own pen line is what parts them. No stroke ring, no shadow.
 *
 * A face that comes slides in where it belongs and one that goes slides out, over [AvatarGroup.MOVE_MILLIS] (none
 * under [reducedMotion]); the others move along. What a screen reader says is the caller's: the group itself is
 * silent.
 */
@Composable
fun AvatarGroup(
    faces: List<GroupFace>,
    modifier: Modifier = Modifier,
    size: Dp = 28.dp,
    reducedMotion: Boolean = false,
) {
    val step = AvatarGroup.step(size)
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
    val width by animateDpAsState(AvatarGroup.width(faces.size, size), spec, label = "faces")
    Box(modifier.width(width).height(size).clearAndSetSemantics { }) {
        // Back to front: the faces from the last to the first.
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
                ) { GroupFaceAvatar(face, size) }
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
                ) { GroupFaceAvatar(face, size) }
            }
        }
    }
}

object AvatarGroup {
    /** How far each face steps in over the one before it, as a share of its size (the web's 0.34). */
    const val OVERLAP = 0.34f

    /** A face coming or going. */
    const val MOVE_MILLIS = 150

    /** From one face's start to the next one's. */
    fun step(size: Dp): Dp = size * (1f - OVERLAP)

    /** The group's width for [faces] faces: the last face whole, every other one a [step]; none for none. */
    fun width(faces: Int, size: Dp): Dp = if (faces <= 0) 0.dp else step(size) * (faces - 1) + size
}

/** A face of the group: [HandDrawnAvatar] as everywhere else, nothing under it. */
@Composable
private fun GroupFaceAvatar(face: GroupFace, size: Dp) {
    HandDrawnAvatar(face.initials, face.imageUrl, face.color, size = size, seed = face.seed)
}
