package com.resonance.app.ui

import android.Manifest
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.heightIn
import com.resonance.design.ModalActionMinWidth
import com.resonance.design.ModalActionMinHeight
import com.resonance.design.toPath
import com.resonance.design.wideCardOutline
import com.resonance.design.OrganicButton
import com.resonance.design.GrainMode
import com.resonance.design.Grain
import com.resonance.design.ButtonVariant
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.AskKind
import com.resonance.app.NotifyAskRules
import com.resonance.app.PushCenter
import com.resonance.app.Session
import com.resonance.app.SystemQuestion
import com.resonance.design.AppFonts
import com.resonance.design.GrainInk
import com.resonance.design.LocalModalBackdrop
import com.resonance.design.LocalToasts
import com.resonance.design.ModalActions
import com.resonance.design.ModalBody
import com.resonance.design.ModalTitle
import com.resonance.design.OrganicModal
import com.resonance.design.Toasts
import com.resonance.design.generated.Tokens
import com.resonance.design.organicSurface
import com.resonance.kit.l10n.L10n
import com.resonance.kit.push.NotificationSwitch
import com.resonance.kit.push.get
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** How long nothing else may be up before the ask comes: what triggered it has closed and settled (a page landing, a sheet leaving). */
private const val ASK_SETTLE_MS = 600L

/**
 * The reply ask (docs/specs/notification-asks.md §2): after reaching someone, while the system's
 * question was never put, our own words first — 想知道對方何時回覆嗎？ — then, on 開啟通知, the system's
 * question (a yes registers this install). 先不要, a tap beside it or Back ask nothing and count toward
 * the pause and the limit ([NotifyAskRules]). Drawn by the shell over the tabs, once nothing else is
 * up — [blocked] (the writer still on screen), no modal open, no toast showing — never stacked, never twice at once.
 */
@Composable
fun NotifyAskHost(session: Session, blocked: Boolean) {
    val kind by PushCenter.asking.collectAsStateWithLifecycle()
    val backdrop = LocalModalBackdrop.current
    val toasts = LocalToasts.current
    // The writer on top, a dialog up, or the shell's toast still saying something (「小紙條已送出」): not yet.
    val stillBlocked by rememberUpdatedState(blocked)
    fun clear() = !stillBlocked && (backdrop?.open ?: 0) == 0 && toasts.current == null
    // The ask on screen (by name: it outlives a recreated activity).
    var showing by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(kind) {
        if (kind == null || showing != null) return@LaunchedEffect
        // Wait for the composer, the writer, any dialog to be gone, and to stay gone a moment.
        while (true) {
            snapshotFlow { clear() }.first { it }
            delay(ASK_SETTLE_MS)
            if (clear()) break
        }
        // Still undetermined (the system's question may have been put from Settings meanwhile).
        if (PushCenter.systemQuestion == SystemQuestion.Undetermined) showing = kind?.name else PushCenter.askClosed(declined = false)
    }
    val shown = showing?.let { name -> AskKind.entries.firstOrNull { it.name == name } } ?: return
    val ask = rememberNotificationPermission { answer ->
        if (answer == NotifyAskRules.Answer.Granted) session.pushesAllowed()
    }
    fun close(declined: Boolean) {
        showing = null
        PushCenter.askClosed(declined)
    }
    NotifyAskDialog(
        shown,
        onLater = { close(declined = true) },
        onTurnOn = {
            close(declined = false)
            ask()
        },
    )
}

/**
 * Puts the system's notification question, reading its answer with the rationale around it
 * ([PushCenter.permissionAnswered]: Back is no answer; a no is remembered, for good once the
 * system won't ask again). Returns what starts it.
 */
@Composable
internal fun rememberNotificationPermission(onAnswer: (NotifyAskRules.Answer) -> Unit): () -> Unit {
    val activity = LocalActivity.current
    fun rationale() = activity?.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) == true
    // Kept by name across a recreated activity, as the request's answer is.
    var before by rememberSaveable { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        onAnswer(PushCenter.permissionAnswered(granted, before, rationale()))
    }
    return {
        before = rationale()
        PushCenter.permissionAsked()
        launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}

