package com.resonance.app.ui

import com.resonance.api.models.FeedCard
import com.resonance.api.models.RestoredCard
import com.resonance.api.models.TrashedCard
import com.resonance.app.Session
import com.resonance.design.Toasts
import com.resonance.design.generated.IconName
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.WritingApi
import com.resonance.kit.l10n.Strings
import java.io.File
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The trash's moves from the app (trash.spec §6): each goes through the server and has every screen
 * that showed the card read again — the card and the card it answers — whether it went through or
 * not; the undo toast says 已移到垃圾桶 · 復原, names the card for TalkBack, and its 復原 restores
 * the card after the menu that trashed it is gone; a restore says 已還原, or the one-exit notice
 * when a resonance came back on its own, or 沒能還原 when it didn't; an emptying that failed is read
 * again first, and a trash found empty is done (round 8 §6.2).
 */
class TrashCenterTest {
    private val language = Strings.language
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    private val toasts = Toasts()
    private val changes = mutableListOf<Session.CardChange>()
    private val calls = FakeTrashCalls()
    private val trash = TrashCenter(calls, { changes += it }, toasts, scope)
    private val resonance = TrashRef("mine", "我也曾在月台上哭過", referenceCardId = "orig")

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun stop() {
        Strings.language = language
        scope.cancel()
    }

    @Test fun toTheTrashThenWhatShowedItAndItsOriginalReadAgain() = runBlocking {
        trash.trash(resonance)
        assertEquals(listOf("mine"), calls.trashed)
        assertEquals(listOf(Session.CardChange("mine", "orig")), changes)
    }

    @Test fun aTrashThatFailsStillHasTheShelvesReadAgain() = runBlocking {
        calls.fails = IOException("offline")
        assertThrows(IOException::class.java) { runBlocking { trash.trash(resonance) } }
        assertEquals(listOf(Session.CardChange("mine", "orig")), changes)
    }

    @Test fun theUndoToastNamesTheCardAndItsUndoRestoresIt() = runBlocking {
        trash.offerUndo(resonance)
        val toast = toasts.current!!
        assertEquals("已移到垃圾桶", toast.message)
        assertEquals("〈我也曾在月台上哭過〉已移到垃圾桶", toast.spoken)
        val action = toast.action!!
        assertEquals("復原", action.label)
        assertEquals("已移到垃圾桶 · 復原〈我也曾在月台上哭過〉", action.accessibilityLabel)
        assertEquals(IconName.Restore, action.icon)
        action.onAction()
        assertEquals(listOf("mine"), calls.restored)
        assertEquals("已還原", toasts.current?.message)
        assertNull(toasts.current?.action)
        // It came back answering its original again: that page reads again too.
        assertEquals(Session.CardChange("mine", "orig"), changes.last())
    }

    @Test fun anUntitledCardsToastSaysJustWhatHappened() {
        trash.offerUndo(TrashRef("d1"))
        assertEquals("已移到垃圾桶", toasts.current?.spoken)
        assertEquals("已移到垃圾桶 · 復原", toasts.current?.action?.accessibilityLabel)
    }

    @Test fun aResonanceThatCameBackOnItsOwnSaysSoInTheNotice() = runBlocking {
        calls.dropped = true
        assertTrue(trash.restoreSaying(resonance))
        assertTrue(trash.restoredAlone)
        assertNull(toasts.current)
    }

    @Test fun anUndoThatFailsSaysTryAgainFromTheTrash() = runBlocking {
        calls.fails = ApiFailure("rate_limited", "Too many requests.", 429)
        assertFalse(trash.restoreSaying(resonance))
        assertEquals("沒能還原，可以到垃圾桶再試一次", toasts.current?.message)
        assertFalse(trash.restoredAlone)
    }

    @Test fun deletingForGoodAndEmptyingReadTheShelvesAgain() = runBlocking {
        trash.deleteForever(TrashRef("d1"))
        assertEquals(listOf("d1"), calls.deleted)
        assertEquals(Session.CardChange("d1", null), changes.last())
        assertEquals(WritingApi.EmptiedTrash(deleted = 3, remaining = 0), trash.emptyTrash())
        // Emptying concerns every page that showed a card (a change naming none).
        assertEquals(Session.CardChange(), changes.last())
    }

