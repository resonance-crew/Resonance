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
import com.resonance.design.LocalToasts
import com.resonance.design.MenuTrigger
import com.resonance.design.OrganicMenu
import com.resonance.design.OrganicMenuItem
import com.resonance.design.Toasts
import com.resonance.design.generated.IconName
import com.resonance.design.fade
import com.resonance.kit.api.ApiFailure
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
 * A move from the owner's ⋯ that the screen showing the card draws at once (round 21: optimistic), before
 * the server answers — and takes back, should it refuse: to the trash, private, answering nothing.
 */
enum class CardMove { Trash, MakePrivate, Unresonate }

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
 * The owner's ⋯ on a card (CardActionsMenu.tsx): 編輯 (公開發表 on a 私人卡's own page, [penBeside]) / 轉為草稿 (a card readers have: published,
 * and not private — round 8 §1.2) / 取消共振 (for a card answering another, [referenceCardId]) /
 * 刪除, in the shared OrganicMenu ([menuRows]). Every 草稿 — never published, or published and kept
 * private — has the same three: it is published from the writer's step, where its tags, cover and
 * type are.
 * 刪除 moves the card to the trash (POST /api/v1/cards/{id}/trash): no dialog — the toast's 復原
 * ([TrashFeedback.Toast]) or the page's banner ([TrashFeedback.Page]) and the trash shelf are the way
 * back — but for the one resonance that asks first ([trashAsk]). Visibility and 取消共振 go through the server too (PATCH, DELETE
 * …/{original}/resonances/{id}) — never straight to Firestore, whose rules refuse them on a
 * published card — which also refreshes the site's cached pages that showed the card. Every move is
 * drawn at once (round 21): the card leaves its shelf ([onLeaving]) or its page shows it moved
 * ([onMoving]) and the question closes, while the server is asked in the account's scope; one the
 * server refuses puts the card back as it was and says so in a toast. Any of them may end a
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
    /** The card is published (a draft's 刪除 never asks; a draft, like a published private card, has no 轉為草稿). */
    published: Boolean = true,
    /** The card is anonymous (its 刪除 takes back no connection). */
    anonymous: Boolean = false,
    /** What the undo toast names. */
    title: String = "",
    trashFeedback: TrashFeedback = TrashFeedback.Toast,
    /** After the card went to the trash (the screens showing it read it again already). */
    onTrashed: () -> Unit = {},
    /**
     * The card box ([TrashFeedback.Toast]): the card leaves its shelf at once (`true`), before the server
     * answers, and comes back should it refuse (`false`) — said then in a toast, which outlives the ⋯.
     */
    onLeaving: (Boolean) -> Unit = {},
    /**
     * The page draws the 私人卡's 編輯 pen beside the ⋯ (its own card page, round 12 §3): the ⋯ leads with
     * 公開發表 instead, which opens the writer at its publish step with the card offered to readers.
     */
    penBeside: Boolean = false,
    /**
     * A move drawn at once where the card shows (round 21): its page in the trash, private, answering
     * nothing ([CardMove]) — returning the way back, run should the server refuse. The card box's trash
     * is [onLeaving] instead.
     */
    onMoving: (CardMove) -> (() -> Unit) = { {} },
) {
    val scope = rememberCoroutineScope()
    val trash = LocalTrash.current ?: rememberFallbackTrash(session)
    var confirmingTrash by remember { mutableStateOf(false) }
    var unresonating by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val ref = TrashRef(cardId, title, referenceCardId)

    val toasts = LocalToasts.current
    // To the trash at once (round 21): the card leaves its shelf, or its page shows its banner, and the
    // question closes; the server is asked in the shell's scope, so what it says still comes once the
    // card (and this menu) has gone — the toast and its 復原 where it left a shelf, or the failure, which
    // puts the card back where it was.
    fun trashNow() {
        if (busy) return
        confirmingTrash = false
        val leaves = trashFeedback == TrashFeedback.Toast
        val back: () -> Unit = if (leaves) {
            onLeaving(true)
            ({ onLeaving(false) })
        } else {
            onMoving(CardMove.Trash).also { onTrashed() }
        }
        trash.launch {
            try {
                trash(ref)
                if (leaves) {
                    onTrashed()
                    offerUndo(ref)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Not moved: the card is back where it was, and the viewer is told.
                back()
                toasts.show(L10n.Me.Actions.trashFailed)
            }
        }
    }

    val items = menuRows(seen = seenByReaders(published, visibility), answering = referenceCardId != null, penBeside = penBeside).map { row ->
        when (row) {
            MenuRow.Edit -> OrganicMenuItem(L10n.Me.Actions.edit, IconName.Pen) { open(Route.Write(cardId = cardId, showsCard = showsCard)) }
            MenuRow.PublishPublicly -> OrganicMenuItem(L10n.Me.Actions.publishPublicly, IconName.Globe) { open(publishRoute(cardId, showsCard)) }
            // 轉為草稿: private, as 轉為私人 was (its byline kept, so it comes back as it went).
            MenuRow.Visibility -> OrganicMenuItem(L10n.Me.Actions.makePrivate, IconName.Lock) {
                if (busy) return@OrganicMenuItem
                // Private at once (round 21); the server asked in the shell's scope, which the ⋯ may not outlive.
                val back = onMoving(CardMove.MakePrivate)
                trash.launch {
                    try {
                        session.writing.updateCard(cardId, visibility = "private")
                        session.noteCardChange(menuChange(cardId, referenceCardId))
                        onChanged()
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        // Nothing changed: the card goes back as it was, and says so (a card in the trash meanwhile, in the plain words).
                        back()
                        toasts.show(if (e is ApiFailure && e.isInTrash) L10n.Safety.actionError else L10n.Me.Actions.makePrivateFailed)
                    }
                }
            }
            MenuRow.Unresonate -> OrganicMenuItem(L10n.Me.Actions.unresonate, IconName.Wave) { unresonating = true }
            MenuRow.Delete -> OrganicMenuItem(L10n.Me.Actions.delete, IconName.Trash, destructive = true) {
                if (busy) return@OrganicMenuItem
                when (trashAsk(referenceCardId, published, visibility, anonymous, referenceAnonymous)) {
                    TrashAsk.AtOnce -> trashNow()
                    TrashAsk.Ask -> confirmingTrash = true
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
                            if (originalAnonymous == true) trashNow() else confirmingTrash = true
                        }
                    }
                }
            }
        }
    }

    Box(Modifier.fade(if (busy && !confirmingTrash && !unresonating) 0.6f else 1f)) {
        OrganicMenu(items, L10n.Me.Actions.menuLabel, seed, hue = hue, trigger = trigger)
    }
    // To the trash, where it can be restored: the plain solid fill, as 取消共振's — only the connection it
    // takes back doesn't come back, which is what the question is for. It closes as it is answered.
    if (confirmingTrash) OrganicConfirmDialog(
        title = L10n.Me.Actions.trashResonanceTitle,
        body = L10n.Me.Actions.trashResonanceBody(Trash.DAYS),
        cancelLabel = L10n.Me.Actions.deleteCancel,
        confirmLabel = L10n.Me.Actions.trashResonanceConfirm,
        onCancel = { confirmingTrash = false },
        onConfirm = ::trashNow,
        busy = false,
        busyLabel = L10n.Me.Actions.delete,
        seed = seed + 5,
    )
    if (unresonating && referenceCardId != null) UnresonateDialog(
        session, cardId, referenceCardId, referenceTitle, seed = seed + 9,
        onSent = {
            unresonating = false
            onMoving(CardMove.Unresonate)
        },
        onDone = onChanged,
        onCancel = { unresonating = false },
    )
}

