package com.resonance.kit

import com.resonance.kit.api.AppHttp
import com.resonance.kit.visual.VisualReady
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The release screenshots' ready signal: said once the screen is quiet, never before, never in a launch that didn't ask. */
class VisualReadyTest {
    private val later = mutableListOf<Pair<Long, () -> Unit>>()
    private val said = mutableListOf<String>()

    private fun start(token: String = "t1") {
        later.clear()
        said.clear()
        VisualReady.start(token, schedule = { ms, run -> later += ms to run }, say = { said += it })
    }

    /** Runs what was put off, as the main looper would once its time came. */
    private fun runLater() {
        val due = later.toList()
        later.clear()
        due.forEach { it.second() }
    }

    @AfterTest
    fun stop() = VisualReady.stop()

    @Test
    fun saysReadyOnceTheRequestsHaveAnsweredAndNoPlaceholderIsLeft() {
        start()
        VisualReady.placeholder(1)
        assertTrue(VisualReady.requestStarted())
        VisualReady.requestEnded()
        // A skeleton still on screen: nothing scheduled to say.
        runLater()
        assertEquals(emptyList(), said)
        VisualReady.placeholder(-1)
        assertEquals(listOf(VisualReady.QUIET_MS), later.map { it.first })
        runLater()
        assertEquals(listOf("ready t1"), said)
        // Said once a launch.
        assertTrue(VisualReady.requestStarted())
        VisualReady.requestEnded()
        runLater()
        assertEquals(listOf("ready t1"), said)
    }

    @Test
    fun aRequestOrAPlaceholderWithinTheQuietTimeStartsItAgain() {
        start()
        assertTrue(VisualReady.requestStarted())
        VisualReady.requestEnded()
        // The next request leaves before the quiet time is up: the first wait no longer counts.
        assertTrue(VisualReady.requestStarted())
        runLater()
        assertEquals(emptyList(), said)
        VisualReady.requestEnded()
        VisualReady.placeholder(1)
        VisualReady.placeholder(-1)
        runLater()
        assertEquals(listOf("ready t1"), said)
    }

    @Test
    fun neverSaysReadyBeforeAnythingAnswered() {
        // The launch's first frames: no request yet, no skeleton yet — not quiet, only early.
        start()
        VisualReady.placeholder(1)
        VisualReady.placeholder(-1)
        runLater()
        assertEquals(emptyList(), said)
    }

    @Test
    fun isSilentUnlessALaunchAskedForIt() {
        VisualReady.stop()
        assertFalse(VisualReady.requestStarted())
        VisualReady.requestEnded()
        VisualReady.placeholder(1)
        assertFalse(VisualReady.enabled)
    }

    @Test
    fun theAppsClientCountsEveryRequestWhileItListens() {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("{}"))
        server.start()
        try {
            start("t2")
            AppHttp.client("Resonance/test").newCall(Request.Builder().url(server.url("/api/v1/me")).build()).execute().close()
            runLater()
            assertEquals(listOf("ready t2"), said)
        } finally {
            server.shutdown()
        }
    }
}
