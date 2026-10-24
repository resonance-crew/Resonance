package com.resonance.app

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.ChatPicturesApi
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.chat.Outbox
import com.resonance.kit.chat.OutgoingImage
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Date

/**
 * A message carrying a picture (round 7 §4.2): the picture goes up first, under the message's own
 * client id — a resend finds it kept — and the message then names it; a message without one goes as
 * it always did. A picture the server won't take is that message's refusal, and nothing is sent.
 */
class ChatPictureSendTest {
    private val server = MockWebServer()
    private val config by lazy { ApiConfiguration(server.url("/").toString()) { "token" } }
    private val clientId = "AbCdEfGhIjKlMnOpQrSt"

    @Before fun start() = server.start()
    @After fun stop() = server.shutdown()

    private fun message(image: OutgoingImage?, text: String = "") =
        Outbox.Outgoing(clientId, "alice", text, null, null, null, Date(1_000), image = image)

    @Test fun thePictureGoesUpThenTheMessageNamesIt() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"$clientId","width":1200,"height":900}"""))
        server.enqueue(MockResponse().setResponseCode(201).setHeader("Content-Type", "application/json").setBody("""{"conversationId":"alice_bob","id":"$clientId"}"""))
        val sent = deliver(MessagingApi(config), ChatPicturesApi(config), "bob", message(OutgoingImage(byteArrayOf(1, 2), "image/jpeg", 1200, 900), "看這個"))
        assertEquals(MessagingApi.Sent("alice_bob", clientId), sent)
        val upload = server.takeRequest()
        assertEquals("/api/v1/chat-images", upload.path)
        val form = upload.body.readUtf8()
        assertTrue(form, "\r\n\r\n$clientId\r\n" in form)
        val send = server.takeRequest()
        assertEquals("/api/v1/messages", send.path)
        val body = send.body.readUtf8()
        assertTrue(body, "\"image\":\"$clientId\"" in body)
        assertTrue(body, "\"clientId\":\"$clientId\"" in body)
        assertTrue(body, "\"text\":\"看這個\"" in body)
    }

    @Test fun aMessageWithoutAPictureGoesAsItAlwaysDid() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(201).setHeader("Content-Type", "application/json").setBody("""{"conversationId":"alice_bob","id":"$clientId"}"""))
        deliver(MessagingApi(config), ChatPicturesApi(config), "bob", message(null, "hi"))
        assertEquals("/api/v1/messages", server.takeRequest().path)
        assertEquals(1, server.requestCount)
    }

    @Test fun aPictureTheServerWontTakeIsThatMessagesRefusalAndNothingIsSent() {
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":{"code":"invalid_request","message":"Not a picture that can be sent."}}"""))
        val refused = assertThrows(ApiFailure::class.java) {
            runBlocking { deliver(MessagingApi(config), ChatPicturesApi(config), "bob", message(OutgoingImage(byteArrayOf(1), "image/jpeg", 1, 1))) }
        }
        assertTrue(Outbox.refusedByServer(refused))
        assertEquals(1, server.requestCount)
    }
}