    @Test fun anEmptyingThatFailedIsReadAgainBeforeItIsSaid() = runBlocking {
        // The server emptied the trash and only its answer was lost: done, as if it had worked.
        calls.emptyFails = IOException("timeout")
        calls.left = 0
        assertEquals(WritingApi.EmptiedTrash(deleted = 0, remaining = 0), trash.emptyTrash())
        assertEquals(1, calls.reads)
        assertEquals(Session.CardChange(), changes.last())
        // Cards still in it: the failure stands, and the question says so.
        calls.left = 2
        assertThrows(IOException::class.java) { runBlocking { trash.emptyTrash() } }
        // Nor can it be read: the failure stands too.
        calls.left = null
        assertThrows(IOException::class.java) { runBlocking { trash.emptyTrash() } }
        assertEquals(3, calls.reads)
        // An emptying that went through reads nothing more.
        calls.emptyFails = null
        trash.emptyTrash()
        assertEquals(3, calls.reads)
    }

    @Test fun aShelfCaptionSaysWhereTheCardComesBackAndWhenItGoes() {
        val now = Instant.parse("2026-10-20T08:00:00Z")
        fun card(published: Boolean, restoresTo: FeedCard.RestoresTo?, trashedDaysAgo: Double) = FeedCard(
            id = "c", slug = null, title = "t", excerpt = "", tags = emptyList(),
            publishedAt = if (published) "2026-09-01T00:00:00Z" else null,
            author = null, anonymous = false, visibility = FeedCard.Visibility.`private`, imageUrl = null, imageLabel = null,
            accentHue = null, readMinutes = 1, referenceCardId = null, reason = null,
            trashedAt = now.minusSeconds((trashedDaysAgo * 86_400).toLong()).toString(),
            restoresTo = restoresTo,
        )
        assertEquals("還原後公開 · 23 天後永久刪除", TrashWords.caption(card(true, FeedCard.RestoresTo.`public`, 7.0), now))
        assertEquals("私人卡 · 29 天後永久刪除", TrashWords.caption(card(false, FeedCard.RestoresTo.`private`, 1.0), now))
        assertEquals("私人卡 · 30 天後永久刪除", TrashWords.caption(card(false, null, 0.5), now))
        assertEquals("私人卡 · 一天內永久刪除", TrashWords.caption(card(true, FeedCard.RestoresTo.`private`, 29.5), now))
        assertEquals("還原後只給連結看 · 12 天後永久刪除", TrashWords.caption(card(true, FeedCard.RestoresTo.connections, 18.0), now))
        // A visibility no reader knows comes back private, as the server restores it.
        assertEquals("私人卡 · 12 天後永久刪除", TrashWords.caption(card(true, null, 18.0), now))
    }

    private class FakeTrashCalls : TrashCalls {
        val trashed = mutableListOf<String>()
        val restored = mutableListOf<String>()
        val deleted = mutableListOf<String>()
        var fails: Exception? = null
        var dropped = false

        private fun card(id: String, reference: String?) = FeedCard(
            id = id, slug = null, title = "t", excerpt = "", tags = emptyList(), publishedAt = null,
            author = null, anonymous = false, visibility = FeedCard.Visibility.`public`, imageUrl = null, imageLabel = null,
            accentHue = null, readMinutes = 1, referenceCardId = reference, reason = null,
        )

        override suspend fun trash(cardId: String): TrashedCard {
            fails?.let { throw it }
            trashed += cardId
            return TrashedCard(card(cardId, null), changed = true)
        }

        override suspend fun restore(cardId: String): RestoredCard {
            fails?.let { throw it }
            restored += cardId
            return RestoredCard(card(cardId, if (dropped) null else "orig"), changed = true, droppedResonance = dropped)
        }

        override suspend fun deleteForever(cardId: String) {
            fails?.let { throw it }
            deleted += cardId
        }

        var emptyFails: Exception? = null
        /** What the trash holds when read again (null: the read fails). */
        var left: Int? = 0
        var reads = 0

        override suspend fun emptyTrash(): WritingApi.EmptiedTrash {
            emptyFails?.let { throw it }
            return WritingApi.EmptiedTrash(deleted = 3, remaining = 0)
        }

        override suspend fun trashLeft(): Int {
            reads++
            return left ?: throw IOException("offline")
        }
    }
}
