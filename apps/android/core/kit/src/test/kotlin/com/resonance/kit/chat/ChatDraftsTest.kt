package com.resonance.kit.chat

import com.resonance.kit.api.MessagingApi
import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * A message written and not sent waits on the device (round 22 §4.4): per account and conversation —
 * its words, the reply it carries, the note it answers and its card, never pictures — through the
 * thread being left and the app being killed; gone once sent, emptied, deleted or signed out of; at most
 * fifty, none past thirty days.
 */
class ChatDraftsTest {
    private class Device : ChatDrafts.Storage {
        val values = HashMap<String, String>()
        override fun read(account: String): String? = values[account]
        override fun write(account: String, value: String?) {
            if (value == null) values.remove(account) else values[account] = value
        }
    }

    private val device = Device()
    private var now = 1_000_000L
    private fun drafts() = ChatDrafts(device) { now }

    @Test fun everythingButPicturesComesBackForThatConversationAfterTheAppWasKilled() {
        val quote = ReplyQuote("m1", "bob", "〔貼圖：謝謝〕", sticker = ChatSticker("twine", "thanks"))
        val draft = ChatDraft(
            text = "那天其實我也走過那條河堤",
            reply = quote,
            noteRef = MessagingApi.Note("walk", "n1"),
            card = DraftCard("c1", "雨後散步", "https://img/x.webp", keptPrivate = true),
        )
        drafts().of("alice").keep("alice_bob", draft)
        // A new store over the same device: the app opened again.
        assertEquals(draft, drafts().of("alice").get("alice_bob"))
        assertNull(drafts().of("alice").get("alice_carol"))
        assertNull(drafts().of("bob").get("alice_bob"))
        assertEquals(mapOf("alice_bob" to draft), drafts().of("alice").all())
    }

    @Test fun anEmptiedOrSentDraftLeavesNothingAndSignOutTakesThemAll() {
        val alice = drafts().of("alice")
        alice.keep("a_b", ChatDraft("hi"))
        alice.keep("a_c", ChatDraft("yo"))
        alice.keep("a_b", ChatDraft("   "))
        assertNull(alice.get("a_b"))
        alice.clear("a_c")
        assertNull(alice.get("a_c"))
        assertTrue(device.values.isEmpty(), "nothing left on the device")
        alice.keep("a_b", ChatDraft("again"))
        drafts().forget("alice")
        assertNull(drafts().of("alice").get("a_b"))
    }

    @Test fun atMostFiftyTheLatestWrittenAndNoneOlderThanThirtyDays() {
        val alice = drafts().of("alice")
        for (i in 0 until 55) {
            now += 1000
            alice.keep("p$i", ChatDraft("draft $i"))
        }
        val kept = alice.all()
        assertEquals(50, kept.size)
        assertFalse("p0" in kept)
        assertTrue("p54" in kept)
        now += ChatDrafts.MAX_AGE_MS + 1
        assertTrue(alice.all().isEmpty())
    }

    @Test fun theListShowsTheWordsElseTheCardsTitle() {
        assertEquals("line one line two", ChatDraft("  line one\nline two ").preview)
        assertEquals("雨後散步", ChatDraft(card = DraftCard("c", "雨後散步")).preview)
        assertNull(ChatDraft(reply = ReplyQuote("m", "b", "x")).preview)
        assertFalse(ChatDraft(reply = ReplyQuote("m", "b", "x")).isEmpty)
    }

    @Test fun aRestoredReplyIsDroppedWhenItsMessageWasUnsentOrIsGone() {
        val quote = ReplyQuote("m1", "bob", "hi")
        val held = ChatMessage("m1", "bob", "hi", Date(1))
        val unsent = ChatMessage("m1", "bob", "", Date(1), unsentAt = Date(2))
        assertTrue(replyStillStands(quote, listOf(held), complete = true, conversationGone = false))
        assertFalse(replyStillStands(quote, listOf(unsent), complete = false, conversationGone = false))
        // Not held: gone only when the whole conversation is held; older pages may still have it.
        assertFalse(replyStillStands(quote, emptyList(), complete = true, conversationGone = false))
        assertTrue(replyStillStands(quote, emptyList(), complete = false, conversationGone = false))
        assertFalse(replyStillStands(quote, listOf(held), complete = false, conversationGone = true))
    }
}
