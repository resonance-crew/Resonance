package com.resonance.kit.writing

import com.resonance.api.models.MapOp
import com.resonance.api.models.MapOpsResponse
import com.resonance.kit.api.ApiFailure
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.io.IOException
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The thought map's changes on the contract's path (Phase 2, `apiThoughtMap`): one batch in flight, the
 * rest in the next one, in the order made; a card dragged again while its last drop is waiting is one
 * move; offline a batch waits first in line; a refused one is dropped and the map read again.
 */
class MapOpQueueTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @AfterTest fun tearDown() = scope.cancel()

    private class Server {
        val batches = java.util.Collections.synchronizedList(mutableListOf<List<MapOp>>())
        @Volatile var gate: CompletableDeferred<Unit>? = null
        @Volatile var failNext = 0
        @Volatile var failure: Exception = IOException("offline")
        @Volatile var inFlight = 0
        @Volatile var mostInFlight = 0

        suspend fun send(ops: List<MapOp>): MapOpsResponse {
            inFlight++
            mostInFlight = maxOf(mostInFlight, inFlight)
            try {
                gate?.await()
                batches += ops
                if (failNext > 0) {
                    failNext--
                    throw failure
                }
                return MapOpsResponse(ops.size, emptyList())
            } finally {
                inFlight--
            }
        }
    }

    private fun move(id: String, x: Double, group: String? = "g") = MapOp(MapOp.Op.moveNode, cardId = id, x = x, y = 0.0, groupId = group)

    private fun List<MapOp>.names() = map { op -> listOfNotNull(op.op.value, op.cardId ?: op.groupId ?: op.id, op.x?.toInt()?.toString(), op.title).joinToString(" ") }

    private suspend fun eventually(check: () -> Boolean) = withTimeout(5_000) { while (!check()) delay(5) }

    @Test fun oneBatchInFlightAndWhatCameMeanwhileGoesNextInOrder() = runBlocking {
        val server = Server().apply { gate = CompletableDeferred() }
        val queue = MapOpQueue(server::send, scope)
        queue.add(MapOp(MapOp.Op.addNode, cardId = "a", x = 1.0, y = 1.0))
        eventually { server.inFlight == 1 }
        queue.add(MapOp(MapOp.Op.addNode, cardId = "b", x = 2.0, y = 2.0))
        queue.add(MapOp(MapOp.Op.addEdge, sourceCardId = "a", targetCardId = "b"))
        queue.add(MapOp(MapOp.Op.removeNode, cardId = "c"))
        server.gate!!.complete(Unit)
        withTimeout(5_000) { queue.settle() }
        assertEquals(1, server.mostInFlight)
        assertEquals(listOf(listOf("addNode a 1"), listOf("addNode b 2", "addEdge", "removeNode c")), server.batches.map { it.names() })
        assertTrue(queue.idle)
    }

    @Test fun aCardDroppedAgainWhileItsLastDropWaitsIsOneMove() = runBlocking {
        val server = Server().apply { gate = CompletableDeferred() }
        val queue = MapOpQueue(server::send, scope)
        queue.add(MapOp(MapOp.Op.addNode, cardId = "x", x = 0.0, y = 0.0))
        eventually { server.inFlight == 1 }
        // Three drops of "a" (the last out of every region: move + unfile), one of "b" between them.
        queue.place("a", listOf(move("a", 10.0)))
        queue.place("b", listOf(move("b", 5.0)))
        queue.place("a", listOf(move("a", 20.0)))
        queue.place("a", listOf(move("a", 30.0, group = null), MapOp(MapOp.Op.setNodeGroup, cardId = "a")))
        assertEquals(listOf("moveNode b 5", "moveNode a 30", "setNodeGroup a"), queue.waiting.names())
        server.gate!!.complete(Unit)
        withTimeout(5_000) { queue.settle() }
        assertEquals(listOf("moveNode b 5", "moveNode a 30", "setNodeGroup a"), server.batches.last().names())
    }

    @Test fun anArrowBetweenTwoDropsKeepsBothDrops() = runBlocking {
        val server = Server().apply { gate = CompletableDeferred() }
        val queue = MapOpQueue(server::send, scope)
        queue.add(MapOp(MapOp.Op.addNode, cardId = "x", x = 0.0, y = 0.0))
        eventually { server.inFlight == 1 }
        queue.place("a", listOf(move("a", 10.0)))
        queue.add(MapOp(MapOp.Op.removeNode, cardId = "a"))
        queue.add(MapOp(MapOp.Op.addNode, cardId = "a", x = 0.0, y = 0.0))
        queue.place("a", listOf(move("a", 20.0)))
        assertEquals(listOf("moveNode a 10", "removeNode a", "addNode a 0", "moveNode a 20"), queue.waiting.names())
        server.gate!!.complete(Unit)
        withTimeout(5_000) { queue.settle() }
    }

    @Test fun aRegionChangedAgainIsOneUpdate() = runBlocking {
        val server = Server().apply { gate = CompletableDeferred() }
        val queue = MapOpQueue(server::send, scope)
        queue.add(MapOp(MapOp.Op.addNode, cardId = "x", x = 0.0, y = 0.0))
        eventually { server.inFlight == 1 }
        queue.add(MapOp(MapOp.Op.updateGroup, groupId = "g", w = 400.0, h = 300.0))
        queue.add(MapOp(MapOp.Op.updateGroup, groupId = "g", title = "Walks"))
        val waiting = queue.waiting.single()
        assertEquals(400.0, waiting.w)
        assertEquals("Walks", waiting.title)
        server.gate!!.complete(Unit)
        withTimeout(5_000) { queue.settle() }
    }

    @Test fun offlineABatchWaitsFirstInLineAndGoesWhenTheNetworkComesBack() = runBlocking {
        val server = Server().apply { failNext = 2 }
        val queue = MapOpQueue(server::send, scope, retryDelaysMillis = listOf(10L))
        queue.add(MapOp(MapOp.Op.addNode, cardId = "a", x = 1.0, y = 1.0))
        eventually { server.batches.size >= 1 }
        queue.add(MapOp(MapOp.Op.removeEdge, id = "a_b"))
        withTimeout(5_000) { queue.settle() }
        // Every try sends the same changes in the same order; the last one has them all.
        assertEquals(listOf("addNode a 1", "removeEdge a_b"), server.batches.last().names())
        assertTrue(server.batches.all { it.first().op == MapOp.Op.addNode })
    }

    @Test fun aRefusedBatchIsDroppedAndSaidSo() = runBlocking {
        val server = Server().apply { failNext = 1; failure = ApiFailure("invalid_request", "An arrow joins two different cards.", 400) }
        val queue = MapOpQueue(server::send, scope)
        val refused = CompletableDeferred<Throwable>()
        queue.onRefused = { refused.complete(it) }
        queue.add(MapOp(MapOp.Op.addEdge, sourceCardId = "a", targetCardId = "a"))
        assertEquals(400, (withTimeout(5_000) { refused.await() } as ApiFailure).status)
        withTimeout(5_000) { queue.settle() }
        assertEquals(1, server.batches.size)
    }

    @Test fun aBatchCarriesAtMostTheContractsLimit() = runBlocking {
        val server = Server().apply { gate = CompletableDeferred() }
        val queue = MapOpQueue(server::send, scope, maxOps = 3)
        queue.add(MapOp(MapOp.Op.addNode, cardId = "x", x = 0.0, y = 0.0))
        eventually { server.inFlight == 1 }
        queue.add((1..7).map { MapOp(MapOp.Op.removeNode, cardId = "n$it") })
        server.gate!!.complete(Unit)
        withTimeout(5_000) { queue.settle() }
        assertEquals(listOf(1, 3, 3, 1), server.batches.map { it.size })
    }
}
