package com.resonance.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobCircleOptions
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wavyLine
import com.resonance.geometry.wobCircle
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Where a photo sits under a crop's frame while it is framed (design note B7; round 25 §G3 for the cover too): its
 * zoom [z] (1 = the frame just covered) and its centre's offset ([ox], [oy]) from the frame's centre, in stage units
 * (dp).
 */
@Immutable
data class CropState(val z: Double = 1.0, val ox: Double = 0.0, val oy: Double = 0.0)

/** The square of the photo, in its own pixels, that the mask shows: what becomes the avatar. */
@Immutable
data class CropRect(val x: Double, val y: Double, val side: Double)

/**
 * The avatar's crop (design note B7): a [FrameCrop] whose frame is the square mask [mask] wide, zoomed 1–4 — the same
 * on every platform. A photo [iw] × [ih] (orientation applied) at zoom z is drawn at s = sMin × z, sMin = mask /
 * min(iw, ih), so the mask is always covered; the offset keeps it so; zooming keeps the point under its anchor.
 */
class AvatarCrop(iw: Double, ih: Double, val mask: Double) : FrameCrop(iw, ih, mask, mask, MAX_ZOOM) {
    /** What the mask shows, in the photo's pixels. */
    fun crop(state: CropState): CropRect {
        val s = scale(state.z)
        val side = mask / s
        return CropRect(iw / 2 - state.ox / s - side / 2, ih / 2 - state.oy / s - side / 2, side)
    }

    companion object {
        const val MIN_ZOOM = 1.0
        const val MAX_ZOOM = 4.0

        /** The square the crop is drawn into: its own size, kept between 256 (what the server keeps) and 512. */
        fun outputSize(side: Double): Int = min(512, max(256, side.roundToInt()))

        /** A pointer wheel's zoom (the web's): z × e^(−deltaY × 0.002). */
        fun wheelZoom(z: Double, deltaY: Double): Double = z * exp(-deltaY * 0.002)
    }
}

/**
 * The avatar stage's side (round 25 §G3.1): a square at most 400 wide, and never taller than the window's height − 200
 * ([windowHeight]; unknown: no limit); the mask is 48 smaller, so 24 of the dimmed photo shows round it.
 */
fun cropStageSide(available: Dp, windowHeight: Dp = Dp.Infinity): Dp =
    cropStageWidth(available.value, if (windowHeight == Dp.Infinity) Float.MAX_VALUE / 4 else windowHeight.value, AVATAR_STAGE_MAX, 1f).dp

/** The widest the avatar's stage gets (320 before round 25). */
const val AVATAR_STAGE_MAX = 400f

/** The widest the cover's stage gets on a phone or a tablet. */
const val COVER_STAGE_MAX = 480f

fun cropMask(stage: Dp): Dp = stage - (CROP_MARGIN * 2).dp

/** The scrim over the photo outside the mask: over a picture, the same dark in either scheme. */
private val CropScrim = OverPicture.Scrim

/** What TalkBack offers on a crop stage besides its slider (round 25 §G3.8): 上移 / 下移 / 左移 / 右移. */
@Immutable
data class CropMoveLabels(val up: String, val down: String, val left: String, val right: String)

/** How far one key press or one TalkBack move takes the picture (stage units): 8, with Shift 32 (the web's). */
const val CROP_KEY_STEP = 8.0
const val CROP_KEY_STEP_LARGE = 32.0

/** A zoom key's step (+ / −): the same factor a wheel notch of 100 gives. */
private const val CROP_ZOOM_STEP = 1.2214

/**
 * The avatar's stage (design note B7): [FrameCropStage] with the square mask and HandDrawnAvatar's outline (its
 * recipe at the mask's size, seed 77), so what shows inside it is exactly the avatar to be.
 */
@Composable
fun AvatarCropStage(
    photo: ImageBitmap,
    side: Dp,
    state: CropState,
    onState: (CropState) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    moves: CropMoveLabels? = null,
) {
    FrameCropStage(photo, side, 1f, AvatarCrop.MAX_ZOOM, state, onState, label, modifier, moves) { w, _ ->
        WobRectShape(w * 0.4, 77.0, mag = w * 0.022, options = WobRectOptions(
            curve = 1.3, cornerJitter = 3.2, cornerOffset = w * 0.06, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0),
        ))
    }
}

/**
 * One crop stage for the avatar and the cover (round 25 §G3): [width] wide, its frame [ratio] (height ÷ width) inside
 * [CROP_MARGIN] of dimmed picture on every side, a cream-dark paper in HandDrawnImage's frame (seed 79, no pen line),
 * the photo on it where [state] puts it, dimmed outside [outline] (the frame's own shape, made for its w × h in dp)
 * and outlined in cream. One finger moves the photo, two pinch it about their moving centroid, a mouse wheel zooms
 * about the pointer, the arrow keys move it (8, with Shift 32) and + / − zoom; TalkBack gets [moves] as actions
 * besides the zoom slider beside it. When the stage changes size (turned) the picture keeps its place.
 */
