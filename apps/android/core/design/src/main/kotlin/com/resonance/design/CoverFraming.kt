package com.resonance.design

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.ScaleFactor
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Where a cover is looked at (round 25 §G1) — the twin of src/lib/images/coverFrame.ts. The picture stays whole in
 * storage; the card keeps, inside its `media`, the point of the picture that sits at the centre of every frame it is
 * drawn in ([cx], [cy]: fractions of its width and height), how far it is zoomed ([zoom] 1…2, 1 = the picture just
 * covers the frame) and the picture's width ÷ height when it was framed ([ar] 0.2…5). No frame: the centre, zoom 1.
 */
@Immutable
data class CoverFraming(val cx: Double, val cy: Double, val zoom: Double, val ar: Double) {
    /** As a card's `media.frame` holds it (the drafts' writes). */
    fun toMap(): Map<String, Double> = mapOf("cx" to cx, "cy" to cy, "zoom" to zoom, "ar" to ar)

    /** Whether it is the centre at zoom 1 — what no frame draws, so nothing need be kept. */
    val isCentred: Boolean get() = zoom <= MIN_ZOOM + 1e-6 && kotlin.math.abs(cx - 0.5) < 1e-6 && kotlin.math.abs(cy - 0.5) < 1e-6

    companion object {
        const val MIN_ZOOM = 1.0
        const val MAX_ZOOM = 2.0
        const val MIN_AR = 0.2
        const val MAX_AR = 5.0

        /** The centre at zoom 1 (a cover without a frame). */
        val Centred = CoverFraming(0.5, 0.5, 1.0, 1.0)

        /** A frame the rules would take — the four numbers, each in its range — or null (the centre). */
        fun of(cx: Double?, cy: Double?, zoom: Double?, ar: Double?): CoverFraming? {
            if (cx == null || cy == null || zoom == null || ar == null) return null
            if (listOf(cx, cy, zoom, ar).any { !it.isFinite() }) return null
            if (cx !in 0.0..1.0 || cy !in 0.0..1.0 || zoom !in MIN_ZOOM..MAX_ZOOM || ar !in MIN_AR..MAX_AR) return null
            return CoverFraming(cx, cy, zoom, ar)
        }

        /** A stored `media.frame` (a Firestore map), or null for a missing or malformed one. */
        fun of(map: Map<*, *>?): CoverFraming? {
            if (map == null || map.keys.any { it !in KEYS }) return null
            fun n(k: String) = (map[k] as? Number)?.toDouble()
            return of(n("cx"), n("cy"), n("zoom"), n("ar"))
        }

        private val KEYS = setOf("cx", "cy", "zoom", "ar")
    }
}

/** A crop of the picture, in fractions of its width ([x], [w]) and height ([y], [h]). */
@Immutable
data class CoverCropRect(val x: Double, val y: Double, val w: Double, val h: Double)

/**
 * The part of a picture (its width ÷ height [ar]) shown in a box whose height ÷ width is [boxRatio] (the feed card's
 * 0.62, the card page's 0.52), for [frame] (null: the centre at zoom 1). At zoom 1 the crop is the largest of the
 * box's shape that fits in the picture; the zoom shrinks it about the frame's point; it is then moved, never shrunk,
 * to lie inside the picture. Pinned by native/fixtures/cover-frame.json with the web's and iOS's.
 */
fun coverCrop(ar: Double, frame: CoverFraming?, boxRatio: Double): CoverCropRect {
    val pic = if (ar.isFinite() && ar > 0) ar else 1.0
    val box = if (boxRatio.isFinite() && boxRatio > 0) 1 / boxRatio else 1.0
    val f = frame?.let { CoverFraming.of(it.cx, it.cy, it.zoom, it.ar) } ?: CoverFraming.Centred
    var w = if (pic > box) box / pic else 1.0
    var h = if (pic > box) 1.0 else pic / box
    w /= f.zoom
    h /= f.zoom
    val x = (f.cx - w / 2).coerceIn(0.0, max(0.0, 1 - w))
    val y = (f.cy - h / 2).coerceIn(0.0, max(0.0, 1 - h))
    return CoverCropRect(x, y, w, h)
}

