package com.resonance.app.thoughtmap

import android.app.Application
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ReadingApi
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.minutes

/**
 * The thought map's reads (2026-10-27). The map once sat on its loader for more than 15 s, opened
 * right after a card went to the trash and came back: its first read waits on Firestore, which never
 * answers a read on a stream that has stalled (reproduced by pausing the emulator: the loader until
 * it answered), and nothing offered a way on. And each card the trash and its restore change is read
 * again for each, the answers landing in any order: the trash's, landing last, hid the restored card.
 * The twin of iOS's ThoughtMapReadsTests.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class ThoughtMapReadsTest {
    private fun card(id: String) =
        MapCard(id, "me", slug = null, title = "Card $id", story = "A story.", tags = emptyList(), visibility = "public", publishedAt = null, mediaUrl = null, accentHue = null)

    /** My cards [ids], each on the map. */
    private fun board(vararg ids: String) = ThoughtMapStore.Board(
        ThoughtMapService.Loaded(ids.mapIndexed { i, id -> MapNodeDoc(id, i * 300.0, 0.0, null) }, emptyList(), emptyList()),
        ids.associateWith(::card),
        emptySet(),
    )

    private fun store() = ThoughtMapStore(ReadingApi(ApiConfiguration("http://localhost/") { "token" }))

    /** The map shown with my cards [ids]. */
    private suspend fun loaded(vararg ids: String) = store().apply {
        readBoard = { board(*ids) }
        load("me")
    }

    /** Until [condition] holds (5 s at most), the reads on their way running meanwhile. */
    private suspend fun eventually(condition: () -> Boolean) = withTimeout(5_000) { while (!condition()) delay(5) }

    private val ThoughtMapStore.order get() = nodeOrder.toList()

    @Test fun aFirstReadWithNoAnswerOffersAnotherAndItsLateAnswerPutsNothingBack() = runBlocking {
        val store = store()
        store.firstReadPatience = 300.milliseconds
        val stalled = CompletableDeferred<ThoughtMapStore.Board>()
        val retried = CompletableDeferred<ThoughtMapStore.Board>()
        var asked = 0
        store.readBoard = { (if (++asked == 1) stalled else retried).await() }
        val first = launch { store.load("me") }
        eventually { asked == 1 }
        // The loader while the read is on its way…
        assertFalse(store.loaded || store.failed)
        // …and past the patience 再試一次, never a loader with no end.
        eventually { store.failed }
        assertFalse(store.loaded)
        // 再試一次 (its own patience long, so only the answers decide): the loader again, and the new read's answer is the map.
        store.firstReadPatience = 1.minutes
        val retry = launch { store.load("me") }
        eventually { asked == 2 }
        assertFalse(store.failed)
        retried.complete(board("a", "b"))
        retry.join()
        assertTrue(store.loaded && !store.failed)
        assertEquals(listOf("a", "b"), store.order)
        // The stalled read answering at last puts nothing back.
        stalled.complete(board("a"))
        first.join()
        assertEquals(listOf("a", "b"), store.order)
        assertEquals(setOf("a", "b"), store.cards.keys)
    }

    @Test fun aFirstReadThatAnswersLateStillShowsTheMap() = runBlocking {
        val store = store()
        store.firstReadPatience = 50.milliseconds
        val slow = CompletableDeferred<ThoughtMapStore.Board>()
        store.readBoard = { slow.await() }
        val read = launch { store.load("me") }
        eventually { store.failed }
        // No 再試一次 asked for: the read's own answer, when it comes, is the map.
        slow.complete(board("a"))
        read.join()
        assertTrue(store.loaded && !store.failed)
        assertEquals(listOf("a"), store.order)
    }

    @Test fun theTrashsReadLandingAfterTheRestoresLeavesTheCardOnTheMap() = runBlocking {
        val store = loaded("a", "x")
        assertEquals(listOf("a", "x"), store.order)
        val afterTrash = CompletableDeferred<MapCard?>()
        val afterRestore = CompletableDeferred<MapCard?>()
        var asked = 0
        store.readCard = { _, _ -> (if (++asked == 1) afterTrash else afterRestore).await() }
        // 刪除, then 復原 a moment later: the map reads the card again for each.
        val trashRead = launch { store.refreshCards(listOf("x")) }
        eventually { asked == 1 }
        val restoreRead = launch { store.refreshCards(listOf("x")) }
        eventually { asked == 2 }
        // The restore's read answers first: the card is where it was.
        afterRestore.complete(card("x"))
        restoreRead.join()
        assertEquals(listOf("a", "x"), store.order)
        // The trash's read answers last — the card in the trash, null — and changes nothing.
        afterTrash.complete(null)
        trashRead.join()
        assertEquals(listOf("a", "x"), store.order)
        assertNotNull(store.cards["x"])
    }

    @Test fun inOrderTheTrashTakesTheCardOffAndTheRestorePutsItBack() = runBlocking {
        val store = loaded("a", "x")
        val answers = ArrayDeque(listOf(null, card("x")))
        store.readCard = { _, _ -> answers.removeFirst() }
        store.refreshCards(listOf("x"))
        assertEquals(listOf("a"), store.order)
        assertNull(store.cards["x"])
        store.refreshCards(listOf("x"))
        // Back where it was: its place was kept meanwhile.
        assertEquals(listOf("a", "x"), store.order)
        assertEquals(300.0, store.nodes["x"]?.x)
    }

    @Test fun aReadThatFailsLeavesAnEarlierOneToAnswer() = runBlocking {
        val store = loaded("a", "x")
        val earlier = CompletableDeferred<MapCard?>()
        var asked = 0
        store.readCard = { _, _ -> if (++asked == 1) earlier.await() else throw IllegalStateException("UNAVAILABLE") }
        val first = launch { store.refreshCards(listOf("x")) }
        eventually { asked == 1 }
        // A second read of the card couldn't be read for now: the card stays as it was…
        store.refreshCards(listOf("x"))
        assertEquals(listOf("a", "x"), store.order)
        // …and the first one's answer (in the trash) still counts.
        earlier.complete(null)
        first.join()
        assertEquals(listOf("a"), store.order)
    }

    @Test fun aReadLeftBeforeItAnswersLeavesAnEarlierOneToAnswer() = runBlocking {
        val store = loaded("a", "x")
        val earlier = CompletableDeferred<MapCard?>()
        var asked = 0
        store.readCard = { _, _ -> if (++asked == 1) earlier.await() else awaitCancellation() }
        val first = launch { store.refreshCards(listOf("x")) }
        eventually { asked == 1 }
        // A newer read of the card, left on its way (the screen's effect that began it was cancelled)…
        val left = launch { store.refreshCards(listOf("x")) }
        eventually { asked == 2 }
        left.cancelAndJoin()
        assertEquals(listOf("a", "x"), store.order)
        // …so the first one's answer still counts.
        earlier.complete(null)
        first.join()
        assertEquals(listOf("a"), store.order)
    }
}