/** Outside the signed-in shell (a preview): the trash's moves without the shell's toast. */
@Composable
private fun rememberFallbackTrash(session: Session): TrashCenter {
    val scope = rememberCoroutineScope()
    return remember(session) { TrashCenter(session.writing.trashCalls(session.reading), session::noteCardChange, Toasts(), scope) }
}

/** The ⋯'s rows, in order. */
internal enum class MenuRow { Edit, PublishPublicly, Visibility, Unresonate, Delete }

/** Whether readers have a card: published, and not private (a published private card is a 草稿 to them all, round 8 §1). */
internal fun seenByReaders(published: Boolean, visibility: String): Boolean = published && visibility != "private"

/**
 * 編輯, 轉為草稿 — only on a card readers have ([seen]): a 草稿 (never published, or published and
 * kept private) is published from the writer's step, never from here — 取消共振 on a resonance, 刪除.
 * On a 私人卡's own page, whose 編輯 pen stands beside the ⋯ ([penBeside]), the first row is
 * 公開發表 instead: the way to that step (round 12 §3); the card box's ⋯, with no pen by it, keeps 編輯.
 * As on the web and iOS.
 */
internal fun menuRows(seen: Boolean, answering: Boolean, penBeside: Boolean = false): List<MenuRow> =
    listOf(if (penBeside && !seen) MenuRow.PublishPublicly else MenuRow.Edit) + listOfNotNull(
        MenuRow.Visibility.takeIf { seen },
        MenuRow.Unresonate.takeIf { answering },
    ) + MenuRow.Delete

/** 公開發表's writer (round 12 §3): on the card, at its publish step, the card offered to readers. */
internal fun publishRoute(cardId: String, showsCard: Boolean): Route.Write = Route.Write(cardId = cardId, showsCard = showsCard, publishing = true)

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
 * words). Nothing here is irreversible, so the verb is the plain solid fill. Answered, it closes at
 * once and the link is dropped where it shows ([onSent], round 21: returning the way back); the
 * server asked in the account's scope — refused, the link comes back and a toast says so.
 */
@Composable
private fun UnresonateDialog(
    session: Session,
    cardId: String,
    original: String,
    knownTitle: String?,
    seed: Double,
    onSent: () -> (() -> Unit),
    onDone: () -> Unit,
    onCancel: () -> Unit,
) {
    val toasts = LocalToasts.current
    var title by remember { mutableStateOf(knownTitle) }
    var looking by remember { mutableStateOf(knownTitle == null) }
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
            val back = onSent()
            session.launch {
                try {
                    session.writing.unresonate(original, cardId)
                    // The card's page, the original's resonances, the box's shelves and the thought map.
                    session.noteCardChange(menuChange(cardId, original))
                    onDone()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    back()
                    toasts.show(L10n.Me.Actions.unresonateFailed)
                }
            }
        },
        seed = seed,
        titlePending = looking,
    )
}
