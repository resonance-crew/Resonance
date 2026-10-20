package com.resonance.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.resonance.app.Session
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.MenuTrigger
import com.resonance.design.OrganicAlert
import com.resonance.design.OrganicMenu
import com.resonance.design.OrganicMenuItem
import com.resonance.design.Toasts
import com.resonance.design.generated.IconName
import com.resonance.design.fade
import com.resonance.kit.api.Trash
import com.resonance.kit.l10n.L10n
import com.resonance.kit.reading.cardsByKey
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * How a card's 刪除 says the card went to the trash: the toast with its 復原 (the card box, where the
 * card leaves its shelf), or the page itself (the card's own page, which stays and shows its trash
 * banner as it reads the card again).
 */
enum class TrashFeedback { Toast, Page }

/**
 * Whether 刪除 asks first (trash.spec §0): it moves the card to the trash at once, where it waits
 * 30 days — except a published resonance, public and under the viewer's name, whose original is
 * named: the trash takes it back at once, and with it a connection only it held, which a restore
 * never brings back. That one asks, in the plain colour of 取消共振 (nothing is lost for good).
 * Whether the original is anonymous may be unknown ([LookUp]: read it first; one that can't be read
 * asks — a connection can outlive the original going private).
 */
internal enum class TrashAsk { AtOnce, Ask, LookUp }

internal fun trashAsk(referenceCardId: String?, published: Boolean, visibility: String, anonymous: Boolean, referenceAnonymous: Boolean?): TrashAsk = when {
    referenceCardId == null || !published || visibility != "public" || anonymous -> TrashAsk.AtOnce
    referenceAnonymous == true -> TrashAsk.AtOnce
    referenceAnonymous == false -> TrashAsk.Ask
    else -> TrashAsk.LookUp
}

/**
 * The owner's ⋯ on a card (CardActionsMenu.tsx): 編輯 / 轉為公開·私人 / 取消共振 (for a card answering
 * another, [referenceCardId]) / 刪除, in the shared OrganicMenu. 刪除 moves the card to the trash
 * (POST /api/v1/cards/{id}/trash): no dialog — the toast's 復原 ([TrashFeedback.Toast]) or the page's
 * banner ([TrashFeedback.Page]) and the trash shelf are the way back — but for the one resonance that
 * asks first ([trashAsk]). Visibility and 取消共振 go through the server too (PATCH, DELETE
 * …/{original}/resonances/{id}) — never straight to Firestore, whose rules refuse them on a
 * published card — which also refreshes the site's cached pages that showed the card. One that
 * fails says so and changes nothing: the card stays where it is listed. Any of them may end a
 * connection a resonance made: every screen showing cards reads them again
 * ([Session.noteCardChange]), and the conversations and an open thread follow the connections live.
 * The twin of iOS's CardActionsMenu.
 */
