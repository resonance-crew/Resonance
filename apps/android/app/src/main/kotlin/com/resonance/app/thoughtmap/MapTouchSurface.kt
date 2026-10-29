package com.resonance.app.thoughtmap

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemGestures
import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.changedToDown
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.findRootCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.LayoutDirection
import com.resonance.geometry.MapCamera
import com.resonance.geometry.Pt
import com.resonance.geometry.Rect
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Every finger on the map, raw — the web's pointer events (with capture), so
 * the store can run the web's own state machine: the 4px rule, a second finger
 * turning any gesture into a pinch about the fingers' midpoint. Positions
 * reach the store in dp.
 *
 * The system's back gesture starts in a strip at the screen's left and right
 * edges, and on the map it seeks the page's predictive back (PageFrame scales,
 * shifts and rounds the whole page with the finger) — one finger dragging a
 * region's edge or corner, a card or a link handle there "zoomed the whole
 * screen" (the owner, 2026-10-29). Each edge's exclusion budget (the most the
 * system honours, [MapGestureExclusion.BUDGET]) is spent where the reader is
 * about to drag, recomputed as the camera and the map change — never per touch:
 * the system decides at the touch's start, from what was handed to it before.
 * The Leave button and the back key still leave.
 */
@Composable
fun MapTouchSurface(store: ThoughtMapStore, modifier: Modifier = Modifier) {
    val density = LocalDensity.current
    val d = density.density
    // The strips' widths as the system reports them (its back sensitivity), else a usual strip: with three-button
    // navigation there is none, and excluding a strip nobody swipes from costs nothing.
    val gestures = WindowInsets.systemGestures
    val stripLeft = rememberUpdatedState(gestures.getLeft(density, LayoutDirection.Ltr).let { if (it > 0) it / d.toDouble() else MapGestureExclusion.STRIP_FALLBACK })
    val stripRight = rememberUpdatedState(gestures.getRight(density, LayoutDirection.Ltr).let { if (it > 0) it / d.toDouble() else MapGestureExclusion.STRIP_FALLBACK })
    // Where the map sits in its window (whole dp, so a page settling doesn't churn), and whether a finger is down.
    var place by remember { mutableStateOf<SurfacePlace?>(null) }
    var held by remember { mutableStateOf(false) }
    val bands by remember(store) {
        var last = emptyList<MapGestureExclusion.Band>()
        derivedStateOf {
            // While a finger is down the bands stay as they were: the system has already decided for this touch,
            // and following every frame of a pan or a drag would only re-send the rects.
            if (!held) {
                val p = place
                last = if (p == null) emptyList() else MapGestureExclusion.bands(store.exclusionScene(), p.frame(stripLeft.value, stripRight.value))
            }
            last
        }
    }
    Box(
        modifier
            .fillMaxSize()
            .onSizeChanged { store.setViewport(it.width / d.toDouble(), it.height / d.toDouble()) }
            .onGloballyPositioned { c ->
                val root = c.findRootCoordinates()
                val at = root.localPositionOf(c, Offset.Zero)
                place = SurfacePlace(
                    left = (at.x / d).roundToInt(),
                    right = ((root.size.width - at.x - c.size.width) / d).roundToInt(),
                    width = (c.size.width / d).roundToInt(),
                    height = (c.size.height / d).roundToInt(),
                )
            }
            .pointerInput(store) {
                try {
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent()
                            for (c in event.changes) {
                                val x = c.position.x / d.toDouble()
                                val y = c.position.y / d.toDouble()
                                when {
                                    c.changedToDown() -> store.touchDown(c.id.value, x, y)
                                    c.changedToUp() -> store.touchUp(c.id.value, x, y)
                                    c.pressed && c.positionChanged() -> store.touchMove(c.id.value, x, y)
                                }
                                c.consume()
                            }
                            held = event.changes.any { it.pressed }
                        }
                    }
                } finally {
                    // Leaving mid-gesture ends it like a lift (the web's onPointerCancel = onPointerUp).
                    held = false
                    store.touchesCancelled()
                }
            },
    ) {
        // One invisible box per band, each handing its own bounds to the system (Compose keeps the view's list:
        // a box that moves or goes takes its rect with it). Placed absolutely: the bands are in physical pixels.
        Layout(content = { for (i in bands.indices) Box(Modifier.systemGestureExclusion()) }, modifier = Modifier.fillMaxSize()) { measurables, constraints ->
            val shown = bands
            val placed = measurables.mapIndexed { i, m ->
                val b = shown.getOrNull(i)
                val w = if (b == null) 0 else ((b.right - b.left) * d).roundToInt().coerceAtLeast(0)
                val h = if (b == null) 0 else ((b.bottom - b.top) * d).roundToInt().coerceAtLeast(0)
                m.measure(Constraints.fixed(w, h)) to b
            }
            layout(constraints.maxWidth, constraints.maxHeight) {
                for ((p, b) in placed) if (b != null) p.place((b.left * d).roundToInt(), (b.top * d).roundToInt())
            }
        }
    }
}

