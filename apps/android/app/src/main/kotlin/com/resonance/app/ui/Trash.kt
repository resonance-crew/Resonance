package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.FeedCard
import com.resonance.api.models.RestoredCard
import com.resonance.api.models.TrashedCard
import com.resonance.app.Session
import com.resonance.design.ModalBody
import com.resonance.design.ModalCloseButton
import com.resonance.design.ModalTitle
import com.resonance.design.OrganicModal
import com.resonance.design.Toasts
import com.resonance.design.generated.IconName
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.Trash
import com.resonance.kit.api.WritingApi
import com.resonance.kit.api.purgeInstant
import com.resonance.kit.l10n.L10n
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** What the trash's moves ask of the server ([WritingApi] on screen; a stand-in under test). */
interface TrashCalls {
    /** POST /api/v1/cards/{id}/trash. */
    suspend fun trash(cardId: String): TrashedCard

    /** POST /api/v1/cards/{id}/restore. */
    suspend fun restore(cardId: String): RestoredCard

    /** DELETE /api/v1/cards/{id}?onlyIfTrashed=true: for good, and only while it is still in the trash. */
    suspend fun deleteForever(cardId: String)

    /** DELETE /api/v1/me/trash, page after page. */
    suspend fun emptyTrash(): WritingApi.EmptiedTrash

    /** How many cards the trash holds now, read again (GET /me/cards?tab=trash: none past its days). */
    suspend fun trashLeft(): Int
}

/** The trash's calls through the app's [WritingApi], the trash read again through its [ReadingApi]. */
fun WritingApi.trashCalls(reading: ReadingApi): TrashCalls {
    val api = this
    return object : TrashCalls {
        override suspend fun trash(cardId: String) = api.trashCard(cardId)
        override suspend fun restore(cardId: String) = api.restoreCard(cardId)
        override suspend fun deleteForever(cardId: String) = api.deleteCard(cardId, onlyIfTrashed = true)
        override suspend fun emptyTrash() = api.emptyTrash()
        override suspend fun trashLeft() = inTrash(reading.cardBox(DefaultApi.TabGetCardBox.trash)).size
    }
}

/** A card as the trash's moves need it: its id, the title the toast names, and the card it answers (or answered, before the trash parked it). */
data class TrashRef(val id: String, val title: String = "", val referenceCardId: String? = null)

/**
 * The trash's moves from the app (trash.spec §6; the web's lib/data/trash) — move a card there,
 * bring it back, delete it for good, empty it — each through the server, then every screen that
 * showed the card where it was reads again ([Session.noteCardChange]: the card box's shelves, the
 * trash among them, the card's page and its original's, the thought map). A resonance going in or
 * coming back may end or keep a connection; the conversations follow the connections live.
 *
 * It belongs to the signed-in shell (one per account, beside the toasts), so what it says outlives
 * the control that asked: the toast's 復原 runs after the card's ⋯ has left with the card, and a
 * restore that brought a resonance back on its own says so in a notice ([restoredAlone], drawn once
 * by [RestoredAloneNotice]).
 */
@Stable
class TrashCenter(
    private val calls: TrashCalls,
    private val noteChange: (Session.CardChange) -> Unit,
    private val toasts: Toasts,
    private val scope: CoroutineScope,
) {
    /** 「已還原 · 這張卡片回來了，但不再與原本那張卡片共振」 is up. */
    var restoredAlone by mutableStateOf(false)

    /**
     * Cards deleted for good from their own page's banner (round 21), off every shelf at once — the page
     * left for the card box before the server answers — and back where they were should it refuse.
     */
    private val leaving = mutableStateListOf<String>()

    /** Card [id] leaves the card box's shelves at once ([going]), or comes back (refused, or restored meanwhile elsewhere). */
    fun leave(id: String, going: Boolean) {
        if (going) { if (id !in leaving) leaving.add(id) } else leaving.remove(id)
    }

    /** [cards] without those on their way out ([leave]). */
    fun shown(cards: List<FeedCard>): List<FeedCard> = if (leaving.isEmpty()) cards else cards.filterNot { it.id in leaving }

    private fun change(card: TrashRef) = Session.CardChange(card.id, card.referenceCardId)

    /** Runs [work] in the shell's scope: what it shows or says outlives the control (a card's ⋯) that asked. */
    fun launch(work: suspend TrashCenter.() -> Unit): Job = scope.launch { work() }

    /** To the trash; what showed the card reads again, whether it went or not (the shelf then shows where it is). */
    suspend fun trash(card: TrashRef): TrashedCard =
        try {
            calls.trash(card.id)
        } finally {
            noteChange(change(card))
        }

    /**
     * 「已移到垃圾桶 · 復原」: the toast whose 復原 brings [card] back (TalkBack hears 「〈title〉已移到垃圾桶」,
     * the button 「已移到垃圾桶 · 復原〈title〉」).
     */
    fun offerUndo(card: TrashRef) {
        val named = card.title.isNotBlank()
        toasts.show(
            L10n.Me.Actions.trashed,
            announce = if (named) L10n.Me.Actions.movedToTrash(card.title) else L10n.Me.Actions.trashed,
            action = Toasts.Action(
                L10n.Me.Actions.undo,
                if (named) L10n.Me.Actions.undoTrashLabel(card.title) else L10n.Me.Actions.undoTrash,
                IconName.Restore,
            ) { scope.launch { restoreSaying(card) } },
        )
    }

    /** Out of the trash, as it was; what showed it reads again either way. */
    suspend fun restore(card: TrashRef): RestoredCard =
        try {
            calls.restore(card.id).also { restored ->
                // Coming back as a resonance, it shows the link again where its original shows it.
                noteChange(Session.CardChange(card.id, restored.card.referenceCardId ?: card.referenceCardId))
            }
        } catch (e: Exception) {
            noteChange(change(card))
            throw e
        }

    /**
     * Out of the trash, then said so: 已還原 — or, [sayWho] (the trash shelf's 還原, round 11 §7), who
     * reads it now ([restoredToast]) — or the notice when it came back standing alone (it no longer
     * answers the card it answered), or 沒能還原，可以到垃圾桶再試一次. Whether it came back.
     */
    suspend fun restoreSaying(card: TrashRef, sayWho: Boolean = false): Boolean = try {
        sayRestored(restore(card), sayWho)
        true
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        toasts.show(L10n.Me.Actions.undoFailed)
        false
    }

    /**
     * What a restore that went through says: 已還原 (the card page's banner, a toast's 復原), or who reads
     * the card now ([sayWho]: the shelf's, whose rows no longer say it before — [restoredToast]), or
     * the notice for a resonance that came back on its own.
     */
    fun sayRestored(restored: RestoredCard, sayWho: Boolean = false) {
        when {
            restored.droppedResonance -> restoredAlone = true
            sayWho -> toasts.show(restoredToast(restored.card))
            else -> toasts.show(L10n.Me.Actions.restored)
        }
    }

    /** For good, only while it is in the trash (a card restored meanwhile elsewhere is refused, `isNotInTrash`). */
    suspend fun deleteForever(card: TrashRef) {
        try {
            calls.deleteForever(card.id)
        } finally {
            noteChange(change(card))
        }
    }

    /**
     * 清空垃圾桶: every card in it for good; the shelf reads again to what is left, whatever happened.
     * A failure is looked into before it is said (round 8 §6.2): the trash read again and found empty
     * is done — the server emptied it, and only its answer was lost (it ran past the app's wait, the
     * network went) — so the question closes as if it had worked; still holding cards, or not read,
     * the failure stands and the question says so.
     */
    suspend fun emptyTrash(): WritingApi.EmptiedTrash =
        try {
            try {
                calls.emptyTrash()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val left = try {
                    calls.trashLeft()
                } catch (c: CancellationException) {
                    throw c
                } catch (_: Exception) {
                    null
                }
                if (left != 0) throw e
                WritingApi.EmptiedTrash(deleted = 0, remaining = 0)
            }
        } finally {
            noteChange(Session.CardChange())
        }
}

