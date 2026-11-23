package com.resonance.kit.visual

import com.resonance.kit.api.AppHttp
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.Test
import java.util.Collections

/**
 * Round 32 §P7: a debug launch's timings — each milestone said once, with the ms since the process started, and the
 * launch's requests through the app's one client with their paths, when they went and when they answered.
 */
class LaunchTraceTest {
    @Test fun milestonesOnceAndTheRequestsInTheirOrder() {
        val lines = Collections.synchronizedList(mutableListOf<String>())
        var now = 120L
        LaunchTrace.start({ now }) { lines += it }
        LaunchTrace.mark("signed in")
        now = 340L
        LaunchTrace.mark("signed in")
        assertEquals(listOf("signed in +120ms"), lines.toList())
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
            AppHttp.client("Resonance/test").newCall(Request.Builder().url(server.url("/api/v1/conversations/a_b/messages")).build()).execute().close()
            val traced = lines.filter { "/api/v1/conversations/a_b/messages" in it }
            assertEquals(2, traced.size)
            assertTrue(traced[0].startsWith("request#") && traced[0].endsWith("+340ms"), traced[0])
            assertTrue(traced[1].startsWith("response#") && " 200 " in traced[1], traced[1])
        } finally {
            server.shutdown()
        }
    }
}