/**
 * The ask's dialog: the house modal — its title, one muted line, the quiet hint that Settings can
 * change it, then 先不要 (tonal) · 開啟通知 (solid) at the end, stacked, the verb on top, when they don't
 * fit. A tap beside it is 先不要.
 */
@Composable
internal fun NotifyAskDialog(kind: AskKind, onLater: () -> Unit, onTurnOn: () -> Unit) {
    val title = if (kind == AskKind.Publish) L10n.NotifyAsk.publishTitle else L10n.NotifyAsk.replyTitle
    val body = if (kind == AskKind.Publish) L10n.NotifyAsk.publishBody else L10n.NotifyAsk.replyBody
    OrganicModal(onLater, title, seed = 61.0, closeLabel = L10n.NotifyAsk.later, maxWidth = 420.dp) {
        // As ConfirmModal: 8 between title and line; the modal's 14 before the hint, 18 before the actions.
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.semantics { heading() }) { ModalTitle(title) }
            ModalBody(body)
        }
        BasicText(L10n.NotifyAsk.changeLater, style = AppFonts.body(Tokens.HintSize, lineHeight = 1.55f, color = Tokens.TextMuted))
        ModalActions(L10n.NotifyAsk.later, onLater, L10n.NotifyAsk.turnOn, onTurnOn)
    }
}

/** How wide an invite stands at most (centred in a wider list: a tablet's), its paper itself — the lists add their own side insets to it. */
internal val NotifyInviteMaxWidth = 600.dp

/** The two invites (§3, §4): the switch each turns on and its words. */
internal enum class NotifyInvite(val switch: NotificationSwitch) {
    Picks(NotificationSwitch.Picks),
    ConnectionCards(NotificationSwitch.ConnectionCards);

    val title: String get() = if (this == Picks) L10n.NotifyAsk.picksTitle else L10n.NotifyAsk.connectionCardsTitle
    val body: String get() = if (this == Picks) L10n.NotifyAsk.picksBody else L10n.NotifyAsk.connectionCardsBody

    /** The toast once it is on: what was turned on. */
    val turnedOn: String get() = if (this == Picks) L10n.NotifyAsk.picksOn else L10n.NotifyAsk.connectionCardsOn
}

/**
 * Whether [invite] shows now ([NotifyAskRules.showsInvite]) once [eligible] — reading the switches
 * the first time it is, and the system's question and the "picks" channel (both invites' pushes come
 * on it) again whenever the app comes back.
 */
@Composable
internal fun rememberInviteShown(session: Session, invite: NotifyInvite, eligible: Boolean): Boolean {
    val settings by session.notifySettings.collectAsStateWithLifecycle()
    val answered by session.invitesAnswered.collectAsStateWithLifecycle()
    var system by remember { mutableStateOf(PushCenter.systemQuestion) }
    var channelOff by remember { mutableStateOf(PushCenter.picksBlock == PushCenter.PicksBlock.Channel) }
    LifecycleResumeEffect(Unit) {
        system = PushCenter.systemQuestion
        channelOff = PushCenter.picksBlock == PushCenter.PicksBlock.Channel
        onPauseOrDispose {}
    }
    // The flows' debug switch (`--ez askForNotifications false`) keeps the invites away too: nothing pushes a page down.
    val asks = PushCenter.asksEnabled
    LaunchedEffect(eligible, asks) { if (eligible && asks) session.readNotifySettingsOnce() }
    return asks && NotifyAskRules.showsInvite(eligible, settings?.get(invite.switch), system, invite.switch in answered, channelOff)
}

/**
 * An invite just put above the list's first row: a reader still at the top (the first row, [before] items
 * in, at its start) is shown it — a lazy list keeps the row it showed first in place, which would leave
 * the invite above, out of sight.
 */
internal suspend fun LazyListState.keepTopInView(before: Int) {
    if (firstVisibleItemIndex <= before && firstVisibleItemScrollOffset == 0) scrollToItem(0)
}

/**
 * An invite's card in a list (§3 above the home feed's cards, §4 at the top of the conversations list),
 * keyed so the list animates it away once answered.
 */