/** The signed-in shell's trash (null outside it: a test, a preview). */
val LocalTrash = staticCompositionLocalOf<TrashCenter?> { null }

/**
 * The one-exit notice for a restored resonance that came back on its own: 已還原, 這張卡片回來了，
 * 但不再與原本那張卡片共振, and the quiet close — drawn once by the shell, so it outlives the control
 * (the toast's 復原, a shelf's ⋯) that restored the card.
 */
@Composable
fun RestoredAloneNotice(trash: TrashCenter) {
    if (trash.restoredAlone) OneExitNotice(L10n.Me.Actions.restored, L10n.Me.Actions.restoredAloneBody, seed = 73.0) { trash.restoredAlone = false }
}

/**
 * A notice with nothing to choose, in the web's Modal: its title and its words, then the one way
 * out — the quiet close, under them at the right (a refused move: 刪除 · 沒完成，再試一次).
 */
@Composable
internal fun OneExitNotice(title: String, body: String, seed: Double, onDismiss: () -> Unit) {
    OrganicModal(onDismiss, title, seed = seed, closeLabel = L10n.Native.close, maxWidth = 400.dp) {
        Column(Modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            ModalTitle(title)
            ModalBody(body)
        }
        ModalCloseButton(L10n.Native.close, onDismiss)
    }
}

/**
 * When a card in the trash goes, as its page's banner says it (the shelf's rows say nothing under
 * them since round 11 §7): 「一天內永久刪除」 in its last day, else 「{n} 天後永久刪除」.
 */
internal object TrashWords {
    /** When it goes, or null when the card says nothing of it. */
    fun left(card: FeedCard, now: Instant = Instant.now()): String? = left(card.purgeInstant, now)

    fun left(purgeAt: Instant?, now: Instant = Instant.now()): String? {
        val purge = purgeAt ?: return null
        val left = Trash.daysLeft(purge, now)
        return if (left.lastDay) L10n.Me.trashLastDay else L10n.Me.trashDaysLeft(left.days)
    }
}

/** Who reads a card that came back from the trash (round 11 §7, the web's `restoredAs`). */
internal enum class RestoredAs { Private, Public, Anonymous, Connections }

/**
 * Who reads [card] — the restore's answer, never the trash row — now that it is back: a 私人卡 (kept
 * private, or never published), public, public and anonymous, or connections only.
 */
internal fun restoredAs(card: FeedCard): RestoredAs = when {
    card.publishedAt.isNullOrEmpty() || card.visibility == FeedCard.Visibility.`private` -> RestoredAs.Private
    card.visibility == FeedCard.Visibility.connections -> RestoredAs.Connections
    card.anonymous -> RestoredAs.Anonymous
    else -> RestoredAs.Public
}

/**
 * The trash shelf's restore toast (round 11 §7): who reads the card now — 已還原為私人卡 ·
 * 已還原為公開卡片 · 已還原為匿名公開卡片 · 已還原，僅連結的人看得到 — the only word of it now that
 * the rows no longer warn 還原後公開 before.
 */
internal fun restoredToast(card: FeedCard): String = when (restoredAs(card)) {
    RestoredAs.Private -> L10n.Me.Actions.restoredPrivate
    RestoredAs.Public -> L10n.Me.Actions.restoredPublic
    RestoredAs.Anonymous -> L10n.Me.Actions.restoredAnonymous
    RestoredAs.Connections -> L10n.Me.Actions.restoredConnections
}