@Composable
fun FrameCropStage(
    photo: ImageBitmap,
    width: Dp,
    ratio: Float,
    maxZoom: Double,
    state: CropState,
    onState: (CropState) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    moves: CropMoveLabels? = null,
    outline: (Double, Double) -> Shape,
) {
    val fw = (width.value - CROP_MARGIN * 2).coerceAtLeast(1f)
    val fh = fw * ratio
    val height = (fh + CROP_MARGIN * 2).dp
    val model = remember(photo, fw, fh, maxZoom) { FrameCrop(photo.width.toDouble(), photo.height.toDouble(), fw.toDouble(), fh.toDouble(), maxZoom) }
    val current by rememberUpdatedState(state)
    val emit by rememberUpdatedState(onState)
    // A new size (turned, a window resized): the offsets follow the frame, so the same part of the picture shows.
    val lastWidth = remember { doubleArrayOf(fw.toDouble()) }
    LaunchedEffect(fw) {
        val from = lastWidth[0]
        lastWidth[0] = fw.toDouble()
        if (from != fw.toDouble()) emit(model.clamp(FrameCrop.resized(current, from, fw.toDouble())))
    }
    val paperShape = remember { AutoWobRectShape(16.0, 79.0, 0.8) }
    val frameShape = remember(fw, fh) { outline(fw.toDouble(), fh.toDouble()) }
    val well = Tokens.CreamDark
    fun move(dx: Double, dy: Double): Boolean {
        val next = model.pan(current, dx, dy)
        if (next != current) emit(next)
        return true
    }
    fun zoomBy(k: Double, ax: Double = 0.0, ay: Double = 0.0) {
        val next = model.zoomTo(current, current.z * k, ax, ay)
        if (next != current) emit(next)
    }
    Box(
        modifier
            .size(width, height)
            .semantics {
                contentDescription = label
                if (moves != null) customActions = listOf(
                    // The picture moves the way it says, as an arrow key moves it (16 a move: a few presses' worth).
                    CustomAccessibilityAction(moves.up) { move(0.0, -CROP_KEY_STEP * 2) },
                    CustomAccessibilityAction(moves.down) { move(0.0, CROP_KEY_STEP * 2) },
                    CustomAccessibilityAction(moves.left) { move(-CROP_KEY_STEP * 2, 0.0) },
                    CustomAccessibilityAction(moves.right) { move(CROP_KEY_STEP * 2, 0.0) },
                )
            }
            .onKeyEvent { e ->
                if (e.type != KeyEventType.KeyDown) return@onKeyEvent false
                val step = if (e.isShiftPressed) CROP_KEY_STEP_LARGE else CROP_KEY_STEP
                when (e.key) {
                    // An arrow moves the picture the way it points (what's beyond comes into the frame from there).
                    Key.DirectionUp -> move(0.0, -step)
                    Key.DirectionDown -> move(0.0, step)
                    Key.DirectionLeft -> move(-step, 0.0)
                    Key.DirectionRight -> move(step, 0.0)
                    Key.Plus, Key.Equals, Key.NumPadAdd -> { zoomBy(CROP_ZOOM_STEP); true }
                    Key.Minus, Key.NumPadSubtract -> { zoomBy(1 / CROP_ZOOM_STEP); true }
                    else -> false
                }
            }
            .focusable()
            .pointerInput(model) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        if (event.type != PointerEventType.Scroll) continue
                        val change = event.changes.firstOrNull() ?: continue
                        val dy = change.scrollDelta.y
                        if (dy == 0f) continue
                        // A wheel notch is about 1 here, 100 on the web: the web's e^(−deltaY × 0.002) per its 100.
                        val ax = (change.position.x - size.width / 2f) / density
                        val ay = (change.position.y - size.height / 2f) / density
                        val z = AvatarCrop.wheelZoom(current.z, dy * 100.0)
                        val next = model.zoomTo(current, z, ax.toDouble(), ay.toDouble())
                        if (next != current) emit(next)
                        change.consume()
                    }
                }
            }
            .pointerInput(model) {
                detectTransformGestures { centroid, pan, zoom, _ ->
                    var next = current
                    if (zoom != 1f) {
                        // The fingers' centroid as it moves, from the frame's centre, in stage units.
                        val ax = (centroid.x - size.width / 2f) / density
                        val ay = (centroid.y - size.height / 2f) / density
                        next = model.zoomTo(next, next.z * zoom, ax.toDouble(), ay.toDouble())
                    }
                    next = model.pan(next, (pan.x / density).toDouble(), (pan.y / density).toDouble())
                    if (next != current) emit(next)
                }
            }
            .drawWithCache {
                val paper = paperShape.createOutline(size, layoutDirection, this)
                val paperPath = Path().apply { addOutline(paper) }
                val fwPx = fw.dp.toPx()
                val fhPx = fh.dp.toPx()
                val left0 = (size.width - fwPx) / 2f
                val top0 = (size.height - fhPx) / 2f
                val ring = frameShape.createOutline(Size(fwPx, fhPx), layoutDirection, this)
                val ringPath = Path().apply { addOutline(ring); translate(Offset(left0, top0)) }
                val pen = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round)
                onDrawBehind {
                    clipPath(paperPath) {
                        drawRect(well)
                        val s = model.scale(current.z).toFloat() * density
                        val w = photo.width * s
                        val h = photo.height * s
                        val left = size.width / 2f + current.ox.toFloat() * density - w / 2f
                        val top = size.height / 2f + current.oy.toFloat() * density - h / 2f
                        drawImage(
                            photo,
                            dstOffset = IntOffset(left.roundToInt(), top.roundToInt()),
                            dstSize = IntSize(w.roundToInt(), h.roundToInt()),
                            filterQuality = FilterQuality.Medium,
                        )
                        clipPath(ringPath, ClipOp.Difference) { drawRect(CropScrim) }
                    }
                    drawPath(ringPath, OverPicture.Rim, style = pen)
                }
            },
    )
}