@Composable
fun CardActionsMenu(
    session: Session,
    cardId: String,
    visibility: String,
    open: (Route) -> Unit,
    seed: Double = 7.0,
    hue: Double? = null,
    /** Whether the card opens once the writer is gone (false on the card's own page, which is underneath). */
    showsCard: Boolean = true,
    onChanged: () -> Unit = {},
    /** A chip over a card's cover (the card box), bare in the card page's bar. */
    trigger: MenuTrigger = MenuTrigger.Chip,
    /** The card it resonates with, if it answers one: 取消共振 lets it go. */
    referenceCardId: String? = null,
    /** That card's title, when the page has it (else asked for once the question is). */
    referenceTitle: String? = null,
    /** Whether that card is anonymous, when the page knows it (else looked up when 刪除 needs it). */
    referenceAnonymous: Boolean? = null,
    /** The card is published (a draft's 刪除 never asks). */
    published: Boolean = true,
    /** The card is anonymous (its 刪除 takes back no connection). */
    anonymous: Boolean = false,
    /** What the undo toast names. */
    title: String = "",
    trashFeedback: TrashFeedback = TrashFeedback.Toast,
    /** After the card went to the trash (the screens showing it read it again already). */
    onTrashed: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    val trash = LocalTrash.current ?: rememberFallbackTrash(session)
    var confirmingTrash by remember { mutableStateOf(false) }
    var unresonating by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    /** The visibility change didn't go through (the card is as it was): said in a small alert. */
    var changeFailed by remember { mutableStateOf(false) }
    /** The trash didn't take it, asked or not: said in its dialog (which stays for another try), else in a notice. */
    var trashFailed by remember { mutableStateOf(false) }
    var trashNotice by remember { mutableStateOf(false) }
    val isPrivate = visibility == "private"
    val ref = TrashRef(cardId, title, referenceCardId)

    // To the trash, then said so: the toast and its 復原, or the page's own banner. Run in the shell's
    // scope, so the toast still comes once the card (and this menu) has left its shelf.
    fun trashNow() {
        if (busy) return
        busy = true
        trashFailed = false
        trash.launch {
            try {
                trash(ref)
                confirmingTrash = false
                if (trashFeedback == TrashFeedback.Toast) offerUndo(ref)
                onTrashed()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Not moved: the card stays in every list, and the viewer is told — in the question, if one was asked.
                if (confirmingTrash) trashFailed = true else trashNotice = true
            } finally {
                busy = false
            }
        }
    }

    val items = listOf(
        OrganicMenuItem(L10n.Me.Actions.edit, IconName.Pen) { open(Route.Write(cardId = cardId, showsCard = showsCard)) },
        OrganicMenuItem(
            if (isPrivate) L10n.Me.Actions.makePublic else L10n.Me.Actions.makePrivate,
            if (isPrivate) IconName.Globe else IconName.Lock,
        ) {
            if (busy) return@OrganicMenuItem
            busy = true
            scope.launch {
                try {
                    session.writing.updateCard(cardId, visibility = if (isPrivate) "public" else "private")
                    session.noteCardChange(menuChange(cardId, referenceCardId))
                    onChanged()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // Nothing changed: the card stays as it was, and says so.
                    changeFailed = true
                } finally {
                    busy = false
                }
            }
        },
    ) + listOfNotNull(
        referenceCardId?.let { OrganicMenuItem(L10n.Me.Actions.unresonate, IconName.Wave) { unresonating = true } },
        OrganicMenuItem(L10n.Me.Actions.delete, IconName.Trash, destructive = true) {
            if (busy) return@OrganicMenuItem
            when (trashAsk(referenceCardId, published, visibility, anonymous, referenceAnonymous)) {
                TrashAsk.AtOnce -> trashNow()
                TrashAsk.Ask -> {
                    trashFailed = false
                    confirmingTrash = true
                }
                // Whether the original is anonymous, read first (the ⋯ waits meanwhile).
                TrashAsk.LookUp -> {
                    busy = true
                    scope.launch {
                        val originalAnonymous = try {
                            referenceCardId?.let { session.reading.cardsByKey(listOf(it))[it]?.anonymous }
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            null
                        }
                        busy = false
                        if (originalAnonymous == true) trashNow()
                        else {
                            trashFailed = false
                            confirmingTrash = true
                        }
                    }
                }
            }
        },
    )

    Box(Modifier.fade(if (busy && !confirmingTrash && !unresonating) 0.6f else 1f)) {
        OrganicMenu(items, L10n.Me.Actions.menuLabel, seed, hue = hue, trigger = trigger)
    }
    // To the trash, where it can be restored: the plain solid fill, as 取消共振's — only the connection it
    // takes back doesn't come back, which is what the question is for.
    if (confirmingTrash) OrganicConfirmDialog(
        title = L10n.Me.Actions.trashResonanceTitle,
        body = L10n.Me.Actions.trashResonanceBody(Trash.DAYS),
        cancelLabel = L10n.Me.Actions.deleteCancel,
        confirmLabel = L10n.Me.Actions.trashResonanceConfirm,
        onCancel = { confirmingTrash = false },
        onConfirm = ::trashNow,
        busy = busy,
        seed = seed + 5,
        error = if (trashFailed) L10n.Safety.actionError else null,
    )
    if (trashNotice) OneExitNotice(L10n.Me.Actions.delete, L10n.Safety.actionError, seed = seed + 13) { trashNotice = false }
    if (changeFailed) OrganicAlert(L10n.Safety.actionError, seed = seed + 3) { changeFailed = false }
    if (unresonating && referenceCardId != null) UnresonateDialog(
        session, cardId, referenceCardId, referenceTitle, seed = seed + 9,
        onDone = {
            unresonating = false
            onChanged()
        },
        onCancel = { unresonating = false },
    )
}

/** Outside the signed-in shell (a preview): the trash's moves without the shell's toast. */
@Composable
private fun rememberFallbackTrash(session: Session): TrashCenter {
    val scope = rememberCoroutineScope()
    return remember(session) { TrashCenter(session.writing.trashCalls(), session::noteCardChange, Toasts(), scope) }
}

/**
 * What a change made from the ⋯ is about: the card — and, for a resonance, the card it answers,
 * whose page lists it among its resonances and so reads them again (made private, deleted or let
 * go of, it leaves that list), as on iOS.
 */
internal fun menuChange(cardId: String, referenceCardId: String?) = Session.CardChange(cardId, referenceCardId)

/**
 * "Stop resonating with 〈title〉?" — the card stays, answering nothing; the server lets go of its
 * link to the original. The title is the page's when it has it, else read once the question is
 * asked (until then the question keeps its place unwritten; one that can't be read is the plain
 * words). Nothing here is irreversible, so the verb is the plain solid fill.
 */
@Composable
private fun UnresonateDialog(
    session: Session,
    cardId: String,
    original: String,
    knownTitle: String?,
    seed: Double,
    onDone: () -> Unit,
    onCancel: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf(knownTitle) }
    var looking by remember { mutableStateOf(knownTitle == null) }
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(original) {
        if (title == null) {
            title = try {
                session.reading.cardsByKey(listOf(original))[original]?.title
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
        }
        looking = false
    }
    OrganicConfirmDialog(
        title = title?.let(L10n.Me.Actions::unresonateConfirmTitle) ?: L10n.Me.Actions.unresonate,
        body = L10n.Me.Actions.unresonateConfirmBody,
        cancelLabel = L10n.Me.Actions.deleteCancel,
        confirmLabel = L10n.Me.Actions.unresonateConfirm,
        onCancel = onCancel,
        onConfirm = {
            if (busy) return@OrganicConfirmDialog
            busy = true
            failed = false
            scope.launch {
                try {
                    session.writing.unresonate(original, cardId)
                    // The card's page, the original's resonances, the box's shelves and the thought map.
                    session.noteCardChange(menuChange(cardId, original))
                    onDone()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    failed = true
                } finally {
                    busy = false
                }
            }
        },
        busy = busy,
        seed = seed,
        error = if (failed) L10n.Safety.actionError else null,
        titlePending = looking,
    )
}
