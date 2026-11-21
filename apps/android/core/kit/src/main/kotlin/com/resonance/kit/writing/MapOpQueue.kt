package com.resonance.kit.writing

import com.resonance.api.models.MapOp
import com.resonance.api.models.MapOpsResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * The thought map's changes on their way (Phase 2, `apiThoughtMap`: POST /me/thought-map/ops). The map
 * shows a change the moment it is made (the store's own state); here it waits its turn: one batch in
 * flight at a time, everything queued meanwhile in the next one (up to [maxOps]), in the order made.
 *
 * Coalescing keeps a drag cheap: a card placed again ([place]: its moveNode, and its setNodeGroup when
 * it leaves a region) takes the place of its earlier placements still waiting, as long as nothing else
 * about that card (an arrow, its removal) waits between them; a region changed again ([MapOp.Op.updateGroup])
 * folds into its earlier change likewise. A batch that fails for now (offline, a server error) goes back
 * first in line and is tried again after [retryDelaysMillis] (or with the next change); one the server
 * refuses (a 4xx: a batch is all or nothing) is dropped and [onRefused] hears of it — the map is read
 * again, as the server has it. Kept in memory, as Firestore's queue was for the map's writes. The twin
 * of iOS's MapOpQueue.
 */
class MapOpQueue(
    private val send: suspend (List<MapOp>) -> MapOpsResponse,
    private val scope: CoroutineScope,
    private val retryDelaysMillis: List<Long> = DraftOutbox.RETRY_DELAYS_MILLIS,
    private val maxOps: Int = MAX_OPS,
    private val sendTimeoutMillis: Long = DraftOutbox.SEND_TIMEOUT_MILLIS,
) {
    /** A batch the server refused (with why): what the map shows may not be what it keeps. */
    var onRefused: (Throwable) -> Unit = {}

    private val queued = ArrayList<MapOp>()
    private var sending = false
    private var loop: Job? = null
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private val idleWaiters = ArrayList<CompletableDeferred<Unit>>()

    /** Nothing waiting and nothing on its way: what the server has is what the map shows. */
    val idle: Boolean @Synchronized get() = queued.isEmpty() && !sending

    /** What waits for the next batch (tests). */
    val waiting: List<MapOp> @Synchronized get() = queued.toList()

    /** Changes, in order. */
    fun add(vararg ops: MapOp) = add(ops.toList())

    @Synchronized
    fun add(ops: List<MapOp>) {
        for (op in ops) {
            if (op.op == MapOp.Op.updateGroup) foldGroupUpdate(op) else queued += op
        }
        go()
    }

    /** A card placed (dropped where it lands, filed or not): its earlier placements still waiting go. */
    @Synchronized
    fun place(cardId: String, ops: List<MapOp>) {
        var i = queued.size - 1
        while (i >= 0) {
            val op = queued[i]
            if (mentions(op, cardId)) {
                if (op.op == MapOp.Op.moveNode || op.op == MapOp.Op.setNodeGroup) queued.removeAt(i) else break
            }
            i--
        }
        queued += ops
        go()
    }

    /** Waits until everything made so far has been sent (or refused). */
    suspend fun settle() {
        val wait = synchronized(this) {
            if (queued.isEmpty() && !sending) null else CompletableDeferred<Unit>().also { idleWaiters += it }
        }
        wait?.await()
    }

    fun stop() {
        loop?.cancel()
        loop = null
    }

    private fun foldGroupUpdate(op: MapOp) {
        val id = op.groupId
        for (i in queued.indices.reversed()) {
            val q = queued[i]
            if (q.groupId != id || q.op == MapOp.Op.moveNode || q.op == MapOp.Op.setNodeGroup) continue
            if (q.op == MapOp.Op.updateGroup) {
                queued.removeAt(i)
                queued += q.copy(
                    title = op.title ?: q.title, hue = op.hue ?: q.hue,
                    x = op.x ?: q.x, y = op.y ?: q.y, w = op.w ?: q.w, h = op.h ?: q.h,
                )
                return
            }
            break
        }
        queued += op
    }

    private fun go() {
        if (loop?.isActive != true) loop = scope.launch { drain() }
        wake.trySend(Unit)
    }

    private suspend fun drain() {
        var failures = 0
        while (true) {
            val batch = synchronized(this) {
                if (queued.isEmpty()) {
                    sending = false
                    idleWaiters.forEach { it.complete(Unit) }
                    idleWaiters.clear()
                    null
                } else {
                    sending = true
                    val n = minOf(maxOps, queued.size)
                    ArrayList(queued.subList(0, n)).also { repeat(n) { queued.removeAt(0) } }
                }
            }
            if (batch == null) {
                wake.receive()
                continue
            }
            try {
                // A batch whose call never ends is let go and sent again (as the draft outbox's attempts).
                withTimeoutOrNull(sendTimeoutMillis) { send(batch) } ?: throw java.io.InterruptedIOException("map ops timed out")
                failures = 0
            } catch (e: CancellationException) {
                synchronized(this) { queued.addAll(0, batch); sending = false }
                throw e
            } catch (e: Exception) {
                if (DraftOutbox.refused(e)) {
                    failures = 0
                    onRefused(e)
                    continue
                }
                synchronized(this) { queued.addAll(0, batch) }
                val wait = retryDelaysMillis[failures.coerceAtMost(retryDelaysMillis.lastIndex)]
                failures++
                withTimeoutOrNull(wait) { wake.receive() }
            }
        }
    }

    companion object {
        /** MapOpsRequest's maxItems. */
        const val MAX_OPS = 200

        private fun mentions(op: MapOp, cardId: String): Boolean =
            op.cardId == cardId || op.sourceCardId == cardId || op.targetCardId == cardId ||
                (op.op == MapOp.Op.removeEdge || op.op == MapOp.Op.setEdgeLabel) && op.id?.let { it.startsWith("${cardId}_") || it.endsWith("_$cardId") } == true
    }
}
