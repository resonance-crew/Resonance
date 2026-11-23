package com.resonance.app

import com.resonance.api.models.Author
import com.resonance.api.models.BellItem
import com.resonance.api.models.BellPage
import com.resonance.api.models.BellPayload
import com.resonance.kit.realtime.Signals
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The bell's delta (the web's bellReader, client/notifications): the newest page once with a cursor,
 * then — when the `bell` counter moved — only the rows changed since it, merged by id, newest first,
 * cut to the limit; whole when no one can say what moved, every ten minutes, and when the server
 * answers no `delta`; nothing at all when nothing moved while the listener is live.
 */
class BellReaderTest {
    /** The server's rows, by id. */
    private val server = LinkedHashMap<String, BellItem>()
    /** The rows the next `updatedAfter` answer says changed (null: the server can't tell — no `delta`). */
    private var changed: List<String>? = emptyList()
    /** What was asked: `whole`, or `since:<cursor>`. */
    private val asked = ArrayList<String>()
    private var heard: Signals? = null
    private var clock = 1_000_000L
    private var cursors = 0
    private val limit = 3

    private val reader = BellReader(
        page = { cursor ->
            val next = "k${++cursors}"
            val delta = changed
            if (cursor == null || delta == null) {
                asked += if (cursor == null) "whole" else "since:$cursor"
                BellPage(newest().take(limit), people(newest().take(limit)), null, delta = null, updatedCursor = next)
            } else {
                asked += "since:$cursor"
                val rows = delta.mapNotNull { server[it] }
                BellPage(rows, people(rows), null, delta = true, updatedCursor = next)
            }
        },
        heard = { heard },
        limit = limit,
        now = { clock },
    )

    private fun newest() = server.values.sortedWith(compareByDescending<BellItem> { it.createdAt }.thenByDescending { it.id })

    private fun people(rows: List<BellItem>) = rows.mapNotNull { it.payload.fromUserId }.distinct().map {
        Author(id = it, handle = "h$it", initials = "H", accentColor = "", avatarUrl = null, avatarSeed = null, verified = false, region = null)
    }

    private fun put(id: String, at: Int, from: String = "p$id", readAt: String? = null) {
        server[id] = BellItem(
            id = id, type = "note", payload = BellPayload(fromUserId = from, cardId = "c$id"), readAt = readAt,
            createdAt = "2026-11-22T08:00:%02d.000000Z".format(at),
        )
    }

    private fun read() = runBlocking { reader.read() }
    private fun ids(read: BellReader.Read) = read.items.map { it.id }

    /** Three rows, read whole once with the listener live at bell 1. */
    private fun started() {
        put("a", 3); put("b", 2); put("c", 1)
        heard = Signals(bell = 1)
        assertTrue(read() is BellReader.Read.Whole)
        asked.clear()
    }

    @Test fun aNewRowReadsOnlyWhatChangedAndMergesItInNewestFirst() {
        started()
        put("d", 9)
        changed = listOf("d")
        heard = Signals(bell = 2)
        val read = read()
        assertEquals(listOf("since:k1"), asked)
        assertTrue(read is BellReader.Read.Delta)
        assertEquals(setOf("d"), (read as BellReader.Read.Delta).changed)
        // Cut to the limit: the oldest falls off.
        assertEquals(listOf("d", "a", "b"), ids(read))
        // The answer names the changed rows' people.
        assertEquals(listOf("pd"), read.people.map { it.id })
        // Nothing moved since: nothing is asked.
        assertTrue(read() is BellReader.Read.Same)
        assertEquals(listOf("since:k1"), asked)
    }

    @Test fun aRowReadElsewhereIsReplacedInPlace() {
        started()
        put("b", 2, readAt = "2026-11-22T09:00:00Z")
        changed = listOf("b")
        heard = Signals(bell = 2)
        val read = read()
        assertEquals(listOf("a", "b", "c"), ids(read))
        assertEquals("2026-11-22T09:00:00Z", read.items[1].readAt)
    }

    @Test fun aRowRungAgainMovesToTheTop() {
        started()
        put("c", 8)
        changed = listOf("c")
        heard = Signals(bell = 2)
        assertEquals(listOf("c", "a", "b"), ids(read()))
    }

    @Test fun theSameTimeIsOrderedById() {
        started()
        put("z", 3)
        changed = listOf("z")
        heard = Signals(bell = 2)
        assertEquals(listOf("z", "a", "b"), ids(read()))
    }

    @Test fun noDeltaInTheAnswerIsThePageWhole() {
        started()
        server.remove("a")
        put("e", 9)
        changed = null
        heard = Signals(bell = 2)
        val read = read()
        assertEquals(listOf("since:k1"), asked)
        assertTrue(read is BellReader.Read.Whole)
        assertEquals(listOf("e", "b", "c"), ids(read))
        // …and its cursor is the next delta's.
        changed = emptyList()
        heard = Signals(bell = 3)
        assertTrue(read() is BellReader.Read.Delta)
        assertEquals("since:k2", asked.last())
    }

    @Test fun beforeTheListenerAnswersAndAfterItFailsEveryPullReadsWhole() {
        put("a", 1)
        heard = null
        read()
        // The listener's first answer: what moved between the read and it no one can say.
        heard = Signals(bell = 1)
        assertTrue(read() is BellReader.Read.Whole)
        // Live: nothing moved reads nothing.
        assertTrue(read() is BellReader.Read.Same)
        heard = null
        assertTrue(read() is BellReader.Read.Whole)
        assertTrue(read() is BellReader.Read.Whole)
        assertEquals(listOf("whole", "whole", "whole", "whole"), asked)
    }

    @Test fun anAnswerWithNoCursorReadsWholeNext() {
        val reader = BellReader(
            page = { asked += "whole"; BellPage(emptyList(), emptyList(), null, updatedCursor = null) },
            heard = { Signals(bell = 1) }, limit = 3, now = { clock },
        )
        runBlocking { reader.read(); reader.read() }
        assertEquals(listOf("whole", "whole"), asked)
    }

    @Test fun tenMinutesAfterTheLastWholeReadItReadsWholeAgain() {
        assertEquals(10 * 60_000L, BellReader.FULL_READ_MILLIS)
        started()
        clock += BellReader.FULL_READ_MILLIS - 1
        assertTrue(read() is BellReader.Read.Same)
        // A delta doesn't put the whole read off.
        put("d", 9)
        changed = listOf("d")
        heard = Signals(bell = 2)
        assertTrue(read() is BellReader.Read.Delta)
        clock += 1
        assertTrue(read() is BellReader.Read.Whole)
        assertEquals(listOf("since:k1", "whole"), asked)
    }

    @Test fun anotherTopicMovingAsksNothing() {
        started()
        heard = Signals(bell = 1, inbox = 5, graph = 2)
        repeat(3) { assertTrue(read() is BellReader.Read.Same) }
        assertEquals(emptyList<String>(), asked)
    }
}