/**
 * How far the box a cover is laid out in reaches past the box it is seen in, in pixels, on each side ([x] left and
 * right, [y] top and bottom): [OrganicImage]'s bleed (the wobbly clip's outward swing), a bubble's sides. Round 33
 * §Q4: the crop is the seen box's, and the bleed only carries the same picture on past its edges. [OrganicImage]
 * sets it as it measures (the bleed follows the box offered), before the picture inside is measured and drawn, so the
 * picture's [CoverFit] reads the bleed of the size it is given; a fixed bleed is set once.
 */
@Stable
class CoverInset(x: Float = 0f, y: Float = 0f) {
    var x: Float = x
        internal set
    var y: Float = y
        internal set

    internal fun set(x: Float, y: Float) {
        this.x = x
        this.y = y
    }
}

/** The [CoverInset] of the bled box a cover is drawn in ([OrganicImage]'s content and overlay); null outside one. */
val LocalCoverInset = staticCompositionLocalOf<CoverInset?> { null }

/**
 * A cover drawn on its frame: the picture scaled so the frame's crop ([coverCrop], from the picture's own size and the
 * box's) fills the box, and placed so the crop's corner is the box's — a [ContentScale] and an [Alignment] in one, for
 * an `AsyncImage` or an `Image`. With an [inset] the box is the one seen inside the box laid out (that less the inset on
 * every side): the crop is cut for the seen box and lies on it exactly, and the picture runs on into the inset — the
 * same picture, never a crop of the larger box (round 33 §Q4: the preview was the 調整封面 window's middle ~88 %).
 * Without a frame and without an inset it is `ContentScale.Crop` centred, as before.
 */
@Immutable
data class CoverFit(val frame: CoverFraming?, val inset: CoverInset? = null) : ContentScale, Alignment {
    /** The seen box's size in [space] and its corner in it: [space] less the inset, or all of it when nothing is left. */
    private fun seen(w: Float, h: Float): Triple<Float, Float, Pair<Float, Float>> {
        val ix = inset?.x ?: 0f
        val iy = inset?.y ?: 0f
        return if (w - 2 * ix > 0f && h - 2 * iy > 0f) Triple(w - 2 * ix, h - 2 * iy, ix to iy) else Triple(w, h, 0f to 0f)
    }

    override fun computeScaleFactor(srcSize: Size, dstSize: Size): ScaleFactor {
        if (srcSize.width <= 0f || srcSize.height <= 0f || dstSize.width <= 0f || dstSize.height <= 0f) return ScaleFactor(1f, 1f)
        val (w, h) = seen(dstSize.width, dstSize.height)
        val crop = coverCrop((srcSize.width / srcSize.height).toDouble(), frame, (h / w).toDouble())
        val s = (w / (crop.w * srcSize.width)).toFloat()
        return ScaleFactor(s, s)
    }

    override fun align(size: IntSize, space: IntSize, layoutDirection: LayoutDirection): IntOffset {
        if (size.width <= 0 || size.height <= 0 || space.width <= 0 || space.height <= 0) return IntOffset.Zero
        val (w, h, at) = seen(space.width.toFloat(), space.height.toFloat())
        val crop = coverCrop(size.width.toDouble() / size.height, frame, (h / w).toDouble())
        return IntOffset((at.first - crop.x * size.width).roundToInt(), (at.second - crop.y * size.height).roundToInt())
    }

    companion object {
        /** The scale and alignment for [frame] in a box bled by [inset]: the old centred crop when there is neither. */
        fun scale(frame: CoverFraming?, inset: CoverInset? = null): ContentScale =
            if (frame == null && inset == null) ContentScale.Crop else CoverFit(frame, inset)
        fun alignment(frame: CoverFraming?, inset: CoverInset? = null): Alignment =
            if (frame == null && inset == null) Alignment.Center else CoverFit(frame, inset)
    }
}

