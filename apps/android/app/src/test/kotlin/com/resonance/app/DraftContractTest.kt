package com.resonance.app

import com.resonance.api.models.CreateDraftRequest
import com.resonance.api.models.CreatedDraft
import com.resonance.api.models.DraftMedia
import com.resonance.api.models.DraftSaved
import com.resonance.api.models.PendingEditRequest
import com.resonance.api.models.UpdateDraftRequest
import com.resonance.app.ui.WriteModel
import com.resonance.app.ui.WriterStepsTest
import com.resonance.design.CoverFraming
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.WriterApi
import com.resonance.kit.l10n.Strings
import com.resonance.kit.writing.DraftOutbox
import java.io.File
import java.util.Collections
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
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
 * Drafts on the contract's path (Phase 2, client-config's `apiDrafts`): what DraftService sends in place of
 * its Firestore writes — the cover sent whole, so a frame or a cover taken away is gone without a delete of
 * its own; a reopened card shows the words still on their way; and publishing (or applying an edit) waits
 * for everything written to the card, a save a last launch left included. With the switch off the writer
 * publishes at once, as Firestore keeps its writes' order itself.
 */
class DraftContractTest {
    private val language = Strings.language
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun stop() {
        Strings.language = language
        scope.cancel()
    }

    private val framed = DraftValues(
        title = "雨中散步", story = "那天下午雨停了。", visibility = "private",
        imageUrl = "https://img.example/old.jpg", imageLabel = "old", accentHue = 40.0,
        imageFrame = CoverFraming.of(0.3, 0.6, 1.8, 1.5),
        imageThumbUrl = "https://img.example/old-w960.webp",
    )

    private class Disk : DraftOutbox.Storage {
        @Volatile var text: String? = null
        override fun read() = text
        override fun write(value: String?) {
            text = value
        }
    }

    private class Server : DraftOutbox.Sender {
        val calls: MutableList<String> = Collections.synchronizedList(mutableListOf())
        val saves: MutableList<UpdateDraftRequest> = Collections.synchronizedList(mutableListOf())
        @Volatile var gate: CompletableDeferred<Unit>? = null

        override suspend fun create(request: CreateDraftRequest): CreatedDraft {
            gate?.await()
            calls += "create ${request.id}"
            return CreatedDraft(request.id, true, 0)
        }

        override suspend fun save(cardId: String, request: UpdateDraftRequest): DraftSaved {
            gate?.await()
            calls += "save $cardId ${request.rev}"
            saves += request
            return DraftSaved(true, request.rev, null)
        }

        override suspend fun saveEdit(cardId: String, request: PendingEditRequest): DraftSaved {
            gate?.await()
            calls += "edit $cardId ${request.rev}"
            return DraftSaved(true, request.rev, null)
        }

        override suspend fun discardEdit(cardId: String) {
            calls += "discard $cardId"
        }

        override suspend fun delete(cardId: String) {
            calls += "delete $cardId"
        }
    }

    private val writer = WriterApi(ApiConfiguration("http://localhost/") { "token" })

    private fun service(outbox: DraftOutbox) = DraftService("me", DraftService.Api(writer, outbox))

    private fun opened(values: DraftValues, id: String = "d1") =
        DraftService.OpenedCard(id, values, isPublished = false, slug = null, referenceCardId = null, hasPendingEdit = false)

    @Test fun aSaveSendsTheCoverWholeAndClearsWhatWasTakenAway() {
        val sent = DraftService.saveRequest(framed)
        assertEquals("https://img.example/old.jpg", sent.media?.url)
        assertEquals(1.8, sent.media?.frame?.zoom)
        assertEquals("https://img.example/old-w960.webp", sent.media?.thumbUrl)
        assertNull(sent.clear)

        // A new picture: its frame and the old cover's small copy go with the old picture.
        val replaced = DraftService.saveRequest(framed.copy(imageUrl = "https://img.example/new.jpg", imageFrame = null))
        assertNull(replaced.media?.frame)
        assertNull(replaced.media?.thumbUrl)

        val none = DraftService.saveRequest(framed.copy(imageUrl = null, imageLabel = null, imageFrame = null, accentHue = null))
        assertNull(none.media)
        assertEquals(listOf(UpdateDraftRequest.Clear.media, UpdateDraftRequest.Clear.accentHue), none.clear)
    }

