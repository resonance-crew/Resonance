package com.resonance.kit.chat

import com.resonance.kit.chat.Outbox.Outgoing
import com.resonance.kit.chat.Outbox.Status
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * A picture in a message (round 7 §4): read from the message document (`image: { id, width,
 * height }`, a reply's `replyTo.image`), drawn from the device under the id the server will keep it
 * by while it is on its way, and given its place in the bubble before it loads — as wide as the
 * bubble, at most 320 tall, its shape between 1:2 and 2:1.
 */
class ChatPictureTest {
    private val at = Date(1_000)
    private fun read(vararg fields: Pair<String, Any?>) = ChatMessage.from("m1", mapOf(*fields), at, "http://10.0.2.2:3100")

    @Test fun aPictureComesWithItsSizeAndNeedsNoWords() {
        // Firestore hands numbers back as Longs (or Doubles).
        val m = read("senderId" to "bob", "text" to "", "image" to mapOf("id" to "AbCdEfGhIjKlMnOpQrSt", "width" to 1600L, "height" to 1200.0))
        assertEquals(ChatImage("AbCdEfGhIjKlMnOpQrSt", 1600, 1200), m.image)
        // Words or not, it is a message to draw: the picture heads its bubble.
        assertEquals(Carried.Words, Carried.of(m, null, emptyMap(), emptySet()))
        assertEquals("", Carried.Words.words(m))
    }

    @Test fun anIdThatCantBeOneIsNoPictureAndAnOddSizeIsUnknown() {
        assertNull(read("image" to mapOf("id" to "../me", "width" to 10, "height" to 10)).image)
        assertNull(read("image" to mapOf("width" to 10, "height" to 10)).image)
        assertNull(read("image" to "AbCdEf").image)
        assertEquals(ChatImage("p1", 0, 0), read("image" to mapOf("id" to "p1", "width" to -3, "height" to "tall")).image)
        // A message without one is the message it always was.
        assertNull(read("senderId" to "bob", "text" to "hi").image)
    }

    @Test fun aReplyToAPictureSaysItWasOne() {
        val quoted = read("replyTo" to mapOf("id" to "m0", "senderId" to "alice", "text" to "", "image" to true)).replyTo
        assertEquals(ReplyQuote("m0", "alice", "", null, image = true), quoted)
        assertEquals(false, read("replyTo" to mapOf("id" to "m0", "senderId" to "alice", "text" to "hi")).replyTo?.image)
        // Replying from here quotes it the same way.
        val picture = ChatMessage("p1", "bob", "看", at, image = ChatImage("p1", 10, 10))
        assertTrue(ReplyQuote.of(picture).image)
    }

    @Test fun aPictureOnItsWayIsDrawnUnderTheIdItWillBeKeptBy() = runBlocking {
        val image = OutgoingImage(ByteArray(3), "image/jpeg", 1200, 900)
        val delivered = mutableListOf<OutgoingImage?>()
        val box = Outbox(this, { m -> delivered += m.image; m.clientId })
        box.enqueue(Outgoing("AbCdEfGhIjKlMnOpQrSt", "alice", "", null, null, null, at, image = image))
        val drawn = box.entries.value.single().toMessage()
        assertEquals(ChatImage("AbCdEfGhIjKlMnOpQrSt", 1200, 900), drawn.image)
        assertEquals("", drawn.text)
        withTimeout(5_000) { box.entries.first { it.single().status == Status.Sent } }
        // What went up is what was made ready.
        assertSame(image, delivered.single())
        box.clear()
    }

    @Test fun aPictureTakesTheBubblesWidthUpToItsHeight() {
        // Landscape: the bubble's width, its own shape.
        assertEquals(PictureBox.Size(250f, 187.5f), PictureBox.of(1600, 1200, maxWidth = 250f))
        // Portrait: 320 tall at most, narrower than the bubble.
        assertEquals(PictureBox.Size(240f, 320f), PictureBox.of(1200, 1600, maxWidth = 260f))
        // A tablet's 520-wide bubble: a 2:1 picture 260 tall.
        assertEquals(PictureBox.Size(520f, 260f), PictureBox.of(2048, 1024, maxWidth = 520f))
    }

    @Test fun beyondTwoToOneEitherWayItIsCutToTwoToOne() {
        // A panorama shows at 2:1, a tall screenshot at 1:2 (the picture fills it, its ends cut).
        assertEquals(PictureBox.Size(250f, 125f), PictureBox.of(4000, 500, maxWidth = 250f))
        assertEquals(PictureBox.Size(160f, 320f), PictureBox.of(500, 4000, maxWidth = 250f))
        // A size not known is a square.
        assertEquals(PictureBox.Size(250f, 250f), PictureBox.of(0, 0, maxWidth = 250f))
    }
}
