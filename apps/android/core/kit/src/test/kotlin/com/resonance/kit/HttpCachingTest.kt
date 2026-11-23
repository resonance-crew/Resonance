package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.HttpCaching
import com.resonance.kit.api.PushApi
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.WritingApi
import com.resonance.api.models.ReadingReportRequest
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import okhttp3.Cache
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import java.nio.file.Files
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The API's HTTP cache: a read the server lets a private cache keep is answered from it, until
 * the viewer changes something — then each address is read from the server once more — and
 * nothing of it outlives the account (sign-out empties it).
 */
class HttpCachingTest {
    private val server = MockWebServer()
    private val routes = Routes()
    /**
     * What reached the server: "GET /feed" or, for a read sent past the cache to be checked,
     * "GET /feed revalidate" (`Cache-Control: max-age=0`, which keeps OkHttp's `If-None-Match`).
     */
    private val reached = CopyOnWriteArrayList<String>()
    /** The X-Resonance-Cache header of each request (the server's max-age is opt-in). */
    private val optedIn = CopyOnWriteArrayList<String?>()
    /** The If-None-Match header of each request. */
    private val validators = CopyOnWriteArrayList<String?>()
    /** Whether the server answers a matching If-None-Match with an empty 304, as src/lib/api/v1/cache.ts does. */
    @Volatile private var notModified = false
    private val dir = Files.createTempDirectory("http-cache").toFile()
    private val cache = Cache(dir, 1L shl 20)
    private val caching = HttpCaching(cache)
    private val http by lazy { caching.client(OkHttpClient()) }
    private val config by lazy { ApiConfiguration(server.url("/").toString()) { "token" } }
    private val reading by lazy { ReadingApi(config, http) }
    private val writing by lazy { WritingApi(config, http) }
    private val push by lazy { PushApi(config, http) }

    /** What the server will send, from API-7: private (it depends on the viewer), briefly fresh, with a validator. */
    private fun cacheable(body: String) = json(body).setHeader("Cache-Control", "private, max-age=60").setHeader("ETag", "\"v1\"")

    @BeforeTest fun start() {
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
                val path = request.requestUrl!!.encodedPath.removePrefix("/api/v1")
                reached.add("${request.method} $path" + if (request.getHeader("Cache-Control") == "max-age=0") " revalidate" else "")
                optedIn.add(request.getHeader("X-Resonance-Cache"))
                validators.add(request.getHeader("If-None-Match"))
                if (notModified && request.getHeader("If-None-Match") == "\"v1\"") {
                    return MockResponse().setResponseCode(304).setHeader("Cache-Control", "private, max-age=60").setHeader("ETag", "\"v1\"")
                }
                return routes.dispatch(request)
            }
        }
        routes.on("/feed") { cacheable(pageJson("a")) }
        routes.on("/cards/c1/publish") { json("""{"id":"c1","slug":"a-walk","firstPublish":true}""") }
        routes.on("/me/devices/install-1") { MockResponse().setResponseCode(204) }
        routes.on("/cards/c1/read") { MockResponse().setResponseCode(204) }
        routes.on("/cards/c1/reading") { MockResponse().setResponseCode(204) }
        routes.on("/cards/c1/translation") { json("""{"to":"en","title":"A walk","story":"Rain."}""") }
        server.start()
    }

    @AfterTest fun stop() {
        server.shutdown()
        dir.deleteRecursively()
    }

    @Test fun everyReadOptsInToTheServersReuse() = runBlocking {
        reading.feed()
        assertEquals(listOf<String?>("1"), optedIn)
    }

    @Test fun aFreshAnswerComesFromTheCache() = runBlocking {
        reading.feed()
        reading.feed()
        assertEquals(listOf("GET /feed"), reached)
    }

    @Test fun afterTheViewersOwnWriteEachAddressIsReadFromTheServerOnce() = runBlocking {
        reading.feed()
        writing.publish("c1")
        reading.feed()
        reading.feed()
        assertEquals(listOf("GET /feed", "POST /cards/c1/publish", "GET /feed revalidate"), reached)
    }

    @Test fun aPushRegistrationChangesNothingTheApiReads() = runBlocking {
        reading.feed()
        push.register("install-1", "fcm-token", Strings.Language.En, "2.0.0")
        reading.feed()
        assertEquals(listOf("GET /feed", "PUT /me/devices/install-1"), reached)
    }

    @Test fun aReadersOwnTracesChangeNothingTheApiReads() = runBlocking {
        // A card opened counts a read, reports how it was read and may ask for a translation (iOS's
        // FreshnessMiddleware.unchanging): none of them sends the feed past the cache.
        reading.feed()
        reading.countRead("c1")
        reading.reportReading("c1", ReadingReportRequest("view-0001", 42.5, 0.75, reachedEnd = true))
        reading.translate("c1", "en")
        reading.feed()
        assertEquals(
            listOf("GET /feed", "POST /cards/c1/read", "POST /cards/c1/reading", "POST /cards/c1/translation"),
            reached,
        )
    }

    @Test fun aStaleReadIsRevalidatedWithItsETagAndA304IsAnsweredFromTheCache() = runBlocking {
        notModified = true
        val first = reading.feed()
        writing.publish("c1")
        val again = reading.feed()
        assertEquals(listOf("GET /feed", "POST /cards/c1/publish", "GET /feed revalidate"), reached)
        // The stale read carried the stored answer's validator, and the server's empty 304 became that answer.
        assertEquals(listOf(null, null, "\"v1\""), validators)
        assertEquals(first, again)
        // Checked once since the change: the next read is the cache's again.
        reading.feed()
        assertEquals(3, reached.size)
    }

    @Test fun aChangeMadeOutsideTheApiAlsoReadsAfresh() = runBlocking {
        // A bookmark or a block is written to Firestore: the app says so.
        reading.feed()
        caching.invalidate()
        reading.feed()
        reading.feed()
        assertEquals(listOf("GET /feed", "GET /feed revalidate"), reached)
    }

    @Test fun anAnswerStillOnItsWayWhenTheAccountLeavesIsNeverKept() = runBlocking {
        val gate = CountDownLatch(1)
        val asked = CountDownLatch(1)
        routes.on("/feed") {
            asked.countDown()
            gate.await(5, TimeUnit.SECONDS)
            cacheable(pageJson("theirs"))
        }
        val pending = async(Dispatchers.IO) { runCatching { reading.feed() } }
        assertTrue(asked.await(5, TimeUnit.SECONDS))
        // Signed out (or someone else signed in) while the feed was still coming.
        caching.cancelCalls()
        assertTrue(pending.await().isFailure)
        gate.countDown()
        caching.evict()
        assertEquals(0L, cache.size())
    }

    @Test fun signingOutLeavesNothingBehind() = runBlocking {
        reading.feed()
        caching.clear()
        assertEquals(0L, cache.size())
        reading.feed()
        assertEquals(listOf("GET /feed", "GET /feed revalidate"), reached)
    }
}
