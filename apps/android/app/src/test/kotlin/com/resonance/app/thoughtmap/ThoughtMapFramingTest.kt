package com.resonance.app.thoughtmap

import android.app.Application
import com.resonance.geometry.MapCamera
import com.resonance.geometry.Rect
import com.resonance.geometry.fitCamera
import com.resonance.geometry.mapNodeRect
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.l10n.Strings
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Round 13: the thought map — the screen and the writer's map beside its pane — opens doing what
 * 顯示全部 (👁) does, every card and region framed in what it shows; until the reader pans, pinches
 * or zooms it, every change of that size (the pane easing open, the divider let go, the tablet
 * turned), a card opened in the pane and a read arriving after the map has its size frame it again;
 * after that the pane's card glides to the middle as before, and 顯示全部 hands the camera back.
 * The twin of the web's ThoughtMapCanvas.focus.test.tsx (`followFitRef`).
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class ThoughtMapFramingTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun card(id: String) = MapCard(id, "alice", slug = id, title = "Card $id", story = "# $id", tags = emptyList(), visibility = "public", publishedAt = 1L, mediaUrl = null, accentHue = null)

    private val board = ThoughtMapService.Loaded(
        nodes = listOf(
            MapNodeDoc("a", 40.0, 60.0, "g"),
            MapNodeDoc("b", 900.0, 500.0, null),
            MapNodeDoc("c", -300.0, 1100.0, null),
        ),
        edges = emptyList(),
        groups = listOf(MapGroupDoc("g", "回憶", 88.0, 0.0, 0.0, 460.0, 340.0)),
    )
    private val everything: List<Rect> =
        listOf(mapNodeRect(40.0, 60.0), mapNodeRect(900.0, 500.0), mapNodeRect(-300.0, 1100.0), Rect(0.0, 0.0, 460.0, 340.0))

    private fun framed(w: Double, h: Double): MapCamera = fitCamera(everything, w, h)

    /** A map that has read its board (the session's store, as a visit finds it). */
    private fun store(w: Double = 1280.0, h: Double = 800.0) = ThoughtMapStore(ReadingApi(ApiConfiguration("http://localhost/") { "token" })).apply {
        setViewport(w, h)
        place(board, listOf("a", "b", "c").associateWith(::card), emptySet())
    }

    /** One finger on the empty paper at the top-left corner (the fit leaves 70 of margin), dragged [dx] across. */
    private fun ThoughtMapStore.pan(dx: Double) {
        touchDown(1, 10.0, 10.0)
        touchMove(1, 10.0 + dx, 10.0)
        touchUp(1, 10.0 + dx, 10.0)
    }

    // A held divider once framed everything on every frame of the drag, zooming every card under the finger.
    @Test fun aHeldDividerHoldsTheCameraUntilItIsLetGo() {
        val store = store()
        val before = store.camera
        store.resizing = true
        store.setViewport(1000.0, 800.0)
        store.setViewport(900.0, 800.0)
        assertEquals(before, store.camera)
        assertEquals(900.0, store.viewportW, 0.0)
        store.resizing = false
        assertEquals(framed(900.0, 800.0), store.camera)
    }

    @Test fun theBoardReadAfterTheMapHasItsSizeArrivesFramed() {
        val store = ThoughtMapStore(ReadingApi(ApiConfiguration("http://localhost/") { "token" }))
        store.setViewport(1280.0, 800.0)
        // Nothing read yet: nothing to frame.
        assertEquals(MapCamera(0.0, 0.0, 1.0), store.camera)
        store.place(board, listOf("a", "b", "c").associateWith(::card), emptySet())
        assertTrue(store.framing)
        assertEquals(framed(1280.0, 800.0), store.camera)
    }

    @Test fun untilTheReaderMovesItEverySizeTheMapTakesFramesEverythingAgain() {
        val store = store()
        // The writer's pane easing open beside it, frame by frame, then settled at half the width.
        for (w in listOf(1100.0, 900.0, 700.0, 640.0)) {
            store.setViewport(w, 800.0)
            assertEquals(framed(w, 800.0), store.camera)
        }
        // Settled beside the pane: still everything, no glide to the pane's card.
        assertNull(store.settledBesidePane("a"))
        assertEquals(framed(640.0, 800.0), store.camera)
        // The tablet turned.
        store.setViewport(400.0, 1180.0)
        assertEquals(framed(400.0, 1180.0), store.camera)
        // A tap on the paper, or a finger that moved no more than the 4px rule, isn't the reader's move.
        store.pan(3.0)
        assertTrue(store.framing)
        store.setViewport(640.0, 800.0)
        assertEquals(framed(640.0, 800.0), store.camera)
    }

    @Test fun aPanPinchOrZoomKeepsTheCameraWhereTheReaderPutsIt() {
        val pan = store().apply { pan(40.0) }
        assertFalse(pan.framing)
        val panned = pan.camera
        assertEquals(framed(1280.0, 800.0).x + 40.0, panned.x, 1e-9)
        pan.setViewport(640.0, 800.0)
        assertEquals(panned, pan.camera)
        // Settled beside the pane now: the pane's card to the middle of the map, at the reader's zoom (today's glide).
        val r = mapNodeRect(40.0, 60.0)
        assertEquals(ThoughtMapStore.centredOn(panned, r, 640.0, 800.0), pan.settledBesidePane("a"))
        assertEquals(panned, pan.camera)

        val zoom = store().apply { zoom(1.25) }
        assertFalse(zoom.framing)
        val zoomed = zoom.camera
        zoom.setViewport(640.0, 800.0)
        assertEquals(zoomed, zoom.camera)

        val pinch = store()
        pinch.touchDown(1, 10.0, 10.0)
        pinch.touchDown(2, 60.0, 10.0)
        pinch.touchMove(2, 110.0, 10.0)
        pinch.touchUp(2, 110.0, 10.0)
        pinch.touchUp(1, 10.0, 10.0)
        assertFalse(pinch.framing)
        assertNotEquals(framed(1280.0, 800.0).s, pinch.camera.s)
    }

    @Test fun showAllHandsTheCameraBackAndEveryVisitOpensFramed() {
        val store = store().apply { pan(40.0) }
        store.fit()
        assertTrue(store.framing)
        assertEquals(framed(1280.0, 800.0), store.camera)
        store.setViewport(640.0, 800.0)
        assertEquals(framed(640.0, 800.0), store.camera)

        // The session keeps the store between visits: the next one doesn't open where the last left the camera.
        store.zoom(1.25)
        assertFalse(store.framing)
        store.visit()
        assertTrue(store.framing)
        assertEquals(framed(640.0, 800.0), store.camera)
    }
}
