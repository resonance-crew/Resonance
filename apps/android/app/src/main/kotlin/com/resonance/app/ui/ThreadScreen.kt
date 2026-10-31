package com.resonance.app.ui

import com.resonance.design.generated.HueRole
import com.resonance.design.Mixes
import com.resonance.design.avatarFill
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.draw.drawWithCache
import com.resonance.design.ModalScrim
import com.resonance.design.LayoutClass
import com.resonance.design.LocalWindowLayout
import com.resonance.design.readableColumn

import android.net.Uri
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.imeAnimationTarget
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.IntOffset
import com.resonance.api.models.FeedCard
import com.resonance.app.Stickers
import com.resonance.design.ComposerHeight
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.chat.ChatAlbum
import com.resonance.kit.chat.ComposerPanel
import com.resonance.kit.chat.KeyboardHeights
import com.resonance.kit.chat.PanelMachine
import com.resonance.kit.chat.PanelState
import com.resonance.kit.chat.SegmentRole
import com.resonance.kit.chat.StickerCatalog
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.roundToInt
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import com.resonance.design.ModalScrollFade
import com.resonance.design.scrollFade
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.foundation.layout.RowScope
import com.resonance.design.Skeleton
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.BuildConfig
import com.resonance.app.ConversationsStore
import com.resonance.app.DebugLaunch
import com.resonance.app.PushCenter
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ChatPictureSource
import com.resonance.design.ComposerBacking
import com.resonance.design.CssText
import com.resonance.design.EmptyAction
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.MenuTrigger
import com.resonance.design.ModalCloseButton
import com.resonance.design.ModalGap
import com.resonance.design.ModalTitle
import com.resonance.design.OklchColor
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIconButton
import com.resonance.design.OrganicImage
import com.resonance.design.OrganicInlineBar
import com.resonance.design.OrganicMenu
import com.resonance.design.OrganicMenuItem
import com.resonance.design.OrganicModal
import com.resonance.design.WavyDivider
import com.resonance.design.cream
import com.resonance.design.floatingSlip
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.inlineBarTop
import com.resonance.design.plainClickable
import com.resonance.design.BackdropBlurBudget
import com.resonance.design.softenedUnder
import com.resonance.geometry.seedFromString
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.chat.Carried
import com.resonance.kit.chat.ChatMessage
import com.resonance.kit.chat.MessageReactions
import com.resonance.design.generated.ReactionId
import com.resonance.design.LocalToasts
import com.resonance.kit.chat.SearchHit
import com.resonance.kit.chat.ThreadRows
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Date

