package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.HttpCaching
import com.resonance.kit.api.InboxApi
import com.resonance.kit.api.SocialApi
import com.resonance.kit.chat.toChatMessage
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Cache
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import java.nio.file.Files
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The Phase 2 reads and writes through the contract: the inbox, the bell, the graph and the
 * profile fields the app used to write to Firestore — and the ETag that makes a pull with nothing
 * new a body-less 304, answered from the app's own HTTP cache.
 */
class InboxSocialApiTest {
    private val server = MockWebServer()
    private val seen = CopyOnWriteArrayList<RecordedRequest>()
    private val caching = HttpCaching(Cache(Files.createTempDirectory("inbox-cache").toFile(), 1L shl 20))
    private val config by lazy { ApiConfiguration(server.url("/").toString()) { "token" } }
    private val http by lazy { caching.client(OkHttpClient()) }
    private val inbox by lazy { InboxApi(config, http) }
    private val social by lazy { SocialApi(config, http) }
    private val routes = HashMap<String, () -> MockResponse>()

    @BeforeTest fun start() {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                seen += request
                val key = "${request.method} ${request.path}"
                return routes[key]?.invoke() ?: MockResponse().setResponseCode(404)
                    .setHeader("Content-Type", "application/json").setBody("""{"error":{"code":"not_found","message":"No such conversation."}}""")
            }
        }
        server.start()
    }

    @AfterTest fun stop() = server.shutdown()

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)

    private val conversation = """{"id":"a_b","participants":["a","b"],"otherId":"b",
        "other":{"id":"b","handle":"bea","initials":"BE","accentColor":"#fff","avatarUrl":null,"avatarSeed":null,"verified":false,"region":null},
        "unread":2,"lastMessage":{"text":"hi","senderId":"b","sentAt":"2026-11-21T08:00:00.123456Z","image":false,"sticker":false,"albumCount":null,"unsent":false},
        "request":null,"createdAt":"2026-11-20T08:00:00.000000Z","updatedAt":"2026-11-21T08:00:00.123456Z","originCardId":null}"""

    @Test fun anUnchangedConversationListIsA304FromTheCache() = runBlocking {
        routes["GET /api/v1/conversations"] = {
            val asked = seen.last().getHeader("If-None-Match")
            if (asked == "W/\"abc\"") MockResponse().setResponseCode(304).setHeader("ETag", "W/\"abc\"").setHeader("Cache-Control", "private, no-cache")
            else json("""{"conversations":[$conversation],"nextPageToken":null}""").setHeader("ETag", "W/\"abc\"").setHeader("Cache-Control", "private, no-cache")
        }
        val first = inbox.conversations()
        val second = inbox.conversations()
        assertEquals(listOf("a_b"), first.map { it.id })
        assertEquals(first, second)
        assertEquals(2, first.single().unread)
        assertEquals(null, seen[0].getHeader("If-None-Match"))
        assertEquals("W/\"abc\"", seen[1].getHeader("If-None-Match"))
        assertEquals("Bearer token", seen[1].getHeader("Authorization"))
    }

    @Test fun readMarksDontSendOtherReadsPastTheCache() = runBlocking {
        routes["GET /api/v1/me"] = { json(ME).setHeader("Cache-Control", "private, max-age=60").setHeader("ETag", "\"v1\"") }
        routes["POST /api/v1/conversations/a_b/read"] = { MockResponse().setResponseCode(204) }
        routes["POST /api/v1/notifications/read"] = { MockResponse().setResponseCode(204) }
        val reading = com.resonance.kit.api.ReadingApi(config, http)
        reading.me()
        inbox.markRead("a_b")
        inbox.markBellRead(listOf("n1", "n2"))
        reading.me()
        // Me's second read came from the cache: only one GET reached the server.
        assertEquals(1, seen.count { it.method == "GET" })
        val marked = Json.parseToJsonElement(seen.first { it.path == "/api/v1/notifications/read" }.body.readUtf8()).jsonObject
        assertEquals(listOf("n1", "n2"), (marked["ids"] as kotlinx.serialization.json.JsonArray).map { it.jsonPrimitive.content })
    }

    @Test fun noConversationIsNullAndAPageOfMessagesDrawsAsTheDocumentsDid() = runBlocking {
        assertNull(inbox.conversation("a_c"))
        routes["GET /api/v1/conversations/a_b/messages?before=c1.old&limit=50"] = {
            json(
                """{"messages":[
                {"id":"m2","cursor":"c1.m2","senderId":"b","text":"","sentAt":"2026-11-21T08:00:01.000001Z","unsentAt":"2026-11-21T09:00:00Z"},
                {"id":"m1","cursor":"c1.m1","senderId":"a","text":"look","sentAt":"2026-11-21T08:00:00.5Z","kind":"note","cardRef":"card1",
                 "replyTo":{"id":"m0","senderId":"b","text":"hey","image":true},"reactions":{"b":"heart"},
                 "image":{"id":"0123456789abcdef0123","width":640,"height":480},"album":{"id":"album-0123456789ab","index":0,"count":2},
                 "preview":{"url":"https://example.com/a","title":"A page","description":null,"siteName":"Ex","image":"/api/link-image?u=1"}}
                ],"olderCursor":null,"newerCursor":"c1.m2","hasNewer":false}""",
            )
        }
        val page = inbox.messages("a_b", before = "c1.old")
        assertNull(page.olderCursor)
        val (unsent, note) = page.messages.map { it.toChatMessage("https://resonance.channel") }
        assertTrue(unsent.isUnsent)
        assertEquals("", unsent.text)
        assertTrue(note.isNote)
        assertEquals("card1", note.cardRef)
        assertEquals("m0", note.replyTo?.id)
        assertTrue(note.replyTo?.image == true)
        assertEquals(mapOf("b" to "heart"), note.reactions)
        assertEquals(640, note.image?.width)
        assertEquals(2, note.album?.count)
        assertEquals("https://resonance.channel/api/link-image?u=1", note.preview?.imageUrl)
        assertEquals(java.time.Instant.parse("2026-11-21T08:00:00.5Z").toEpochMilli(), note.sentAt.time)
    }

    @Test fun aBlockIsOneCallAndHintsAndTheAvatarArePatchesOfMe() = runBlocking {
        routes["PUT /api/v1/me/blocks/b"] = { MockResponse().setResponseCode(204) }
        routes["DELETE /api/v1/me/blocks/b"] = { MockResponse().setResponseCode(204) }
        routes["PUT /api/v1/me/bookmarks/card1"] = { MockResponse().setResponseCode(204) }
        routes["DELETE /api/v1/me/bookmarks/card1"] = { MockResponse().setResponseCode(204) }
        routes["PATCH /api/v1/me"] = {
            json(ME)
        }
        social.block("b")
        social.unblock("b")
        social.bookmark("card1", true)
        social.bookmark("card1", false)
        social.hintSeen("writer_map", 2)
        social.setAvatar("https://img.resonance.channel/image/a.webp")
        assertEquals(
            listOf("PUT /api/v1/me/blocks/b", "DELETE /api/v1/me/blocks/b", "PUT /api/v1/me/bookmarks/card1", "DELETE /api/v1/me/bookmarks/card1", "PATCH /api/v1/me", "PATCH /api/v1/me"),
            seen.map { "${it.method} ${it.path}" },
        )
        val hint = Json.parseToJsonElement(seen[4].body.readUtf8()).jsonObject
        assertEquals("2", hint["hintsSeen"]!!.jsonObject["writer_map"]!!.jsonPrimitive.content)
        val avatar = Json.parseToJsonElement(seen[5].body.readUtf8()).jsonObject
        assertEquals("https://img.resonance.channel/image/a.webp", avatar["avatarUrl"]!!.jsonPrimitive.content)
    }

    @Test fun peopleAreAskedThirtyARequest() = runBlocking {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                seen += request
                val ids = request.requestUrl!!.queryParameter("ids")!!.split(',')
                return json("""{"users":[${ids.joinToString(",") { """{"id":"$it","gone":true,"author":null,"bio":null,"joinedAt":null}""" }}]}""")
            }
        }
        val people = social.users((1..31).map { "u$it" } + "u1")
        assertEquals(31, people.size)
        assertEquals(2, seen.size)
        assertTrue(people.all { it.gone && it.author == null })
    }

    private companion object {
        const val ME = """{"id":"a","handle":"amy","initials":"AM","accentColor":"oklch(88% 0.08 55)","bio":null,"avatarUrl":null,"region":"TW","primaryLocale":"zh-TW","handleChangedAt":null}"""
    }
}
