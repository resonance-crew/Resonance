package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.ChatPicturesApi
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.chat.ChatImage
import com.resonance.kit.chat.Outbox
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A picture goes up with the viewer's token, as a form of the file, whom it is for and the
 * message's own client id (the id it is kept under, so a resend finds it), and comes back as its
 * id and size; the message then names it. Read back, it is an address of the API — only ever asked
 * for with the token. The server's refusals keep their code and status, so the outbox can tell a
 * refusal of this message (400, 403) from one that will pass (429).
 */
class ChatPicturesApiTest {
    private val server = MockWebServer()
    private fun api() = ChatPicturesApi(ApiConfiguration(server.url("/").toString()) { "token" })

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    @Test fun aPictureGoesUpUnderTheMessagesClientId() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(201).setHeader("Content-Type", "application/json")
                .setBody("""{"id":"AbCdEfGhIjKlMnOpQrSt","width":1600,"height":1200}"""),
        )
        val kept = api().upload(byteArrayOf(1, 2, 3), "image/jpeg", to = "bob", clientId = "AbCdEfGhIjKlMnOpQrSt")
        assertEquals(ChatImage("AbCdEfGhIjKlMnOpQrSt", 1600, 1200), kept)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/chat-images", request.path)
        assertEquals("Bearer token", request.getHeader("Authorization"))
        assertTrue(request.getHeader("Content-Type")!!.startsWith("multipart/form-data"))
        val form = request.body.readUtf8()
        assertTrue("name=\"file\"; filename=\"picture.jpg\"" in form, form)
        assertTrue("Content-Type: image/jpeg" in form, form)
        assertTrue(Regex("name=\"to\"[\\s\\S]*?\\r\\n\\r\\nbob\\r\\n").containsMatchIn(form), form)
        assertTrue(Regex("name=\"clientId\"[\\s\\S]*?\\r\\n\\r\\nAbCdEfGhIjKlMnOpQrSt\\r\\n").containsMatchIn(form), form)
    }

    @Test fun aGifGoesAsItIs() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"p","width":10,"height":10}"""))
        api().upload(byteArrayOf(0x47, 0x49, 0x46), "image/gif", to = "bob", clientId = "AbCdEfGhIjKlMnOpQrSt")
        assertTrue("filename=\"picture.gif\"" in server.takeRequest().body.readUtf8())
    }

    @Test fun theServersNoKeepsItsCodeAndStatus() = runBlocking {
        val refusals = listOf(
            Triple(403, "blocked", "You cannot message this person."),
            Triple(403, "forbidden", "You can message people you are connected with."),
            Triple(400, "invalid_request", "Not a picture that can be sent."),
            Triple(429, "rate_limited", "Too many requests."),
        )
        for ((status, code, message) in refusals) {
            server.enqueue(MockResponse().setResponseCode(status).setBody("""{"error":{"code":"$code","message":"$message"}}"""))
            val e = assertFailsWith<ApiFailure> { api().upload(ByteArray(1), "image/jpeg", "bob", "AbCdEfGhIjKlMnOpQrSt") }
            assertEquals(ApiFailure(code, message, status), e)
        }
        // A refusal of this picture fails only its message; too many for today, and the server's trouble, will pass.
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":{"code":"invalid_request","message":"No."}}"""))
        assertTrue(Outbox.refusedByServer(assertFailsWith<ApiFailure> { api().upload(ByteArray(1), "image/jpeg", "bob", "AbCdEfGhIjKlMnOpQrSt") }))
        server.enqueue(MockResponse().setResponseCode(429).setBody("""{"error":{"code":"rate_limited","message":"Too many requests."}}"""))
        assertFalse(Outbox.refusedByServer(assertFailsWith<ApiFailure> { api().upload(ByteArray(1), "image/jpeg", "bob", "AbCdEfGhIjKlMnOpQrSt") }))
        server.enqueue(MockResponse().setResponseCode(502).setBody("Bad gateway"))
        val down = assertFailsWith<ApiFailure> { api().upload(ByteArray(1), "image/jpeg", "bob", "AbCdEfGhIjKlMnOpQrSt") }
        assertEquals(502, down.status)
        assertFalse(Outbox.refusedByServer(down))
    }

    @Test fun aPictureIsReadAtTheApisAddressWithTheToken() = runBlocking {
        val pictures = api()
        assertEquals(server.url("/api/v1/chat-images/p1?size=thumb").toString(), pictures.url("p1", ChatPicturesApi.Size.Thumb))
        assertEquals(server.url("/api/v1/chat-images/p1").toString(), pictures.url("p1", ChatPicturesApi.Size.Full))
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "image/webp").setBody("RIFF"))
        pictures.client.newCall(okhttp3.Request.Builder().url(pictures.url("p1", ChatPicturesApi.Size.Thumb)).build()).execute().use {
            assertEquals(200, it.code)
        }
        assertEquals("Bearer token", server.takeRequest().getHeader("Authorization"))
    }

    @Test fun theMessageNamesThePicture() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(201).setHeader("Content-Type", "application/json")
                .setBody("""{"conversationId":"alice_bob","id":"AbCdEfGhIjKlMnOpQrSt"}"""),
        )
        MessagingApi(ApiConfiguration(server.url("/").toString()) { "token" })
            .sendMessage("bob", "", clientId = "AbCdEfGhIjKlMnOpQrSt", image = "AbCdEfGhIjKlMnOpQrSt")
        val sent = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
        assertEquals("AbCdEfGhIjKlMnOpQrSt", sent["image"]!!.jsonPrimitive.content)
        assertEquals("", sent["text"]!!.jsonPrimitive.content)
    }
}