/**
 * A conversation (ThreadView.tsx, phone): the person in the bar over the messages — newest at the
 * bottom, stacked in runs, with the quotes of replies and the previews of links, older ones read in as
 * the thread is scrolled — then attachments and the composer. A long-press lifts a message with its
 * actions, a drag toward the middle replies. The ⋯ holds search, what's been shared, report, block
 * and delete; search lists the matches over the thread and steps through them. The twin of iOS's
 * ThreadScreen.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ThreadScreen(session: Session, handle: String, uid: String?, note: MessagingApi.Note?, open: (Route) -> Unit, back: () -> Unit) {
    val scope = rememberCoroutineScope()
    val model = rememberSaveable(handle, uid, saver = threadSaver(handle, uid, session)) {
        ThreadModel(handle, uid, note, session).also { m ->
            // The debug `threadDraft` extra fills the composer (screen checks; the emulator's keyboard is slow to drive).
            if (BuildConfig.DEBUG) DebugLaunch.threadDraft?.let { m.draft = it }
        }
    }
    LaunchedEffect(model) { model.load() }
    DisposableEffect(model) { onDispose { model.close() } }
    // Back in the foreground: listeners that failed listen again; a thread that couldn't find its person asks again.
    val foregrounded by session.foregrounded.collectAsStateWithLifecycle()
    LaunchedEffect(model, foregrounded) { model.resumeIfFailed() }
    // The conversation counts as being looked at only while this screen is resumed: its pushes then stay quiet,
    // and the one in the shade goes. (Not once the app is in the background, or the screen covered.)
    val pair = model.pairId
    if (pair != null) {
        LifecycleResumeEffect(pair) {
            PushCenter.viewing(pair)
            // What arrived while it was covered or in the background is read now.
            model.markReadIfNeeded()
            onPauseOrDispose { PushCenter.stoppedViewing(pair) }
        }
    }

    var searching by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    // The list of matches covers the thread; after a match is chosen the thread shows and the bar steps through them.
    var showResults by rememberSaveable { mutableStateOf(false) }
    var currentHit by rememberSaveable { mutableStateOf<String?>(null) }
    var showingMedia by remember { mutableStateOf(false) }
    var pickingCard by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf(false) }
    var confirmingBlock by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var blockError by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf<MessageMenu?>(null) }
    // Round 16 §3: a message of yours to unsend (asked first), one of theirs being reported.
    var unsending by remember { mutableStateOf<ChatMessage?>(null) }
    var reportingMessage by remember { mutableStateOf<ChatMessage?>(null) }
    val toasts = LocalToasts.current
    val sayError: (String) -> Unit = { toasts.show(it) }
    val links = rememberLinkOpener()
    val context = LocalContext.current
    val density = LocalDensity.current
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val composerFocus = remember { FocusRequester() }
    val searchFocus = remember { FocusRequester() }
    val flash = remember { Flash() }
    // A card and pictures never ride together (round 22 §4.2): choosing one while the other waits asks first.
    var replacing by remember { mutableStateOf<Replace?>(null) }
    // Pictures chosen (the gallery, the system's picker): ten in all, said when more were chosen.
    val addPictures: (List<Uri>) -> Unit = { uris ->
        val add = { if (model.addPictures(context, uris) > 0) toasts.show(L10n.Messages.picturesMax) }
        if (model.pendingCard != null) replacing = Replace.WithPictures(add) else add()
    }
    // 「改用系統選擇器」: the system's photo picker, several at once (no permission asked: it hands over only what was chosen).
    val systemPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(ChatAlbum.MAX)) { uris -> if (uris.isNotEmpty()) addPictures(uris) }
    val pickWithSystem: () -> Unit = { systemPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    val togglePicture: (Uri) -> Unit = { uri ->
        val toggle = { if (!model.togglePicture(context, uri)) toasts.show(L10n.Messages.picturesMax) }
        if (model.pendingCard != null && model.pictureNumber(uri.toString()) == null) replacing = Replace.WithPictures(toggle) else toggle()
    }
    val pickCard: (FeedCard) -> Unit = { card ->
        val attach = { model.attachCard(ThreadModel.Attachment(card.id, card.title, card.imageUrl, keptPrivate = card.keptPrivate)) }
        if (model.pictures.isNotEmpty()) replacing = Replace.WithCard(attach) else attach()
    }
    // A picture opened whole (the viewer over everything), or null.
    var viewing by remember { mutableStateOf<ChatPictureSource?>(null) }

    // What lies under the capsule (round 22 §4.1–4.2): the keyboard, a panel in its place, or nothing.
    var panel by remember { mutableStateOf(PanelState()) }
    // Which panel's content is drawn: kept while a closing panel slides away.
    var shownPanel by remember { mutableStateOf(ComposerPanel.None) }
    var attachTab by rememberSaveable { mutableStateOf(AttachTab.Pictures) }
    // The sticker being previewed (a second tap sends it).
    var previewing by remember { mutableStateOf<StickerCatalog.Sticker?>(null) }
    val still = remember(context) { context.prefersReducedMotion() }
    val panelRoom = remember { PanelRoom(scope, still) }
    val stickerCatalog by Stickers.catalog.collectAsStateWithLifecycle()
    // The field grown to the thread (round 22 §4.3, option C): what it leaves over itself under the bar (px) —
    // their last message and its air, or only the air — or null. Its height follows the keyboard or a panel under it.
    var expandedReserve by remember { mutableStateOf<Int?>(null) }
    var expandedExtras by remember { mutableIntStateOf(0) }
    var capsuleHeight by remember { mutableIntStateOf(0) }
    var screenHeight by remember { mutableIntStateOf(0) }
    var screenWidth by remember { mutableIntStateOf(0) }

    // Over what is drawn: a card the viewer can't see, sent alone, has no row, and shapes no run around it.
    val rows by remember(model) { derivedStateOf { ThreadRows.build(model.messages, drawn = { model.carried(it) != Carried.Nothing }) } }
    val rowsNow by rememberUpdatedState(rows)
    val list = rememberLazyListState()
    val resultsList = rememberLazyListState()
    // The bar lies over the thread, so what scrolls shows right up to its pen line.
    val top = inlineBarTop()
    val topPx = with(density) { top.roundToPx() }
    // The composer floats over the thread's foot (round 9 §4): the room it takes, which the thread keeps clear —
    // over the keyboard, a panel in its place (round 22) or the navigation bar, whichever is taller.
    val navigationBars = WindowInsets.navigationBars
    val imeInsets = WindowInsets.ime
    val imeTarget = WindowInsets.imeAnimationTarget
    val keyboardPlace: () -> Int = remember(navigationBars, imeInsets, density, panelRoom) {
        { maxOf(imeInsets.getBottom(density), navigationBars.getBottom(density) + panelRoom.height.roundToInt()) }
    }
    val room = remember(keyboardPlace, density) { ComposerRoom(keyboardPlace, density) }
    // The letter's line under the newest message, when answering their letter is what connects you.
    val notice = if (model.foot == ThreadFoot.Answer) L10n.Messages.replyToConnect(model.other?.handle ?: handle) else null
    val noticeNow by rememberUpdatedState(notice)
    val scroll = remember(list) { ThreadScroll(list, { rowsNow }, { topPx }, { room.clear }, { if (noticeNow != null) 1 else 0 }) }

    // The words typed are searched for a moment after the last key; a blank field is no search.
    LaunchedEffect(query, searching) {
        if (!searching) return@LaunchedEffect
        if (query.isBlank()) {
            model.search("")
            currentHit = null
        } else {
            delay(SEARCH_DEBOUNCE_MILLIS)
            model.search(query)
        }
    }
    val closeSearch: () -> Unit = {
        searching = false
        showResults = false
        currentHit = null
        query = ""
        model.endSearch()
        focusManager.clearFocus()
    }
    // The matches are marked in the thread while it is being looked at (not under the list of them).
    val marking = searching && query.isNotBlank() && !showResults
    val highlights = remember(model.searchHits, marking) { if (marking) model.searchHits.associate { it.messageId to it.ranges } else emptyMap() }
    val jump: (String, Boolean) -> Unit = { id, pulse ->
        scope.launch {
            // A quote's original may be far up: older pages are read until it is held.
            if (model.ensureLoaded(id) && scroll.reveal(id) && pulse) scroll.indexOf(id).let { rowsNow.asReversed().getOrNull(it)?.message?.key?.let(flash::pulse) }
        }
    }
    val pick: (SearchHit) -> Unit = { hit ->
        currentHit = hit.messageId
        showResults = false
        focusManager.clearFocus()
        keyboard?.hide()
        jump(hit.messageId, false)
    }
    // A tap on the thread's blank, or on the foot's solid paper, puts the keyboard away (round 11 §2) — and a panel in its place.
    val closePanel: () -> Unit = {
        previewing = null
        panel = PanelMachine.dismissed(panel)
        panelRoom.animateTo(0f) { if (!panel.keepsRoom) shownPanel = ComposerPanel.None }
    }
    val putKeyboardAway: () -> Unit = {
        focusManager.clearFocus()
        keyboard?.hide()
        if (panel.keepsRoom) closePanel() else panel = PanelState()
    }
    val reply: (ChatMessage) -> Unit = { message ->
        model.reply(message)
        runCatching { composerFocus.requestFocus() }
        keyboard?.show()
    }
    // Opened at a note (a bell row, an older push): the note itself — brought to the middle, flashed and
    // set up to be answered — or, for an older one the thread never got, the chip that answers it.
    LaunchedEffect(model) {
        val landing = model.landOnNote() as? NoteLanding.Message ?: return@LaunchedEffect
        model.reply(landing.message)
        jump(landing.message.id, true)
    }
    BackHandler(enabled = searching) {
        if (showResults && currentHit != null) showResults = false else closeSearch()
    }
    // The panels (round 22 §4.1–4.2) ---------------------------------------------------------------
    val phone = LocalWindowLayout.current.cls == LayoutClass.Compact
    // The window's orientation (a pane beside the conversations may be upright in a window on its side).
    val landscape = LocalConfiguration.current.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
    /** The keyboard's place for a panel now: the keyboard's own height while it is up, else the one remembered. */
    fun panelBase(): Float {
        val keyboardUp = imeInsets.getBottom(density) - navigationBars.getBottom(density)
        if (keyboardUp > with(density) { KeyboardHeights.MIN_DOCKED.dp.toPx() }) return keyboardUp.toFloat()
        val h = session.keyboardHeights.panelHeight(landscape, with(density) { screenHeight.toDp().value }, phone)
        return with(density) { h.dp.toPx() }
    }
    /** Under the header: as tall as the panel grows (the capsule rides up with it). */
    fun panelMax(): Float =
        (screenHeight - topPx - room.foot - with(density) { (ComposerGap + PanelTopAir).toPx() } - navigationBars.getBottom(density)).toFloat().coerceAtLeast(panelRoom.base)
    /** A panel comes in the keyboard's place: laid out at once where the keyboard is, then the keyboard goes (no dip). */
    fun openPanel(next: PanelState) {
        val wasUp = imeInsets.getBottom(density) > navigationBars.getBottom(density)
        expandedReserve = null
        previewing = null
        panel = next
        shownPanel = next.panel
        panelRoom.base = panelBase()
        panelRoom.max = panelMax()
        if (wasUp) {
            panelRoom.snapTo(panelRoom.base)
            keyboard?.hide()
        } else {
            panelRoom.animateTo(panelRoom.base)
        }
    }
    /** The keyboard comes back over the panel's kept room ([PanelState.holding] until it has risen). */
    fun backToKeyboard(next: PanelState) {
        previewing = null
        panel = next
        runCatching { composerFocus.requestFocus() }
        keyboard?.show()
    }
    val onStickers: () -> Unit = {
        val next = PanelMachine.stickerButton(panel)
        if (next.panel == ComposerPanel.Stickers) openPanel(next) else backToKeyboard(next)
    }
    val onAttach: () -> Unit = {
        val next = PanelMachine.attachButton(panel)
        if (next.panel == ComposerPanel.Attach) openPanel(next) else backToKeyboard(next)
    }
    val onFieldTap: () -> Unit = { if (panel.panelOpen) backToKeyboard(PanelMachine.keyboardShown(panel)) }
    val setGrown: (Boolean) -> Unit = { grown ->
        // Grown to under the header there is no room over the capsule for a preview.
        if (grown) previewing = null
        panel = PanelMachine.setExpanded(panel, grown)
        panelRoom.max = panelMax()
        panelRoom.animateTo(if (grown) panelRoom.max else panelRoom.base)
    }
    val settlePanel: (PanelRoom.Stop) -> Unit = { stop ->
        when (stop) {
            PanelRoom.Stop.Grown -> setGrown(true)
            PanelRoom.Stop.Base -> setGrown(false)
            PanelRoom.Stop.Closed -> closePanel()
        }
    }
    BackHandler(enabled = panel.panelOpen) {
        if (previewing != null) previewing = null else closePanel()
    }
    // The keyboard risen over a panel's kept room: the room goes (after a moment at most — a hardware keyboard never rises).
    LaunchedEffect(panel.holding) {
        if (!panel.holding) return@LaunchedEffect
        withTimeoutOrNull(KEYBOARD_RISE_MILLIS) {
            snapshotFlow { imeInsets.getBottom(density) - navigationBars.getBottom(density) }.first { it >= panelRoom.height - 2f }
        }
        val risen = imeInsets.getBottom(density) - navigationBars.getBottom(density) >= panelRoom.height - 2f
        panel = PanelMachine.keyboardSettled(panel)
        if (risen) panelRoom.snapTo(0f) else panelRoom.animateTo(0f)
        shownPanel = ComposerPanel.None
    }
    // The keyboard coming up any other way while a panel shows takes its place; going away by itself, nothing is under the capsule.
    LaunchedEffect(imeTarget, density) {
        snapshotFlow { imeTarget.getBottom(density) > navigationBars.getBottom(density) }.collect { up ->
            if (up && panel.panelOpen && !panelRoom.held) backToKeyboard(PanelMachine.keyboardShown(panel))
            if (!up && panel.panel == ComposerPanel.Keyboard && !panel.holding) panel = PanelMachine.keyboardHidden(panel)
            if (up && panel.panel == ComposerPanel.None) panel = PanelMachine.keyboardShown(panel)
        }
    }
    // The keyboard standing still: its height, remembered for this orientation (a panel takes its place next time).
    LaunchedEffect(imeInsets, imeTarget, density) {
        snapshotFlow { Triple(imeInsets.getBottom(density), imeTarget.getBottom(density), navigationBars.getBottom(density)) }.collect { (now, target, nav) ->
            if (now == target && now > nav && screenHeight > 0) {
                session.keyboardHeights.note(landscape, with(density) { (now - nav).toDp().value })
            }
        }
    }
    // Turned or resized with a panel open: it takes the keyboard's place for the new window.
    LaunchedEffect(screenWidth, screenHeight, landscape) {
        if (!panel.panelOpen || panelRoom.held) return@LaunchedEffect
        panelRoom.base = panelBase()
        panelRoom.max = panelMax()
        panelRoom.snapTo(if (panel.expanded) panelRoom.max else panelRoom.base)
    }
    val sendSticker: (StickerCatalog.Sticker) -> Unit = { sticker ->
        previewing = null
        model.sendSticker(sticker.ref)
    }
    val tapSticker: (StickerCatalog.Sticker) -> Unit = { sticker ->
        if (previewing?.ref == sticker.ref) sendSticker(sticker) else previewing = sticker
    }
    // The field grown to the thread (option C): under the other person's last message — or the header, when that is a tall one.
    val expand: () -> Unit = {
        scope.launch {
            if (panel.keepsRoom) closePanel()
            val gap = with(density) { ComposerGap.roundToPx() }
            val clear = with(density) { ComposerClear.roundToPx() }
            val avail = screenHeight - topPx - keyboardPlace() - gap
            var reserve = clear
            val theirs = rowsNow.lastOrNull { !model.isMine(it.message) && !it.message.isUnsent }
            var keep: Int? = null
            if (theirs != null) {
                val index = scroll.indexOf(theirs.message.id) + (if (noticeNow != null) 1 else 0)
                if (index >= 0) {
                    list.scrollToItem(index)
                    withFrameNanos { }
                    val size = list.layoutInfo.visibleItemsInfo.firstOrNull { it.index == index }?.size
                    if (size != null && size <= avail * TALL_SHARE) {
                        reserve = clear + size + with(density) { 8.dp.roundToPx() }
                        keep = index
                    }
                }
            }
            expandedExtras = (room.foot - capsuleHeight).coerceAtLeast(0)
            expandedReserve = reserve
            keep?.let {
                withFrameNanos { }
                list.scrollToItem(it)
            }
        }
    }
    // Grown, the capsule takes what is left between that and the keyboard, a panel or the navigation bar (recomputed
    // as they move); beside the conversations (a tablet's pane) at most 60 % of the pane; never less than three rows.
    val expandedHeight: androidx.compose.ui.unit.Dp? = expandedReserve?.let { reserve ->
        val gap = with(density) { ComposerGap.roundToPx() }
        var capsule = screenHeight - topPx - keyboardPlace() - gap - expandedExtras - reserve
        if (!phone) capsule = minOf(capsule, (screenHeight * 0.6f).roundToInt())
        with(density) { capsule.coerceAtLeast((ComposerHeight * 3).roundToPx()).toDp() }
    }
    val collapse: () -> Unit = { expandedReserve = null }
    val onSegment: (SegmentRole) -> Unit = { role ->
        when (role) {
            SegmentRole.Send -> {
                model.send()
                expandedReserve = null
            }
            SegmentRole.Expand -> setGrown(true)
            SegmentRole.Collapse -> setGrown(false)
        }
    }
    // A draft is kept a moment after typing stops, and as the thread is left or covered (round 22 §4.4).
    LaunchedEffect(model) {
        snapshotFlow { model.currentDraft }.drop(1).collectLatest {
            delay(DRAFT_SAVE_MILLIS)
            model.keepDraft()
        }
    }
    DisposableEffect(model) { onDispose { model.keepDraft() } }
    LifecycleResumeEffect(model) { onPauseOrDispose { model.keepDraft() } }

    // The row is the list's width inside its 16 margins (their face's column is not counted), capped
    // at the widest bubble: measured where the thread is, a pane beside the conversations included.
    val pageWidth = LocalWindowLayout.current.contentWidth
    var listWidth by remember { mutableStateOf(pageWidth) }
    val rowMax = LayoutClass.bubbleMax(listWidth.value).dp
    // Read where each message is drawn, never here: a message held (or let go) redraws the thread, never composes it.
    val lifted = remember { { menu?.row?.message?.key } }
    // Reactions only between two people connected, with no block (a letter not yet answered takes none).
    val reacts = model.foot == ThreadFoot.Composer
    val ctx = remember(model, rowMax, links, highlights, currentHit, open, scroll, lifted, reacts, phone) {
        ThreadContext(
            model, rowMax, links, open, highlights, currentHit, flash, scroll,
            onMenu = { menu = it },
            onReply = reply,
            onQuote = { id -> jump(id, true) },
            lifted = lifted,
            onPicture = { viewing = it },
            onReact = { message, id -> model.react(message, id, sayError) },
            reacts = reacts,
            stickerSize = if (phone) 128.dp else 144.dp,
            origin = session.config.origin,
        )
    }

    // How far a held message's overlay is up (0…1): what lies under its scrim is softened as much (round 16 review F8).
    val heldOver = remember { mutableFloatStateOf(0f) }
    // How tall the thread's bar is (px, its wave's band included): where the body a held message dims starts.
    var barHeight by remember { mutableIntStateOf(0) }
    // Where this screen lies in the window, known before anything is held: the held message's overlay (laid over
    // the screen's whole box) places what it lifts from its first frame, without a frame spent finding itself.
    val screenAt = remember { ScreenSpot() }
    Box(
        Modifier.fillMaxSize().cream().onSizeChanged {
            listWidth = with(density) { it.width.toDp() }
            screenHeight = it.height
            screenWidth = it.width
        }.onGloballyPositioned { screenAt.offset = it.positionInRoot() },
    ) {
        // The thread's body — the messages and the composer — softened under a held message's scrim (round 17 §2.1:
        // the body alone); the bar over it, and the overlay over both, stay sharp.
        // Softened only where this phone draws the blur within its frames (round 17 addendum A4: BackdropBlurBudget).
        Box(Modifier.fillMaxSize().softenedUnder { BackdropBlurBudget.softening(heldOver.floatValue) }) {
        when (model.phase) {
            // One layout while it is found and once it is: what the thread always has is there from the
            // start (the bar's back and ⋯, the composer), and only what isn't known yet is in the shimmer.
            ThreadModel.Phase.Loading, ThreadModel.Phase.Ready -> {
                val ready = model.phase == ThreadModel.Phase.Ready
                val foot = model.foot
                // The thread runs to the screen's foot; the composer floats over it.
                Box(Modifier.fillMaxSize()) {
                    if (ready) MessageList(rows, ctx, list, top, Modifier.fillMaxSize().onThreadBlankTap(putKeyboardAway), pillVisible = !(searching && showResults), sayEmpty = foot.composes, room = room, notice = notice)
                    // Who it is with, or the first read, still on its way: the thread's shapes until the messages take their place.
                    if (!ready || !model.threadReady) ThreadSkeleton(room, Modifier.padding(top = top))
                    if (ready && searching && showResults) SearchResults(model, query, top, resultsList, pick, bottom = with(density) { room.clear.toDp() })
                }
                // While they are found the composer is there already (nothing to send to until they are): a
                // thread mostly is somewhere to write, and the field stays put — what was typed, the keyboard.
                // It floats 8 over the navigation bar or the keyboard, the page's gutter at its sides; in a wide
                // pane it keeps to a column of its own, centred under the thread. Behind it the foot's paper
                // (round 10 §3.2) runs the pane's whole width down to the screen's edge, so the thread never
                // shows under or beside it — its fade over the foot's top 12 (round 11 §3), counted in the room it
                // takes; a tap on its solid part puts the keyboard away, as one on the thread's blank does.
                // A sticker previewed: a tap anywhere on the thread lets it go (the panel's own taps are its own).
                if (previewing != null) Box(Modifier.fillMaxSize().pointerInput(Unit) { detectTapGestures { previewing = null } })
                Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth()) {
                    if (foot != ThreadFoot.Pending) ComposerBacking(Modifier.matchParentSize(), onTap = putKeyboardAway)
                    Column(Modifier.fillMaxWidth()) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .padding(bottom = ComposerGap)
                                .onSizeChanged { room.foot = it.height },
                        ) {
                            val padded = Modifier.readableColumn(ComposerMax).padding(horizontal = ComposerGutter)
                            when (foot) {
                                ThreadFoot.Composer, ThreadFoot.Answer -> Composer(
                                    model, handle, composerFocus, panel,
                                    onStickers = onStickers, onAttach = onAttach, onSegment = onSegment, onFieldTap = onFieldTap,
                                    expandedHeight = expandedHeight, onExpand = expand, onCollapse = collapse,
                                    onCapsuleHeight = { capsuleHeight = it },
                                    modifier = padded,
                                )
                                ThreadFoot.Awaiting -> FootNote(L10n.Messages.awaitingReply, padded)
                                ThreadFoot.Closed -> FootNote(L10n.Messages.notConnected, padded) {
                                    BasicText(
                                        L10n.Messages.viewProfile,
                                        style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.Terracotta).copy(textDecoration = TextDecoration.Underline),
                                        modifier = Modifier
                                            .heightIn(min = 44.dp)
                                            .wrapContentHeight()
                                            .plainClickable(role = Role.Button) { open(Route.Author(model.other?.handle ?: handle)) },
                                    )
                                }
                                // Whether a note waits not heard yet: no foot, rather than one that changes as it arrives.
                                ThreadFoot.Pending -> {}
                            }
                        }
                        // The keyboard's place: the keyboard itself, a panel standing in for it, or the navigation bar —
                        // the panel's content laid out at its own height from the top, the rest clipped.
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .clipToBounds()
                                .layout { measurable, constraints ->
                                    val h = keyboardPlace()
                                    // The panel's content runs on under the navigation bar to the screen's edge (its lists scroll
                                    // there, their fade at that edge; room under their last row keeps it clear of the bar).
                                    val content = panelRoom.contentHeight.roundToInt() + navigationBars.getBottom(this)
                                    val placeable = measurable.measure(Constraints.fixed(constraints.maxWidth, content.coerceAtLeast(0)))
                                    layout(constraints.maxWidth, h) { placeable.place(0, 0) }
                                },
                        ) {
                            val origin = session.config.origin
                            val navigation = with(density) { navigationBars.getBottom(density).toDp() }
                            when (shownPanel) {
                                ComposerPanel.Stickers -> StickerPanel(
                                    stickerCatalog, model.recentStickers, origin, previewing?.ref, tapSticker,
                                    Modifier.readableColumn(ComposerMax), navigation = navigation,
                                )
                                ComposerPanel.Attach -> AttachPanel(
                                    session, attachTab, { attachTab = it }, model::pictureNumber, panelRoom,
                                    onGrip = settlePanel, onToggle = togglePicture, onSystemPicker = pickWithSystem,
                                    onPickCard = pickCard,
                                    modifier = Modifier.readableColumn(ComposerMax), navigation = navigation,
                                )
                                else -> {}
                            }
                        }
                    }
                }
                // The sticker previewed stands over the capsule (round 22 §4.1).
                StickerPreview(
                    previewing, session.config.origin, sendSticker,
                    Modifier.align(Alignment.BottomCenter).offset { IntOffset(0, -(room.above + with(density) { 8.dp.roundToPx() })) },
                    size = if (phone) 144.dp else 160.dp,
                )
            }
            ThreadModel.Phase.Missing -> {
                BasicText(
                    L10n.Messages.userNotFound,
                    style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.TextMuted),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp).padding(top = top + 20.dp),
                )
            }
            // Who they are couldn't be asked (offline): a retry, never "user not found".
            ThreadModel.Phase.Failed -> Box(Modifier.padding(top = top)) {
                OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { scope.launch { model.load() } }, action = EmptyAction.Outline)
            }
        }

        }

        // The held message's scrim, under the bar: dimming the body from the bar's wavy line down, the bar's own
        // paper keeping the rest — the bar, the conversations beside the pane and the rule between stay as they are.
        // Beside the conversations it reaches back to the rule itself (round 17 review D2): no undimmed strip between.
        val scrim = ModalScrim
        val paneEdge = LocalPaneScrimEdge.current
        Box(
            Modifier.fillMaxSize().drawWithCache {
                val region = paneEdge?.region(size, this.density)
                onDrawBehind {
                    val over = heldOver.floatValue
                    if (over > 0f) {
                        if (region != null) drawPath(region, scrim, alpha = over) else drawRect(scrim, alpha = over)
                    }
                }
            },
        )

        val conversations by session.conversations.state.collectAsStateWithLifecycle()
        val conversationIds by session.conversations.ids.collectAsStateWithLifecycle()
        Box(Modifier.onSizeChanged { barHeight = it.height }) {
        ThreadBar(
            model, handle, searching, query, showResults, currentHit, searchFocus,
            scrolled = if (searching && showResults) resultsList.canScrollBackward else list.canScrollForward,
            menuShown = threadMenuShown(model, conversations, conversationIds),
            onQuery = { query = it },
            onShowResults = { showResults = true },
            onPick = pick,
            onCloseSearch = closeSearch,
            menu = barMenu(
                model, session, searching = { searching = true; showResults = true },
                showMedia = { showingMedia = true }, report = { reporting = true },
                block = { blockError = null; confirmingBlock = true }, delete = { confirmingDelete = true },
            ),
            open = open, back = back,
        )
        }

        menu?.let { m ->
            // An album's picture pressed: that picture's own message (its reactions, its unsend).
            val held = m.target
            MessageMenuOverlay(
                m, ctx,
                actions = remember(m) {
                    messageActions(
                        m, model, links, context, open,
                        reply = { reply(held) },
                        unsend = { unsending = held },
                        // 停止分享 asks nothing: the message stays, and sending the card again shares it again.
                        stopSharing = { model.stopSharing(held, onDone = { toasts.show(it) }, onError = sayError) },
                        report = { reportingMessage = held },
                    )
                },
                footer = fullTime(held.sentAt),
                tray = if (reacts && MessageReactions.canReact(held)) {
                    TrayOffer(
                        MessageReactions.mine(model.find(held.id)?.reactions ?: held.reactions, model.me)?.let(ReactionId::of),
                    ) { id -> model.react(held, id.key, sayError) }
                } else null,
                onDismiss = { menu = null },
                origin = screenAt.offset,
                over = heldOver,
                regionTop = barHeight.takeIf { it > 0 },
            )
        }
    }
    viewing?.let { picture -> PictureViewer(picture, model.pictureLoader) { viewing = null } }
    // Opening search puts the cursor in its field.
    LaunchedEffect(searching) { if (searching) runCatching { searchFocus.requestFocus() } }

    val other = model.other
    if (showingMedia) OrganicModal({ showingMedia = false }, L10n.Messages.mediaTitle, seed = 53.0, maxWidth = 480.dp) {
        SharedMediaContent(model, links, onClose = { showingMedia = false }) { route ->
            showingMedia = false
            open(route)
        }
    }
    LinkDialogs(links)
    if (reporting && other != null && pair != null) ReportDialog(
        session, SafetyService.Target.Message(pair, other.id, pair), other.handle,
        onBlocked = { scope.launch { model.refreshConnection() } },
        offerBlock = !model.isBlocked,
    ) { reporting = false }
    // 檢舉這則訊息 (round 16 §3): the report flow, for that one message.
    reportingMessage?.let { message ->
        if (other != null && pair != null) ReportDialog(
            session, SafetyService.Target.Message(message.id, message.senderId, pair), other.handle,
            onBlocked = { scope.launch { model.refreshConnection() } },
            offerBlock = !model.isBlocked,
            // Titled for that one message, not the conversation (the bar's 檢舉 keeps 檢舉與 bob 的對話).
            customTitle = L10n.Safety.reportThisMessage,
        ) { reportingMessage = null }
    }
    // 收回 asks first, in the plain colour (it takes the words back, it doesn't destroy them for good).
    unsending?.let { message ->
        OrganicConfirmDialog(
            title = L10n.Messages.unsendTitle,
            body = L10n.Messages.unsendBody,
            cancelLabel = L10n.Messages.unsendCancel,
            confirmLabel = L10n.Messages.unsendConfirm,
            onCancel = { unsending = null },
            onConfirm = {
                unsending = null
                model.unsend(message, sayError)
            },
            seed = 73.0,
        )
    }
    if (confirmingBlock) OrganicConfirmDialog(
        title = L10n.Safety.blockTitle(other?.handle ?: ""),
        body = L10n.Safety.blockBody,
        cancelLabel = L10n.Safety.cancel,
        confirmLabel = L10n.Safety.blockConfirm,
        onCancel = { confirmingBlock = false },
        onConfirm = {
            val person = other ?: return@OrganicConfirmDialog
            if (busy) return@OrganicConfirmDialog
            busy = true
            scope.launch {
                try {
                    session.safety?.block(person.id)
                    confirmingBlock = false
                    model.refreshConnection()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    blockError = L10n.Safety.actionError
                } finally {
                    busy = false
                }
            }
        },
        busy = busy,
        seed = 71.0,
        error = blockError,
    )
    if (confirmingDelete) OrganicConfirmDialog(
        title = L10n.Messages.deleteConfirmTitle,
        body = L10n.Messages.deleteConfirmBody,
        cancelLabel = L10n.Messages.deleteCancel,
        destructive = true,
        confirmLabel = L10n.Messages.deleteConfirm,
        onCancel = { confirmingDelete = false },
        onConfirm = {
            // Gone at once (round 21): the thread is left and its row leaves the list; a refusal brings the row back and says so.
            confirmingDelete = false
            if (model.deleteConversationNow { toasts.show(L10n.Messages.deleteError) }) back()
        },
        seed = 59.0,
    )
    replacing?.let { r ->
        val pictures = r is Replace.WithPictures
        OrganicConfirmDialog(
            title = if (pictures) L10n.Messages.replaceWithPicturesTitle else L10n.Messages.replaceWithCardTitle,
            body = if (pictures) L10n.Messages.replaceWithPicturesBody else L10n.Messages.replaceWithCardBody,
            cancelLabel = L10n.Messages.unsendCancel,
            confirmLabel = if (pictures) L10n.Messages.replaceWithPicturesConfirm else L10n.Messages.replaceWithCardConfirm,
            onCancel = { replacing = null },
            onConfirm = {
                replacing = null
                if (pictures) model.pendingCard = null else model.clearPictures()
                r.then()
            },
            seed = 77.0,
        )
    }
    if (pickingCard) OrganicModal(
        { pickingCard = false }, L10n.Messages.pickCard,
        seed = 53.0, maxWidth = 480.dp, closeLabel = L10n.Write.Editor.CardModal.cancel,
    ) {
        // Your public cards, then your 私人卡 (named, titled): the message lets its recipient read one.
        CardPickerContent(
            session, L10n.Messages.pickCard, L10n.Messages.pickCardSubtitle,
            onPick = { card ->
                pickingCard = false
                pickCard(card)
            },
            privateLabel = L10n.Messages.privateCard,
            empty = L10n.Messages.pickCardEmpty,
        ) { pickingCard = false }
    }
}

