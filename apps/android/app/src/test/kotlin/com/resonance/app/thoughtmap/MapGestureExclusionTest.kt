package com.resonance.app.thoughtmap

import com.resonance.app.thoughtmap.MapGestureExclusion.Band
import com.resonance.app.thoughtmap.MapGestureExclusion.Edge
import com.resonance.app.thoughtmap.MapGestureExclusion.Frame
import com.resonance.app.thoughtmap.MapGestureExclusion.Scene
import com.resonance.app.thoughtmap.MapGestureExclusion.Span
import com.resonance.geometry.MapCamera
import com.resonance.geometry.Pt
import com.resonance.geometry.Rect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Android only, 2026-10-29 (the owner): one finger sliding along a region's edge "zoomed the whole screen" now and
 * then — not the map's camera but the page's predictive back (PageFrame scales the page with the finger), which the
 * system starts from a strip at the screen's left and right edges wherever the app hasn't excluded it. The map once
 * excluded only the middle 200dp of each edge; it now spends each edge's 200dp where a drag is about to start.
 */
class MapGestureExclusionTest {
    /** A phone-sized map reaching both edges, each with a 32dp strip. */
    private val phone = Frame(400.0, 800.0, Span(0.0, 32.0), Span(368.0, 400.0))
    private val still = MapCamera(0.0, 0.0, 1.0)

    private fun scene(
        camera: MapCamera = still,
        handles: List<Pt> = emptyList(),
        selectedCorner: Pt? = null,
        corners: List<Pt> = emptyList(),
        boxes: List<Rect> = emptyList(),
        focus: Pt? = null,
    ) = Scene(camera, handles, selectedCorner, corners, boxes, focus)

    private fun List<Band>.on(edge: Edge) = filter { it.edge == edge }
    private fun List<Band>.total(edge: Edge) = on(edge).sumOf { it.bottom - it.top }
    private fun List<Band>.covers(edge: Edge, y: Double) = on(edge).any { y >= it.top - 1e-9 && y <= it.bottom + 1e-9 }

    private fun assertWithinBudget(bands: List<Band>) {
        for (edge in Edge.entries) {
            assertTrue("$edge spends ${bands.total(edge)}", bands.total(edge) <= MapGestureExclusion.BUDGET + 1e-6)
            // Disjoint, top first: what the system unions is exactly what was counted.
            val spans = bands.on(edge)
            for (i in 1 until spans.size) assertTrue(spans[i].top >= spans[i - 1].bottom)
        }
    }

    @Test fun nothingNearAnEdgeKeepsTheMiddleAsBefore() {
        val bands = MapGestureExclusion.bands(scene(), phone)
        assertEquals(
            listOf(Band(Edge.Left, 0.0, 300.0, 32.0, 500.0), Band(Edge.Right, 368.0, 300.0, 400.0, 500.0)),
            bands,
        )
    }

    @Test fun eachBandStaysInItsOwnStrip() {
        // A full-width rect would count against both edges' budgets at once.
        for (b in MapGestureExclusion.bands(scene(corners = listOf(Pt(10.0, 100.0), Pt(390.0, 700.0))), phone)) {
            if (b.edge == Edge.Left) assertEquals(Pair(0.0, 32.0), Pair(b.left, b.right))
            else assertEquals(Pair(368.0, 400.0), Pair(b.left, b.right))
        }
    }

    @Test fun theSelectedCardsHandlesComeFirst() {
        // A selected card mostly off the left edge: its top and bottom handles lie in the strip, above and below the middle.
        val card = Rect(-100.0, 60.0, 232.0, 178.0)
        val handles = LinkSide.entries.map { Pt(card.x + it.cx, card.y + it.cy) }
        val bands = MapGestureExclusion.bands(scene(handles = handles, boxes = listOf(card), focus = Pt(16.0, 149.0)), phone)
        assertWithinBudget(bands)
        // Each handle's 64 about it…
        for (y in listOf(59.0 - 31, 59.0 + 31, 239.0 - 31, 239.0 + 31)) assertTrue("covers $y", bands.covers(Edge.Left, y))
        // …then the card itself from its middle, and nothing is left for the middle of the screen.
        assertTrue(bands.covers(Edge.Left, 149.0))
        assertFalse(bands.covers(Edge.Left, 400.0))
        assertEquals(200.0, bands.total(Edge.Left), 1e-6)
        // The right edge has nothing of it: the middle, as ever.
        assertEquals(listOf(Band(Edge.Right, 368.0, 300.0, 400.0, 500.0)), bands.on(Edge.Right))
    }

