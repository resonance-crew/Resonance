package com.resonance.app

import android.app.Application
import com.resonance.api.models.FeedCard
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.IOException

/**
 * The bell's extras across visits (#8, the bell flashing as it opens): a card or a face that couldn't
 * be read last time is asked again when the screen appears, and its row keeps drawing as it did —
 * without it, never the skeleton — until the answer replaces it. Before the fix every visit took the
 * failed ones out of the failed set first, so each row flashed back to its skeleton while it was read.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class NotificationsExtrasTest {
    private val store = NotificationsStore()
    private val covers = ArrayList<String>()

    init {
        store.prefetchCovers = { covers += it }
    }

    private fun row(id: String, from: String, card: String) = NotificationsStore.Item(
        id = id, type = "note", fromHandle = null, fromUserId = from, cardId = card, preview = null, noteId = null,
        count = null, readAt = null, createdAt = null,
    )

    private fun card(id: String) = FeedCard(
        id = id, slug = id, title = id, excerpt = "…", tags = emptyList(), publishedAt = "2026-09-01T08:00:00.000Z",
        author = null, anonymous = false, visibility = FeedCard.Visibility.`public`, imageUrl = "https://img.example/$id.webp", imageLabel = null,
        accentHue = 140.0, readMinutes = 1, referenceCardId = null, reason = null,
    )

    private val person = Person("b", "bob", "BO", null, null, null)
    private val rows = listOf(row("n1", "b", "c1"))
    private val offline: suspend (List<String>) -> Map<String, FeedCard?> = { throw IOException("offline") }
    private val nobody: suspend (String) -> Person? = { throw IOException("offline") }

    @Test fun whatFailedLastVisitStaysDrawnAsItWasWhileItIsAskedAgain() = runBlocking {
        // The first visit, offline: neither the face nor the card could be read.
        store.loadExtras(rows, HashSet(), nobody, offline)
        assertTrue(store.extras.value.cardSettled("c1"))
        assertTrue(store.extras.value.personSettled("b"))
        assertTrue("c1" in store.extras.value.failedCards)

        // The next visit asks again; while the answer is on its way the row draws as before.
        val asked = CompletableDeferred<Unit>()
        val answer = CompletableDeferred<Unit>()
        val visit = launch {
            store.loadExtras(
                rows, HashSet(),
                person = { asked.complete(Unit); answer.await(); person },
                cards = { ids -> asked.complete(Unit); answer.await(); ids.associateWith { card(it) } },
            )
        }
        asked.await()
        assertTrue("a failed card is not a skeleton again while it is asked", store.extras.value.cardSettled("c1"))
        assertTrue("nor a failed face", store.extras.value.personSettled("b"))

        answer.complete(Unit)
        visit.join()
        val extras = store.extras.value
        assertEquals("c1", extras.cards["c1"]?.id)
        assertFalse("c1" in extras.failedCards)
        assertEquals(person, extras.people["b"])
        assertFalse("b" in extras.failedPeople)
        // The card's cover went to the image loader as it arrived.
        assertEquals(listOf("https://img.example/c1.webp"), covers)
    }

    @Test fun aSecondFailureLeavesItFailed() = runBlocking {
        store.loadExtras(rows, HashSet(), nobody, offline)
        store.loadExtras(rows, HashSet(), nobody, offline)
        assertTrue("c1" in store.extras.value.failedCards)
        assertTrue("b" in store.extras.value.failedPeople)
        assertTrue(covers.isEmpty())
    }

    @Test fun aBackgroundReadLeavesWhatFailedAloneAndOneVisitAsksOnce() = runBlocking {
        store.loadExtras(rows, HashSet(), nobody, offline)
        var cardReads = 0
        val count: suspend (List<String>) -> Map<String, FeedCard?> = { ids -> cardReads++; ids.associateWith { card(it) } }
        // A pull's background read doesn't retry it…
        store.loadExtras(rows, HashSet(), nobody, count, retryFailed = false)
        assertEquals(0, cardReads)
        // …the screen's appearance does, once however many times the rows arrive.
        val skip = HashSet<String>()
        store.loadExtras(rows, skip, { person }, count)
        store.loadExtras(rows, skip, { person }, count)
        assertEquals(1, cardReads)
        assertEquals("c1", store.extras.value.cards["c1"]?.id)
    }
}