/**
 * The thread's foot where there is no composer: a calm line, centred — a note of yours waiting for
 * its answer, or why you can't write here — and what can be done about it, if anything; floating in
 * the composer's place on an opaque framed slip (round 9 §4), the foot's paper behind it as behind
 * the capsule, its fade over the slip's top 12 (round 10 §3.2, round 11 §3).
 */
@Composable
private fun FootNote(text: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(
        modifier.fillMaxWidth().floatingSlip(seed = 31.0).padding(horizontal = 18.dp).padding(top = 12.dp, bottom = if (action != null) 4.dp else 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        BasicText(text, style = AppFonts.body(13.5f, lineHeight = 1.55f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
        action?.invoke()
    }
}

/** How long after the last key a search is run. */
private const val SEARCH_DEBOUNCE_MILLIS = 250L

/** The ⋯ menu's rows: search, what's been shared, report, block (or unblock), delete. */
@Composable
private fun barMenu(
    model: ThreadModel,
    session: Session,
    searching: () -> Unit,
    showMedia: () -> Unit,
    report: () -> Unit,
    block: () -> Unit,
    delete: () -> Unit,
): List<OrganicMenuItem> {
    val scope = rememberCoroutineScope()
    val toasts = LocalToasts.current
    val other = model.other
    return buildList {
        add(OrganicMenuItem(L10n.Messages.menuSearch, IconName.Search) { searching() })
        add(OrganicMenuItem(L10n.Messages.menuMedia, IconName.Cards) { showMedia() })
        add(OrganicMenuItem(L10n.Safety.reportMessage, IconName.Flag) { report() })
        if (model.isBlocked) {
            add(OrganicMenuItem(L10n.Safety.unblock, IconName.Ban) {
                scope.launch {
                    // Not undone: said in a toast (round 21), never silently.
                    other?.let { runCatching { session.safety?.unblock(it.id) }.onFailure { toasts.show(L10n.Safety.unblockFailed) } }
                    model.refreshConnection()
                }
            })
        } else {
            add(OrganicMenuItem(L10n.Safety.block, IconName.Ban, destructive = true) { block() })
        }
        add(OrganicMenuItem(L10n.Messages.menuDelete, IconName.Trash, destructive = true) { delete() })
    }
}

// Bar

/**
 * The thread's bar, over the messages: back, the person (their face and pen name, a tap goes to
 * their page) and the ⋯ — edged by the header's wavy pen line like every pushed page's, half ink
 * at rest and full once messages scroll under it. Search takes the person's place with its field
 * (and, once a match was chosen, "3/12" and the way through them). While the person is found it is
 * already the same bar: the pen name the way here carried beside the face's place, and the ⋯ in its
 * place ([menuShown]), taking a tap once there is a conversation to act on.
 */
@Composable
private fun ThreadBar(
    model: ThreadModel,
    handle: String,
    searching: Boolean,
    query: String,
    showResults: Boolean,
    currentHit: String?,
    searchFocus: FocusRequester,
    scrolled: Boolean,
    menuShown: Boolean,
    onQuery: (String) -> Unit,
    onShowResults: () -> Unit,
    onPick: (SearchHit) -> Unit,
    onCloseSearch: () -> Unit,
    menu: List<OrganicMenuItem>,
    open: (Route) -> Unit,
    back: () -> Unit,
) {
    val ready = model.phase == ThreadModel.Phase.Ready
    val found = ready || model.phase == ThreadModel.Phase.Loading
    val pair = model.pairId
    val other = model.other
    OrganicInlineBar(
        L10n.Messages.back, back,
        scrolled = ready && scrolled,
        showBack = !(ready && searching),
        leading = {
            if (ready && searching) {
                SearchField(query, onQuery, searchFocus, onFocus = onShowResults, onSearch = onShowResults)
                val hits = model.searchHits
                val at = currentHit?.let { id -> hits.indexOfFirst { it.messageId == id } } ?: -1
                if (at >= 0 && !showResults) {
                    SearchSteps(
                        position = at + 1, count = hits.size,
                        canGoOlder = at + 1 < hits.size, canGoNewer = at > 0,
                        onOlder = { onPick(hits[at + 1]) }, onNewer = { onPick(hits[at - 1]) },
                    )
                }
            }
        },
        // The person: beside the arrow on a phone and in a pane, in the middle of a tablet's header
        // when the thread fills the window (round 5, part C) — the thread's bar is the header there.
        // Their profile not read yet: the pen name the way here carried, beside the face's place.
        centre = if (!found || (ready && searching)) null else if (other == null || !ready) ({ PersonPlaceholder(handle) }) else {
            {
                Row(
                    Modifier
                        .weight(1f, fill = false)
                        .plainClickable(role = Role.Button, onClickLabel = L10n.Messages.viewProfile) { open(Route.Author(other.handle)) },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    HandDrawnAvatar(other.initials, other.avatarUrl, avatarFill(other.accentColor), 36.dp, seedOr(other.avatarSeed, 3.0))
                    BasicText(
                        other.handle, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        style = AppFonts.heading(18f, 700, lineHeight = 1.2f),
                        modifier = Modifier.weight(1f, fill = false).semantics { heading() },
                    )
                }
            }
        },
        trailing = {
            if (ready && searching) {
                OrganicIconButton(IconName.Close, L10n.Messages.searchClose, size = 16.dp, onClick = onCloseSearch)
            } else if (menuShown) {
                // A bare glyph; its 48 hit box is the bar's own end margin.
                OrganicMenu(
                    menu, L10n.Messages.moreMenu, seed = seedFromString(pair ?: handle).toDouble(), triggerSize = 34.dp, trigger = MenuTrigger.Bare,
                    enabled = ready && model.conversationExists && pair != null,
                )
            }
        },
    )
}

/**
 * The ⋯ is a conversation's: in the bar from the start when Messages lists this one — or hasn't been
 * read yet (a push opened the app here) — rather than coming once the conversation has been read; for
 * someone not written to yet, once the first message makes it. iOS's ThreadScreen.menuShown.
 */
private fun threadMenuShown(model: ThreadModel, list: ConversationsStore.State, ids: Set<String>): Boolean {
    if (model.phase != ThreadModel.Phase.Loading && model.phase != ThreadModel.Phase.Ready) return false
    if (model.conversationExists) return true
    val pair = model.pairId
    val name = model.other?.handle ?: model.handle
    val listed = if (pair != null) pair in ids else list.conversations.any { it.other.handle.equals(name, ignoreCase = true) }
    return listed || (!list.loaded && !model.threadReady)
}

/**
 * The bar's person before their profile arrives: the pen name the way here carried, beside the
 * face's place in the shimmer, so nothing moves along when the face comes. iOS's PersonPlaceholder.
 */
@Composable
private fun RowScope.PersonPlaceholder(handle: String) {
    Row(Modifier.weight(1f, fill = false), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Skeleton(height = 36.dp, circle = true)
        BasicText(
            handle, maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = AppFonts.heading(18f, 700, lineHeight = 1.2f),
            modifier = Modifier.weight(1f, fill = false).semantics { heading() },
        )
    }
}

// Labels

/** The day label: 9月29日 / September 29. */
internal fun dayLabel(date: Date): String {
    val pattern = if (Strings.language == Strings.Language.ZhTW) "M月d日" else "MMMM d"
    return date.toInstant().atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern(pattern, Strings.language.locale))
}

/**
 * The chat's time of day, one way wherever it shows (round 16 review F5, the web's lib/chat/time) — the
 * conversation list, the thread's labels, a message's menu, a search's results: the hour without a
 * leading zero, as the language writes it — 下午3:04 / 3:04 PM.
 */
internal fun chatTimePattern(): String = if (Strings.language == Strings.Language.ZhTW) "ah:mm" else "h:mm a"

/** The time label inside a day: 下午3:04 / 3:04 PM ([chatTimePattern]). */
internal fun timeLabel(date: Date): String =
    date.toInstant().atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern(chatTimePattern(), Strings.language.locale))

/** The full time a long-press shows (the web's hover title): 9月29日 下午3:04 / September 29 at 3:04 PM. */
internal fun fullTime(date: Date): String {
    val pattern = if (Strings.language == Strings.Language.ZhTW) "M月d日 ${chatTimePattern()}" else "MMMM d 'at' ${chatTimePattern()}"
    return date.toInstant().atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern(pattern, Strings.language.locale))
}

