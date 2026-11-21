package com.resonance.app.thoughtmap

import android.app.Application
import com.resonance.api.models.MapOp
import com.resonance.api.models.MapOpsResponse
import com.resonance.geometry.MapCamera
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.WriterApi
import com.resonance.kit.config.Features
import com.resonance.kit.realtime.SignalHub
import com.resonance.kit.writing.MapOpQueue
import java.util.Collections
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLooper

/**
 * The thought map on the contract's path (Phase 2, client-config's `apiThoughtMap`): a drag is drawn where
 * the finger lifts at once and its op waits its turn (one batch in flight, a card dropped again while its
 * last drop waits is one move); a region appears the moment it is made, under the device's id; a `map`
 * signal reads the map again — never over a change still on its way. With the switch off, the store stays
 * on Firestore. The twin of iOS's ThoughtMapContractTests.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class ThoughtMapContractTest {
    private val server = MockWebServer()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val batches: MutableList<List<MapOp>> = Collections.synchronizedList(mutableListOf())
    private var gate = CompletableDeferred<Unit>()

    @Before fun up() = server.start()

    @After fun down() {
        scope.cancel()
        server.shutdown()
    }

    private fun card(id: String) =
        MapCard(id, "me", slug = null, title = "Card $id", story = "A story.", tags = emptyList(), visibility = "public", publishedAt = null, mediaUrl = null, accentHue = null)

    private fun board() = ThoughtMapStore.Board(
        ThoughtMapService.Loaded(listOf(MapNodeDoc("a", 0.0, 0.0, null), MapNodeDoc("b", 600.0, 400.0, null)), emptyList(), emptyList()),
        mapOf("a" to card("a"), "b" to card("b")),
        emptySet(),
    )

    private fun store(apiThoughtMap: Boolean): ThoughtMapStore {
        val config = ApiConfiguration(server.url("/").toString()) { "token" }
        return ThoughtMapStore(ReadingApi(config)).apply {
            remote = ThoughtMapStore.Remote(WriterApi(config), SignalHub(), MutableStateFlow(true)) { Features(apiThoughtMap = apiThoughtMap) }
            // The batches the server is sent, held until the test lets them through.
            queue = MapOpQueue({ ops -> gate.await(); batches += ops; MapOpsResponse(ops.size, emptyList()) }, scope)
            readBoard = { board() }
            setViewport(1280.0, 800.0)
        }
    }

    private suspend fun loaded(apiThoughtMap: Boolean = true) = store(apiThoughtMap).apply {
        load("me")
        camera = MapCamera(0.0, 0.0, 1.0)
    }

    /** A card dragged by its middle from where it is to world point (x, y), in a few moves. */
    private fun ThoughtMapStore.drag(id: String, x: Double, y: Double) {
        val n = nodes.getValue(id)
        fun sx(wx: Double) = wx * camera.s + camera.x
        fun sy(wy: Double) = wy * camera.s + camera.y
        val fx = sx(n.x + 100)
        val fy = sy(n.y + 60)
        touchDown(1, fx, fy)
        for (k in 1..4) touchMove(1, fx + (sx(x) - fx) * k / 4, fy + (sy(y) - fy) * k / 4)
        touchUp(1, sx(x), sy(y))
        written()
    }

    /** The store's writes are launched on the main thread: let them reach the queue. */
    private fun written() = ShadowLooper.idleMainLooper()

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)

    @Test fun offTheSwitchTheMapStaysOnFirestore() = runBlocking {
        val store = loaded(apiThoughtMap = false)
        store.mapChanged(force = true)
        assertEquals(0, server.requestCount)
        assertTrue(store.queue!!.idle)
        assertEquals(0.0, store.nodes.getValue("a").x, 0.0)
    }

    @Test fun aDragIsDrawnAtOnceAndADropAgainWhileTheLastWaitsIsOneMove() = runBlocking {
        val store = loaded()
        store.drag("a", 300.0, 60.0)
        // Drawn where it was dropped before any answer.
        val first = store.nodes.getValue("a").x
        assertTrue(first > 100)
        store.drag("a", 260.0, 300.0)
        store.drag("a", 200.0, 500.0)
        val waiting = store.queue!!.waiting
        // At most one placement of "a" waits behind the batch in flight.
        assertTrue(waiting.count { it.op == MapOp.Op.moveNode && it.cardId == "a" } <= 1)
        gate.complete(Unit)
        withTimeout(5_000) { store.queue!!.settle() }
        val last = batches.flatten().last { it.op == MapOp.Op.moveNode }
        assertEquals(store.nodes.getValue("a").x, last.x!!, 0.0)
        assertEquals(store.nodes.getValue("a").y, last.y!!, 0.0)
        assertTrue(batches.size <= 2)
    }

    @Test fun aRegionAppearsAtOnceUnderTheDevicesId() = runBlocking {
        val store = loaded()
        store.addGroup()
        val id = store.groupOrder.single()
        assertTrue(Regex("^[A-Za-z0-9]{20}$").matches(id))
        assertNotNull(store.groups[id])
        store.removeNode("b")
        written()
        gate.complete(Unit)
        withTimeout(5_000) { store.queue!!.settle() }
        val ops = batches.flatten()
        assertEquals(MapOp.Op.addGroup, ops.first().op)
        assertEquals(id, ops.first().groupId)
        assertEquals(MapOp.Op.removeNode, ops.last().op)
    }

    @Test fun aSignalReadsTheMapAgainButNeverOverAChangeOnItsWay() = runBlocking {
        val store = loaded()
        val moved = """{"nodes":[{"id":"a","cardId":"a","x":0,"y":0,"groupId":null,"createdAt":null,"updatedAt":null},""" +
            """{"id":"b","cardId":"b","x":900,"y":100,"groupId":null,"createdAt":null,"updatedAt":null}],"edges":[],"groups":[]}"""
        // A change of ours on its way: the server's copy (without it) is not laid over the map.
        store.removeNode("a")
        written()
        server.enqueue(json(moved))
        store.mapChanged()
        assertEquals(0, server.requestCount)
        assertNull(store.nodes["a"])
        gate.complete(Unit)
        withTimeout(5_000) { store.queue!!.settle() }
        // Idle: another device's move of "b" comes in (and "a", which our batch took off, as the server has it).
        server.enqueue(json(moved))
        store.mapChanged()
        assertEquals(900.0, store.nodes.getValue("b").x, 0.0)
        assertEquals(listOf("a", "b"), store.nodeOrder.sorted())
        // The same answer again changes nothing drawn.
        val before = store.nodes.getValue("b")
        server.enqueue(json(moved))
        store.mapChanged()
        assertTrue(before === store.nodes.getValue("b"))
        assertFalse(store.failed)
    }
}
