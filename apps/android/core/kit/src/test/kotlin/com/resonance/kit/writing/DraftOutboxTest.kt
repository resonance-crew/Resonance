package com.resonance.kit.writing

import com.resonance.api.models.CreateDraftRequest
import com.resonance.api.models.CreatedDraft
import com.resonance.api.models.DraftMedia
import com.resonance.api.models.DraftSaved
import com.resonance.api.models.PendingEditRequest
import com.resonance.api.models.UpdateDraftRequest
import com.resonance.kit.api.ApiFailure
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
import java.io.IOException
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The writer's outbox on the contract's path (Phase 2, `apiDrafts`): what Firestore's offline queue did
 * for the straight writes, now ours — kept on the device, sent in order one at a time, numbered by `rev`
 * so a late save never overwrites newer words, sent again after the network comes back, and still there
 * after the app is killed. The twin of iOS's DraftOutboxTests.
 */
class DraftOutboxTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @AfterTest fun tearDown() = scope.cancel()

    /** A device's SharedPreferences, as the outbox sees them. */
    private class Disk : DraftOutbox.Storage {
        @Volatile var text: String? = null
        override fun read() = text
        override fun write(value: String?) {
            text = value
        }
    }

    /** The server: records every call; [gate] holds each until opened; [failNext] answers that many with [failure]. */
    private class Server : DraftOutbox.Sender {
        val calls = java.util.Collections.synchronizedList(mutableListOf<String>())
        val saves = java.util.Collections.synchronizedList(mutableListOf<UpdateDraftRequest>())
        val creates = java.util.Collections.synchronizedList(mutableListOf<CreateDraftRequest>())
        val edits = java.util.Collections.synchronizedList(mutableListOf<PendingEditRequest>())
        @Volatile var stored = 0
        @Volatile var failNext = 0
        @Volatile var failure: Exception = IOException("offline")
        @Volatile var gate: CompletableDeferred<Unit>? = null
        @Volatile var inFlight = 0
        @Volatile var mostInFlight = 0

        private suspend fun step(name: String) {
            inFlight++
            mostInFlight = maxOf(mostInFlight, inFlight)
            try {
                gate?.await()
                calls += name
                if (failNext > 0) {
                    failNext--
                    throw failure
                }
            } finally {
                inFlight--
            }
        }

        override suspend fun create(request: CreateDraftRequest): CreatedDraft {
            step("create ${request.id}")
            creates += request
            return CreatedDraft(request.id, true, 0)
        }

        override suspend fun save(cardId: String, request: UpdateDraftRequest): DraftSaved {
            step("save $cardId ${request.rev} ${request.thoughtCore}")
            saves += request
            if (request.rev <= stored) return DraftSaved(false, stored, null)
            stored = request.rev
            return DraftSaved(true, request.rev, "2026-11-21T00:00:00.000000Z")
        }

        override suspend fun saveEdit(cardId: String, request: PendingEditRequest): DraftSaved {
            step("edit $cardId ${request.rev} ${request.thoughtCore}")
            edits += request
            return DraftSaved(true, request.rev, null)
        }

        override suspend fun discardEdit(cardId: String) = step("discard $cardId")
        override suspend fun delete(cardId: String) = step("delete $cardId")
    }

    private fun outbox(disk: Disk = Disk(), server: Server = Server(), retry: List<Long> = listOf(20L)) =
        DraftOutbox(disk, server, scope, retry).also { it.start() }

    private fun create(id: String, title: String = "") =
        CreateDraftRequest(id = id, thoughtCore = title, story = "", tags = emptyList(), visibility = CreateDraftRequest.Visibility.`private`)

    private fun save(title: String, media: DraftMedia? = null) = UpdateDraftRequest(
        rev = 0, thoughtCore = title, story = "s", tags = emptyList(), visibility = UpdateDraftRequest.Visibility.`private`,
        anonymous = false, media = media, clear = if (media == null) listOf(UpdateDraftRequest.Clear.media) else null,
    )

    private fun edit(title: String) =
        PendingEditRequest(rev = 0, thoughtCore = title, story = "s", tags = emptyList(), visibility = PendingEditRequest.Visibility.public, anonymous = false)

    private suspend fun eventually(check: () -> Boolean) = withTimeout(5_000) { while (!check()) delay(5) }

    @Test fun savesGoInOrderOneAtATimeEachNumberedAboveTheLast() = runBlocking {
        val server = Server()
        val box = outbox(server = server)
        box.create(create("d1", "a"))
        box.save("d1", save("ab"))
        box.save("d1", save("abc"))
        assertEquals(listOf("create d1", "save d1 1 ab", "save d1 2 abc"), server.calls)
        assertEquals(1, server.mostInFlight)
        assertEquals(2, box.rev("d1"))
        assertTrue(box.ops.isEmpty())
    }

    @Test fun aSaveWaitingBehindAnotherTakesTheWaitingSavesPlace() = runBlocking {
        val server = Server().apply { gate = CompletableDeferred() }
        val box = outbox(server = server)
        val first = async { box.save("d1", save("one")) }
        eventually { server.inFlight == 1 }
        // While "one" is on its way, two more are typed: only the newest goes after it.
        val second = async { box.save("d1", save("two")) }
        eventually { box.ops.size == 2 }
        val third = async { box.save("d1", save("three")) }
        eventually { box.ops.lastOrNull()?.save?.thoughtCore == "three" }
        assertEquals(2, box.ops.size)
        server.gate!!.complete(Unit)
        listOf(first, second, third).forEach { it.await() }
        assertEquals(listOf("save d1 1 one", "save d1 3 three"), server.calls)
    }

    @Test fun aDraftMadeAndTypedIntoBeforeItCouldGoIsOneCreate() = runBlocking {
        val server = Server()
        // Not sending yet (offline from the start): a create never tried takes the saves typed after it.
        val untried = DraftOutbox(Disk(), server, scope, listOf(20L))
        val made = async { untried.create(create("d2", "t")) }
        eventually { untried.ops.size == 1 }
        val typed = async { untried.save("d2", save("typed", DraftMedia(DraftMedia.Type.image, "https://img.example/a.jpg"))) }
        eventually { untried.ops.single().create?.thoughtCore == "typed" }
        assertEquals("https://img.example/a.jpg", untried.ops.single().create?.media?.url)
        untried.start()
        made.await()
        typed.await()
        assertEquals(listOf("create d2"), server.calls)
        assertEquals("typed", server.creates.single().thoughtCore)
    }

    @Test fun aStaleAnswerIsSentOnceMoreAboveTheStoredNumber() = runBlocking {
        // Another device (or this one before a reinstall) took the draft to rev 7: this device's words are newer.
        val server = Server().apply { stored = 7 }
        val box = outbox(server = server)
        box.save("d1", save("mine"))
        assertEquals(listOf("save d1 1 mine", "save d1 8 mine"), server.calls)
        assertEquals(8, box.rev("d1"))
        box.save("d1", save("next"))
        assertEquals("save d1 9 next", server.calls.last())
    }

    @Test fun offlineTheSaveWaitsAndGoesWhenTheNetworkComesBack() = runBlocking {
        val server = Server().apply { failNext = 3 }
        val box = outbox(server = server, retry = listOf(10L, 20L))
        val saving = async { box.save("d1", save("offline words")) }
        eventually { server.calls.size >= 2 }
        // Still waiting (as Firestore's await did offline), and still queued.
        assertTrue(saving.isActive)
        assertEquals("offline words", box.pending("d1")?.save?.thoughtCore)
        saving.await()
        assertEquals(4, server.calls.size)
        assertTrue(server.calls.all { it == "save d1 1 offline words" })
        assertTrue(box.ops.isEmpty())
    }

    @Test fun anAttemptThatNeverEndsIsLetGoAndTriedAgain() = runBlocking {
        // Found on the AVD: a create begun as airplane mode came on never answered, and nothing went after it.
        var hung = 1
        val server = object : DraftOutbox.Sender by Server() {
            val calls = java.util.Collections.synchronizedList(mutableListOf<String>())
            override suspend fun create(request: CreateDraftRequest): CreatedDraft {
                calls += request.id
                if (hung-- > 0) kotlinx.coroutines.awaitCancellation()
                return CreatedDraft(request.id, true, 0)
            }
        }
        val box = DraftOutbox(Disk(), server, scope, listOf(10L), sendTimeoutMillis = 100L).also { it.start() }
        withTimeout(5_000) { box.create(create("d7")) }
        assertEquals(listOf("d7", "d7"), server.calls)
    }

    @Test fun aTokenThatCannotBeHadOfflineIsRetriedNotDropped() = runBlocking {
        // Offline, the ID token's refresh fails inside the request's interceptor: no ApiFailure, no IOException.
        val server = Server().apply { failNext = 2; failure = IllegalStateException("A network error (such as timeout, interrupted connection or unreachable host) has occurred.") }
        val box = outbox(server = server, retry = listOf(10L))
        withTimeout(5_000) { box.save("d1", save("w")) }
        assertEquals(3, server.calls.size)
        assertTrue(box.ops.isEmpty())
    }

    @Test fun kickTriesAtOnceRatherThanAtTheNextRetry() = runBlocking {
        val server = Server().apply { failNext = 1 }
        val box = outbox(server = server, retry = listOf(60_000L))
        val saving = async { box.save("d1", save("w")) }
        eventually { server.calls.size == 1 }
        box.kick()
        withTimeout(2_000) { saving.await() }
        assertEquals(2, server.calls.size)
    }

    @Test fun aRefusalDropsTheRequestAndTellsItsCaller() = runBlocking {
        val server = Server().apply { failNext = 1; failure = ApiFailure("conflict", ApiFailure.IN_TRASH_MESSAGE, 409) }
        val box = outbox(server = server)
        val e = assertFailsWith<ApiFailure> { box.save("d1", save("w")) }
        assertTrue(e.isInTrash)
        assertTrue(box.ops.isEmpty())
        // A token to refresh is no refusal: the words wait.
        assertTrue(!DraftOutbox.refused(ApiFailure("unauthenticated", "x", 401)))
        assertTrue(!DraftOutbox.refused(ApiFailure("rate_limited", "x", 429)))
        assertTrue(!DraftOutbox.refused(IOException()))
    }

    @Test fun whatWasQueuedOutlivesTheAppAndGoesAtTheNextLaunch() = runBlocking {
        val disk = Disk()
        val server = Server().apply { failNext = Int.MAX_VALUE }
        val first = DraftOutbox(disk, server, scope, listOf(60_000L)).also { it.start() }
        val lost = scope.launch { first.create(create("d3", "kept")) }
        eventually { server.calls.isNotEmpty() }
        val typed = scope.launch { first.save("d3", save("kept and more")) }
        eventually { first.ops.size == 2 }
        // The app is killed: its coroutines go, the disk stays.
        first.stop()
        lost.cancel()
        typed.cancel()
        assertNotNull(disk.text)

        val fresh = Server()
        val next = DraftOutbox(disk, fresh, scope, listOf(20L))
        assertEquals("kept and more", next.pending("d3")?.save?.thoughtCore)
        assertEquals(1, next.rev("d3"))
        next.start()
        eventually { next.ops.isEmpty() }
        assertEquals(listOf("create d3", "save d3 1 kept and more"), fresh.calls)
        assertNull(disk.text?.takeIf { DraftOutbox.decode(it)?.ops?.isNotEmpty() == true })
    }

    @Test fun settleWaitsForEverythingOfTheCardBeforePublishing() = runBlocking {
        val server = Server().apply { gate = CompletableDeferred() }
        val disk = Disk()
        // Words a last launch left: no caller waits for them, but publishing must.
        DraftOutbox(disk, Server().apply { failNext = Int.MAX_VALUE }, scope, listOf(60_000L)).apply {
            val q = scope.launch { save("d1", save("left by the last launch")) }
            eventually { ops.isNotEmpty() }
            stop()
            q.cancel()
        }
        val box = DraftOutbox(disk, server, scope, listOf(20L)).also { it.start() }
        val published = CompletableDeferred<List<String>>()
        val publish = scope.launch {
            box.settle("d1")
            published.complete(server.calls.toList())
        }
        delay(50)
        assertTrue(publish.isActive)
        server.gate!!.complete(Unit)
        assertEquals(listOf("save d1 1 left by the last launch"), withTimeout(5_000) { published.await() })
    }

    @Test fun anEditNeverSentAndThenDiscardedSendsOnlyTheDiscard() = runBlocking {
        val server = Server().apply { gate = CompletableDeferred() }
        val box = outbox(server = server)
        val other = async { box.save("busy", save("x")) }
        eventually { server.inFlight == 1 }
        val e = async { box.saveEdit("c1", edit("revised")) }
        eventually { box.ops.size == 2 }
        val d = async { box.discardEdit("c1") }
        eventually { box.ops.lastOrNull()?.kind == DraftOutbox.Kind.DiscardEdit }
        server.gate!!.complete(Unit)
        listOf(other, e, d).forEach { it.await() }
        assertEquals(listOf("save busy 1 x", "discard c1"), server.calls)
    }

    @Test fun aDraftThatNeverReachedTheServerAndIsLetGoOfSendsNothing() = runBlocking {
        val server = Server()
        val disk = Disk()
        val box = DraftOutbox(disk, server, scope, listOf(20L))
        val made = async { box.create(create("d9", "x")) }
        eventually { box.ops.size == 1 }
        box.delete("d9")
        made.await()
        box.start()
        delay(50)
        assertTrue(server.calls.isEmpty())
        assertTrue(box.ops.isEmpty())
    }

    @Test fun pendingEditsCountTheirOwnRevs() = runBlocking {
        val server = Server()
        val box = outbox(server = server)
        box.saveEdit("c1", edit("a"))
        box.saveEdit("c1", edit("b"))
        assertEquals(listOf("edit c1 1 a", "edit c1 2 b"), server.calls)
        assertEquals(0, box.rev("c1"))
        assertEquals(2, box.rev("c1", edit = true))
        box.discardEdit("c1")
        assertEquals(0, box.rev("c1", edit = true))
    }

    @Test fun foldKeepsWhatTheSaveClears() {
        val c = create("d1", "t").copy(media = DraftMedia(DraftMedia.Type.image, "https://img.example/a.jpg"), accentHue = 40.0)
        val folded = DraftOutbox.fold(c, save("t2").copy(clear = listOf(UpdateDraftRequest.Clear.media, UpdateDraftRequest.Clear.accentHue)))
        assertEquals("t2", folded.thoughtCore)
        assertNull(folded.media)
        assertNull(folded.accentHue)
    }
}
