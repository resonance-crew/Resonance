package com.resonance.app.ui

import com.resonance.api.models.ApplyEditResponse
import com.resonance.api.models.FeedCard
import com.resonance.api.models.PublishResponse
import com.resonance.api.models.RestoredCard
import com.resonance.app.DraftService
import com.resonance.app.DraftStore
import com.resonance.app.DraftValues
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.WritingApi
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
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
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
 * The writer's two steps (writer.spec), driven through its model the way the screen drives it:
 * 下一步 asks for a title and waits a moment for a new card's first save before the publish step
 * opens (never longer: offline, the server's yes never comes until the network does); the step's
 * choices are the draft's own values, autosaved and kept on the way back to writing, never
 * anonymous and for connections only in any write — a draft stored that way goes out public; the
 * mirror is asked once per text and never for a live card; 發布 and 儲存修改 save first; and a card
 * moved to the trash while it is open (its saves refused, its publish 409) goes back to writing and
 * says so, keeping what was typed, until 還原 writes it — and leaving never says that was kept.
 */
class WriterStepsTest {
    private val language = Strings.language
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    private val store = FakeStore()
    private val calls = FakeCalls()
    private val editor = FakeEditor()
    private var reachedOut = 0
    private val wrote = mutableListOf<String>()

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun stop() {
        Strings.language = language
        scope.cancel()
    }

    private fun model(
        opened: DraftService.OpenedCard? = null,
        referenceCardId: String? = null,
        initialStep: WriterStep = WriterStep.Write,
        nextWait: Long = WriteModel.NEXT_WAIT_MS,
    ) = WriteModel(store, calls, referenceCardId, editor, opened, initialStep, scope, reachedOut = { reachedOut++ }, locale = { "zh-TW" }, nextWait = nextWait)
        .apply { onWrote = { wrote += it } }

    private fun draft(values: DraftValues, id: String = "d1") =
        DraftService.OpenedCard(id, values, isPublished = false, slug = null, referenceCardId = null, hasPendingEdit = false)

    private fun live(values: DraftValues, pendingEdit: Boolean = false, liveVisibility: String = values.visibility, liveAnonymous: Boolean = values.anonymous) =
        DraftService.OpenedCard("c1", values, isPublished = true, slug = "a-walk", referenceCardId = null, hasPendingEdit = pendingEdit, liveVisibility = liveVisibility, liveAnonymous = liveAnonymous)

    private val written = DraftValues(title = "雨中散步", story = "那天下午雨停了。")

    // 下一步

    @Test fun nextWaitsForANewCardsFirstSaveThenOpensTheStep() = runBlocking {
        val m = model()
        m.setTitle("雨中散步")
        m.update { copy(story = "那天下午雨停了。") }
        val gate = CompletableDeferred<Unit>()
        store.createGate = gate
        val next = async { m.next() }
        // The save is on its way: still writing — the draft's id issued already, the server's yes not
        // in yet — and past 300 ms the pill shows its loader.
        delay(WriteModel.NEXT_LOADER_MS + 150)
        assertEquals(WriterStep.Write, m.step)
        assertEquals("d-new", m.draftId)
        assertTrue(m.nextLoading)
        gate.complete(Unit)
        assertTrue(next.await())
        assertEquals(WriterStep.Publish, m.step)
        assertEquals("d-new", m.draftId)
        assertFalse(m.nextLoading)
        assertEquals(listOf(DraftValues(title = "雨中散步", story = "那天下午雨停了。")), store.created)
    }

    @Test fun offlineNextOpensTheStepOnTheDraftOnTheDeviceAfterAMoment() = runBlocking {
        // Firestore neither fails nor finishes a write it can't send: the create's answer never comes.
        val m = model(nextWait = 600)
        val created = mutableListOf<String>()
        m.onCreated = { created += it }
        m.setTitle("雨中散步")
        val gate = CompletableDeferred<Unit>()
        store.createGate = gate
        val next = async { m.next() }
        delay(WriteModel.NEXT_LOADER_MS + 150)
        assertEquals(WriterStep.Write, m.step)
        assertTrue(m.nextLoading)
        // Past the wait the step opens on the draft's issued id, no loader and no error.
        assertTrue(withTimeout(5_000) { next.await() })
        assertEquals(WriterStep.Publish, m.step)
        assertEquals("d-new", m.draftId)
        assertEquals(listOf("d-new"), created)
        assertFalse(m.nextLoading)
        assertNull(m.saveError)
        // The network comes back: the write lands as it was issued.
        gate.complete(Unit)
        assertEquals(listOf(DraftValues(title = "雨中散步")), store.created)
        assertEquals(listOf("d-new"), store.createdIds)
    }

    @Test fun withoutATitleNextStaysOnWritingAsksForOneAndCostsNoMirror() = runBlocking {
        val m = model()
        m.update { copy(story = "只有故事，沒有標題。") }
        assertTrue(m.nextEnabled)
        assertFalse(m.next())
        assertEquals(WriterStep.Write, m.step)
        assertTrue(m.titleError)
        assertEquals(1, m.titleFocus)
        m.reflect()
        assertEquals(0, calls.insights)
        // The next keystroke takes the error away.
        m.setTitle("有了")
        assertFalse(m.titleError)
    }

    @Test fun nothingWrittenIsNothingToGoOnWith() = runBlocking {
        val m = model()
        assertFalse(m.nextEnabled)
        assertFalse(m.next())
        assertFalse(m.titleError)
        assertEquals(WriterStep.Write, m.step)
        // A live card always can.
        assertTrue(model(live(written)).nextEnabled)
    }

    @Test fun aFirstSaveThatFailsStaysOnWritingAndSaysSo() = runBlocking {
        store.failWith = IOException("offline")
        val m = model()
        m.setTitle("雨中散步")
        assertFalse(m.next())
        assertEquals(WriterStep.Write, m.step)
        assertEquals("沒存成，再試一次", m.saveError)
        // A refused create leaves no draft behind it.
        assertNull(m.draftId)
    }

    @Test fun aKeptDraftOpensTheStepAtOnceAndSavesOnItsWay() = runBlocking {
        val m = model(draft(written))
        m.update { copy(story = "那天下午雨停了，路燈亮起來。") }
        assertTrue(m.next())
        assertEquals(WriterStep.Publish, m.step)
        assertEquals("那天下午雨停了，路燈亮起來。", store.updates.last().second.story)
    }

    @Test fun aNewCardsStepIsNeverRestoredBeforeItIsADraft() {
        assertEquals(WriterStep.Write, model(initialStep = WriterStep.Publish).step)
        assertEquals(WriterStep.Publish, model(draft(written), initialStep = WriterStep.Publish).step)
    }

    // The step's choices

    @Test fun backFromTheStepIsWritingAndTheChoicesStayAndSave() = runBlocking {
        val m = model(draft(written))
        m.next()
        m.setAudience("private", anonymous = false)
        assertTrue(m.back())
        assertEquals(WriterStep.Write, m.step)
        assertEquals("private", m.values.visibility)
        m.saveNow()
        assertEquals("private", store.updates.last().second.visibility)
        // Writing has nothing to step back to: the page's own way out answers.
        assertFalse(m.back())
    }

    @Test fun anonymousOnACardForConnectionsIsPublicInTheSameWrite() = runBlocking {
        val m = model(draft(written.copy(visibility = "connections")))
        m.next()
        m.setAudience(m.values.visibility, anonymous = true)
        assertEquals("public", m.values.visibility)
        assertTrue(m.values.anonymous)
        m.saveNow()
        assertEquals(1, store.updates.size)
        assertEquals(written.copy(visibility = "public", anonymous = true), store.updates.single().second)
        assertTrue(store.updates.none { (_, v) -> v.anonymous && v.visibility == "connections" })
    }

    @Test fun aDraftKeptAnonymousForConnectionsGoesOutPublic() = runBlocking {
        // The rules let a draft hold the pair (the builds before letters kept it); the server's first publish refuses it.
        val stored = written.copy(visibility = "connections", anonymous = true)
        val m = model(draft(stored))
        assertTrue(m.next())
        // The step shows 公開 chosen, and the draft says so in the write on the way.
        assertEquals("public", m.values.visibility)
        assertTrue(m.values.anonymous)
        assertEquals("rain-walk", m.publish())
        assertEquals(stored.copy(visibility = "public"), store.updates.last().second)
        assertTrue(store.updates.none { (_, v) -> v.anonymous && v.visibility == "connections" })

        // Opened on the step itself (a restored process): 發布 settles it all the same.
        store.updates.clear()
        val restored = model(draft(stored, id = "d2"), initialStep = WriterStep.Publish)
        assertEquals("rain-walk", restored.publish())
        assertEquals("d2" to stored.copy(visibility = "public"), store.updates.last())
    }

    // 誰可以看見: 公開 · 匿名公開 · 只有自己 (round 7 §1)

    @Test fun eachOfTheThreeWritesWhoAndUnderWhoseNameInOneChange() = runBlocking {
        val m = model(draft(written))
        m.next()
        m.choose(Audience.Anonymous)
        assertEquals("public" to true, m.values.visibility to m.values.anonymous)
        assertEquals(Audience.Anonymous, m.audience)
        m.choose(Audience.Public)
        assertEquals("public" to false, m.values.visibility to m.values.anonymous)
        m.choose(Audience.Anonymous)
        // A draft kept for its writer is simply theirs: no anonymous flag left over from trying 匿名公開.
        m.choose(Audience.Private)
        assertEquals("private" to false, m.values.visibility to m.values.anonymous)
        assertEquals(Audience.Private, m.audience)
        m.saveNow()
        assertEquals(written.copy(visibility = "private"), store.updates.last().second)
        assertTrue(store.updates.none { (_, v) -> v.anonymous && v.visibility == "connections" })
    }

    @Test fun onlyMeKeepsALiveCardsAnonymitySoItComesBackAnonymous() {
        // Made private, then public again from its ⋯, an anonymous card must never come back under its author's name.
        val anonymous = model(live(written.copy(anonymous = true)))
        anonymous.choose(Audience.Private)
        assertEquals("private" to true, anonymous.values.visibility to anonymous.values.anonymous)
        assertEquals(Audience.Private, anonymous.audience)
        val named = model(live(written))
        named.choose(Audience.Private)
        assertEquals("private" to false, named.values.visibility to named.values.anonymous)
    }

    @Test fun aCardKeptForConnectionsShowsNoneChosenAndReadsAsPublishing() {
        assertNull(audienceOf("connections", anonymous = false))
        assertEquals(Audience.Private, audienceOf("private", anonymous = true))
        val m = model(draft(written.copy(visibility = "connections")))
        assertNull(m.audience)
        assertEquals("發布", m.verb)
        assertEquals("發布這張卡片", m.stepTitle)
    }

    @Test fun theVerbAndTheStepsTitleFollowTheAudience() {
        val m = model(draft(written))
        assertEquals("發布" to "發布這張卡片", m.verb to m.stepTitle)
        m.choose(Audience.Anonymous)
        assertEquals("匿名發布" to "發布這張卡片", m.verb to m.stepTitle)
        m.choose(Audience.Private)
        assertEquals("儲存" to "儲存這張卡片", m.verb to m.stepTitle)
        // A live card is updated whoever it is for.
        val live = model(live(written))
        live.choose(Audience.Private)
        assertEquals("儲存修改" to "更新這張卡片", live.verb to live.stepTitle)
    }

    @Test fun keptForYourselfAFailureSaysItDidntSave() = runBlocking {
        val m = model(draft(written))
        m.next()
        calls.publishFails = ApiFailure("internal", "Something went wrong.", 500)
        m.choose(Audience.Private)
        assertNull(m.publish())
        assertEquals("沒儲存成功，再試一次", m.publishError)
        m.choose(Audience.Anonymous)
        assertNull(m.publish())
        assertEquals("沒發布成功，再試一次", m.publishError)
        // The save it waited on, refused: the same words.
        calls.publishFails = null
        store.failWith = IOException("offline")
        m.choose(Audience.Private)
        assertNull(m.publish())
        assertEquals("沒儲存成功，再試一次", m.publishError)
    }

    @Test fun theUpdateHintShowsOnlyWhileTheLiveCardHasReaders() {
        val m = model(live(written))
        assertTrue(m.showsUpdateHint)
        m.choose(Audience.Private)
        assertFalse(m.showsUpdateHint)
        m.choose(Audience.Anonymous)
        assertTrue(m.showsUpdateHint)
        // An older card kept for connections has readers too (none of the three chosen).
        assertTrue(model(live(written.copy(visibility = "connections"))).showsUpdateHint)
        assertFalse(model(draft(written)).showsUpdateHint)
    }

    @Test fun aLiveCardAlreadyAnonymousForConnectionsKeepsBoth() = runBlocking {
        val m = model(live(written.copy(visibility = "connections", anonymous = true)))
        assertTrue(m.next())
        assertEquals("connections", m.values.visibility)
        assertEquals("a-walk", m.applyEdit())
        assertEquals("connections", store.edits.last().second.visibility)
    }

    @Test fun theMirrorIsAskedOncePerTextAndNeverForALiveCard() = runBlocking {
        calls.insightAnswer = "被看見，比被喜歡更難得"
        val m = model(draft(written))
        m.next()
        m.reflect()
        assertEquals(1, calls.insights)
        assertEquals(Mirror.Shown("被看見，比被喜歡更難得"), m.mirror)
        // Back to writing and forward again with the same words: the answer it had.
        m.back()
        m.next()
        m.reflect()
        assertEquals(1, calls.insights)
        // Other words, another question.
        m.back()
        m.update { copy(story = story + "後來我們走了很久。") }
        m.next()
        m.reflect()
        assertEquals(2, calls.insights)

        // Nothing to say folds the line away.
        calls.insightAnswer = null
        m.back()
        m.update { copy(story = story + "又一段。") }
        m.next()
        m.reflect()
        assertEquals(Mirror.None, m.mirror)

        val revision = model(live(written))
        revision.next()
        revision.reflect()
        assertEquals(3, calls.insights)
        assertNull(revision.mirror)
    }

    @Test fun theResonanceLineSaysWhetherTheOriginalsAuthorIsReached() {
        // Before its first publication: public and named reaches; anything else is quiet.
        assertEquals(ResonanceLine.Reaches, resonanceLine(true, updating = false, liveReaches = false, visibility = "public", anonymous = false))
        assertEquals(ResonanceLine.Quiet, resonanceLine(true, updating = false, liveReaches = false, visibility = "private", anonymous = false))
        assertEquals(ResonanceLine.Quiet, resonanceLine(true, updating = false, liveReaches = false, visibility = "public", anonymous = true))
        assertEquals(ResonanceLine.Quiet, resonanceLine(true, updating = false, liveReaches = false, visibility = "connections", anonymous = false))
        // A live one: only when this save makes a hidden one public and named.
        assertEquals(ResonanceLine.Reaches, resonanceLine(true, updating = true, liveReaches = false, visibility = "public", anonymous = false))
        assertNull(resonanceLine(true, updating = true, liveReaches = true, visibility = "public", anonymous = false))
        assertNull(resonanceLine(true, updating = true, liveReaches = false, visibility = "private", anonymous = false))
        // A card answering nothing has no line.
        assertNull(resonanceLine(false, updating = false, liveReaches = false, visibility = "public", anonymous = false))
    }

    @Test fun aLiveResonanceMadePublicAndNamedInTheStepSaysItReaches() = runBlocking {
        val hidden = model(live(written.copy(visibility = "private"), liveVisibility = "private"), referenceCardId = "orig")
        assertNull(hidden.resonanceLine)
        hidden.setAudience("public", anonymous = false)
        assertEquals(ResonanceLine.Reaches, hidden.resonanceLine)
        val reaching = model(live(written), referenceCardId = "orig")
        assertNull(reaching.resonanceLine)
    }

    // The verbs

    @Test fun publishSavesThenPublishesAndSaysWhereTheCardLives() = runBlocking {
        val m = model(draft(written))
        m.next()
        m.update { copy(tags = listOf("雨")) }
        assertEquals("rain-walk", m.publish())
        assertEquals(listOf("d1"), calls.published)
        assertEquals(listOf("雨"), store.updates.last().second.tags)
        assertEquals(1, reachedOut)
        assertTrue("d1" in wrote)
        assertFalse(m.pending)
    }

    @Test fun aRefusalThatIsntTheTrashIsSaidInTheStepsWords() = runBlocking {
        val m = model(draft(written))
        m.next()
        calls.publishFails = ApiFailure("rate_limited", "Too many requests.", 429)
        assertNull(m.publish())
        assertEquals("今天的次數用完了，明天再試", m.publishError)
        assertEquals(WriterStep.Publish, m.step)
        calls.publishFails = ApiFailure("conflict", "Pick a pen name first.", 409)
        assertNull(m.publish())
        assertEquals("沒發布成功，再試一次", m.publishError)
        assertFalse(m.trashed)
    }

    @Test fun aLiveCardSavesItsChangesThroughTheBufferEvenUntouched() = runBlocking {
        val m = model(live(written))
        m.next()
        assertEquals("a-walk", m.applyEdit())
        // Nothing changed since it opened, and the buffer was written all the same before the apply.
        assertEquals(listOf("c1" to written), store.edits)
        assertEquals(listOf("c1"), calls.applied)
    }

    @Test fun anApplyThatFoundNoBufferSaysItDidntSaveAndKeepsTheWordsOwed() = runBlocking {
        calls.applyResult = ApplyEditResponse("c1", "a-walk", applied = false)
        val m = model(live(written))
        m.setTitle("雨中散步（改）")
        m.next()
        assertNull(m.applyEdit())
        assertEquals("沒存成，再試一次", m.publishError)
        assertTrue(m.hasWork)
    }

    @Test fun discardShowsOnlyWithARevisionAndSaveForLaterAlways() = runBlocking {
        assertTrue(model(draft(written)).showsWayOut)
        val untouched = model(live(written))
        assertFalse(untouched.showsWayOut)
        untouched.setTitle("改了")
        assertTrue(untouched.showsWayOut)
        assertTrue(model(live(written, pendingEdit = true)).showsWayOut)
    }

    @Test fun saveForLaterWritesWhatIsOnScreen() = runBlocking {
        val m = model(draft(written))
        m.next()
        m.setAudience("private", anonymous = false)
        assertTrue(m.saveForLater())
        assertEquals("private", store.updates.last().second.visibility)
        store.failWith = IOException("offline")
        m.update { copy(tags = listOf("夜")) }
        assertFalse(m.saveForLater())
        assertEquals("沒存成，再試一次", m.publishError)
    }

    // The trash

    @Test fun aPublishRefusedForTheTrashGoesBackToWritingWithTheNotice() = runBlocking {
        val m = model(draft(written))
        m.next()
        store.trashed = true
        calls.publishFails = ApiFailure("conflict", ApiFailure.IN_TRASH_MESSAGE, 409)
        assertNull(m.publish())
        assertTrue(m.trashed)
        assertEquals(WriterStep.Write, m.step)
        assertNull(m.publishError)
        // No 下一步 for a card in the trash, and its line stands in for the save line.
        assertFalse(m.showsNext)
        assertNull(m.saveStatus)
        assertTrue(m.hasWork)
    }

    @Test fun aTrashRefusalIsTakenAtItsWordWhenTheCardCantBeReadAgain() = runBlocking {
        val m = model(live(written))
        m.next()
        store.readFails = true
        calls.applyFails = ApiFailure("conflict", ApiFailure.IN_TRASH_MESSAGE, 409)
        assertNull(m.applyEdit())
        assertTrue(m.trashed)
        assertEquals(WriterStep.Write, m.step)
    }

    @Test fun anAutosaveTheRulesRefuseForATrashedCardSaysSoAndWritesNothingMore() = runBlocking {
        val m = model(draft(written))
        store.failWith = Refused()
        store.trashed = true
        m.update { copy(story = "又寫了一句。") }
        m.flush()
        assertTrue(m.trashed)
        // The words stay on screen, and nothing more is written into the card.
        assertEquals("又寫了一句。", m.values.story)
        store.failWith = null
        m.update { copy(story = "再一句。") }
        m.saveNow()
        assertTrue(store.updates.isEmpty())
    }

    @Test fun aRefusalOnACardThatIsntInTheTrashIsNoNotice() = runBlocking {
        val m = model(draft(written))
        store.failWith = Refused()
        m.update { copy(story = "又寫了一句。") }
        m.flush()
        assertFalse(m.trashed)
    }

    @Test fun restoreTakesItOutAndWritesWhatWasTypedMeanwhile() = runBlocking {
        val m = model(draft(written))
        store.failWith = Refused()
        store.trashed = true
        m.update { copy(story = "垃圾桶裡寫的。") }
        m.flush()
        assertTrue(m.trashed)
        store.failWith = null
        calls.restoreDropped = true
        assertEquals(true, m.restore())
        assertFalse(m.trashed)
        assertEquals(listOf("d1"), calls.restored)
        assertEquals("垃圾桶裡寫的。", store.updates.last().second.story)
        assertTrue(m.showsNext)
    }

    @Test fun leavingACardInTheTrashNeverSaysTheWritingWasKept() = runBlocking {
        val m = model(draft(written))
        store.failWith = Refused()
        store.trashed = true
        m.update { copy(story = "垃圾桶裡寫的。") }
        m.flush()
        assertTrue(m.trashed)
        // Typed since the last save it took, and held nowhere: the question says the card keeps nothing until restored.
        assertEquals(LeaveQuestion.Trashed, m.leaveQuestion)
        assertEquals("這張卡片在垃圾桶裡，還原後才會儲存", leaveBody(m.leaveQuestion))
        // Restored, the words are written, and it asks as any draft does.
        store.failWith = null
        m.restore()
        assertEquals(LeaveQuestion.Draft, m.leaveQuestion)

        // In the trash with everything on screen in the card (its publish refused): nothing to ask.
        val untouched = model(draft(written, id = "d2"))
        untouched.next()
        calls.publishFails = ApiFailure("conflict", ApiFailure.IN_TRASH_MESSAGE, 409)
        untouched.publish()
        assertTrue(untouched.trashed)
        assertNull(untouched.leaveQuestion)
    }

    @Test fun leavingAsksAsTheWritingIsKept() {
        assertNull(model().leaveQuestion)
        assertEquals(LeaveQuestion.Draft, model(draft(written)).leaveQuestion)
        assertNull(model(live(written)).leaveQuestion)
        assertEquals(LeaveQuestion.Revision, model(live(written, pendingEdit = true)).leaveQuestion)
        assertEquals("寫下的內容已經存成草稿，之後可以在「我的卡片盒」接著寫", leaveBody(LeaveQuestion.Draft))
        assertEquals("你的修改已經存起來了，還沒套用到已發布的卡片", leaveBody(LeaveQuestion.Revision))
    }

    @Test fun aRestoreThatFailsSaysSoAndStaysInTheTrash() = runBlocking {
        val m = model(draft(written))
        store.failWith = Refused()
        store.trashed = true
        m.update { copy(story = "x") }
        m.flush()
        calls.restoreFails = IOException("offline")
        assertNull(m.restore())
        assertTrue(m.trashed)
        assertEquals("沒完成，再試一次", m.restoreError)
    }

    // The title

    @Test fun theTitleIsOneLineOfAtMostSixty() {
        assertEquals("一行 標題", oneLine("一行\n標題"))
        assertEquals("a b c", oneLine("a\r\nb\rc"))
        assertEquals(60, oneLine("字".repeat(80)).length)
        // Never half a character: an emoji across the 60th unit stays out whole.
        assertEquals(59, oneLine("字".repeat(59) + "😀" + "字").length)
    }

    @Test fun anEnterTypedGoesOnToTheStoryAPastedBreakIsASpace() {
        assertTrue(enteredLineBreak("雨中散步", "雨中散步\n"))
        assertTrue(enteredLineBreak("雨中散步", "雨中\n散步"))
        assertFalse(enteredLineBreak("雨中", "雨中\n散步"))
        assertFalse(enteredLineBreak("雨中散步", "雨中散步!"))
    }

    @Test fun theIslandIsToldTheTitleItSetsTheStoryWith() {
        val m = model(draft(written))
        assertEquals(listOf("雨中散步"), editor.titles)
        assertEquals("那天下午雨停了。", editor.story)
        m.setTitle("雨\n後")
        assertEquals("雨 後", editor.titles.last())
    }

    // Stand-ins

    private class Refused : Exception("PERMISSION_DENIED")

    private class FakeStore : DraftStore {
        val created = mutableListOf<DraftValues>()
        val createdIds = mutableListOf<String>()
        val updates = mutableListOf<Pair<String, DraftValues>>()
        val edits = mutableListOf<Pair<String, DraftValues>>()
        var discarded = 0
        var createGate: CompletableDeferred<Unit>? = null
        var failWith: Exception? = null
        var trashed = false
        var readFails = false

        override fun newDraftId() = "d-new"

        override suspend fun create(id: String, v: DraftValues, locale: String, referenceCardId: String?) {
            createGate?.await()
            failWith?.let { throw it }
            created += v
            createdIds += id
        }

        override suspend fun update(id: String, v: DraftValues) {
            failWith?.let { throw it }
            updates += id to v
        }

        override suspend fun saveEdit(id: String, v: DraftValues) {
            failWith?.let { throw it }
            edits += id to v
        }

        override suspend fun discardEdit(id: String) {
            discarded++
        }

        override suspend fun isTrashed(id: String): Boolean {
            if (readFails) throw IOException("offline")
            return trashed
        }

        override fun refused(error: Throwable): Boolean = error is Refused
    }

    private class FakeCalls : WriterCalls {
        val published = mutableListOf<String>()
        val applied = mutableListOf<String>()
        val restored = mutableListOf<String>()
        var publishFails: Exception? = null
        var applyFails: Exception? = null
        var restoreFails: Exception? = null
        var restoreDropped = false
        var applyResult = ApplyEditResponse("c1", "a-walk", applied = true)
        var insights = 0
        var insightAnswer: String? = "你想說的是雨"

        override suspend fun publish(cardId: String): PublishResponse {
            publishFails?.let { throw it }
            published += cardId
            return PublishResponse(cardId, "rain-walk", firstPublish = true)
        }

        override suspend fun applyEdit(cardId: String): ApplyEditResponse {
            applyFails?.let { throw it }
            applied += cardId
            return applyResult
        }

        override suspend fun restoreCard(cardId: String): RestoredCard {
            restoreFails?.let { throw it }
            restored += cardId
            return RestoredCard(card(cardId), changed = true, droppedResonance = restoreDropped)
        }

        override suspend fun suggestTags(title: String, story: String, tags: List<String>) = listOf("雨")

        override suspend fun insight(title: String, story: String): String? {
            insights++
            return insightAnswer
        }

        override suspend fun upload(image: ByteArray, filename: String) = "https://img.example/$filename"

        override fun illustrate(story: String): Flow<WritingApi.IllustrationEvent> = emptyFlow()

        private fun card(id: String) = FeedCard(
            id = id, slug = null, title = "雨中散步", excerpt = "…", tags = emptyList(), publishedAt = null,
            author = null, anonymous = false, visibility = FeedCard.Visibility.`private`, imageUrl = null, imageLabel = null,
            accentHue = null, readMinutes = 1, referenceCardId = null, reason = null,
        )
    }

    private class FakeEditor : StoryEditor {
        override var onChange: (String) -> Unit = {}
        var story = ""
        val titles = mutableListOf<String>()
        override fun setMarkdown(markdown: String) {
            story = markdown
        }
        override fun exec(command: String, args: Map<String, String>) {}
        override fun setTitle(title: String) {
            titles += title
        }
        override fun destroy() {}
    }
}