/** The map's box in its window, in whole dp: its gaps to the window's left and right edges, and its size. */
private data class SurfacePlace(val left: Int, val right: Int, val width: Int, val height: Int) {
    /** Each edge's strip across the map, in the map's own x (null where the map doesn't reach that strip). */
    fun frame(stripLeft: Double, stripRight: Double): MapGestureExclusion.Frame {
        fun span(from: Double, to: Double) = MapGestureExclusion.Span(max(0.0, from), min(width.toDouble(), to)).takeIf { it.to > it.from }
        return MapGestureExclusion.Frame(
            width = width.toDouble(),
            height = height.toDouble(),
            left = span(-left.toDouble(), stripLeft - left),
            right = span(width + right - stripRight, (width + right).toDouble()),
        )
    }
}

/**
 * Where on the map's left and right edges the system's back gesture gives way to the map. Android honours at most
 * [BUDGET] dp of exclusion per edge (past it, it drops the topmost rects), so each edge's budget goes, in order, to:
 * 1. the selected card's link handles and the selected region's resize corner — a [TARGET]-tall band centred on each
 *    that lies within the strip;
 * 2. every other region's resize corner within the strip;
 * 3. the regions' and cards' vertical extents where they cross the strip (clipped to the map), nearest the selected
 *    item — else the screen's middle — first;
 * 4. what is left, the middle of the edge (where a pan ends up), as the map always had.
 * A band that no longer fits whole keeps the part around its anchor that does. Pure: tested on the JVM.
 */
object MapGestureExclusion {
    /** The most exclusion Android honours along each edge, in dp. */
    const val BUDGET = 200.0
    /** A handle's or corner's band: room for the finger to land a little off it. */
    const val TARGET = 64.0
    /** The strip's width when the system reports none. */
    const val STRIP_FALLBACK = 32.0

    enum class Edge { Left, Right }

    /** A span along one axis, [from] < [to]. */
    data class Span(val from: Double, val to: Double)

    /** The map's size (dp) and each edge's strip across it, in the map's own x (null: the map doesn't reach it). */
    data class Frame(val width: Double, val height: Double, val left: Span?, val right: Span?)

    /** What a drag could take hold of, in world units (see [ThoughtMapStore.exclusionScene]). */
    data class Scene(
        val camera: MapCamera,
        val handles: List<Pt>,
        val selectedCorner: Pt?,
        val corners: List<Pt>,
        val boxes: List<Rect>,
        /** The selected item's middle: the extents nearest it go first. */
        val focus: Pt?,
    )

    /** One rect handed to the system, in the map's own dp: [left]..[right] across [edge]'s strip, [top]..[bottom] down it. */
    data class Band(val edge: Edge, val left: Double, val top: Double, val right: Double, val bottom: Double)

    fun bands(scene: Scene, frame: Frame): List<Band> {
        if (frame.height <= 0) return emptyList()
        val out = ArrayList<Band>()
        for (edge in Edge.entries) {
            val strip = (if (edge == Edge.Left) frame.left else frame.right) ?: continue
            for (span in spansFor(scene, frame.height, strip, edge)) out += Band(edge, strip.from, span.from, strip.to, span.to)
        }
        return out
    }

