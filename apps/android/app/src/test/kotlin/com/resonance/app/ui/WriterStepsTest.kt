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
 * The writer's two steps (writer.spec, round 8 §2), driven through its model the way the screen
 * drives it: ✓ asks for a title and waits a moment for a new card's first save before the publish
 * step opens (never longer: offline, the server's yes never comes until the network does); the bar
 * says how the writing is kept (儲存中⋯ only for a write past 400 ms, 已儲存, 修改已暫存, 未儲存); the
 * step's choices are the draft's own values, autosaved and kept on the way back to writing, never
 * anonymous and for connections only in any write — a draft stored that way goes out public; its one
 * button follows the card and the choice (a 草稿 kept one is written, never published); the mirror is
 * asked once per text and never for a live card; every verb saves first; a story's picture that fails
 * is said where the writing is, never in the cover's slot; and a card moved to the trash while it is
 * open (its saves refused, its publish 409) goes back to writing and says so, keeping what was typed,
 * until 還原 writes it — and leaving never says that was kept.
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
        beganNew: Boolean = false,
    ) = WriteModel(store, calls, referenceCardId, editor, opened, initialStep, scope, reachedOut = { reachedOut++ }, locale = { "zh-TW" }, nextWait = nextWait, beganNew = beganNew)
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
        assertEquals(listOf(DraftValues(title = "雨中散步", story = "那天下午雨停了。", visibility = "private")), store.created)
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
        // A new card is kept as a 私人卡 until the step chooses otherwise.
        assertEquals(listOf(DraftValues(title = "雨中散步", visibility = "private")), store.created)
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
        assertEquals(StepDone.Page("rain-walk"), m.finish())
        assertEquals(stored.copy(visibility = "public"), store.updates.last().second)
        assertTrue(store.updates.none { (_, v) -> v.anonymous && v.visibility == "connections" })

        // Opened on the step itself (a restored process): 發布 settles it all the same.
        store.updates.clear()
        val restored = model(draft(stored, id = "d2"), initialStep = WriterStep.Publish)
        assertEquals(StepDone.Page("rain-walk"), restored.finish())
        assertEquals("d2" to stored.copy(visibility = "public"), store.updates.last())
    }

    // 卡片類型: 公開 · 匿名公開 · 草稿 (round 7 §1, round 8 §2.2)

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

    @Test fun aDraftChosenKeepsALiveCardsAnonymitySoItComesBackAnonymous() {
        // Made a 草稿, then public again, an anonymous card must never come back under its author's name.
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

    @Test fun theStepsTitleAndItsOneButtonFollowTheCardAndTheChoice() {
        // Never published: 發布 · 匿名發布 by the choice, or 儲存 to keep it a 草稿.
        val m = model(draft(written))
        assertEquals(Triple(StepVerb.Publish, "發布", "發布這張卡片"), Triple(m.stepVerb, m.verb, m.stepTitle))
        m.choose(Audience.Anonymous)
        assertEquals(Triple(StepVerb.PublishAnonymously, "匿名發布", "發布這張卡片"), Triple(m.stepVerb, m.verb, m.stepTitle))
        m.choose(Audience.Private)
        assertEquals(Triple(StepVerb.Save, "儲存", "儲存私人卡"), Triple(m.stepVerb, m.verb, m.stepTitle))
        // A card readers have: 儲存修改 while it stays theirs, 轉為草稿 once 草稿 is chosen — 更新這張卡片 either way.
        val live = model(live(written))
        assertEquals(Triple(StepVerb.Update, "儲存修改", "更新這張卡片"), Triple(live.stepVerb, live.verb, live.stepTitle))
        live.choose(Audience.Anonymous)
        assertEquals(StepVerb.Update, live.stepVerb)
        live.choose(Audience.Private)
        assertEquals(Triple(StepVerb.MakeDraft, "轉為私人卡", "更新這張卡片"), Triple(live.stepVerb, live.verb, live.stepTitle))
        // An older card kept for connections, none of the three chosen: an update.
        assertEquals(StepVerb.Update, model(live(written.copy(visibility = "connections"))).stepVerb)
        // A published card kept private is a 草稿: published again by its choice, or kept one.
        val kept = model(live(written.copy(visibility = "private")))
        assertEquals(Triple(StepVerb.Save, "儲存", "儲存私人卡"), Triple(kept.stepVerb, kept.verb, kept.stepTitle))
        kept.choose(Audience.Public)
        assertEquals(Triple(StepVerb.Publish, "發布", "發布這張卡片"), Triple(kept.stepVerb, kept.verb, kept.stepTitle))
        kept.choose(Audience.Anonymous)
        assertEquals(Triple(StepVerb.PublishAnonymously, "匿名發布", "發布這張卡片"), Triple(kept.stepVerb, kept.verb, kept.stepTitle))
        // At work, the longer verbs say the bare one (round 21): 轉為私人卡 and 儲存修改 say 儲存, 匿名發布 says 發布.
        assertEquals("儲存", live.verbBusyLabel)
        live.choose(Audience.Public)
        assertEquals("儲存", live.verbBusyLabel)
        assertEquals("發布", kept.verbBusyLabel)
        kept.choose(Audience.Public)
        assertNull(kept.verbBusyLabel)
    }

    @Test fun aDraftKeptOneIsWrittenAndNeverPublishedNotEvenToItsWriterThenItsPageOpens() = runBlocking {
        val m = model(draft(written))
        m.next()
        m.choose(Audience.Private)
        // Round 9 §1: 儲存 lands on the 私人卡's page, by its id (it has no slug).
        assertEquals(StepDone.Page("d1"), m.finish())
        assertEquals(written.copy(visibility = "private"), store.updates.last().second)
        assertTrue(calls.published.isEmpty())
        assertTrue(calls.applied.isEmpty())
        // Its save refused: 沒儲存成功, and the writer stays.
        store.failWith = IOException("offline")
        m.update { copy(tags = listOf("夜")) }
        assertNull(m.finish())
        assertEquals("沒儲存成功，再試一次", m.publishError)
        assertTrue(calls.published.isEmpty())
    }

    @Test fun aWriterLeftWithNothingInItLeavesNoPrivateCard() = runBlocking {
        // Round 9 §1: nothing written, nothing made.
        val blank = model()
        blank.saveNow()
        assertFalse(blank.dropIfEmpty())
        assertTrue(store.created.isEmpty())
        // Written, then taken out again: the card begun here goes on the way out.
        val m = model()
        m.setTitle("雨")
        m.saveNow()
        assertEquals("d-new", m.draftId)
        m.setTitle("")
        m.saveNow()
        assertTrue(m.dropIfEmpty())
        assertEquals(listOf("d-new"), store.deleted)
        assertNull(m.draftId)
        assertEquals("d-new", wrote.last())
        // A card of yours opened here and emptied stays yours to keep; so does one with anything left in it.
        val opened = model(draft(written))
        opened.setTitle("")
        opened.update { copy(story = "") }
        assertFalse(opened.dropIfEmpty())
        val kept = model()
        kept.setTitle("雨")
        kept.saveNow()
        assertFalse(kept.dropIfEmpty())
        assertEquals(listOf("d-new"), store.deleted)
    }

    @Test fun aCardReadersHaveMadePrivateIsAppliedThenItsPageOpens() = runBlocking {
        val m = model(live(written))
        m.next()
        m.choose(Audience.Private)
        assertEquals(StepDone.Page("a-walk"), m.finish())
        assertEquals(listOf("c1" to written.copy(visibility = "private")), store.edits)
        assertEquals(listOf("c1"), calls.applied)
        assertTrue(calls.published.isEmpty())
        assertEquals(0, reachedOut)
    }

    @Test fun aPublishedPrivateCardIsPublishedAgainThroughItsEditOrKeptOne() = runBlocking {
        val kept = live(written.copy(visibility = "private"))
        // 公開: the pending edit applied, now public — its page next; the publish call is never made (its first date stays).
        val m = model(kept)
        m.next()
        m.choose(Audience.Public)
        assertEquals(StepDone.Page("a-walk"), m.finish())
        assertEquals(written, store.edits.last().second)
        assertEquals(listOf("c1"), calls.applied)
        assertTrue(calls.published.isEmpty())
        assertEquals(1, reachedOut)
        // 儲存: applied as it is, and its page opens.
        val again = model(kept)
        again.next()
        assertEquals(StepDone.Page("a-walk"), again.finish())
        assertEquals(listOf("c1", "c1"), calls.applied)
        assertEquals(1, reachedOut)
    }

    @Test fun aPublishThatFailsSaysItDidntPublishEveryOtherVerbThatItDidntSave() = runBlocking {
        calls.publishFails = ApiFailure("internal", "Something went wrong.", 500)
        calls.applyFails = ApiFailure("internal", "Something went wrong.", 500)
        val m = model(draft(written))
        m.next()
        m.choose(Audience.Anonymous)
        assertNull(m.finish())
        assertEquals("沒發布成功，再試一次", m.publishError)
        // A published private card made public was being published.
        val kept = model(live(written.copy(visibility = "private")))
        kept.choose(Audience.Public)
        assertNull(kept.finish())
        assertEquals("沒發布成功，再試一次", kept.publishError)
        // 儲存修改 and 轉為草稿 were saving.
        val live = model(live(written))
        assertNull(live.finish())
        assertEquals("沒儲存成功，再試一次", live.publishError)
        live.choose(Audience.Private)
        assertNull(live.finish())
        assertEquals("沒儲存成功，再試一次", live.publishError)
        // The save a publish waited on, refused: 沒發布成功 all the same.
        calls.publishFails = null
        store.failWith = IOException("offline")
        m.update { copy(tags = listOf("夜")) }
        assertNull(m.finish())
        assertEquals("沒發布成功，再試一次", m.publishError)
    }

    @Test fun theUpdateHintShowsOnlyWhileReadersHaveTheCardAndKeepIt() {
        val m = model(live(written))
        assertTrue(m.showsUpdateHint)
        m.choose(Audience.Private)
        assertFalse(m.showsUpdateHint)
        m.choose(Audience.Anonymous)
        assertTrue(m.showsUpdateHint)
        // An older card kept for connections has readers too (none of the three chosen).
        assertTrue(model(live(written.copy(visibility = "connections"))).showsUpdateHint)
        assertFalse(model(draft(written)).showsUpdateHint)
        // A published private card has none: choosing 公開 publishes it.
        val kept = model(live(written.copy(visibility = "private")))
        kept.choose(Audience.Public)
        assertFalse(kept.showsUpdateHint)
    }

    @Test fun theWritersTitleIsShortAndSaysWhatTheCardIs() {
        assertEquals("新卡片", model().title)
        assertEquals("編輯私人卡", model(draft(written)).title)
        assertEquals("編輯卡片", model(live(written)).title)
        assertEquals("編輯卡片", model(live(written.copy(visibility = "connections"))).title)
        // A published card kept private is a 草稿, whatever its pending edit says now.
        assertEquals("編輯私人卡", model(live(written, liveVisibility = "private")).title)
        // A new card stays a new card after its first save in this visit — the screen coming back too (a rotation).
        val m = model()
        m.setTitle("雨中散步")
        runBlocking { m.saveNow() }
        assertEquals("新卡片", m.title)
        assertEquals("新卡片", model(draft(written), beganNew = true).title)
    }

    @Test fun aLiveCardAlreadyAnonymousForConnectionsKeepsBoth() = runBlocking {
        val m = model(live(written.copy(visibility = "connections", anonymous = true)))
        assertTrue(m.next())
        assertEquals("connections", m.values.visibility)
        assertEquals(StepDone.Page("a-walk"), m.finish())
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
        assertEquals(StepDone.Page("rain-walk"), m.finish())
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
        assertNull(m.finish())
        assertEquals("今天的次數用完了，明天再試", m.publishError)
        assertEquals(WriterStep.Publish, m.step)
        calls.publishFails = ApiFailure("conflict", "Pick a pen name first.", 409)
        assertNull(m.finish())
        assertEquals("沒發布成功，再試一次", m.publishError)
        assertFalse(m.trashed)
    }

    @Test fun aLiveCardSavesItsChangesThroughTheBufferEvenUntouched() = runBlocking {
        val m = model(live(written))
        m.next()
        assertEquals(StepDone.Page("a-walk"), m.finish())
        // Nothing changed since it opened, and the buffer was written all the same before the apply.
        assertEquals(listOf("c1" to written), store.edits)
        assertEquals(listOf("c1"), calls.applied)
    }

    @Test fun anApplyThatFoundNoBufferSaysItDidntSaveAndKeepsTheWordsOwed() = runBlocking {
        calls.applyResult = ApplyEditResponse("c1", "a-walk", applied = false)
        val m = model(live(written))
        m.setTitle("雨中散步（改）")
        m.next()
        assertNull(m.finish())
        assertEquals("沒儲存成功，再試一次", m.publishError)
        assertTrue(m.hasWork)
    }

    @Test fun theOnlyOtherButtonIsAPublishedCardsDiscardWhileItHasARevision() = runBlocking {
        // A draft's choices are its one button: no 存成草稿，稍後再寫 any more.
        assertFalse(model(draft(written)).showsWayOut)
        assertFalse(model().showsWayOut)
        val untouched = model(live(written))
        assertFalse(untouched.showsWayOut)
        untouched.setTitle("改了")
        assertTrue(untouched.showsWayOut)
        assertTrue(model(live(written, pendingEdit = true)).showsWayOut)
        // A published card kept private too.
        assertTrue(model(live(written.copy(visibility = "private"), pendingEdit = true)).showsWayOut)
    }

    // The trash

    @Test fun aPublishRefusedForTheTrashGoesBackToWritingWithTheNotice() = runBlocking {
        val m = model(draft(written))
        m.next()
        store.trashed = true
        calls.publishFails = ApiFailure("conflict", ApiFailure.IN_TRASH_MESSAGE, 409)
        assertNull(m.finish())
        assertTrue(m.trashed)
        assertEquals(WriterStep.Write, m.step)
        assertNull(m.publishError)
        // No ✓ for a card in the trash, and the bar says nothing: its line in the page says it.
        assertFalse(m.showsNext)
        assertNull(m.saveState)
        assertTrue(m.hasWork)
    }

    @Test fun aTrashRefusalIsTakenAtItsWordWhenTheCardCantBeReadAgain() = runBlocking {
        val m = model(live(written))
        m.next()
        store.readFails = true
        calls.applyFails = ApiFailure("conflict", ApiFailure.IN_TRASH_MESSAGE, 409)
        assertNull(m.finish())
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
        untouched.finish()
        assertTrue(untouched.trashed)
        assertNull(untouched.leaveQuestion)
    }

    @Test fun leavingAsksAsTheWritingIsKept() {
        assertNull(model().leaveQuestion)
        assertEquals(LeaveQuestion.Draft, model(draft(written)).leaveQuestion)
        assertNull(model(live(written)).leaveQuestion)
        assertEquals(LeaveQuestion.Revision, model(live(written, pendingEdit = true)).leaveQuestion)
        assertEquals("寫下的內容已經存成私人卡，之後可以在「我的卡片盒」接著寫", leaveBody(LeaveQuestion.Draft))
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

    // The bar's save state (round 8 §2.1)

    @Test fun theBarSaysNothingUntilTheFirstWriteThenSavingOnlyForASlowOne() = runBlocking {
        val m = model(draft(written))
        assertNull(m.saveState)
        // A quick write goes straight to 已儲存: no 儲存中⋯ flicker before it, nor after.
        m.update { copy(story = "那天下午雨停了，路燈亮起來。") }
        m.saveNow()
        assertEquals(SaveState.Saved, m.saveState)
        delay(WriteModel.SAVING_SHOWN_MS + 150)
        assertEquals(SaveState.Saved, m.saveState)
        // One still on its way past 400 ms says 儲存中⋯ until it lands.
        val gate = CompletableDeferred<Unit>()
        store.updateGate = gate
        m.update { copy(tags = listOf("雨")) }
        val saving = async(Dispatchers.Default) { m.saveNow() }
        delay(WriteModel.SAVING_SHOWN_MS / 2)
        assertEquals(SaveState.Saved, m.saveState)
        delay(WriteModel.SAVING_SHOWN_MS)
        assertEquals(SaveState.Saving, m.saveState)
        gate.complete(Unit)
        saving.await()
        assertEquals(SaveState.Saved, m.saveState)
        assertEquals("已儲存", saveStateWord(m.saveState!!))
    }

    @Test fun aWriteThatFailsSaysNotSavedUntilOneGoesThrough() = runBlocking {
        val m = model(draft(written))
        store.failWith = IOException("offline")
        m.update { copy(story = "又寫了一句。") }
        m.saveNow()
        assertEquals(SaveState.Failed, m.saveState)
        assertEquals("未儲存", saveStateWord(SaveState.Failed))
        store.failWith = null
        m.update { copy(story = "再一句。") }
        m.saveNow()
        assertEquals(SaveState.Saved, m.saveState)
    }

    @Test fun aPublishedCardsWritesAreSavedPrivatelyFromTheStartWithARevision() = runBlocking {
        // Nothing written in this visit, nothing buffered: nothing to say.
        val m = model(live(written))
        assertNull(m.saveState)
        m.setTitle("雨中散步（改）")
        m.saveNow()
        assertEquals(SaveState.SavedLive, m.saveState)
        assertEquals("修改已暫存", saveStateWord(SaveState.SavedLive))
        // Opened with a revision buffered: said at once.
        assertEquals(SaveState.SavedLive, model(live(written, pendingEdit = true)).saveState)
        // A new card's first save is a draft's.
        val fresh = model()
        fresh.setTitle("雨中散步")
        fresh.saveNow()
        assertEquals(SaveState.Saved, fresh.saveState)
    }

    // Pictures (round 8 §3)

    @Test fun aStorysPictureThatFailsIsSaidWhereTheWritingIsNeverInTheCoversSlot() = runBlocking {
        val m = model(draft(written))
        val said = mutableListOf<String>()
        m.onStoryPictureError = { said += it }
        // Unreadable (or not encodable): 讀不出這張圖片.
        m.insertPicture { throw IllegalStateException("not a picture") }
        withTimeout(2_000) { while (m.uploadingInline) delay(10) }
        // Read, but its upload failed: 圖片上傳失敗.
        calls.uploadFails = IOException("offline")
        m.insertPicture { byteArrayOf(1, 2, 3) }
        withTimeout(2_000) { while (m.uploadingInline) delay(10) }
        assertEquals(listOf("讀不出這張圖片，請換成 JPG 或 PNG", "圖片上傳失敗，請再試一次"), said)
        assertNull(m.mediaError)
        assertTrue(editor.commands.isEmpty())
        // One that goes up is put at the caret.
        calls.uploadFails = null
        m.insertPicture { byteArrayOf(1, 2, 3) }
        withTimeout(2_000) { while (m.uploadingInline) delay(10) }
        assertEquals(listOf("insertImage" to mapOf("src" to "https://img.example/photo.jpg", "alt" to "photo.jpg")), editor.commands)
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

    // Stand-ins (RoundTwelveTest drives the writer with them too)

    private class Refused : Exception("PERMISSION_DENIED")

    internal class FakeStore : DraftStore {
        val created = mutableListOf<DraftValues>()
        val createdIds = mutableListOf<String>()
        val updates = mutableListOf<Pair<String, DraftValues>>()
        val edits = mutableListOf<Pair<String, DraftValues>>()
        var discarded = 0
        var createGate: CompletableDeferred<Unit>? = null
        var updateGate: CompletableDeferred<Unit>? = null
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
            updateGate?.await()
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

        val deleted = mutableListOf<String>()
        override suspend fun delete(id: String) {
            failWith?.let { throw it }
            deleted += id
        }

        override suspend fun isTrashed(id: String): Boolean {
            if (readFails) throw IOException("offline")
            return trashed
        }

        override fun refused(error: Throwable): Boolean = error is Refused
    }

    internal class FakeCalls : WriterCalls {
        val published = mutableListOf<String>()
        val applied = mutableListOf<String>()
        val restored = mutableListOf<String>()
        var publishFails: Exception? = null
        var applyFails: Exception? = null
        var restoreFails: Exception? = null
        var restoreDropped = false
        var uploadFails: Exception? = null
        var applyResult = ApplyEditResponse("c1", "a-walk", applied = true)
        var insights = 0
        var insightAnswer: String? = "你想說的是雨"
        /** GET …/private-shares: what it answers (or throws), and the cards it was asked about. */
        var shared = false
        var sharedFails: Exception? = null
        val sharedAsked = mutableListOf<String>()

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

        override suspend fun upload(image: ByteArray, filename: String): String {
            uploadFails?.let { throw it }
            return "https://img.example/$filename"
        }

        override fun illustrate(story: String): Flow<WritingApi.IllustrationEvent> = emptyFlow()

        override suspend fun sharedPrivately(cardId: String): Boolean {
            sharedAsked += cardId
            sharedFails?.let { throw it }
            return shared
        }

        private fun card(id: String) = FeedCard(
            id = id, slug = null, title = "雨中散步", excerpt = "…", tags = emptyList(), publishedAt = null,
            author = null, anonymous = false, visibility = FeedCard.Visibility.`private`, imageUrl = null, imageLabel = null,
            accentHue = null, readMinutes = 1, referenceCardId = null, reason = null,
        )
    }

    internal class FakeEditor : StoryEditor {
        override var onChange: (String) -> Unit = {}
        var story = ""
        val titles = mutableListOf<String>()
        val commands = mutableListOf<Pair<String, Map<String, String>>>()
        override fun setMarkdown(markdown: String) {
            story = markdown
        }
        override fun exec(command: String, args: Map<String, String>) {
            commands += command to args
        }
        override fun setTitle(title: String) {
            titles += title
        }
        override fun destroy() {}
    }
}
