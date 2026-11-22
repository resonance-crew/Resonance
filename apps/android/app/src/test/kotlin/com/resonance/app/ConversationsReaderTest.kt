package com.resonance.app

import com.resonance.api.models.Conversation
import com.resonance.kit.api.InboxApi
import com.resonance.kit.realtime.Signals
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The conversation list's delta (traffic phase 3, the web's conversationsDelta.test): a pull reads
 * only the conversations whose `threads` counters moved and merges them into the list it holds, and
 * reads whole only when that can't be trusted — or reads nothing when nothing moved.
 */
class ConversationsReaderTest {
    /** The server's list, by id; each pull answers from it. */
    private val server = LinkedHashMap<String, Conversation>()
    private var complete = true
    /** What was asked: `whole`, or the pairs a delta named. */
    private val asked = ArrayList<String>()
    /** The listener's counters (null: not live). */
    private var heard: Signals? = null
    private var clock = 1_000_000L

    private val reader = ConversationsReader(
        whole = { asked += "whole"; InboxApi.Listed(server.values.sortedByDescending { it.updatedAt }, complete) },
        some = { pairs -> asked += pairs.joinToString(","); server.values.filter { it.id in pairs }.sortedByDescending { it.updatedAt } },
        heard = { heard },
        now = { clock },
    )

    private fun conversation(other: String, at: Int) = Conversation(
        id = "a_$other", participants = listOf("a", other), otherId = other, other = null, unread = 0,
        lastMessage = null, request = null, createdAt = null,
        updatedAt = "2026-11-22T08:00:%02d.000000Z".format(at), originCardId = null,
    )

    private fun put(other: String, at: Int) {
        server["a_$other"] = conversation(other, at)
    }

    private fun read() = runBlocking { reader.read() }
    private fun ids(read: ConversationsReader.Read) = read.conversations.map { it.id }

    /** Three conversations, read whole once with the listener live at inbox 1. */
    private fun started() {
        put("b", 3); put("c", 2); put("d", 1)
        heard = Signals(inbox = 1, threads = mapOf("a_b" to 1, "a_c" to 1, "a_d" to 1))
        assertTrue(read() is ConversationsReader.Read.Whole)
        asked.clear()
    }

    @Test fun aMessageReadsOnlyItsConversationAndMergesItIn() {
        started()
        // d's other person wrote: d moves to the top, its counter and inbox with it.
        put("d", 9)
        heard = Signals(inbox = 2, threads = mapOf("a_b" to 1, "a_c" to 1, "a_d" to 2))
        val read = read()
        assertEquals(listOf("a_d"), asked)
        assertEquals(ConversationsReader.Read.Delta(read.conversations, setOf("a_d")), read)
        assertEquals(listOf("a_d", "a_b", "a_c"), ids(read))
        // The next pull with nothing new reads nothing.
        assertTrue(read() is ConversationsReader.Read.Same)
        assertEquals(listOf("a_d"), asked)
    }

    @Test fun aNewConversationJoinsTheList() {
        started()
        put("e", 9)
        heard = Signals(inbox = 2, threads = mapOf("a_b" to 1, "a_c" to 1, "a_d" to 1, "a_e" to 1))
        assertEquals(listOf("a_e", "a_b", "a_c", "a_d"), ids(read()))
        assertEquals(listOf("a_e"), asked)
    }

    @Test fun oneAskedForAndLeftOutIsGone() {
        started()
        server.remove("a_c")
        heard = Signals(inbox = 2, threads = mapOf("a_b" to 1, "a_c" to 2, "a_d" to 1))
        assertEquals(listOf("a_b", "a_d"), ids(read()))
        assertEquals(listOf("a_c"), asked)
    }

