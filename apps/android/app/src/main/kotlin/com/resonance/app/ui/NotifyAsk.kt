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
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
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
import com.resonance.design.filledBand
import com.resonance.design.HeaderEdgeHeight
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.unit.Dp
import com.resonance.design.OrganicButton
import com.resonance.design.GrainMode
import com.resonance.design.Grain
import com.resonance.design.ButtonVariant
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
import com.resonance.app.BuildConfig
import com.resonance.app.DebugLaunch
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

/** The two invites (§3, §4): the switch each turns on and its words. */
internal enum class NotifyInvite(val switch: NotificationSwitch) {
    Picks(NotificationSwitch.Picks),
    ConnectionCards(NotificationSwitch.ConnectionCards);

    /** Its name to the debug builds' `--es notifyInvite` (iOS's `-notifyInvite` names). */
    val debugName: String get() = if (this == Picks) "picks" else "connectionCards"

    val title: String get() = if (this == Picks) L10n.NotifyAsk.picksTitle else L10n.NotifyAsk.connectionCardsTitle
    val body: String get() = if (this == Picks) L10n.NotifyAsk.picksBody else L10n.NotifyAsk.connectionCardsBody

    /** The toast once it is on: what was turned on. */
    val turnedOn: String get() = if (this == Picks) L10n.NotifyAsk.picksOn else L10n.NotifyAsk.connectionCardsOn
}

/**
 * An invite in its list: [shown] while its reasons hold ([reasons]: [NotifyAskRules.showsInvite]) and the system's
 * first no hasn't put it away on this screen ([putAway]: the reasons may still hold, the system may ask again). What
 * the list lays out round it — the feed's pull paper, whether the first card starts at the bar's line — reads
 * [shown], never the reasons alone, so nothing there wears the invite's grey once it has gone (round 24 review).
 */
@Stable
internal class InviteShown(val invite: NotifyInvite, private val reasons: State<Boolean>) {
    private var away by mutableStateOf(false)

    val shown: Boolean get() = reasons.value && !away

    /** The system said no (not for good): the invite leaves this screen, nothing saved. */
    fun putAway() {
        away = true
    }
}

/**
 * Whether [invite] shows now ([NotifyAskRules.showsInvite]) once [eligible] — reading the switches
 * the first time it is, and the system's question and the "picks" channel (both invites' pushes come
 * on it) again whenever the app comes back. Debug builds' `--es notifyInvite picks|connectionCards|all`
 * show those invites whatever their reasons (screen checks; iOS's `-notifyInvite`).
 */
