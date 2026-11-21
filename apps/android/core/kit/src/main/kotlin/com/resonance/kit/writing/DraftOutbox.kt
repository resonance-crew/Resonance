package com.resonance.kit.writing

import com.resonance.api.models.CreateDraftRequest
import com.resonance.api.models.CreatedDraft
import com.resonance.api.models.DraftSaved
import com.resonance.api.models.PendingEditRequest
import com.resonance.api.models.UpdateDraftRequest
import com.resonance.kit.api.ApiFailure
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The writer's words on their way to the server (Phase 2, `apiDrafts`): what Firestore's own offline
 * queue did for the straight writes — every create, autosave, pending edit, discard and delete kept on
 * the device the moment it is issued ([Storage], so a killed app or a phone offline loses nothing), sent
 * one at a time in the order issued, and sent again until the server has it. The twin of iOS's
 * DraftOutbox and the web's draft outbox.
 *
 * - **rev**: each draft (and each card's pending edit) counts its saves here, kept with the queue; a save
 *   carries the next number, and the server applies it only above the one it holds. A late or repeated
 *   save is answered `applied: false` with the stored number: when this device's words are still the
 *   newest it holds (they are: it sends only its latest), it resends them once under `stored + 1`.
 * - **coalescing**: a save waiting behind another write of the same card takes the place of the save
 *   still waiting before it (both carry every field, the newer wins), and one waiting on the card's
 *   create goes into the create — a draft made offline and typed into is one request when the network
 *   comes back. A request already tried (it may have reached the server) is never folded away.
 * - **failures**: a refusal (a 4xx but 401, 408 and 429: the card in the trash, an id in use, a card gone)
 *   drops that request and fails its callers with the [ApiFailure]; anything else (offline, a timeout,
 *   a token to refresh, the server busy) leaves it first in line, tried again after [retryDelaysMillis] or at [kick].
 *
 * Callers wait for their own request to be taken ([create], [save], [saveEdit], …) — as a Firestore
 * write's `await` did, which offline never returned until the network came back — and [settle] waits for
 * everything of one card, as publish, edits/apply and discard must (the server works from what it holds).
 */
class DraftOutbox(
    private val storage: Storage,
    private val sender: Sender,
    private val scope: CoroutineScope,
    private val retryDelaysMillis: List<Long> = RETRY_DELAYS_MILLIS,
) {
    /** Where the queue lives between launches (the app: SharedPreferences, per account). */
    interface Storage {
        fun read(): String?
        fun write(value: String?)
    }

    /** The calls the queue makes (the app: [com.resonance.kit.api.WriterApi] and DELETE /cards/{id}). */
    interface Sender {
        suspend fun create(request: CreateDraftRequest): CreatedDraft
        suspend fun save(cardId: String, request: UpdateDraftRequest): DraftSaved
        suspend fun saveEdit(cardId: String, request: PendingEditRequest): DraftSaved
        suspend fun discardEdit(cardId: String)
        suspend fun delete(cardId: String)
    }

    @Serializable
    enum class Kind { Create, Save, Edit, DiscardEdit, Delete }

    /** One request on its way. [tried]: sent at least once — it may have reached the server. */
    @Serializable
    data class Op(
        val seq: Long,
        val cardId: String,
        val kind: Kind,
        val create: CreateDraftRequest? = null,
        val save: UpdateDraftRequest? = null,
        val edit: PendingEditRequest? = null,
        val tried: Boolean = false,
        val resent: Boolean = false,
    )

    @Serializable
    data class State(val next: Long = 1, val ops: List<Op> = emptyList(), val revs: Map<String, Int> = emptyMap())

    private val lock = Mutex()
    @Volatile private var state: State = storage.read()?.let(::decode) ?: State()
    private var inFlight: Long? = null
    private val waiters = HashMap<Long, MutableList<CompletableDeferred<Unit>>>()
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private var loop: Job? = null

    /** What is still on its way (for tests and the writer's reopen). */
    val ops: List<Op> get() = state.ops

    /** The last save number used for [cardId]'s draft / pending edit. */
    fun rev(cardId: String, edit: Boolean = false): Int = state.revs[revKey(cardId, edit)] ?: 0

    /** Starts sending (at sign-in: what a last launch left goes first). */
    fun start() {
        if (loop?.isActive == true) return
        loop = scope.launch { drain() }
        wake.trySend(Unit)
    }

    /** Stops sending (sign-out); what is queued stays unless [forget] empties it. */
    fun stop() {
        loop?.cancel()
        loop = null
        inFlight = null
    }

    /** The network may be back (the app in the foreground again): what waits is tried now. */
    fun kick() {
        wake.trySend(Unit)
    }

    /** The account is gone from this device: its queue too. */
    suspend fun forget() {
        stop()
        lock.withLock {
            state = State()
            storage.write(null)
            waiters.values.flatten().forEach { it.cancel() }
            waiters.clear()
        }
    }

    /**
     * The newest words this device holds for [cardId] and hasn't had taken yet: the last create or save
     * of its draft, or the last pending edit — what reopening the card must show over the server's copy.
     */
    fun pending(cardId: String): Op? = state.ops.lastOrNull { it.cardId == cardId && it.kind in WORDS }

    suspend fun create(request: CreateDraftRequest) = enqueue(request.id, Kind.Create) { copy(create = request) }

    /** An autosave of [cardId]'s draft: [request]'s `rev` is replaced by the next number. */
    suspend fun save(cardId: String, request: UpdateDraftRequest) = enqueue(cardId, Kind.Save) { revs ->
        val rev = (revs[revKey(cardId, false)] ?: 0) + 1
        copy(save = request.copy(rev = rev))
    }

    /** An autosave of [cardId]'s pending edit: [request]'s `rev` is replaced by the next number. */
    suspend fun saveEdit(cardId: String, request: PendingEditRequest) = enqueue(cardId, Kind.Edit) { revs ->
        val rev = (revs[revKey(cardId, true)] ?: 0) + 1
        copy(edit = request.copy(rev = rev))
    }

    suspend fun discardEdit(cardId: String) = enqueue(cardId, Kind.DiscardEdit) { this }

    suspend fun delete(cardId: String) = enqueue(cardId, Kind.Delete) { this }

    /** Waits until nothing of [cardId] is left to send; a refusal of one of them fails it. */
    suspend fun settle(cardId: String) {
        val waits = lock.withLock { state.ops.filter { it.cardId == cardId }.map { waiterOf(it.seq) } }
        waits.forEach { it.await() }
    }

    private suspend fun enqueue(cardId: String, kind: Kind, fill: Op.(Map<String, Int>) -> Op) {
        val wait = lock.withLock {
            val ops = state.ops.toMutableList()
            var revs = state.revs
            val base = fill(Op(seq = state.next, cardId = cardId, kind = kind), revs)
            base.save?.let { revs = revs + (revKey(cardId, false) to it.rev) }
            base.edit?.let { revs = revs + (revKey(cardId, true) to it.rev) }
            val lastIndex = ops.indexOfLast { it.cardId == cardId }
            val last = ops.getOrNull(lastIndex)
            val waitable = last != null && last.seq != inFlight && !last.tried
            val seq: Long = when {
                // The save still waiting takes the newer words in its place.
                waitable && kind == Kind.Save && last!!.kind == Kind.Save -> {
                    ops[lastIndex] = last.copy(save = base.save); last.seq
                }
                waitable && kind == Kind.Edit && last!!.kind == Kind.Edit -> {
                    ops[lastIndex] = last.copy(edit = base.edit); last.seq
                }
                // A draft made and typed into before it could be sent goes as one create.
                waitable && kind == Kind.Save && last!!.kind == Kind.Create -> {
                    ops[lastIndex] = last.copy(create = fold(last.create!!, base.save!!)); last.seq
                }
                // An edit never sent and then discarded: neither need go.
                waitable && kind == Kind.DiscardEdit && last!!.kind == Kind.Edit -> {
                    ops.removeAt(lastIndex)
                    finish(last.seq, null)
                    ops += base
                    base.seq
                }
                // A draft that never reached the server and is let go of: nothing is sent at all.
                kind == Kind.Delete && ops.filter { it.cardId == cardId }.let { mine -> mine.isNotEmpty() && mine.none { it.tried || it.seq == inFlight } && mine.first().kind == Kind.Create } -> {
                    val gone = ops.filter { it.cardId == cardId }
                    ops.removeAll(gone)
                    gone.forEach { finish(it.seq, null) }
                    0L
                }
                else -> {
                    ops += base
                    base.seq
                }
            }
            commit(state.copy(next = state.next + 1, ops = ops, revs = revs))
            if (seq == 0L) null else waiterOf(seq)
        }
        wake.trySend(Unit)
        wait?.await()
    }

    private fun waiterOf(seq: Long): CompletableDeferred<Unit> =
        CompletableDeferred<Unit>().also { waiters.getOrPut(seq) { mutableListOf() } += it }

    private fun finish(seq: Long, error: Throwable?) {
        waiters.remove(seq)?.forEach { if (error == null) it.complete(Unit) else it.completeExceptionally(error) }
    }

    /** Kept on the device first, then in force: nothing is sent, or said to be queued, that a kill could lose. */
    private fun commit(next: State) {
        storage.write(if (next.ops.isEmpty() && next.revs.isEmpty()) null else json.encodeToString(State.serializer(), next))
        state = next
    }

    private suspend fun drain() {
        var failures = 0
        while (true) {
            val op = lock.withLock {
                state.ops.firstOrNull()?.also { first ->
                    inFlight = first.seq
                    if (!first.tried) commit(state.copy(ops = state.ops.map { if (it.seq == first.seq) it.copy(tried = true) else it }))
                }
            }
            if (op == null) {
                wake.receive()
                continue
            }
            val outcome = try {
                Result.success(send(op))
            } catch (e: CancellationException) {
                lock.withLock { inFlight = null }
                throw e
            } catch (e: Exception) {
                // Taking away what is already gone is done.
                if (op.kind in GOING && (e as? ApiFailure)?.status == 404) Result.success(Unit) else Result.failure(e)
            }
            val error = outcome.exceptionOrNull()
            if (error != null && !refused(error)) {
                lock.withLock { inFlight = null }
                val wait = retryDelaysMillis[failures.coerceAtMost(retryDelaysMillis.lastIndex)]
                failures++
                withTimeoutOrNull(wait) { wake.receive() }
                continue
            }
            failures = 0
            lock.withLock {
                inFlight = null
                val answer = outcome.getOrNull()
                val resend = (answer as? DraftSaved)?.let { staleResend(op, it) }
                var revs = state.revs
                when (answer) {
                    is CreatedDraft -> revs = revs + (revKey(op.cardId, false) to maxOf(revs[revKey(op.cardId, false)] ?: 0, answer.rev))
                    is DraftSaved -> {
                        val key = revKey(op.cardId, op.kind == Kind.Edit)
                        revs = revs + (key to maxOf(revs[key] ?: 0, answer.rev, resend?.let { r -> r.save?.rev ?: r.edit?.rev } ?: 0))
                    }
                }
                // A pending edit applied or dropped: its count may start again, as the server's does.
                if (op.kind == Kind.DiscardEdit) revs = revs - revKey(op.cardId, true)
                if (op.kind == Kind.Delete) revs = revs - revKey(op.cardId, false) - revKey(op.cardId, true)
                val ops = if (resend != null) state.ops.map { if (it.seq == op.seq) resend else it } else state.ops.filter { it.seq != op.seq }
                commit(state.copy(ops = ops, revs = revs))
                if (resend == null) finish(op.seq, error)
            }
        }
    }

    /** `applied: false` with a stored number at or past this one's: this device's words, once more above it. */
    private fun staleResend(op: Op, answer: DraftSaved): Op? {
        if (answer.applied || op.resent) return null
        val next = answer.rev + 1
        return when (op.kind) {
            Kind.Save -> op.save?.takeIf { answer.rev >= it.rev }?.let { op.copy(save = it.copy(rev = next), resent = true) }
            Kind.Edit -> op.edit?.takeIf { answer.rev >= it.rev }?.let { op.copy(edit = it.copy(rev = next), resent = true) }
            else -> null
        }
    }

    private suspend fun send(op: Op): Any = when (op.kind) {
        Kind.Create -> sender.create(op.create!!)
        Kind.Save -> sender.save(op.cardId, op.save!!)
        Kind.Edit -> sender.saveEdit(op.cardId, op.edit!!)
        Kind.DiscardEdit -> sender.discardEdit(op.cardId)
        Kind.Delete -> sender.delete(op.cardId)
    }

    companion object {
        /** Offline or a server error: tried again after these waits (the last repeats), or at once on [kick]. */
        val RETRY_DELAYS_MILLIS = listOf(1_000L, 2_000L, 5_000L, 15_000L, 30_000L)
        private val WORDS = setOf(Kind.Create, Kind.Save, Kind.Edit)
        private val GOING = setOf(Kind.DiscardEdit, Kind.Delete)
        private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

        private fun revKey(cardId: String, edit: Boolean) = (if (edit) "e:" else "d:") + cardId

        /** A queue this build can't read is none (its words were the server's to keep by then, or lost with a downgrade). */
        fun decode(text: String): State? = runCatching { json.decodeFromString(State.serializer(), text) }.getOrNull()

        /**
         * A refusal the server will give again: the request goes, and its callers hear why. Not a 401 (a token
         * that is refreshed and tried again), a 408 or a 429: those words wait and go later.
         */
        fun refused(e: Throwable): Boolean {
            val status = (e as? ApiFailure)?.status ?: return false
            return status in 400..499 && status != 401 && status != 408 && status != 429
        }

        /** [create] with [save]'s fields over it (a save carries every field; `clear` takes the cover or hue away). */
        fun fold(create: CreateDraftRequest, save: UpdateDraftRequest): CreateDraftRequest {
            val clear = save.clear.orEmpty()
            return create.copy(
                thoughtCore = save.thoughtCore ?: create.thoughtCore,
                story = save.story ?: create.story,
                tags = save.tags ?: create.tags,
                visibility = save.visibility?.let { v -> CreateDraftRequest.Visibility.entries.firstOrNull { it.value == v.value } } ?: create.visibility,
                anonymous = save.anonymous ?: create.anonymous,
                media = if (UpdateDraftRequest.Clear.media in clear) null else save.media ?: create.media,
                accentHue = if (UpdateDraftRequest.Clear.accentHue in clear) null else save.accentHue ?: create.accentHue,
            )
        }
    }
}
