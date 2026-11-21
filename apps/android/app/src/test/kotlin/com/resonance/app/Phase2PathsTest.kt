package com.resonance.app

import android.app.Application
import android.content.Context
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.InboxApi
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.SafetyApi
import com.resonance.kit.api.SocialApi
import com.resonance.kit.config.Features
import com.resonance.kit.config.UpdateNeed
import com.resonance.kit.realtime.SignalHub
import com.resonance.kit.realtime.Signals
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Phase 2 (中間層去平台綁定): every converged path on both of client-config's values. Switched on,
 * the live lists pull the contract — once at start, again when their signal moves, read marks drawn
 * at once and then told — and the services make the one call the server's transaction needs.
 * Switched off, nothing reaches /api/v1: the build goes to Firestore as before (which a JVM test
 * can't reach — it fails there, and that failure is the proof it was asked).
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class Phase2PathsTest {
    private val server = MockWebServer()
    private val seen = CopyOnWriteArrayList<String>()
    private val bodies = HashMap<String, String>()
    private val routes = HashMap<String, () -> MockResponse>()
    private lateinit var config: ApiConfiguration
    private val signals = SignalHub()
    private val onScreen = MutableStateFlow(false)
    private var features = Features.LEGACY

    private val inbox by lazy { InboxApi(config) }
    private val social by lazy { SocialApi(config) }
    private val remote by lazy { LiveRemote(inbox, social, signals, onScreen) { features } }
    private val on = Features(signals = true, apiSocial = true, apiInbox = true, apiBell = true, apiThoughtMap = true)

    @Before fun start() {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val key = "${request.method} ${request.path}"
                seen += key
                bodies[key] = request.body.readUtf8()
                return routes[key]?.invoke() ?: routes[key.substringBefore('?')]?.invoke() ?: MockResponse().setResponseCode(404)
                    .setHeader("Content-Type", "application/json").setBody("""{"error":{"code":"not_found","message":"Not found."}}""")
            }
        }
        server.start()
        config = ApiConfiguration(server.url("/").toString()) { "token" }
    }

    @After fun stop() = server.shutdown()

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setHeader("Cache-Control", "private, no-cache").setBody(body)
    private val empty = MockResponse().setResponseCode(204)

    /** Lets the main thread run what the IO threads handed back, until [done]. */
    private fun until(done: () -> Boolean) {
        repeat(400) {
            shadowOf(Looper.getMainLooper()).idle()
            if (done()) return
            Thread.sleep(10)
        }
        fail("timed out; reached: $seen")
    }

    private fun author(id: String, handle: String) =
        """{"id":"$id","handle":"$handle","initials":"${handle.take(2).uppercase()}","accentColor":"","avatarUrl":null,"avatarSeed":"7","verified":false,"region":null}"""

    private fun conversation(other: String, unread: Int, text: String) = """{"id":"a_$other","participants":["a","$other"],"otherId":"$other",
        "other":${author(other, "pen$other")},"unread":$unread,
        "lastMessage":{"text":"$text","senderId":"$other","sentAt":"2026-11-21T08:00:00.000001Z","image":false,"sticker":false,"albumCount":null,"unsent":false},
        "request":null,"createdAt":null,"updatedAt":"2026-11-21T08:00:00.000001Z","originCardId":null}"""

    private fun graph(connected: List<String>, blocked: List<String>) {
        routes["GET /api/v1/me/connections"] = {
            json("""{"connections":[${connected.joinToString(",") { """{"userId":"$it","establishedAt":null,"person":{"id":"$it","gone":false,"author":${author(it, "pen$it")},"bio":null,"joinedAt":null}}""" }}]}""")
        }
        routes["GET /api/v1/me/blocks"] = {
            json("""{"blocks":[${blocked.joinToString(",") { """{"userId":"$it","blockedAt":"2026-11-20T00:00:00Z","person":{"id":"$it","gone":false,"author":${author(it, "pen$it")},"bio":null,"joinedAt":null}}""" }}]}""")
        }
    }

    @Test fun theConversationsArePulledAgainWhenTheInboxSignalMovesAndAReadIsDrawnAtOnce() {
        features = on
        var text = "hello"
        routes["GET /api/v1/conversations"] = { json("""{"conversations":[${conversation("b", 2, text)},${conversation("x", 1, "blocked")}],"nextPageToken":null}""") }
        graph(connected = listOf("b", "c"), blocked = listOf("x"))
        val store = ConversationsStore().also { it.remote = remote }
        store.start("a")
        until { store.state.value.loaded }
        val state = store.state.value
        // The blocked person's conversation drops out; a connection with no conversation is a starter.
        assertEquals(listOf("b"), state.conversations.map { it.other.id })
        assertEquals("penb", state.conversations.single().other.handle)
        assertEquals(listOf("c"), state.starters.map { it.id })
        assertEquals(2, state.unreadTotal)
        assertEquals(setOf("x"), store.blockedIds.value)
        assertEquals(setOf("a_b", "a_x"), store.ids.value)

        text = "again"
        val pulls = seen.count { it == "GET /api/v1/conversations" }
        signals.publish(Signals(inbox = 5))
        until { store.state.value.conversations.firstOrNull()?.lastText == "again" }
        assertTrue(seen.count { it == "GET /api/v1/conversations" } > pulls)

        // Read here: the badge goes at once, before any answer.
        store.readHere("a_b")
        until { store.state.value.unreadTotal == 0 }
        // Firestore was never asked for anything: no path but the contract's ran.
        store.stop()
    }

    @Test fun aBlockHereReadsTheGraphAgainAtOnce() {
        features = on
        routes["GET /api/v1/conversations"] = { json("""{"conversations":[],"nextPageToken":null}""") }
        var blocked = listOf<String>()
        routes["GET /api/v1/me/connections"] = { json("""{"connections":[]}""") }
        routes["GET /api/v1/me/blocks"] = {
            json("""{"blocks":[${blocked.joinToString(",") { """{"userId":"$it","blockedAt":null,"person":{"id":"$it","gone":true,"author":null,"bio":null,"joinedAt":null}}""" }}]}""")
        }
        routes["PUT /api/v1/me/blocks/b"] = { blocked = listOf("b"); empty }
        val store = ConversationsStore().also { it.remote = remote }
        store.start("a")
        until { store.state.value.loaded }
        val safety = SafetyService("a", SafetyApi(config), social, store::graphChanged)
        runBlocking { safety.block("b") }
        until { store.blockedIds.value == setOf("b") }
        // One call: the server ends the connection and withdraws the invites in the same transaction.
        assertEquals(1, seen.count { it.startsWith("PUT ") || it.startsWith("DELETE ") || it.startsWith("PATCH ") })
        val list = runBlocking { safety.blocked() }
        assertEquals("b", list.single().id)
        // A deleted account shows as one, never as stale data.
        assertEquals(null, list.single().handle)
        store.stop()
    }

    @Test fun theBellIsPulledOnItsSignalAndARowIsReadAtOnce() {
        features = on
        var readAt = "null"
        routes["GET /api/v1/me/bell"] = {
            json("""{"items":[{"id":"n1","type":"note","payload":{"fromUserId":"b","cardId":"c1","noteId":"t1","preview":"hi","anonymous":true},"readAt":$readAt,"createdAt":"2026-11-21T08:00:00Z"}],"people":[],"nextPageToken":null}""")
        }
        routes["POST /api/v1/notifications/read"] = { readAt = "\"2026-11-21T09:00:00Z\""; empty }
        val store = NotificationsStore().also { it.remote = remote }
        store.start("a")
        until { store.loaded.value }
        val row = store.items.value.single()
        assertTrue(row.isUnread)
        assertTrue(row.onAnonymousCard)
        assertEquals("/api/v1/me/bell?limit=50", seen.first { it.startsWith("GET /api/v1/me/bell") }.substringAfter("GET "))
        store.markRead(row)
        // Drawn read before the server answers.
        assertFalse(store.items.value.single().isUnread)
        until { "POST /api/v1/notifications/read" in seen }
        assertTrue(bodies["POST /api/v1/notifications/read"]!!.contains("\"n1\""))
        val before = seen.count { it.startsWith("GET /api/v1/me/bell") }
        signals.publish(Signals(bell = 3))
        until { seen.count { it.startsWith("GET /api/v1/me/bell") } > before }
        until { !store.items.value.single().isUnread }
        store.stop()
    }

    @Test fun switchedOffNothingReachesTheContract() {
        features = Features.LEGACY
        val conversations = ConversationsStore().also { it.remote = remote }
        // Firestore's listeners, which a JVM test can't reach: asked, and only them.
        assertTrue(runCatching { conversations.start("a") }.isFailure)
        val bell = NotificationsStore().also { it.remote = remote }
        assertTrue(runCatching { bell.start("a") }.isFailure)
        val safety = SafetyService("a", SafetyApi(config))
        assertTrue(runCatching { runBlocking { safety.block("b") } }.isFailure)
        assertTrue(runCatching { runBlocking { safety.unblock("b") } }.isFailure)
        val bookmarks = BookmarkService("a")
        assertTrue(runCatching { runBlocking { bookmarks.set("c1", true) } }.isFailure)
        val prefs = ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("hints-off", Context.MODE_PRIVATE)
        // A hint still shows (the device's count governs), its mirror going to Firestore.
        assertTrue(runBlocking { HintService("a", prefs).claim("map") })
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(emptyList<String>(), seen.toList())
    }

    @Test fun switchedOnBookmarksAndHintsGoThroughTheContract() = runBlocking {
        routes["PUT /api/v1/me/bookmarks/c1"] = { empty }
        routes["DELETE /api/v1/me/bookmarks/c1"] = { empty }
        val me = """{"id":"a","handle":"amy","initials":"AM","accentColor":"","bio":null,"avatarUrl":null,"region":"TW","primaryLocale":"zh-TW","handleChangedAt":null,"hintsSeen":{"map":3}}"""
        routes["PATCH /api/v1/me"] = { json(me) }
        val bookmarks = BookmarkService("a", BookmarkService.Api(social, ReadingApi(config)))
        assertTrue(bookmarks.set("c1", true))
        assertFalse(bookmarks.set("c1", false))
        val prefs = ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("hints-on", Context.MODE_PRIVATE)
        var profile: com.resonance.api.models.Me? = null
        val hints = HintService("a", prefs, HintService.Api(social, { profile }, { profile = it }))
        assertTrue(hints.claim("map"))
        assertTrue(bodies["PATCH /api/v1/me"]!!.contains("\"hintsSeen\":{\"map\":1}"))
        // The profile the server answered says 3 (seen on the web): the hint is quiet now.
        assertFalse(hints.claim("map"))
        assertEquals(listOf("PUT /api/v1/me/bookmarks/c1", "DELETE /api/v1/me/bookmarks/c1", "PATCH /api/v1/me"), seen.toList())
    }

    @Test fun theUpdateScreenGoesByTheKeptConfigAndThisBuild() {
        val prefs = ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("config", Context.MODE_PRIVATE)
        prefs.edit().putString(
            "clientConfig",
            """{"minBuild":{"ios":0,"android":18},"recommendedBuild":{"ios":0,"android":20},"features":{"signals":true,"apiSocial":false,"apiInbox":true,"apiBell":true,"apiThoughtMap":true,"apiDrafts":false}}""",
        ).commit()
        val app = AppConfig(usesEmulator = true, emulatorHost = server.hostName, emulatorApiPort = server.port)
        assertEquals(UpdateNeed.Required, Session(app, prefs, appBuild = 17).updateNeed.value)
        assertEquals(UpdateNeed.Recommended, Session(app, prefs, appBuild = 18).updateNeed.value)
        val current = Session(app, prefs, appBuild = 20)
        assertEquals(UpdateNeed.None, current.updateNeed.value)
        assertTrue(current.features.apiInbox)
        assertFalse(current.features.apiSocial)
        // Nothing kept: nothing asked, every path as before.
        val fresh = ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("config-none", Context.MODE_PRIVATE)
        val never = Session(app, fresh, appBuild = 1)
        assertEquals(UpdateNeed.None, never.updateNeed.value)
        assertEquals(Features.LEGACY, never.features)
    }
}
