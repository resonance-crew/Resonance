package com.resonance.app.ui

import com.resonance.app.DraftService
import com.resonance.app.DraftValues
import com.resonance.kit.l10n.Strings
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The writer with no network (found on a phone, maestro/flows/draft-offline.yaml): a write's answer never comes
 * until the network does — Firestore neither fails nor finishes a write it can't send, and the draft outbox's
 * callers wait for their request to be taken — so nothing that keeps words may wait on an answer. Every save is
 * handed to the store the moment it is made, in order (it is on the device from then: a killed app loses nothing),
 * and only the answers are waited on one after another. What the old one-at-a-time lock protected stays: a new card
 * keeps the one id it was created under, publish and 捨棄修改 go behind every write on its way, and the bar's words
 * are what they were (儲存中⋯ while any answer is owed, 已儲存 once the last is in, 未儲存 when the last was refused).
 */
class WriterOfflineSavesTest {
    private val language = Strings.language
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    private val store = WriterStepsTest.FakeStore()
    private val calls = WriterStepsTest.FakeCalls()
    private val wrote = mutableListOf<String>()

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun stop() {
        Strings.language = language
        scope.cancel()
    }

    private fun model(opened: DraftService.OpenedCard? = null, nextWait: Long = WriteModel.NEXT_WAIT_MS) =
        WriteModel(store, calls, null, WriterStepsTest.FakeEditor(), opened, WriterStep.Write, scope, reachedOut = {}, locale = { "zh-TW" }, nextWait = nextWait)
            .apply { onWrote = { wrote += it } }

    private val written = DraftValues(title = "斷線前的晚上", story = "窗外開始下雨。")

    private fun draft(values: DraftValues = written) =
        DraftService.OpenedCard("d1", values, isPublished = false, slug = null, referenceCardId = null, hasPendingEdit = false)

    private fun live(values: DraftValues = written) =
        DraftService.OpenedCard("c1", values, isPublished = true, slug = "a-night", referenceCardId = null, hasPendingEdit = false)

    /** The network is gone: no write of this kind is answered until the gate opens. */
    private fun offline() = CompletableDeferred<Unit>().also {
        store.createGate = it
        store.updateGate = it
        store.editGate = it
    }

    @Test fun wordsTypedAfterTheFirstOfflineAutosaveAreHandedOverToo() = runBlocking {
        val m = model(draft())
        offline()
        // She writes on, pauses (the autosave), writes again, pauses again: the first save's answer never came.
        m.update { copy(story = "窗外開始下雨。燈一盞一盞熄了") }
        delay(WriteModel.AUTOSAVE_DELAY_MS + 300)
        m.update { copy(story = "窗外開始下雨。燈一盞一盞熄了，只剩一扇窗") }
        delay(WriteModel.AUTOSAVE_DELAY_MS + 300)
        // Both are with the store — the second not stuck behind the first — in the order they were written.
        assertEquals(
            listOf("窗外開始下雨。燈一盞一盞熄了", "窗外開始下雨。燈一盞一盞熄了，只剩一扇窗"),
            store.handed.map { it.third.story },
        )
        assertEquals(listOf('U', 'U'), store.handed.map { it.first })
        // Nothing was answered: the bar says 儲存中⋯ and stays so.
        assertTrue(store.updates.isEmpty())
        assertEquals(SaveState.Saving, m.saveState)
    }

    @Test fun goingToTheBackgroundOfflineHandsOverWhatIsOnScreenAtOnce() = runBlocking {
        val m = model(draft())
        offline()
        m.update { copy(story = "第一句。") }
        m.flush()
        m.update { copy(story = "第一句。第二句。") }
        m.flush()
        assertEquals(listOf("第一句。", "第一句。第二句。"), store.handed.map { it.third.story })
        // The same words are not handed over twice.
        m.flush()
        assertEquals(2, store.handed.size)
    }

    @Test fun aNewCardOfflineKeepsItsOneIdAndItsLaterWordsAreUpdatesOfIt() = runBlocking {
        val m = model()
        val created = mutableListOf<String>()
        m.onCreated = { created += it }
        offline()
        m.setTitle("斷線前的晚上")
        m.flush()
        m.update { copy(story = "窗外開始下雨。") }
        m.flush()
        m.update { copy(story = "窗外開始下雨。燈熄了。") }
        m.flush()
        // One create, under the id the writer holds from then on: never a second draft.
        assertEquals(listOf('C', 'U', 'U'), store.handed.map { it.first })
        assertEquals(listOf("d-new", "d-new", "d-new"), store.handed.map { it.second })
        assertEquals(listOf("d-new"), created)
        assertEquals("d-new", m.draftId)
        assertEquals("窗外開始下雨。燈熄了。", store.handed.last().third.story)
    }

    @Test fun aLiveCardsRevisionsOfflineAllGoIntoItsBuffer() = runBlocking {
        val m = model(live())
        offline()
        m.setTitle("斷線前的晚上（改）")
        m.flush()
        m.update { copy(story = "改過的一句。") }
        m.flush()
        assertEquals(listOf('E', 'E'), store.handed.map { it.first })
        assertEquals("改過的一句。", store.handed.last().third.story)
        // Not said kept before the server has it.
        assertFalse(m.hasPendingEdit)
    }