/**
 * The web's OrganicSlider: a thick wavy stroke for the track (7, oklch(84% 0.022 75)), the same
 * stroke in terracotta up to the value, and a lopsided cream knob (r 11) on a terracotta rim. Drag
 * or tap it; TalkBack adjusts it ([label], its range and value).
 */
@Composable
fun OrganicSlider(
    value: Float,
    onChange: (Float) -> Unit,
    range: ClosedFloatingPointRange<Float>,
    label: String,
    modifier: Modifier = Modifier,
    step: Float = 0f,
    seed: Double = 5.0,
) {
    val emit by rememberUpdatedState(onChange)
    val knobR = 11.dp
    val trackInk = SliderTrack
    val accent = Tokens.Terracotta
    val knobPaper = Tokens.Cream
    fun valueAt(x: Float, width: Float, density: Float): Float {
        val pad = (knobR.value + 1f) * density
        val usable = max(1f, width - pad * 2)
        val raw = range.start + ((x - pad) / usable).coerceIn(0f, 1f) * (range.endInclusive - range.start)
        return if (step > 0f) ((raw - range.start) / step).roundToInt() * step + range.start else raw
    }
    Canvas(
        modifier
            .fillMaxWidth()
            .height(knobR * 2 + 4.dp)
            .semantics {
                contentDescription = label
                progressBarRangeInfo = ProgressBarRangeInfo(value, range)
                setProgress { v -> emit(v.coerceIn(range.start, range.endInclusive)); true }
            }
            .pointerInput(range, step) {
                detectTapGestures { emit(valueAt(it.x, size.width.toFloat(), density)) }
            }
            .pointerInput(range, step) {
                detectHorizontalDragGestures { change, _ -> emit(valueAt(change.position.x, size.width.toFloat(), density)) }
            },
    ) {
        val d = density
        val w = size.width / d
        val cy = size.height / 2f
        val pad = knobR.value + 1f
        val frac = if (range.endInclusive > range.start) ((value - range.start) / (range.endInclusive - range.start)).coerceIn(0f, 1f) else 0f
        val thumbX = (pad + frac * max(0f, w - pad * 2)) * d
        val capPad = 7f / 2 + 1
        val barLen = max(0f, w - capPad * 2)
        if (barLen > 0f) {
            val bar = wavyLine(barLen.toDouble(), seed, 2.6, max(4, (barLen / 38f).roundToInt())).toPath(d, capPad * d, cy)
            val track = Stroke(7.dp.toPx(), cap = StrokeCap.Round)
            drawPath(bar, trackInk, style = track)
            clipRect(right = thumbX) { drawPath(bar, accent, style = track) }
        }
        val knob = wobCircle(knobR.value.toDouble(), knobR.value.toDouble(), knobR.value.toDouble(), seed + 5, WobCircleOptions(segments = 9, mag = 0.7, cpJitter = 0.4)).toPath(d)
        translate(left = thumbX - knobR.toPx(), top = cy - knobR.toPx()) {
            drawPath(knob, knobPaper)
            drawPath(knob, accent, style = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round))
        }
    }
}

/** The slider's track (the web's oklch(84% 0.022 75)): a switch's off well, a step from the paper in either scheme. */
private val SliderTrack: Color @Composable @ReadOnlyComposable get() = Tokens.ToggleOff
