package com.resonance.kit

import com.resonance.kit.realtime.SignalHub
import com.resonance.kit.realtime.Signals
import com.resonance.kit.realtime.launchPulls
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * `signals/{uid}` → the stores' pulls: a counter that moves pulls its list again once (the
 * listener's first answer too), other topics don't; while the app is on screen a minute's safety
 * pull runs regardless, in the background none; asks during a pull fold into one more.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SignalsTest {
    @Test fun theDocumentReadsAsCountersAnOddFieldAsZero() {
        val s = Signals.of(mapOf("v" to 1L, "inbox" to 3L, "bell" to 2.0, "graph" to "x", "threads" to mapOf("a_b" to 4L, 7 to 1L)))
        assertEquals(Signals(inbox = 3, bell = 2, graph = 0, threads = mapOf("a_b" to 4L)), s)
        assertEquals(0, s.thread("a_c"))
        assertEquals(Signals(), Signals.of(null))
    }

    @Test fun aMovingCounterPullsItsTopicOnly() = runTest {
        val hub = SignalHub()
        val foreground = MutableStateFlow(false)
        var inboxPulls = 0
        var threadPulls = 0
        val inbox = backgroundScope.launchPulls(hub.topic(Signals.Topic.Inbox), foreground) { inboxPulls++ }
        val thread = backgroundScope.launchPulls(hub.thread("a_b"), foreground) { threadPulls++ }
        runCurrent()
        // Started: one pull each, before any signal.
        assertEquals(1, inboxPulls)
        hub.publish(Signals(inbox = 1))
        runCurrent()
        // The listener's first answer pulls once more (a 304 when nothing moved).
        assertEquals(2, inboxPulls)
        assertEquals(2, threadPulls)
        hub.publish(Signals(inbox = 1, bell = 5))
        runCurrent()
        assertEquals(2, inboxPulls)
        hub.publish(Signals(inbox = 2, bell = 5, threads = mapOf("a_b" to 1)))
        runCurrent()
        assertEquals(3, inboxPulls)
        assertEquals(3, threadPulls)
        hub.publish(Signals(inbox = 2, bell = 5, threads = mapOf("a_b" to 1, "a_c" to 9)))
        runCurrent()
        assertEquals(3, threadPulls)
        inbox.cancel()
        thread.cancel()
    }

    @Test fun aMinutesSafetyPullOnlyOnScreen() = runTest {
        val foreground = MutableStateFlow(true)
        var pulls = 0
        val job = backgroundScope.launchPulls(SignalHub().topic(Signals.Topic.Bell), foreground, everyMillis = 60_000) { pulls++ }
        runCurrent()
        assertEquals(1, pulls)
        advanceTimeBy(60_001)
        assertEquals(2, pulls)
        foreground.value = false
        runCurrent()
        advanceTimeBy(300_000)
        assertEquals(2, pulls)
        foreground.value = true
        runCurrent()
        advanceTimeBy(60_001)
        assertEquals(3, pulls)
        job.cancel()
    }

    @Test fun asksDuringAPullFoldIntoOneMoreAndAFailureIsLetGo() = runTest {
        val hub = SignalHub()
        var pulls = 0
        val job = backgroundScope.launchPulls(hub.topic(Signals.Topic.Graph), MutableStateFlow(false)) {
            pulls++
            if (pulls == 1) {
                // While the first pull runs, three moves.
                hub.publish(Signals(graph = 1))
                hub.publish(Signals(graph = 2))
                hub.publish(Signals(graph = 3))
                kotlinx.coroutines.yield()
                error("offline")
            }
        }
        runCurrent()
        assertEquals(2, pulls)
        hub.publish(Signals(graph = 4))
        runCurrent()
        assertEquals(3, pulls)
        job.cancel()
    }
}