    @Test fun theNetworkBackEveryAnswerIsTakenInOrderAndTheBarSaysSaved() = runBlocking {
        val m = model(draft())
        val network = offline()
        m.update { copy(story = "第一句。") }
        m.flush()
        m.update { copy(story = "第一句。第二句。") }
        m.flush()
        delay(WriteModel.SAVING_SHOWN_MS + 150)
        assertEquals(SaveState.Saving, m.saveState)
        assertTrue(m.needsSave)
        network.complete(Unit)
        assertEquals(listOf("第一句。", "第一句。第二句。"), store.updates.map { it.second.story })
        assertEquals(SaveState.Saved, m.saveState)
        assertFalse(m.needsSave)
        assertEquals(listOf("d1", "d1"), wrote)
        // Nothing left to write: leaving hands nothing more over.
        m.saveNow()
        assertEquals(2, store.handed.size)
    }

    @Test fun publishGoesBehindEveryWriteOnItsWay() = runBlocking {
        val m = model(draft())
        m.next()
        val network = offline()
        m.update { copy(tags = listOf("雨")) }
        m.flush()
        m.update { copy(tags = listOf("雨", "夜")) }
        val publishing = async(Dispatchers.Unconfined) { m.finish() }
        // Its own save is handed over at once; the publish call waits for the answers.
        assertEquals(listOf(listOf("雨"), listOf("雨", "夜")), store.handed.map { it.third.tags })
        assertTrue(m.pending)
        assertTrue(calls.published.isEmpty())
        network.complete(Unit)
        assertEquals(StepDone.Page("rain-walk"), withTimeout(5_000) { publishing.await() })
        assertEquals(listOf("d1"), calls.published)
        assertEquals(listOf("雨", "夜"), store.updates.last().second.tags)
    }

    @Test fun discardGoesBehindEveryWriteOnItsWayAndNothingIsWrittenAfterIt() = runBlocking {
        val m = model(live())
        val network = offline()
        m.setTitle("斷線前的晚上（改）")
        m.flush()
        val discarding = async(Dispatchers.Unconfined) { m.discardEdit() }
        // A straggling write can't re-create the buffer: the discard is not issued before its answer.
        assertEquals(0, store.discarded)
        network.complete(Unit)
        assertEquals("a-night", withTimeout(5_000) { discarding.await() })
        assertEquals(1, store.discarded)
        m.update { copy(story = "之後又寫的。") }
        m.saveNow()
        assertEquals(1, store.handed.size)
    }

    @Test fun aSaveAskedForWhileADiscardIsOnItsWayWaitsForItsAnswer() = runBlocking {
        val m = model(live())
        m.setTitle("斷線前的晚上（改）")
        m.saveNow()
        assertEquals(1, store.handed.size)
        val gate = CompletableDeferred<Unit>()
        store.discardGate = gate
        val discarding = async(Dispatchers.Unconfined) { m.discardEdit() }
        m.update { copy(story = "捨棄的時候寫的。") }
        m.flush()
        // Not handed over behind a discard that may still go through (it would bring the buffer back).
        assertEquals(1, store.handed.size)
        gate.complete(Unit)
        assertEquals("a-night", withTimeout(5_000) { discarding.await() })
        assertEquals(1, store.handed.size)
    }

    @Test fun aWriteRefusedWhileALaterOneIsOnItsWayLeavesTheLaterOnesWordsKept() = runBlocking {
        val m = model(draft())
        val first = CompletableDeferred<Unit>()
        store.updateGate = first
        m.update { copy(story = "第一句。") }
        m.flush()
        // The second is answered at once; the first, when it is, is refused.
        store.updateGate = null
        m.update { copy(story = "第一句。第二句。") }
        m.flush()
        assertEquals(2, store.handed.size)
        // The answers are read in the order the writes were made: the bar waits on the first.
        assertTrue(m.needsSave)
        store.failWith = IOException("offline")
        first.complete(Unit)
        // The first's refusal, then the second's yes (it was answered before the refusal was set).
        assertEquals(SaveState.Saved, m.saveState)
        assertFalse(m.needsSave)
        assertEquals("第一句。第二句。", store.updates.single().second.story)
    }

    @Test fun aRefusedWriteIsHandedOverAgainByTheNextSaveThoughNothingChanged() = runBlocking {
        val m = model(draft())
        store.failWith = IOException("offline")
        m.update { copy(story = "又寫了一句。") }
        m.saveNow()
        assertEquals(SaveState.Failed, m.saveState)
        store.failWith = null
        m.saveNow()
        assertEquals(SaveState.Saved, m.saveState)
        assertEquals("又寫了一句。", store.updates.single().second.story)
    }

    @Test fun aCreateRefusedLeavesNoIdAndTheNextSaveCreatesAfresh() = runBlocking {
        val m = model()
        val network = offline()
        m.setTitle("斷線前的晚上")
        m.flush()
        assertEquals("d-new", m.draftId)
        store.failWith = IOException("refused")
        network.complete(Unit)
        assertNull(m.draftId)
        assertEquals(SaveState.Failed, m.saveState)
        store.failWith = null
        m.saveNow()
        assertEquals(listOf('C', 'C'), store.handed.map { it.first })
        assertEquals("d-new", m.draftId)
        assertEquals(1, store.created.size)
    }
}