    @Test fun aListThePagesCutShortReadsWholeWhenItLosesOne() {
        complete = false
        started()
        server.remove("a_c")
        heard = Signals(inbox = 2, threads = mapOf("a_b" to 1, "a_c" to 2, "a_d" to 1))
        val read = read()
        assertEquals(listOf("a_c", "whole"), asked)
        assertTrue(read is ConversationsReader.Read.Whole)
    }

    @Test fun moreThanTwentyMovedReadsWhole() {
        started()
        val threads = (1..21).associate { "a_n$it" to 1L } + mapOf("a_b" to 1L, "a_c" to 1L, "a_d" to 1L)
        (1..21).forEach { put("n$it", 10 + it) }
        heard = Signals(inbox = 2, threads = threads)
        assertTrue(read() is ConversationsReader.Read.Whole)
        assertEquals(listOf("whole"), asked)
    }

    @Test fun twentyMovedIsStillADelta() {
        started()
        val threads = (1..20).associate { "a_n$it" to 1L } + mapOf("a_b" to 1L, "a_c" to 1L, "a_d" to 1L)
        (1..20).forEach { put("n$it", 10 + it) }
        heard = Signals(inbox = 2, threads = threads)
        assertTrue(read() is ConversationsReader.Read.Delta)
        assertEquals(20, asked.single().split(",").size)
    }

    @Test fun theInboxMovingWithNoConversationsCounterReadsWhole() {
        started()
        heard = Signals(inbox = 2, threads = mapOf("a_b" to 1, "a_c" to 1, "a_d" to 1))
        assertTrue(read() is ConversationsReader.Read.Whole)
        assertEquals(listOf("whole"), asked)
    }

    @Test fun beforeTheListenerAnswersAndAfterItFailsEveryPullReadsWhole() {
        put("b", 3)
        heard = null
        read()
        // The listener's first answer: what moved between the read and it no one can say.
        heard = Signals(inbox = 1, threads = mapOf("a_b" to 1))
        assertTrue(read() is ConversationsReader.Read.Whole)
        // Live: nothing moved reads nothing.
        assertTrue(read() is ConversationsReader.Read.Same)
        // Failed (SignalHub.live says null): whole, each pull.
        heard = null
        assertTrue(read() is ConversationsReader.Read.Whole)
        assertTrue(read() is ConversationsReader.Read.Whole)
        assertEquals(listOf("whole", "whole", "whole", "whole"), asked)
    }

    @Test fun tenMinutesAfterTheLastWholeReadItReadsWholeAgain() {
        // The server's early 304 trusts a list as long (signalTag EARLY_MAX_AGE_S), and the web's LIST_FULL_READ_MS.
        assertEquals(10 * 60_000L, ConversationsReader.FULL_READ_MILLIS)
        started()
        clock += ConversationsReader.FULL_READ_MILLIS - 1
        assertTrue(read() is ConversationsReader.Read.Same)
        // A delta doesn't put the whole read off.
        put("d", 9)
        heard = Signals(inbox = 2, threads = mapOf("a_b" to 1, "a_c" to 1, "a_d" to 2))
        assertTrue(read() is ConversationsReader.Read.Delta)
        clock += 1
        assertTrue(read() is ConversationsReader.Read.Whole)
        assertEquals(listOf("a_d", "whole"), asked)
    }

    @Test fun aSafetyPullWithNothingMovedAsksNothing() {
        started()
        // A reaction moves a thread's counter but not the list's: no row changed.
        heard = Signals(inbox = 1, threads = mapOf("a_b" to 2, "a_c" to 1, "a_d" to 1))
        repeat(5) { assertTrue(read() is ConversationsReader.Read.Same) }
        assertEquals(emptyList<String>(), asked)
        // …and the moved thread counter isn't read again when the list later moves for another.
        put("c", 9)
        heard = Signals(inbox = 2, threads = mapOf("a_b" to 2, "a_c" to 2, "a_d" to 1))
        assertEquals(listOf("a_c", "a_b", "a_d"), ids(read()))
        assertEquals(listOf("a_c"), asked)
    }
}