@Composable
internal fun rememberInviteShown(session: Session, invite: NotifyInvite, eligible: Boolean): InviteShown {
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
    val forced = BuildConfig.DEBUG && invite.debugName in DebugLaunch.notifyInvites
    val reasons = rememberUpdatedState(
        forced || asks && NotifyAskRules.showsInvite(eligible, settings?.get(invite.switch), system, invite.switch in answered, channelOff),
    )
    return remember(invite) { InviteShown(invite, reasons) }
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
 * An invite in a list (§3 above the home feed's cards, §4 at the top of the conversations list), keyed so the list
 * animates it away once answered. [modifier] is the item's own (the room under it); [look] how it is drawn there.
 */
internal fun LazyListScope.notifyInviteItem(session: Session, invite: InviteShown, modifier: Modifier = Modifier, look: InviteLook) {
    item(key = "notify-invite-${invite.invite.name}") {
        NotifyInviteCard(session, invite, modifier.animateItem(), look)
    }
}

/**
 * How an invite is drawn where it lies (round 24, the owner): a phone's is a band of its list ([Band]); the conversations'
 * on a tablet, one pane or two, a card with no pen line inside the content's own margins ([Card]). The home feed's takes
 * the feed's own look (the owner, 2026-11-23: 「卡片已經變成區段的設計了，所以上面這個提醒也應該做成區段…如果…卡片是一塊一塊的…
 * 兩欄的話，那上方還是要做成這一個卡片的設計」): a [Band] over bands, a phone's or a tablet's, the grid's wide card ([WideCard])
 * over the bordered grid.
 */
internal sealed interface InviteLook {
    /**
     * A band of its list, never a card (round 24, the owner: 「做成像是首頁這邊手機上文章…用水平分割線分割的區段…
     * 裡面有填色…深色一點的灰，這樣就不會在手機的版面上顯得又多一張卡片的感覺」): the thread's grey ([Tokens.BubbleTheirs]) edge to
     * edge with the story bands' grain, parted by their wavy rule in the header's quiet grey ([Tokens.FieldBorderHover]).
     * [words]: where its words stand across it (the list's own content column). [underBar]: its top is the bar's pen
     * line — no rule of its own there, the paper reaching [above] up past its box under the bar, so no pull or stretch
     * ever opens the page's cream between the bar's line and the band — else its own rule along its top. [bottomRule]:
     * its own rule along its foot (false over a card that draws its own top rule). [top]: from its box's top to its
     * words; [bottom]: under its buttons. Inside: title, 8, the line, 14, then 不用了 · 好，通知我 at the end — or, [beside]
     * (a tablet's reading column), the buttons at the end of the words' row where they leave the words room
     * ([WideInviteLayout], as the grid's card).
     */
    data class Band(
        val words: Modifier,
        val underBar: Boolean,
        val top: Dp = InviteBandPad,
        val above: Dp = 0.dp,
        val bottomRule: Boolean = true,
        val bottom: Dp = InviteBandPad,
        val beside: Boolean = false,
    ) : InviteLook

    /**
     * A tablet's conversations' (round 24, the owner: 「在 iPad 和 Android 平板上…這個通知區塊…應該要做這種沒有 border 的卡片，就是原本的設計，
     * 因為它這時候左邊右邊的 padding 已經變多了」): the thread's grey with the cards' grain in a card's organic outline
     * ([borderlessCard]), no pen line at all, never edge to edge — its item puts it inside the content's margins. 22 at
     * its sides, [top] over the title and [bottom] under the buttons; inside: title, 8, the line, 14, then 不用了 ·
     * 好，通知我 at the end (stacked, the verb on top, when they don't fit). [seed]: its outline's.
     */
    data class Card(val top: Dp, val bottom: Dp, val seed: Double) : InviteLook

    /**
     * The bordered grid's (an expanded window): the grid's width as one more card, borderless as [Card] — words at the
     * start, buttons at the end beside them.
     */
    data object WideCard : InviteLook
}

/** A band invite's air inside: above its words and under its buttons. */
internal val InviteBandPad = 20.dp

/** A tablet's picks band's air: the story bands' own (their 32 over and under their content). */
internal val InviteBandTabletPad = 32.dp

/** The band invite's rules (wavyLine seeds): along its top, along its foot. */
internal const val INVITE_TOP_RULE = 84.0
internal const val INVITE_BOTTOM_RULE = 108.0

/** The invites' card outlines (wobRect seeds): the picks invite's, the connection-cards invite's. */
internal const val PICKS_INVITE_SEED = 191.0
internal const val CONNECTIONS_INVITE_SEED = 193.0

/**
 * The connection-cards invite atop the conversations list, as [frame] lays the rows out. A phone's ([ConversationsFrame.bands])
 * is a band from the bar's pen line, its words where the rows' content is and 20 under the bar's foot (as the feed's
 * picks invite's are), its paper reaching up to the list's top ([barFoot]: the bar's foot under it) so a stretch at the
 * top never parts it from the bar. A tablet's and the panes' is [ConversationsInviteCard], where [conversationsInviteRoom]
 * puts it.
 */
internal fun conversationsInviteLook(frame: ConversationsFrame, readable: Modifier, barFoot: Dp): InviteLook {
    if (!frame.bands) return ConversationsInviteCard
    val gap = frame.headGap ?: 0.dp
    return InviteLook.Band(
        words = readable.padding(start = frame.start, end = frame.end).padding(horizontal = frame.rowInset),
        underBar = true,
        top = InviteBandPad - gap,
        above = barFoot + gap,
    )
}

/** A tablet's conversations invite: 22 over its title, 20 under its buttons (round 24 §A3). */
internal val ConversationsInviteCard = InviteLook.Card(top = 22.dp, bottom = 20.dp, seed = CONNECTIONS_INVITE_SEED)

/**
 * The conversations invite's own room in the list: a phone's band the list's whole width; a tablet's card in the rows'
 * column ([readable]), its edges where a row's box is — its top where the first row's would be — and both the
 * [conversationsInviteGap] over the first row.
 */
internal fun conversationsInviteRoom(frame: ConversationsFrame, readable: Modifier): Modifier =
    if (frame.bands) Modifier.padding(bottom = conversationsInviteGap(frame))
    else readable.padding(start = frame.start, end = frame.end).padding(bottom = conversationsInviteGap(frame))

/** Under the conversations invite to the first row: a phone's 4, as the first row stands under the bar's foot; else 12. */
internal fun conversationsInviteGap(frame: ConversationsFrame): Dp = if (frame.bands) frame.headGap ?: 4.dp else 12.dp

/**
 * The picks invite over a banded feed, a phone's or a tablet's: its words where the cards' are ([inset] — a phone's 38, a
 * tablet's the reading column's), the story bands' 32 over and under them on a [tablet] (a phone's 20), and there the
 * buttons beside them; under the bar its top is the bar's pen line (the list starts at the top of the bar's wavy band, so
 * its words keep that band's height more, and a pull's gap wears its grey: FeedScreen's `pullPaper`), else — a refresh
 * note above it — a rule of its own; its foot is the first card's own top rule.
 */
internal fun feedInviteLook(inset: Dp, underBar: Boolean, tablet: Boolean = false): InviteLook.Band {
    val air = if (tablet) InviteBandTabletPad else InviteBandPad
    return InviteLook.Band(
        words = Modifier.padding(horizontal = inset),
        underBar = underBar,
        top = if (underBar) HeaderEdgeHeight + air else air,
        bottomRule = false,
        bottom = air,
        beside = tablet,
    )
}

/**
 * The invite ([InviteLook]: a band of its list, a tablet's borderless card, or the grid's wide card) — its
 * title, one line, then 不用了 (tonal) · 好，通知我 (solid) at its end. 好，通知我 puts the system's question first when it
 * was never put; on a yes (or with notifications already showing) the switch is saved, the card goes and the toast says
 * what was turned on — a failed save keeps the card, and the toast says so. A system no: the card goes, nothing saved, and the toast leads to the system
 * settings; the dialog closed with Back answered nothing, and the card stays.
 * 不用了: gone for good, for this account on this install.
 */
@Composable
internal fun NotifyInviteCard(session: Session, shown: InviteShown, modifier: Modifier = Modifier, look: InviteLook) {
    val invite = shown.invite
    val context = LocalContext.current
    val toasts = LocalToasts.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
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
            // Put away on this screen, where the list reads it (the feed's pull paper, its first card's rule).
            shown.putAway()
            toasts.show(
                L10n.NotifyAsk.systemOff,
                action = Toasts.Action(L10n.NotifyAsk.openSettings, L10n.NotifyAsk.openSettings) {
                    runCatching { context.startActivity(PushCenter.notificationSettingsIntent(context)) }
                },
            )
        }
    }
    if (!shown.shown) return
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

/** The invite's words and buttons in [look], apart from what its buttons do: title (18) → 8 → line → 14 → buttons. */
@Composable
internal fun NotifyInviteSheet(
    title: String, body: String, busy: Boolean, modifier: Modifier = Modifier, look: InviteLook,
    onNo: () -> Unit, onYes: () -> Unit,
) {
    val words: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            BasicText(title, style = AppFonts.heading(18f, lineHeight = 1.3f), modifier = Modifier.semantics { heading() })
            // On the grey every look is drawn on, the muted ink deepened to clear 4.5:1 (the text-muted is short of it there).
            ModalBody(body, color = InviteBodyInk)
        }
    }
    // As the dialogs' foot: small pills a finger can land on.
    val target = Modifier.heightIn(min = ModalActionMinHeight).widthIn(min = ModalActionMinWidth)
    val no: @Composable () -> Unit = { OrganicButton(L10n.NotifyAsk.no, target, variant = ButtonVariant.Tonal, small = true, enabled = !busy, onClick = onNo) }
    val yes: @Composable () -> Unit = { OrganicButton(L10n.NotifyAsk.yes, target, small = true, loading = busy, onClick = onYes) }
    when (look) {
        is InviteLook.Band -> {
            val paper = Tokens.BubbleTheirs
            val pen = Tokens.FieldBorderHover
            Box(
                modifier
                    .fillMaxWidth()
                    .filledBand(
                        paper, pen,
                        topRule = INVITE_TOP_RULE.takeUnless { look.underBar },
                        bottomRule = INVITE_BOTTOM_RULE.takeIf { look.bottomRule },
                        above = if (look.underBar) look.above else 0.dp,
                        grainInk = GrainInk.current,
                    ),
            ) {
                val inside = look.words.padding(top = look.top, bottom = look.bottom)
                if (look.beside) {
                    WideInviteLayout(inside, words = words, no = no, yes = yes)
                } else {
                    Column(inside) {
                        words()
                        ModalActions(L10n.NotifyAsk.no, onNo, L10n.NotifyAsk.yes, onYes, busy = busy, topPadding = 14.dp)
                    }
                }
            }
        }
        is InviteLook.Card -> Column(
            modifier
                .fillMaxWidth()
                .borderlessCard(look.seed)
                .padding(start = 22.dp, end = 22.dp, top = look.top, bottom = look.bottom),
        ) {
            words()
            ModalActions(L10n.NotifyAsk.no, onNo, L10n.NotifyAsk.yes, onYes, busy = busy, topPadding = 14.dp)
        }
        InviteLook.WideCard -> WideInviteLayout(
            modifier.fillMaxWidth().borderlessCard(PICKS_INVITE_SEED).padding(22.dp),
            words = words, no = no, yes = yes,
        )
    }
}