/**
 * A frame's crop stage maths (round 25 §G3), apart from Compose so it can be tested — the avatar's square and the
 * cover's 0.62 alike: a picture [iw] × [ih] under a frame [fw] × [fh] (stage units) is drawn at s = sMin × z, sMin the
 * least that covers the frame, so the frame is always covered; the offset ([CropState.ox], [CropState.oy]: the
 * picture's centre from the frame's) keeps it so; zooming keeps the point under its anchor where it is.
 */
open class FrameCrop(val iw: Double, val ih: Double, val fw: Double, val fh: Double, val maxZoom: Double) {
    private val minScale = max(fw / iw, fh / ih)

    fun scale(z: Double): Double = minScale * z

    /** The state with its zoom in [1, maxZoom] and the picture still covering the frame. */
    fun clamp(state: CropState): CropState {
        val z = state.z.coerceIn(1.0, maxZoom)
        val s = scale(z)
        val maxX = max(0.0, (iw * s - fw) / 2)
        val maxY = max(0.0, (ih * s - fh) / 2)
        return CropState(z, state.ox.coerceIn(-maxX, maxX), state.oy.coerceIn(-maxY, maxY))
    }

    /** A drag of ([dx], [dy]) stage units. */
    fun pan(state: CropState, dx: Double, dy: Double): CropState = clamp(state.copy(ox = state.ox + dx, oy = state.oy + dy))

    /** How far the picture's centre may move from the frame's at zoom [z], across and down (0: no room on that axis). */
    fun room(z: Double): Pair<Double, Double> {
        val sc = scale(z.coerceIn(1.0, maxZoom))
        return max(0.0, (iw * sc - fw) / 2) to max(0.0, (ih * sc - fh) / 2)
    }

    /** Whether one axis has no room at zoom [z] (round 33 §Q5: a 3:2 picture at zoom 1 in the 0.62 frame, across). */
    fun lacksRoom(z: Double): Boolean = room(z).let { (x, y) -> x < NO_ROOM || y < NO_ROOM }

    /**
     * A drag of ([dx], [dy]) that may pull past the picture's limits (round 33 §Q5): what fits moves the picture, what
     * doesn't is kept as [StageDrag.overX] / [StageDrag.overY] — how far the finger is past the limit, the stage drawing
     * [rubber] of it — and a drag back takes the pull up first. [StageDrag.blocked]: the drag pushed (mostly) along an
     * axis with no room at all.
     */
    fun drag(from: StageDrag, dx: Double, dy: Double): StageDrag {
        val (rx, ry) = room(from.state.z)
        val (x, ox) = axis(from.state.ox, from.overX, dx, rx)
        val (y, oy) = axis(from.state.oy, from.overY, dy, ry)
        // Mostly along the axis (a finger's sideways wobble on a drag down is not a push across).
        val blocked = (rx < NO_ROOM && kotlin.math.abs(dx) > kotlin.math.abs(dy)) || (ry < NO_ROOM && kotlin.math.abs(dy) > kotlin.math.abs(dx))
        return StageDrag(clamp(from.state.copy(ox = x, oy = y)), ox, oy, blocked)
    }

    private fun axis(at: Double, over: Double, d: Double, limit: Double): Pair<Double, Double> {
        var rest = d
        if (over != 0.0) {
            val pulled = over + rest
            // Still past the limit the same way: only the pull changes.
            if (pulled * over > 0) return at to pulled
            rest = pulled
        }
        val to = at + rest
        val kept = to.coerceIn(-limit, limit)
        return kept to (to - kept)
    }

    /** Zoomed to [z], the picture's point under the anchor ([ax], [ay] from the frame's centre) staying there. */
    fun zoomTo(state: CropState, z: Double, ax: Double = 0.0, ay: Double = 0.0): CropState {
        val to = z.coerceIn(1.0, maxZoom)
        val k = scale(to) / scale(state.z)
        return clamp(CropState(to, ax - (ax - state.ox) * k, ay - (ay - state.oy) * k))
    }

    /** What the frame shows, in fractions of the picture. */
    fun cropFractions(state: CropState): CoverCropRect {
        val s = scale(state.z)
        val w = fw / s / iw
        val h = fh / s / ih
        return CoverCropRect(0.5 - state.ox / s / iw - w / 2, 0.5 - state.oy / s / ih - h / 2, w, h)
    }

