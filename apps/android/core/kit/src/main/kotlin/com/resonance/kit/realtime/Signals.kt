package com.resonance.kit.realtime

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * `signals/{uid}` (Phase 2): the one document the app listens to, numbers only — each a counter
 * the server raises when something of that topic changed for this person. A rise says "pull the
 * matching GET again"; it never carries what changed. An absent counter is 0.
 */
data class Signals(
    val inbox: Long = 0,
    val bell: Long = 0,
    val graph: Long = 0,
    val map: Long = 0,
    val drafts: Long = 0,
    /** Per conversation the person is in, by pair id. */
    val threads: Map<String, Long> = emptyMap(),
) {
    enum class Topic { Inbox, Bell, Graph, Map, Drafts }

    operator fun get(topic: Topic): Long = when (topic) {
        Topic.Inbox -> inbox
        Topic.Bell -> bell
        Topic.Graph -> graph
        Topic.Map -> map
        Topic.Drafts -> drafts
    }

    fun thread(pair: String): Long = threads[pair] ?: 0

    companion object {
        /** The document's fields as Firestore hands them (numbers as Long or Double); anything odd reads as 0. */
        fun of(data: Map<String, Any?>?): Signals {
            data ?: return Signals()
            fun n(v: Any?): Long = (v as? Number)?.toLong()?.coerceAtLeast(0) ?: 0
            val threads = (data["threads"] as? Map<*, *>)?.mapNotNull { (k, v) -> (k as? String)?.let { it to n(v) } }?.toMap().orEmpty()
            return Signals(n(data["inbox"]), n(data["bell"]), n(data["graph"]), n(data["map"]), n(data["drafts"]), threads)
        }
    }
}

/**
 * Where the stores hear the signal: the listener ([publish]) on one side, a Flow per topic on the
 * other. Each flow says the counter's value whenever it changes (its first value too: a store
 * pulls once more as the listener first answers, which an ETag makes a 304 when nothing moved).
 */
class SignalHub {
    private val _state = MutableStateFlow<Signals?>(null)
    /** The document as last read; null before the listener has answered (or with no listener: the flag off). */
    val state: StateFlow<Signals?> = _state

    /** The listener reported an error and is over until it answers again: no one can say what moved meanwhile. */
    @Volatile private var failed = false

    fun publish(signals: Signals?) {
        failed = false
        _state.value = signals
    }

    /** The listener failed ([live] says nothing until its next answer); the counters as last heard stay in [state]. */
    fun fail() {
        failed = true
    }

    /**
     * The counters as last heard while the listener is live — what a pull compares with the counters
     * at its last read to read only what moved (the conversation list's `?pairs=`, the web's
     * `heardCounters`). Null while no one can say what moved: no listener (the flag off, signed
     * out), one that hasn't answered yet, or one that failed and hasn't answered since.
     */
    fun live(): Signals? = if (failed) null else _state.value

    fun topic(topic: Signals.Topic): Flow<Long> = _state.filterNotNull().map { it[topic] }.distinctUntilChanged()
    fun thread(pair: String): Flow<Long> = _state.filterNotNull().map { it.thread(pair) }.distinctUntilChanged()
}

/**
 * Keeps a store current without a listener of its own: [pull] runs once now, whenever [triggers]
 * says something (a signal's counter moving), and every [everyMillis] while [foreground] is true
 * (the safety pull: writes no signal follows — an old build's straight to Firestore). Pulls never
 * overlap; asks while one runs fold into one more after it. A pull that throws is let go (the next
 * ask tries again). Cancel the job to stop.
 */
fun CoroutineScope.launchPulls(
    triggers: Flow<Any?>,
    foreground: StateFlow<Boolean>,
    everyMillis: Long = SAFETY_PULL_MILLIS,
    pull: suspend () -> Unit,
): Job = launch {
    val asks = Channel<Unit>(Channel.CONFLATED)
    asks.trySend(Unit)
    launch { triggers.collect { asks.trySend(Unit) } }
    launch {
        foreground.collectLatest { shown ->
            if (!shown) return@collectLatest
            while (true) {
                delay(everyMillis)
                asks.trySend(Unit)
            }
        }
    }
    for (ask in asks) {
        try {
            pull()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Offline, the server busy: the next signal or minute asks again.
        }
    }
}

/** A minute: the foreground's safety pull. */
const val SAFETY_PULL_MILLIS = 60_000L
