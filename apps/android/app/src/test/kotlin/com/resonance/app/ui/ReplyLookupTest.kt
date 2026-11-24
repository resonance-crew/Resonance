package com.resonance.app.ui

import com.resonance.app.DraftService
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Round 35 (4) (the owner: 在模拟器上，这个用卡片回应的这个按钮，有时候进到页面都会一直在 loading): the reply segment is live from
 * its first frame, the background read ends (6 s, then retries), and a press before an answer asks then — inked only
 * while it does — and opens what it hears; a failed ask says so quietly and leaves the segment pressable.
 */
class ReplyLookupTest {
    private val draft = DraftService.Resonance("r1", "r1", published = false)

    @Test fun theSegmentIsLiveFromEntryNeverASpinnerOfItsOwn() {
        val lookup = ReplyLookup(find = { awaitCancellation() })
        // Before any answer: the plain 用卡片回應, not inked, pressable.
        assertEquals(ReplyLookup.State.Looking, lookup.state)
        assertFalse(lookup.asking)
        assertNull(lookup.mine)
        assertEquals("loading only while a press asks", true, File("src/main/kotlin/com/resonance/app/ui/CardViewerActions.kt").readText().contains("loading = lookup.asking"))
        assertEquals(6_000L, REPLY_LOOKUP_PATIENCE_MS)
    }

    @Test fun aHangingReadEndsAtItsPatienceAndIsTriedAgainThenFails() = runBlocking {
        val reads = AtomicInteger()
        val lookup = ReplyLookup(find = { reads.incrementAndGet(); awaitCancellation() }, patienceMs = 40, retriesMs = listOf(10, 10))
        val started = System.nanoTime()
        lookup.look()
        val took = (System.nanoTime() - started) / 1_000_000
        assertEquals(ReplyLookup.State.Failed, lookup.state)
        assertEquals("the first read and two retries", 3, reads.get())
        assertTrue("ended ($took ms), never for good", took < 2_000)
        assertFalse(lookup.asking)
        // Failed is not a press refused: the segment asks again.
        assertNull(lookup.mine)
    }

    @Test fun aReadThatFailsThenAnswersIsFound() = runBlocking {
        val reads = AtomicInteger()
        val lookup = ReplyLookup(find = { if (reads.incrementAndGet() < 3) error("unavailable") else draft }, patienceMs = 40, retriesMs = listOf(5, 5))
        lookup.look()
        assertEquals(ReplyLookup.State.Found(draft), lookup.state)
        assertEquals(ReplyAction.Mine.Found(published = false), lookup.mine)
    }

    @Test fun aPressBeforeTheAnswerAsksThenAndOpensWhatItHears() = runBlocking {
        // The background read hangs; the press's own read answers "none": the picker can open.
        val calls = AtomicInteger()
        val lookup = ReplyLookup(find = { if (calls.incrementAndGet() == 1) awaitCancellation() else null }, patienceMs = 5_000, retriesMs = emptyList())
        val background = launch { lookup.look() }
        yield()
        val answer = lookup.ask()
        assertEquals(ReplyLookup.State.Found(null), answer)
        assertEquals(ReplyAction.Mine.None, lookup.mine)
        assertFalse(lookup.asking)
        assertFalse(lookup.tapFailed)
        background.cancel()
    }

    @Test fun thePressInksOnlyWhileItAsks() = runBlocking {
        val gate = CompletableDeferred<DraftService.Resonance?>()
        val lookup = ReplyLookup(find = { gate.await() }, patienceMs = 5_000, retriesMs = emptyList())
        val asked = async { lookup.ask() }
        yield()
        assertTrue("inked during the ask", lookup.asking)
        // A second press meanwhile starts no second read.
        assertNull(lookup.ask())
        gate.complete(DraftService.Resonance("r2", "my-reply", published = true))
        assertEquals("my-reply", asked.await()?.mine?.routeKey)
        assertEquals(ReplyAction.Mine.Found(published = true), lookup.mine)
        assertFalse(lookup.asking)
    }

    @Test fun aFailedAskShowsTheQuietLineAndLeavesTheSegmentPressable() = runBlocking {
        val lookup = ReplyLookup(find = { awaitCancellation() }, patienceMs = 40, retriesMs = emptyList())
        val started = System.nanoTime()
        assertNull(lookup.ask())
        assertTrue("bounded by its patience", (System.nanoTime() - started) / 1_000_000 < 2_000)
        assertTrue(lookup.tapFailed)
        assertFalse("pressable again", lookup.asking)
        // The line goes once an answer comes (the background read again, after a change).
        val failing = AtomicInteger()
        val again = ReplyLookup(find = { if (failing.incrementAndGet() == 1) error("offline") else draft }, patienceMs = 40, retriesMs = emptyList())
        assertNull(again.ask())
        assertTrue(again.tapFailed)
        again.look()
        assertFalse(again.tapFailed)
        assertEquals(ReplyLookup.State.Found(draft), again.state)
        // The page draws the line under the capsule from this flag.
        assertTrue(File("src/main/kotlin/com/resonance/app/ui/CardViewerActions.kt").readText().contains("if (lookup.tapFailed) BasicText("))
    }
}
