package com.resonance.app.ui

import com.resonance.kit.chat.ChatImage
import com.resonance.kit.chat.ChatMessage
import com.resonance.kit.chat.Delivery
import com.resonance.kit.chat.LinkPreview
import com.resonance.kit.chat.ReplyQuote
import com.resonance.kit.chat.RunPosition
import com.resonance.kit.chat.ThreadRow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import java.util.Date

/**
 * A thread row's kind, which the list reuses compositions by (A10): what the message carries from
 * the start — a picture, a note's card, a card, a reply's quote — and nothing that comes later, so a
 * row sending, then sent, then wearing its link's preview stays the kind it was.
 */
class ThreadRowTypeTest {
    private fun row(message: ChatMessage) = ThreadRow(message, RunPosition.Single, dayLabel = false, timeLabel = false)
    private val plain = ChatMessage("m1", "bob", "hello https://example.com", Date(0))

    @Test fun eachKindOfMessageIsItsOwnKindOfRow() {
        val kinds = listOf(
            plain,
            plain.copy(image = ChatImage("m1", 800, 600)),
            plain.copy(cardRef = "c1", isNote = true),
            plain.copy(cardRef = "c1"),
            plain.copy(replyTo = ReplyQuote("m0", "alice", "hi")),
        ).map { rowContentType(row(it)) }
        assertEquals(kinds.size, kinds.distinct().size)
    }

    @Test fun aRowKeepsItsKindWhileItsMessageIsSentAndUnfurled() {
        val sending = plain.copy(id = "client-1", key = "client-1", delivery = Delivery.Sending, replyTo = ReplyQuote("m0", "alice", "hi"))
        val sent = sending.copy(id = "m9", delivery = Delivery.Delivered)
        val unfurled = sent.copy(preview = LinkPreview("https://example.com", "Example", null, null, null))
        assertEquals(rowContentType(row(sending)), rowContentType(row(sent)))
        assertEquals(rowContentType(row(sent)), rowContentType(row(unfurled)))
        assertNotEquals(rowContentType(row(plain)), rowContentType(row(sending)))
    }
}
