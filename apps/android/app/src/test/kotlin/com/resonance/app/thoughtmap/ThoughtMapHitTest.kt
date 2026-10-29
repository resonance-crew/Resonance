package com.resonance.app.thoughtmap

import android.app.Application
import com.resonance.app.thoughtmap.ThoughtMapStore.Hit
import com.resonance.app.thoughtmap.ThoughtMapStore.Selection
import com.resonance.geometry.MapCamera
import com.resonance.geometry.mapNodeH
import com.resonance.geometry.mapNodeW
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.l10n.Strings
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * 2026-10-29, the owner: a selected card's 開啟 and 移除 sat side by side on its tab and one was tapped for the
 * other — the tab now holds 開啟 alone and 移除 is a trash in the card's opposite corner; an arrow can be drawn
 * out of any of the four sides; and a region's title and trash stand well in from its corner. The twin of the
 * web's ThoughtMapNode.test.tsx.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class ThoughtMapHitTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun card(id: String) = MapCard(id, "alice", slug = id, title = "Card $id", story = "# $id", tags = listOf("夜"), visibility = "public", publishedAt = 1L, mediaUrl = null, accentHue = null)

    // A free card, a region, and a card filed in it hanging 20 past its left edge.
    private val ax = 100.0
    private val ay = 200.0
    private val gx = 600.0
    private val gy = 0.0
    private val gw = 460.0
    private val gh = 340.0
    private val board = ThoughtMapService.Loaded(
        nodes = listOf(MapNodeDoc("a", ax, ay, null), MapNodeDoc("f", gx - 20, gy + 120, "g")),
        edges = emptyList(),
        groups = listOf(MapGroupDoc("g", "回憶", 88.0, gx, gy, gw, gh)),
    )

    /** The board read, at 1:1 with the world at the screen's origin (so a world point is its screen point) unless [s] says. */
    private fun store(s: Double = 1.0) = ThoughtMapStore(ReadingApi(ApiConfiguration("http://localhost/") { "token" })).apply {
        setViewport(1280.0, 800.0)
        place(board, listOf("a", "f").associateWith(::card), emptySet())
        camera = MapCamera(0.0, 0.0, s)
    }

    /** A hit at world point (x, y) under the store's camera. */
    private fun ThoughtMapStore.at(x: Double, y: Double): Hit = hitTest(x * camera.s + camera.x, y * camera.s + camera.y)

    private fun ThoughtMapStore.tap(x: Double, y: Double) {
        val px = x * camera.s + camera.x
        val py = y * camera.s + camera.y
        touchDown(1, px, py)
        touchUp(1, px, py)
    }

    @Test fun theTabIsOpenAllAcross() {
        val store = store().apply { selection = Selection.Node("a") }
        val tabTop = ay - ThoughtMapStore.tabH / 2
        // The tab's 64: its start, its middle, its end — all 開啟 (there's no second button on it any more).
        for (x in listOf(24.0, 56.0, 88.0)) assertEquals(Hit.TabOpen("a"), store.at(ax + x, tabTop))
        var opened: MapCard? = null
        store.onOpen = { opened = it }
        store.tap(ax + 56, tabTop)
        assertEquals("a", opened?.id)
        assertEquals(64.0, ThoughtMapStore.tabW, 0.0)
    }

    @Test fun removeIsTheTrashInTheCardsOppositeCorner() {
        val store = store()
        val tx = ax + mapNodeW - 23
        val ty = ay + mapNodeH - 21
        // Not selected, the corner is just the card.
        assertEquals(Hit.Node("a"), store.at(tx, ty))
        store.selection = Selection.Node("a")
        assertEquals(Hit.NodeRemove("a"), store.at(tx, ty))
        // Across the card from 開啟: some 200 apart.
        val open = Pair(ax + 24 + 32, ay - 15)
        assertTrue(Math.hypot(tx - open.first, ty - open.second) > 190)
        store.tap(tx, ty)
        assertNull(store.nodes["a"])
        assertNull(store.selection)
    }

    // Grown with the finger's reach (44 world units at 0.5×) the trash's box covered the card's bottom-right quarter,
    // and a press meant to drag the card took it off the map, with no undo.
    @Test fun removeNeverGrowsIntoTheCardZoomedOut() {
        val store = store(s = 0.5).apply { selection = Selection.Node("a") }
        val tx = ax + ThoughtMapStore.removeX
        val ty = ay + ThoughtMapStore.removeY
        assertEquals(Hit.NodeRemove("a"), store.at(tx, ty))
        assertEquals(Hit.NodeRemove("a"), store.at(tx - 18, ty + 18))
        assertEquals(Hit.Node("a"), store.at(tx - 30, ty))
        assertEquals(Hit.Node("a"), store.at(tx, ty - 30))
        // A drag from there moves the card and leaves it on the map.
        store.touchDown(1, (tx - 30) * 0.5, ty * 0.5)
        store.touchMove(1, (tx - 30) * 0.5 - 40, ty * 0.5)
        store.touchUp(1, (tx - 30) * 0.5 - 40, ty * 0.5)
        assertTrue(store.nodes["a"] != null && store.nodes["a"]!!.x < ax)
    }

    @Test fun eachOfTheFourSidesStartsAnArrow() {
        val store = store().apply { selection = Selection.Node("a") }
        val expected = mapOf(
            LinkSide.Right to Pair(mapNodeW + 1, mapNodeH / 2),
            LinkSide.Left to Pair(-1.0, mapNodeH / 2),
            LinkSide.Top to Pair(mapNodeW / 2, -1.0),
            LinkSide.Bottom to Pair(mapNodeW / 2, mapNodeH + 1),
        )
        for ((side, c) in expected) {
            assertEquals(side, store.at(ax + c.first, ay + c.second).let { (it as Hit.LinkHandle).side })
            // A finger a little off it, outward, still lands on it.
            val (ox, oy) = when (side) {
                LinkSide.Right -> Pair(10.0, 0.0)
                LinkSide.Left -> Pair(-10.0, 0.0)
                LinkSide.Top -> Pair(0.0, -10.0)
                LinkSide.Bottom -> Pair(0.0, 10.0)
            }
            assertEquals(Hit.LinkHandle("a", side), store.at(ax + c.first + ox, ay + c.second + oy))
        }
        // Dragged from the left handle, an arrow is being drawn out of the card.
        store.touchDown(1, ax - 1, ay + mapNodeH / 2)
        assertEquals("a", store.linkDraft?.sourceId)
        store.touchesCancelled()
    }

    @Test fun aHandlesReachNeverEatsTheCardsBody() {
        // Zoomed out, a finger's reach is 44 world units: the left handle's would take the press 30 inside the edge…
        val store = store(s = 0.5).apply { selection = Selection.Node("a") }
        assertEquals(Hit.Node("a"), store.at(ax + 30, ay + mapNodeH / 2))
        // …but not deeper than 14: there it is still the handle, and outward it reaches the whole 44.
        assertEquals(Hit.LinkHandle("a", LinkSide.Left), store.at(ax + 12, ay + mapNodeH / 2))
        assertEquals(Hit.LinkHandle("a", LinkSide.Left), store.at(ax - 40, ay + mapNodeH / 2))
        // A drag on the body still moves the card.
        store.touchDown(1, (ax + 30) * 0.5, (ay + mapNodeH / 2) * 0.5)
        store.touchMove(1, (ax + 30) * 0.5 + 40, (ay + mapNodeH / 2) * 0.5)
        assertEquals("a", store.dragNodeId)
        store.touchUp(1, (ax + 30) * 0.5 + 40, (ay + mapNodeH / 2) * 0.5)
        assertNotEquals(ax, store.nodes["a"]!!.x)
    }

    @Test fun whileTheCardIsDraggedItHasNoControls() {
        val store = store().apply { selection = Selection.Node("a") }
        store.touchDown(1, ax + 100, ay + 80)
        store.touchMove(1, ax + 120, ay + 80)
        assertEquals("a", store.dragNodeId)
        assertEquals(Hit.Node("a"), store.at(store.nodes["a"]!!.x + mapNodeW - 23, store.nodes["a"]!!.y + mapNodeH - 21))
        store.touchesCancelled()
    }

    @Test fun aFiledCardsControlsAreCutByItsRegionAsTheCardIs() {
        val store = store().apply { selection = Selection.Node("f") }
        val fx = gx - 20
        val fy = gy + 120
        // Its left handle lies outside the region's box, where nothing of the card is drawn: no arrow from there.
        assertTrue(store.at(fx - 1, fy + mapNodeH / 2) !is Hit.LinkHandle)
        // Its right one is inside, and works.
        assertEquals(Hit.LinkHandle("f", LinkSide.Right), store.at(fx + mapNodeW + 1, fy + mapNodeH / 2))
    }

    @Test fun aRegionsTitleAndTrashStandWellInFromItsCorner() {
        val store = store()
        // The trash's 28 box 20 in from the top and right: its middle 34 from each.
        assertEquals(Hit.GroupDelete("g"), store.at(gx + gw - 34, gy + 34))
        assertEquals(Hit.GroupDelete("g"), store.at(gx + gw - 34 + 20, gy + 34 - 20))
        // The title's row: 56 tall (it was 43), up to 60 short of the right edge.
        assertEquals(Hit.GroupTitle("g"), store.at(gx + 40, gy + 50))
        assertEquals(Hit.GroupTitle("g"), store.at(gx + gw - 62, gy + 8))
        // Between the two, past the title's 60 and outside the trash's reach, is the region itself.
        assertEquals(Hit.Group("g"), store.at(gx + gw - 58, gy + 8))
        // Below the row, the region (a drag there moves it too, but a tap on it doesn't rename).
        assertEquals(Hit.Group("g"), store.at(gx + 40, gy + 70))
    }

    // Android only: a drag starting in the back gesture's strip went to the system (the page's predictive back).
    @Test fun theSelectedCardsHandlesAreHandedToTheScreensEdge() {
        // Card a's left edge 10 from the screen's left.
        val store = store().apply { camera = MapCamera(10 - ax, 0.0, 1.0) }
        val frame = MapGestureExclusion.Frame(400.0, 800.0, MapGestureExclusion.Span(0.0, 32.0), MapGestureExclusion.Span(368.0, 400.0))
        fun leftCovers(y: Double) = MapGestureExclusion.bands(store.exclusionScene(), frame)
            .any { it.edge == MapGestureExclusion.Edge.Left && y >= it.top && y <= it.bottom }
        assertTrue(store.exclusionScene().handles.isEmpty())
        store.selection = Selection.Node("a")
        assertEquals(4, store.exclusionScene().handles.size)
        // The left handle's band: 64 tall about it.
        val handleY = ay + mapNodeH / 2
        assertTrue(leftCovers(handleY - 31) && leftCovers(handleY + 31))
        // The region's resize corner is handed to the edge too once it lies in the strip.
        store.selection = null
        store.camera = MapCamera(-(gx + gw - 5) + 16, 0.0, 1.0)
        assertTrue(leftCovers(gy + gh - 5))
    }
}
