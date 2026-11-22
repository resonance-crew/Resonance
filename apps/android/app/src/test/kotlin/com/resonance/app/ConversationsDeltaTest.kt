package com.resonance.app

import android.app.Application
import android.os.Looper
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.InboxApi
import com.resonance.kit.api.SocialApi
import com.resonance.kit.config.Features
import com.resonance.kit.realtime.SignalHub
import com.resonance.kit.realtime.Signals
import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The Messages list on the API path reads only what moved (traffic phase 3): a conversation whose
 * `threads` counter moved is asked for alone (`?pairs=`) and merged into the list on screen, a read
 * here keeps its mark until a read covers it, and a pull with nothing moved — the foreground's kick,
 * the minute's safety pull — sends nothing while the listener is live.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class ConversationsDeltaTest {
    private val server = MockWebServer()
    private val seen = CopyOnWriteArrayList<String>()
    private val routes = HashMap<String, () -> MockResponse>()
    private lateinit var config: ApiConfiguration
    private val signals = SignalHub()
    private val onScreen = MutableStateFlow(false)
    private val on = Features(signals = true, apiSocial = true, apiInbox = true, apiBell = true, apiThoughtMap = true)
    private val remote by lazy { LiveRemote(InboxApi(config), SocialApi(config), signals, onScreen) { on } }

    @Before fun start() {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val key = "${request.method} ${request.path}"
                seen += key
                return routes[key]?.invoke() ?: MockResponse().setResponseCode(404)
                    .setHeader("Content-Type", "application/json").setBody("""{"error":{"code":"not_found","message":"Not found."}}""")
            }
        }
        server.start()
        config = ApiConfiguration(server.url("/").toString()) { "token" }
        routes["GET /api/v1/me/connections"] = { json("""{"connections":[]}""") }
        routes["GET /api/v1/me/blocks"] = { json("""{"blocks":[]}""") }
    }

    @After fun stop() = server.shutdown()

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setHeader("Cache-Control", "private, no-cache").setBody(body)

    private fun until(done: () -> Boolean) {
        repeat(400) {
            shadowOf(Looper.getMainLooper()).idle()
            if (done()) return
            Thread.sleep(10)
        }
        throw AssertionError("timed out; reached: $seen")
    }

    /** Lets whatever pull is on its way finish (and shows none started). */
    private fun settle() = repeat(30) {
        shadowOf(Looper.getMainLooper()).idle()
        Thread.sleep(10)
    }

    private fun author(id: String) =
        """{"id":"$id","handle":"pen$id","initials":"PE","accentColor":"","avatarUrl":null,"avatarSeed":"7","verified":false,"region":null}"""

    private fun conversation(other: String, at: Int, unread: Int, text: String) = """{"id":"a_$other","participants":["a","$other"],"otherId":"$other",
        "other":${author(other)},"unread":$unread,
        "lastMessage":{"text":"$text","senderId":"$other","sentAt":"2026-11-22T08:00:${"%02d".format(at)}.000001Z","image":false,"sticker":false,"albumCount":null,"unsent":false},
        "request":null,"createdAt":null,"updatedAt":"2026-11-22T08:00:${"%02d".format(at)}.000001Z","originCardId":null}"""

    private fun list(vararg rows: String) = json("""{"conversations":[${rows.joinToString(",")}],"nextPageToken":null}""")

    private val wholeReads get() = seen.count { it == "GET /api/v1/conversations" }
    private val deltaReads get() = seen.filter { it.startsWith("GET /api/v1/conversations?pairs=") }

    @Test fun aMovedConversationIsReadAloneAndMergedIntoTheList() {
        routes["GET /api/v1/conversations"] = { list(conversation("b", 3, 1, "from b"), conversation("c", 2, 0, "from c")) }
        // The listener has answered: the start's read stands for these counters.
        signals.publish(Signals(inbox = 1, threads = mapOf("a_b" to 1, "a_c" to 1)))
        val store = ConversationsStore().also { it.remote = remote }
        store.start("a")
        until { store.state.value.loaded }
        settle()
        assertEquals(1, wholeReads)
        assertEquals(listOf("a_b", "a_c"), store.state.value.conversations.map { it.id })

        // c wrote again: c alone is asked for, and comes to the top.
        routes["GET /api/v1/conversations?pairs=a_c"] = { list(conversation("c", 9, 1, "c again")) }
        signals.publish(Signals(inbox = 2, threads = mapOf("a_b" to 1, "a_c" to 2)))
        until { store.state.value.conversations.firstOrNull()?.lastText == "c again" }
        assertEquals(listOf("GET /api/v1/conversations?pairs=a_c"), deltaReads)
        assertEquals(1, wholeReads)
        assertEquals(listOf("a_c", "a_b"), store.state.value.conversations.map { it.id })
        assertEquals("from b", store.state.value.conversations[1].lastText)
        assertEquals(setOf("a_b", "a_c"), store.ids.value)

        // Read here and told: the mark stays until a read covers b (the kick reads nothing, nothing moved yet).
        store.readHere("a_b")
        store.readHere("a_b", done = true)
        store.resume()
        settle()
        assertEquals(1, wholeReads)
        assertEquals(1, deltaReads.size)
        assertEquals(0, store.state.value.conversations.first { it.id == "a_b" }.unread)

        // The read's touch arrives: b is read alone, and what the server says of it stands.
        routes["GET /api/v1/conversations?pairs=a_b"] = { list(conversation("b", 3, 0, "from b")) }
        signals.publish(Signals(inbox = 3, threads = mapOf("a_b" to 2, "a_c" to 2)))
        until { deltaReads.size == 2 }
        assertEquals("GET /api/v1/conversations?pairs=a_b", deltaReads.last())

        // b deleted: asked for and left out, it leaves the list.
        routes["GET /api/v1/conversations?pairs=a_b"] = { list() }
        signals.publish(Signals(inbox = 4, threads = mapOf("a_b" to 3, "a_c" to 2)))
        until { store.state.value.conversations.map { it.id } == listOf("a_c") }
        assertEquals(setOf("a_c"), store.ids.value)
        assertEquals(1, wholeReads)

        // The listener failed: no one can say what moved, so the next pull reads whole.
        signals.fail()
        store.resume()
        until { wholeReads == 2 }
        store.stop()
    }
}