    @Test fun handlesThenCornersThenWhatIsNearestTheMiddle() {
        val bands = MapGestureExclusion.bands(
            scene(
                handles = listOf(Pt(5.0, 700.0)),
                corners = listOf(Pt(10.0, 100.0), Pt(10.0, 300.0), Pt(10.0, 400.0), Pt(10.0, 500.0)),
            ),
            phone,
        )
        assertWithinBudget(bands)
        // The handle (64), the corner at the middle (64), the next nearest (64) and 8 of the one after.
        assertTrue(bands.covers(Edge.Left, 700.0))
        assertTrue(bands.covers(Edge.Left, 400.0))
        assertTrue(bands.covers(Edge.Left, 300.0))
        assertTrue(bands.covers(Edge.Left, 500.0))
        assertFalse(bands.covers(Edge.Left, 100.0))
        assertEquals(200.0, bands.total(Edge.Left), 1e-6)
        val last = bands.on(Edge.Left).first { it.top <= 500.0 && it.bottom >= 500.0 }
        assertEquals(8.0, last.bottom - last.top, 1e-6)
    }

    @Test fun theSelectedRegionsCornerComesBeforeTheOthers() {
        val bands = MapGestureExclusion.bands(
            scene(selectedCorner = Pt(20.0, 760.0), corners = List(4) { Pt(20.0, 380.0 + it * 70) }),
            phone,
        )
        assertWithinBudget(bands)
        assertTrue(bands.covers(Edge.Left, 760.0))
    }

    @Test fun theExtentNearestTheSelectionGoesFirst() {
        val far = Rect(-50.0, 0.0, 300.0, 150.0)
        val near = Rect(-50.0, 600.0, 300.0, 190.0)
        val bands = MapGestureExclusion.bands(scene(boxes = listOf(far, near), focus = Pt(100.0, 650.0)), phone)
        assertWithinBudget(bands)
        // The near one whole (190), the far one's 10 nearest the selection, nothing for the middle.
        assertTrue(bands.covers(Edge.Left, 600.0) && bands.covers(Edge.Left, 790.0))
        assertTrue(bands.covers(Edge.Left, 145.0))
        assertFalse(bands.covers(Edge.Left, 50.0))
        assertFalse(bands.covers(Edge.Left, 400.0))
    }

    @Test fun anEdgeNeverSpendsMoreThanTheSystemHonours() {
        // A crowded edge, zoomed in: every kind of thing in the strip at once.
        val cam = MapCamera(-40.0, -100.0, 2.0)
        val corners = List(12) { Pt(20.0, 60.0 * it) }
        val boxes = List(10) { Rect(0.0, 45.0 * it, 232.0, 178.0) } + Rect(0.0, -500.0, 460.0, 2000.0)
        val handles = listOf(Pt(15.0, 120.0), Pt(15.0, 250.0), Pt(130.0, 30.0), Pt(130.0, 300.0))
        val bands = MapGestureExclusion.bands(scene(cam, handles, Pt(30.0, 380.0), corners, boxes, Pt(130.0, 210.0)), phone)
        assertWithinBudget(bands)
        assertEquals(200.0, bands.total(Edge.Left), 1e-6)
        // And never past the map.
        assertTrue(bands.all { it.top >= 0 && it.bottom <= phone.height })
    }

    @Test fun aPointIsInTheStripWhenItsReachIs() {
        // At 1:1 a finger reaches 22 from a corner's middle: just past that it is the map's middle band alone.
        val outside = MapGestureExclusion.bands(scene(corners = listOf(Pt(32.0 + 23, 100.0))), phone)
        assertFalse(outside.covers(Edge.Left, 100.0))
        assertEquals(Band(Edge.Left, 0.0, 300.0, 32.0, 500.0), outside.on(Edge.Left).single())
        val inside = MapGestureExclusion.bands(scene(corners = listOf(Pt(32.0 + 21, 100.0))), phone)
        assertTrue(inside.covers(Edge.Left, 100.0))
        // Zoomed in, a handle's reach grows with the card (14 world units): at 2× it is 28 on screen.
        val zoomed = MapCamera(0.0, 0.0, 2.0)
        assertTrue(MapGestureExclusion.bands(scene(zoomed, handles = listOf(Pt((32.0 + 27) / 2, 100.0))), phone).covers(Edge.Left, 200.0))
        assertFalse(MapGestureExclusion.bands(scene(zoomed, handles = listOf(Pt((32.0 + 29) / 2, 100.0))), phone).covers(Edge.Left, 200.0))
        // A box counts when any of it crosses the strip.
        assertTrue(MapGestureExclusion.bands(scene(boxes = listOf(Rect(31.0, 600.0, 200.0, 100.0))), phone).covers(Edge.Left, 650.0))
        assertFalse(MapGestureExclusion.bands(scene(boxes = listOf(Rect(33.0, 600.0, 200.0, 100.0))), phone).covers(Edge.Left, 650.0))
    }

    @Test fun aMapAwayFromAnEdgeHandsItNothing() {
        // The tablet's workspace: the map beside the writer's pane reaches only the screen's left edge.
        val beside = Frame(600.0, 800.0, Span(0.0, 32.0), null)
        val bands = MapGestureExclusion.bands(scene(corners = listOf(Pt(590.0, 100.0))), beside)
        assertTrue(bands.on(Edge.Right).isEmpty())
        assertEquals(1, bands.on(Edge.Left).size)
    }
}