internal fun LazyListScope.notifyInviteItem(session: Session, invite: NotifyInvite, modifier: Modifier = Modifier, look: InviteLook = InviteLook.Sheet) {
    item(key = "notify-invite-${invite.name}") {
        NotifyInviteCard(session, invite, modifier.animateItem(), look)
    }
}

/** How an invite is drawn where it lies. */
internal enum class InviteLook {
    /** Its own paper inside a pen line, the buttons under its words (the conversations list). */
    Sheet,

    /**
     * No paper of its own (the owner, 2026-11-01): a band of the banded feed, on the page between the
     * header's pen line and the first card's top wave — the lines already there.
     */
    Band,

    /** The grid's width as one more card, framed as the grid's cards are: words at the start, buttons at the end beside them. */
    WideCard,
}

/**
 * The invite card: a paper sheet in the card style — the card paper inside the modal's pen line, no
 * shadow — its title, one line, then 不用了 (tonal) · 好，通知我 (solid) at its end. 好，通知我 puts the
 * system's question first when it was never put; on a yes (or with notifications already showing) the
 * switch is saved, the card goes and the toast says what was turned on — a failed save keeps the card,
 * and the toast says so. A system no: the card goes, nothing saved, and the toast leads to the system
 * settings; the dialog closed with Back answered nothing, and the card stays.
 * 不用了: gone for good, for this account on this install.
 */
@Composable
internal fun NotifyInviteCard(session: Session, invite: NotifyInvite, modifier: Modifier = Modifier, look: InviteLook = InviteLook.Sheet) {
    val context = LocalContext.current
    val toasts = LocalToasts.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var hidden by remember { mutableStateOf(false) }
    fun save() {
        busy = true
        scope.launch {
            try {
                session.turnOnPush(invite.switch)
                session.answerInvite(invite.switch)
                toasts.show(invite.turnedOn)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                toasts.show(L10n.Settings.Notifications.saveError)
            } finally {
                busy = false
            }
        }
    }
    val ask = rememberNotificationPermission { answer ->
        if (answer == NotifyAskRules.Answer.Granted) {
            session.pushesAllowed()
            save()
        } else if (answer == NotifyAskRules.Answer.Dismissed) {
            // Back: no answer — the invite stays as it was.
            busy = false
        } else {
            busy = false
            hidden = true
            toasts.show(
                L10n.NotifyAsk.systemOff,
                action = Toasts.Action(L10n.NotifyAsk.openSettings, L10n.NotifyAsk.openSettings) {
                    runCatching { context.startActivity(PushCenter.notificationSettingsIntent(context)) }
                },
            )
        }
    }
    if (hidden) return
    NotifyInviteSheet(
        invite.title, invite.body, busy, modifier, look,
        onNo = { session.answerInvite(invite.switch) },
        onYes = {
            when (NotifyAskRules.yesStep(PushCenter.systemQuestion)) {
                NotifyAskRules.YesStep.AskSystem -> {
                    busy = true
                    ask()
                }
                NotifyAskRules.YesStep.Save -> save()
            }
        },
    )
}