/**
 * The invite's line on its grey: the muted ink deepened to clear 4.5:1 on the bubbles' papers ([Tokens.LinkCardMuted],
 * the link cards' — [Tokens.TextMuted] falls short of it on [Tokens.BubbleTheirs] in the light themes).
 */
internal val InviteBodyInk: androidx.compose.ui.graphics.Color @Composable @ReadOnlyComposable get() = Tokens.LinkCardMuted

/**
 * A tablet's card invite paper (round 24, the owner's 「沒有 border 的卡片」): the thread's grey ([Tokens.BubbleTheirs]) with the
 * cards' grain (`grain-card` at 0.2) in a card's organic outline — the grid's cards', its long edges turning as often
 * per dp as theirs ([wideCardOutline]) — and no pen line at all.
 */
@Composable
private fun Modifier.borderlessCard(seed: Double): Modifier {
    val grainInk = GrainInk.current
    val paper = Tokens.BubbleTheirs
    return drawWithCache {
        val outline = Outline.Generic(wideCardOutline((size.width / density).toDouble(), (size.height / density).toDouble(), seed).toPath(density))
        val grain = Grain.brush(GrainMode.Tile, "grain-card", size, density, 0.2f, grainInk)
        onDrawBehind {
            drawOutline(outline, paper)
            grain?.let { drawOutline(outline, it, alpha = 0.2f) }
        }
    }
}

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
