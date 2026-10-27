package com.resonance.kit.chat

import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Round 16 §3–§4 in the kit: what a message document says of its reactions and of being unsent, the
 * chips a thread draws from them, choosing (and choosing again to take back), and when a message may
 * still be unsent — and the unsend push that takes a line out of the shade.
 */
class MessageReactionsTest {
    private val origin = "https://resonance.channel"
    private val now = Date(1_800_000_000_000)

    private fun message(fields: Map<String, Any?>) = ChatMessage.from("m1", fields, now, origin)

    @Test fun aMessageReadsWhoReactedHowKeepingIdsItDoesNotKnow() {
        val m = message(mapOf("senderId" to "bob", "text" to "早安", "reactions" to mapOf("alice" to "heart", "bob" to "sparkler", "" to "hug", "carol" to 3)))
        // Unknown ids stay (a newer build's), drawn as nothing; blank keys and non-strings go.
        assertEquals(mapOf("alice" to "heart", "bob" to "sparkler"), m.reactions)
        assertFalse(m.isUnsent)
        assertTrue(m.canReply)
    }

    @Test fun anUnsentMessageIsItsSenderAndTimeAlone() {
        val at = Date(1_800_000_100_000)
        val m = message(mapOf("senderId" to "bob", "sentAt" to now, "unsentAt" to at, "text" to "left over", "reactions" to mapOf("alice" to "heart")))
        assertTrue(m.isUnsent)
        assertEquals(at, m.unsentAt)
        assertEquals("", m.text)
        assertEquals(emptyMap(), m.reactions)
        assertEquals("bob", m.senderId)
        assertFalse(m.canReply)
        // Epoch milliseconds and anything with a toDate() read too (Firestore's Timestamp).
        assertEquals(at, ChatMessage.unsentDate(at.time))
        assertEquals(at, ChatMessage.unsentDate(object { @Suppress("unused") fun toDate() = at }))
        assertNull(ChatMessage.unsentDate(null))
    }

    @Test fun aQuoteOfAnUnsentMessageSaysSo() {
        val m = message(mapOf("senderId" to "alice", "text" to "嗯", "replyTo" to mapOf("id" to "m0", "senderId" to "bob", "unsent" to true)))
        val quote = m.replyTo!!
        assertTrue(quote.unsent)
        assertEquals("m0", quote.id)
        assertEquals("", quote.text)
        assertFalse(message(mapOf("senderId" to "alice", "text" to "嗯", "replyTo" to mapOf("id" to "m0", "senderId" to "bob", "text" to "hi"))).replyTo!!.unsent)
    }

    @Test fun chipsAreTheKnownReactionsInTheirOrderCountingBoth() {
        assertEquals(listOf("heart", "moved", "laugh", "hug", "thumbs"), MessageReactions.KNOWN)
        val both = MessageReactions.chips(mapOf("alice" to "laugh", "bob" to "laugh"), me = "alice")
        assertEquals(listOf(MessageReactions.Chip("laugh", 2, mine = true)), both)
        // Two distinct ones in the canonical order, whoever gave which first; an unknown id is no chip.
        val two = MessageReactions.chips(mapOf("bob" to "thumbs", "alice" to "heart", "carol" to "sparkler"), me = "alice")
        assertEquals(listOf(MessageReactions.Chip("heart", 1, true), MessageReactions.Chip("thumbs", 1, false)), two)
        assertEquals(emptyList(), MessageReactions.chips(emptyMap(), "alice"))
        assertNull(MessageReactions.mine(mapOf("alice" to "sparkler"), "alice"))
        assertEquals("hug", MessageReactions.mine(mapOf("alice" to "hug"), "alice"))
    }

    @Test fun choosingReplacesAndChoosingTheSameAgainTakesItBack() {
        val (replaced, sent) = MessageReactions.choose(mapOf("alice" to "heart", "bob" to "hug"), "alice", "laugh")
        assertEquals(mapOf("alice" to "laugh", "bob" to "hug"), replaced)
        assertEquals("laugh", sent)
        val (removed, none) = MessageReactions.choose(replaced, "alice", "laugh")
        assertEquals(mapOf("bob" to "hug"), removed)
        assertNull(none)
    }

    @Test fun onlyYourOwnDeliveredWordsWithinADayCanBeUnsent() {
        val sent = ChatMessage("m1", "alice", "早安", Date(now.time - 60_000))
        assertTrue(MessageReactions.canUnsend(sent, "alice", now))
        assertFalse(MessageReactions.canUnsend(sent, "bob", now))
        assertFalse(MessageReactions.canUnsend(sent.copy(isNote = true), "alice", now))
        assertFalse(MessageReactions.canUnsend(sent.copy(delivery = Delivery.Sending), "alice", now))
        assertFalse(MessageReactions.canUnsend(sent.copy(unsentAt = now), "alice", now))
        val day = MessageReactions.UNSEND_WINDOW_MS
        assertTrue(MessageReactions.canUnsend(sent.copy(sentAt = Date(now.time - day)), "alice", now))
        assertFalse(MessageReactions.canUnsend(sent.copy(sentAt = Date(now.time - day - 1)), "alice", now))
        assertTrue(MessageReactions.canReact(sent))
        assertFalse(MessageReactions.canReact(sent.copy(delivery = Delivery.Failed)))
        assertFalse(MessageReactions.canReact(sent.copy(unsentAt = now)))
    }

    @Test fun theUnsendPushNamesTheConversationAndTheMessageForItsAccount() {
        val push = ChatUnsend.from(mapOf("type" to "unsend", "conversationId" to "alice_bob", "messageId" to "m9"))!!
        assertEquals(ChatUnsend("alice_bob", "m9"), push)
        assertTrue(push.isFor("alice"))
        assertFalse(push.isFor("carol"))
        assertFalse(push.isFor(null))
        assertFalse(ChatUnsend.from(mapOf("type" to "unsend", "conversationId" to "alice_bob", "messageId" to "m9", "toUserId" to "bob"))!!.isFor("alice"))
        assertNull(ChatUnsend.from(mapOf("type" to "message", "conversationId" to "alice_bob", "messageId" to "m9")))
        assertNull(ChatUnsend.from(mapOf("type" to "unsend", "conversationId" to "alice_bob")))
        // A message push is still a message push, not an unsend.
        assertNull(ChatPush.from(mapOf("type" to "unsend", "conversationId" to "alice_bob", "title" to "bob")))
    }
}