    @Test fun aNewDraftIsCreatedUnderTheDevicesIdWithItsLocaleAndOriginal() {
        val id = DraftService.newId()
        assertTrue(Regex("^[A-Za-z0-9]{20}$").matches(id))
        val made = DraftService.createRequest(id, framed.copy(visibility = "public"), "zh-TW", "orig")
        assertEquals(CreateDraftRequest.Visibility.public, made.visibility)
        assertEquals("zh-TW", made.originalLocale)
        assertEquals("orig", made.referenceCardId)
        assertEquals(DraftMedia.Type.image, made.media?.type)
    }

    @Test fun aReopenedCardShowsTheWordsStillOnTheirWay() {
        val server = opened(DraftValues(title = "old", visibility = "private"))
        val queued = DraftOutbox.Op(1, "d1", DraftOutbox.Kind.Save, save = DraftService.saveRequest(framed.copy(title = "typed offline")).copy(rev = 3))
        val shown = DraftService.queuedOver(server, queued)
        assertEquals("typed offline", shown.values.title)
        assertEquals("https://img.example/old.jpg", shown.values.imageUrl)
        assertEquals(framed.imageFrame, shown.values.imageFrame)
        assertEquals(40.0, shown.values.accentHue)

        val cleared = DraftService.queuedOver(server, queued.copy(save = DraftService.saveRequest(DraftValues(title = "no cover"))))
        assertNull(cleared.values.imageUrl)
        assertNull(cleared.values.accentHue)

        // A published card's queued revision is its pending edit; the live card's fields stay its own.
        val live = server.copy(id = "c1", isPublished = true, liveVisibility = "public")
        val edit = DraftOutbox.Op(2, "c1", DraftOutbox.Kind.Edit, edit = DraftService.editRequest(framed.copy(title = "revised", visibility = "public")))
        val revised = DraftService.queuedOver(live, edit)
        assertEquals("revised", revised.values.title)
        assertTrue(revised.hasPendingEdit)
        assertEquals("public", revised.liveVisibility)
        assertEquals(live, DraftService.queuedOver(live, queued))
    }

    @Test fun theServicesWritesGoThroughTheOutboxInOrder() = runBlocking {
        val server = Server()
        val outbox = DraftOutbox(Disk(), server, scope, listOf(20L)).also { it.start() }
        val drafts = service(outbox)
        val id = drafts.newDraftId()
        drafts.create(id, framed, "zh-TW", null)
        drafts.update(id, framed.copy(title = "two"))
        drafts.saveEdit("c1", framed)
        drafts.discardEdit("c1")
        drafts.delete(id)
        assertEquals(listOf("create $id", "save $id 1", "edit c1 1", "discard c1", "delete $id"), server.calls)
    }

    @Test fun publishingWaitsForASaveTheLastLaunchLeft() = runBlocking {
        val disk = Disk()
        val words = framed.copy(visibility = "public")
        // The last launch: the save kept on the device, never sent (the app was killed offline).
        DraftOutbox(disk, Server(), scope).let { last ->
            val left = scope.launch { last.save("d1", DraftService.saveRequest(words)) }
            withTimeout(5_000) { while (last.ops.isEmpty()) delay(5) }
            left.cancel()
        }
        val server = Server().apply { gate = CompletableDeferred() }
        val outbox = DraftOutbox(disk, server, scope, listOf(20L)).also { it.start() }
        val calls = WriterStepsTest.FakeCalls()
        val reopened = DraftService.queuedOver(opened(DraftValues(title = "old", visibility = "public")), outbox.pending("d1"))
        assertEquals(words, reopened.values.copy(imageThumbUrl = words.imageThumbUrl))
        val m = WriteModel(service(outbox), calls, null, WriterStepsTest.FakeEditor(), reopened, publishing = true, scope = scope, reachedOut = {}, locale = { "zh-TW" })
        val publishing = async { m.finish() }
        delay(150)
        // The words on screen are the queued ones (nothing new to save), yet publish waits for them to land.
        assertTrue(calls.published.isEmpty())
        server.gate!!.complete(Unit)
        withTimeout(5_000) { publishing.await() }
        assertEquals(listOf("save d1 1"), server.calls)
        assertEquals(listOf("d1"), calls.published)
    }

    @Test fun withTheSwitchOffPublishingGoesAtOnce() = runBlocking {
        val store = WriterStepsTest.FakeStore()
        val calls = WriterStepsTest.FakeCalls()
        val m = WriteModel(store, calls, null, WriterStepsTest.FakeEditor(), opened(framed.copy(visibility = "public")), publishing = true, scope = scope, reachedOut = {}, locale = { "zh-TW" })
        withTimeout(5_000) { m.finish() }
        assertEquals(listOf("d1"), calls.published)
        assertFalse(store.updates.isEmpty() && store.created.isNotEmpty())
    }
}