    /** The cover's frame for [state]: the picture's point at the frame's centre, the zoom, the picture's ratio. */
    fun framing(state: CropState): CoverFraming {
        val c = clamp(state)
        val s = scale(c.z)
        return CoverFraming(
            (0.5 - c.ox / s / iw).coerceIn(0.0, 1.0),
            (0.5 - c.oy / s / ih).coerceIn(0.0, 1.0),
            c.z.coerceIn(CoverFraming.MIN_ZOOM, CoverFraming.MAX_ZOOM),
            (iw / ih).coerceIn(CoverFraming.MIN_AR, CoverFraming.MAX_AR),
        )
    }

    /** The state that shows [frame] (null: the start, centred): its point at the frame's centre, clamped. */
    fun stateOf(frame: CoverFraming?): CropState {
        if (frame == null) return CropState()
        val z = frame.zoom.coerceIn(1.0, maxZoom)
        val s = scale(z)
        return clamp(CropState(z, (0.5 - frame.cx) * iw * s, (0.5 - frame.cy) * ih * s))
    }

    companion object {
        /** A state kept as the stage changes size (turned, a window resized): its offsets follow the frame's width. */
        fun resized(state: CropState, fromWidth: Double, toWidth: Double): CropState =
            if (fromWidth <= 0 || toWidth <= 0 || fromWidth == toWidth) state
            else state.copy(ox = state.ox * toWidth / fromWidth, oy = state.oy * toWidth / fromWidth)

        /** The slider's place for zoom [z] (a multiplying scale: ln z, so a slide, a pinch and a wheel are one control). */
        fun sliderOf(z: Double): Float = kotlin.math.ln(max(1.0, z)).toFloat()

        /** The zoom at slider place [v]. */
        fun zoomOf(v: Float): Double = kotlin.math.exp(v.toDouble())

        /** Less than this (stage units) is no room. */
        const val NO_ROOM = 0.5

        /** The farthest a pull past the limit shows (round 33 §Q5: at most ~24). */
        const val RUBBER_REACH = 24.0

        /**
         * How far a pull of [over] past the limit draws the picture: reach × (1 − e^(−|over| / 2 reach)), with it at first,
         * then less and less, never [reach] — the web's and iOS's curve.
         */
        fun rubber(over: Double, reach: Double = RUBBER_REACH): Double =
            kotlin.math.sign(over) * reach * (1 - kotlin.math.exp(-kotlin.math.abs(over) / (2 * reach)))

        /** The pull that draws [shown] ([rubber]'s inverse): a drag caught while the picture springs back goes on from there. */
        fun pullOf(shown: Double, reach: Double = RUBBER_REACH): Double {
            val b = kotlin.math.abs(shown).coerceAtMost(reach * 0.999)
            return kotlin.math.sign(shown) * -2 * reach * kotlin.math.ln(1 - b / reach)
        }
    }
}

/** A drag on a crop stage as it goes ([FrameCrop.drag]): the picture's state and how far the finger is past its limits. */
@Immutable
data class StageDrag(val state: CropState, val overX: Double = 0.0, val overY: Double = 0.0, val blocked: Boolean = false)

/**
 * How wide a crop stage may be (round 25 §G3.1): the dialog's width ([available]), at most [cap] (480 for the cover,
 * 400 for the avatar) — and never taller than the window's height − 200, the width following, so a phone held
 * sideways keeps the frame and its buttons on one screen. The stage is its frame ([ratio]: height ÷ width) with
 * [margin] of dimmed picture round it on every side: (w − 2m) × ratio + 2m tall.
 */
fun cropStageWidth(available: Float, windowHeight: Float, cap: Float, ratio: Float, margin: Float = CROP_MARGIN): Float {
    val room = max(2 * margin + 80f, windowHeight - 200f)
    val byHeight = (room - 2 * margin) / ratio + 2 * margin
    return max(2 * margin + 40f, min(min(available, cap), byHeight))
}

/** The dimmed picture round a crop's frame, on every side (the avatar's 24 since round 5). */
const val CROP_MARGIN = 24f