// Cards & links

/** "Cards & links": everything shared in the loaded messages. */
@Composable
private fun SharedMediaContent(model: ThreadModel, opener: LinkOpener, onClose: () -> Unit, open: (Route) -> Unit) {
    val (cardIds, links) = model.shared
    val cards = cardIds.mapNotNull { model.cards[it] }
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.padding(bottom = 8.dp)) { ModalTitle(L10n.Messages.mediaTitle) }
        CssText(
            L10n.Messages.mediaSubtitle, AppFonts.Family.Body, 14f, lineHeight = 1.6f, color = Tokens.TextMuted,
            modifier = Modifier.padding(bottom = 18.dp),
        )
        if (cards.isEmpty() && links.isEmpty()) {
            BasicText(L10n.Messages.mediaEmpty, style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.TextMuted))
        }
        val scroll = rememberScrollState()
        Column(
            Modifier
                .heightIn(max = minOf(420f, LocalConfiguration.current.screenHeightDp * 0.55f).dp)
                // Fading at the side it can still move toward, as the modal's own content does.
                .scrollFade(scroll, ModalScrollFade)
                .verticalScroll(scroll),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            if (cards.isNotEmpty()) Column {
                MediaHead(L10n.Messages.mediaCards)
                cards.forEachIndexed { i, card ->
                    if (i > 0) WavyDivider(seed = (53 + i * 7).toDouble())
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .plainClickable(role = Role.Button) { open(Route.Card(card.routeKey, card)) }
                            .padding(vertical = 10.dp, horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        val cover = Tokens.hue(HueRole.Accent, card.accentHue ?: 55.0)
                        OrganicImage(card.imageUrl, 7.0, Modifier.size(40.dp)) { Box(Modifier.fillMaxSize().background(cover)) }
                        BasicText(
                            card.title, maxLines = 2, overflow = TextOverflow.Ellipsis,
                            style = AppFonts.body(14f, 600, lineHeight = 1.3f), modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
            if (links.isNotEmpty()) Column {
                MediaHead(L10n.Messages.mediaLinks)
                links.forEachIndexed { i, url ->
                    if (i > 0) WavyDivider(seed = (97 + i * 11).toDouble())
                    BasicText(
                        url,
                        style = AppFonts.body(13.5f, lineHeight = 1.3f, color = Tokens.Terracotta).copy(textDecoration = TextDecoration.Underline),
                        modifier = Modifier
                            .fillMaxWidth()
                            .plainClickable(role = Role.Button) { model.openLink(url, opener, open) }
                            .padding(vertical = 10.dp, horizontal = 4.dp),
                    )
                }
            }
        }
        // Nothing to choose here, only to look through: the way out is under the list.
        ModalCloseButton(L10n.Safety.Report.close, onClose, Modifier.padding(top = ModalGap))
    }
}

@Composable
private fun MediaHead(text: String) {
    BasicText(
        text.uppercase(),
        style = AppFonts.body(12f, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.06.em),
        modifier = Modifier.padding(bottom = 4.dp),
    )
}

/** The widest the composer runs in a wide thread pane. */
private val ComposerMax = 720.dp

/** The composer's sides: the page's gutter. */
private val ComposerGutter = 14.dp

/** Where a screen lies in its window (px), kept as it is laid out and read when needed, never drawn from. */
internal class ScreenSpot {
    var offset: androidx.compose.ui.geometry.Offset? = null
}

/** A card replacing the pictures waiting, or pictures replacing the card: asked first, then [then]. */
internal sealed class Replace(val then: () -> Unit) {
    class WithCard(then: () -> Unit) : Replace(then)
    class WithPictures(then: () -> Unit) : Replace(then)
}

/** The air a grown panel leaves between the header's pen line and the capsule riding up with it. */
private val PanelTopAir = 8.dp

/** How long the keyboard is given to rise over a panel's kept room before the room goes anyway. */
private const val KEYBOARD_RISE_MILLIS = 700L

/** The draft is kept this long after typing stops (round 22 §4.4). */
private const val DRAFT_SAVE_MILLIS = 500L

/** Their last message taller than this share of the room (a picture): the field grows to under the header instead (round 22 §4.3, = B). */
private const val TALL_SHARE = 0.35f
