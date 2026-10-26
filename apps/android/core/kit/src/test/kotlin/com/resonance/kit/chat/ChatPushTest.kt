package com.resonance.kit.chat

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The data of a chat push, as the server sends it. */
class ChatPushTest {
    private val data = mapOf(
        "type" to "message", "conversationId" to "alice_bob", "messageId" to "m1", "fromUserId" to "bob", "fromHandle" to "bob",
        "title" to "bob", "body" to "hello", "route" to "/messages/bob", "sentAt" to "1790000000000",
    )

    @Test fun readsTheKeysTheServerSends() {
        assertEquals(ChatPush("alice_bob", "m1", "bob", null, "bob", "hello", "/messages/bob", 1_790_000_000_000), ChatPush.from(data))
        assertEquals("alice", ChatPush.from(data + ("toUserId" to "alice"))!!.toUserId)
    }

    @Test fun drawnOnlyForTheAccountItWasSentTo() {
        val toAlice = ChatPush.from(data + ("toUserId" to "alice"))!!
        assertEquals(true, toAlice.isFor("alice"))
        assertEquals(false, toAlice.isFor("bob")) // signed in as someone else since
        assertEquals(false, toAlice.isFor(null)) // signed out
        // An older server names no recipient: one of the conversation's two people must be signed in.
        val unnamed = ChatPush.from(data)!!
        assertEquals(true, unnamed.isFor("alice"))
        assertEquals(false, unnamed.isFor("carol"))
        assertEquals(false, unnamed.isFor("alice_bob"))
    }

    @Test fun anotherTypeOrNoConversationIsNoChatPush() {
        assertNull(ChatPush.from(data + ("type" to "resonance")))
        assertNull(ChatPush.from(data - "type"))
        assertNull(ChatPush.from(data - "conversationId"))
        assertNull(ChatPush.from(data + ("conversationId" to " ")))
        assertNull(ChatPush.from(data - "title"))
    }

    @Test fun theNotificationPayloadFillsWhatTheDataLacks() {
        val old = data - "title" - "body" - "sentAt"
        val push = ChatPush.from(old, fallbackTitle = "bob", fallbackBody = "hello", now = 5)!!
        assertEquals("bob", push.title)
        assertEquals("hello", push.body)
        assertEquals(5L, push.sentAt)
    }

    @Test fun aBadTimeIsNow() {
        assertEquals(7L, ChatPush.from(data + ("sentAt" to "soon"), now = 7)!!.sentAt)
        assertEquals(7L, ChatPush.from(data + ("sentAt" to "0"), now = 7)!!.sentAt)
    }

    @Test fun carriesTheSendersAvatarAsFarAsTheirProfileHasOne() {
        val photo = "https://img.resonance.channel/avatars/2026-10/a.webp"
        val push = ChatPush.from(data + mapOf("fromAvatarUrl" to photo, "fromInitials" to " 小明 ", "fromColor" to "oklch(90% 0.06 140)"))!!
        assertEquals(photo, push.fromAvatarUrl)
        assertEquals("小明", push.fromInitials)
        assertEquals("oklch(90% 0.06 140)", push.fromColor)
        // None of it is needed; a picture that isn't on the web is no picture.
        ChatPush.from(data)!!.let { assertNull(it.fromAvatarUrl); assertNull(it.fromInitials); assertNull(it.fromColor) }
        assertNull(ChatPush.from(data + ("fromAvatarUrl" to "file:///data/data/x.png"))!!.fromAvatarUrl)
        assertNull(ChatPush.from(data + ("fromInitials" to "  "))!!.fromInitials)
    }

    @Test fun aCardAloneStillHasABody() {
        assertEquals("Shared a card", ChatPush.from(data + ("body" to "Shared a card"))!!.body)
        assertEquals("", ChatPush.from(data - "body")!!.body)
    }
}