/** The invite's words and buttons in [look], apart from what its buttons do: title (18) → 8 → line → 14 → buttons (18 on the sheet). */
@Composable
internal fun NotifyInviteSheet(
    title: String, body: String, busy: Boolean, modifier: Modifier = Modifier, look: InviteLook = InviteLook.Sheet,
    onNo: () -> Unit, onYes: () -> Unit,
) {
    val words: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            BasicText(title, style = AppFonts.heading(18f, lineHeight = 1.3f), modifier = Modifier.semantics { heading() })
            ModalBody(body)
        }
    }
    // As the dialogs' foot: small pills a finger can land on.
    val target = Modifier.heightIn(min = ModalActionMinHeight).widthIn(min = ModalActionMinWidth)
    val no: @Composable () -> Unit = { OrganicButton(L10n.NotifyAsk.no, target, variant = ButtonVariant.Tonal, small = true, enabled = !busy, onClick = onNo) }
    val yes: @Composable () -> Unit = { OrganicButton(L10n.NotifyAsk.yes, target, small = true, loading = busy, onClick = onYes) }
    when (look) {
        InviteLook.Sheet -> Column(
            modifier
                .fillMaxWidth()
                .organicSurface(Tokens.CardBg, Tokens.ModalBorder, radius = 22.0, seed = 67.0, grainInk = GrainInk.current)
                .padding(horizontal = 22.dp, vertical = 20.dp),
        ) {
            words()
            ModalActions(L10n.NotifyAsk.no, onNo, L10n.NotifyAsk.yes, onYes, busy = busy, topPadding = 18.dp)
        }
        InviteLook.Band -> Column(modifier.fillMaxWidth()) {
            words()
            ModalActions(L10n.NotifyAsk.no, onNo, L10n.NotifyAsk.yes, onYes, busy = busy, topPadding = 14.dp)
        }
        InviteLook.WideCard -> {
            val grainInk = GrainInk.current
            val paper = Tokens.CardBg
            val pen = Tokens.ModalBorder
            WideInviteLayout(
                modifier
                    .fillMaxWidth()
                    // The grid's cards' outline, its long edges turning as often per dp as theirs, in the dialog's paper and pen.
                    .drawWithCache {
                        val outline = Outline.Generic(wideCardOutline((size.width / density).toDouble(), (size.height / density).toDouble(), WIDE_INVITE_SEED).toPath(density))
                        val grain = Grain.brush(GrainMode.Tile, "grain-card", size, density, 0.2f, grainInk)
                        val ink = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                        onDrawBehind {
                            drawOutline(outline, paper)
                            grain?.let { drawOutline(outline, it, alpha = 0.2f) }
                            drawOutline(outline, pen, style = ink)
                        }
                    }
                    .padding(22.dp),
                words = words, no = no, yes = yes,
            )
        }
    }
}

/** The wide invite's outline seed (the grid's cards take theirs from their place). */
private const val WIDE_INVITE_SEED = 191.0

/** The words keep at least this much beside the buttons; with less, the buttons go under them. */
private val WideInviteWordsMin = 280.dp

/**
 * The wide invite's inside: [words] at the start, [no] · [yes] (10 apart) at the end of the same row,
 * centred against the words, 28 between — or, when the width or a large text size leaves the words
 * less than [WideInviteWordsMin], the buttons under the words at the end, 14 below them.
 */
@Composable
private fun WideInviteLayout(
    modifier: Modifier,
    words: @Composable () -> Unit,
    no: @Composable () -> Unit,
    yes: @Composable () -> Unit,
) {
    Layout({ words(); no(); yes() }, modifier) { measurables, constraints ->
        val width = constraints.maxWidth
        val gap = 10.dp.roundToPx()
        val apart = 28.dp.roundToPx()
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val noP = measurables[1].measure(loose)
        val yesP = measurables[2].measure(loose)
        val buttons = noP.width + gap + yesP.width
        val buttonsHeight = maxOf(noP.height, yesP.height)
        val beside = width - buttons - apart >= WideInviteWordsMin.roundToPx()
        if (beside) {
            val wordsP = measurables[0].measure(loose.copy(maxWidth = width - buttons - apart))
            val height = maxOf(wordsP.height, buttonsHeight)
            layout(width, height) {
                wordsP.place(0, (height - wordsP.height) / 2)
                yesP.place(width - yesP.width, (height - yesP.height) / 2)
                noP.place(width - yesP.width - gap - noP.width, (height - noP.height) / 2)
            }
        } else {
            val wordsP = measurables[0].measure(loose.copy(maxWidth = width))
            val top = wordsP.height + 14.dp.roundToPx()
            val stacked = buttons > width
            val height = top + if (stacked) noP.height + gap + yesP.height else buttonsHeight
            layout(width, height) {
                wordsP.place(0, 0)
                if (stacked) {
                    // Too narrow for both on a line: the verb on top, as the dialogs' foot.
                    yesP.place(width - yesP.width, top)
                    noP.place(width - noP.width, top + yesP.height + gap)
                } else {
                    yesP.place(width - yesP.width, top + (buttonsHeight - yesP.height) / 2)
                    noP.place(width - yesP.width - gap - noP.width, top + (buttonsHeight - noP.height) / 2)
                }
            }
        }
    }
}