    /** One edge's spans down the map, disjoint and top first, their total within [BUDGET]. */
    private fun spansFor(scene: Scene, height: Double, strip: Span, edge: Edge): List<Span> {
        val cam = scene.camera
        val s = cam.s
        fun sx(x: Double) = x * s + cam.x
        fun sy(y: Double) = y * s + cam.y
        // A point reaches the strip when its reach (the hit-test's, on screen) does.
        fun inStrip(p: Pt, reach: Double): Boolean = sx(p.x) + reach >= strip.from && sx(p.x) - reach <= strip.to
        val taken = Taken(height)
        fun target(p: Pt) = taken.offer(sy(p.y) - TARGET / 2, sy(p.y) + TARGET / 2, sy(p.y))
        // The middle of the selected item on screen, else the screen's.
        val anchor = scene.focus?.let { sy(it.y).coerceIn(0.0, height) } ?: (height / 2)

        // 1. The selected card's handles (the one facing this edge first) and the selected region's corner.
        val handleReach = max(14 * s, 22.0)
        val nearEdge = compareBy<Pt> { if (edge == Edge.Left) sx(it.x) else -sx(it.x) }
        for (h in scene.handles.filter { inStrip(it, handleReach) }.sortedWith(nearEdge)) target(h)
        val cornerReach = max(11 * s, 22.0)
        scene.selectedCorner?.takeIf { inStrip(it, cornerReach) }?.let(::target)
        // 2. Every other region's corner, nearest the anchor first.
        for (c in scene.corners.filter { inStrip(it, cornerReach) }.sortedBy { abs(sy(it.y) - anchor) }) target(c)
        // 3. Regions and cards crossing the strip, the extent nearest the anchor first, from the point of it nearest.
        val extents = scene.boxes
            .filter { sx(it.x + it.w) >= strip.from && sx(it.x) <= strip.to }
            .map { Span(max(0.0, sy(it.y)), min(height, sy(it.y + it.h))) }
            .filter { it.to > it.from }
            .sortedBy { distance(anchor, it) }
        for (e in extents) taken.offer(e.from, e.to, anchor.coerceIn(e.from, e.to))
        // 4. The rest to the middle (pans).
        taken.offer(0.0, height, height / 2)
        return taken.spans
    }

    private fun distance(y: Double, span: Span): Double = if (y < span.from) span.from - y else if (y > span.to) y - span.to else 0.0

    /** The spans chosen so far along one edge, kept merged, and what is left of the budget. */
    private class Taken(val height: Double) {
        var spans: List<Span> = emptyList()
            private set

        private fun covered(list: List<Span>) = list.sumOf { it.to - it.from }

        private fun merged(with: Span): List<Span> {
            val all = (spans + with).sortedBy { it.from }
            val out = ArrayList<Span>()
            for (sp in all) {
                val last = out.lastOrNull()
                if (last != null && sp.from <= last.to) out[out.size - 1] = Span(last.from, max(last.to, sp.to)) else out += sp
            }
            return out
        }

        /**
         * [from]..[to] (clipped to the map), or — when it doesn't fit whole — the longest window of it around
         * [anchor] (shifted to stay inside it) that does: a window only grows by covering more, so the longest that
         * fits is found by halving.
         */
        fun offer(from: Double, to: Double, anchor: Double) {
            val lo = max(0.0, from)
            val hi = min(height, to)
            if (hi - lo < 1) return
            val left = BUDGET - covered(spans)
            if (left < 1) return
            fun window(len: Double): Span {
                val start = (anchor - len / 2).coerceIn(lo, hi - len)
                return Span(start, start + len)
            }
            fun cost(span: Span) = covered(merged(span))
            if (cost(Span(lo, hi)) <= BUDGET) {
                spans = merged(Span(lo, hi))
                return
            }
            var short = 0.0
            var long = hi - lo
            repeat(40) {
                val mid = (short + long) / 2
                if (cost(window(mid)) <= BUDGET) short = mid else long = mid
            }
            // Where the window still grows one for one (it usually does: its ends on uncovered map), the exact length.
            val exact = short + (BUDGET - cost(window(short)))
            if (exact <= hi - lo && cost(window(exact)) <= BUDGET) short = exact
            if (short < 1) return
            val chosen = window(short)
            if (cost(chosen) - covered(spans) >= 1) spans = merged(chosen)
        }
    }
}
