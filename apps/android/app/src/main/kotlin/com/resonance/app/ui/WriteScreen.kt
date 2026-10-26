package com.resonance.app.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Ease
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import coil3.compose.AsyncImage
import com.resonance.app.BuildConfig
import com.resonance.app.DebugLaunch
import com.resonance.app.DraftService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.BarStatus
import com.resonance.design.BorderedStoryCard
import com.resonance.design.ButtonFace
import com.resonance.design.CardPalette
import com.resonance.design.OrganicIndication
import com.resonance.design.ButtonVariant
import com.resonance.design.CoverFrame
import com.resonance.design.CssText
import com.resonance.design.EmptyAction
import com.resonance.design.Grain
import com.resonance.design.GrainMode
import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.LayoutClass
import com.resonance.design.LocalToasts
import com.resonance.design.LocalWindowLayout
import com.resonance.design.Mixes
import com.resonance.design.ModalError
import com.resonance.design.OklchColor
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicButtonShape
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicIconButton
import com.resonance.design.OrganicInlineBar
import com.resonance.design.OrganicMenuFrom
import com.resonance.design.OrganicMenuItem
import com.resonance.design.OrganicModal
import com.resonance.design.ReadingTextScale
import com.resonance.design.SaveStateText
import com.resonance.design.TitleWithStatus
import com.resonance.design.storyHeadGap
import com.resonance.design.Segment
import com.resonance.design.SegmentedActionBar
import com.resonance.design.SketchLoader
import com.resonance.design.StoryCard
import com.resonance.design.StoryCardContent
import com.resonance.design.StoryCardCover
import com.resonance.design.StoryType
import com.resonance.design.WavyDivider
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.holdWhile
import com.resonance.design.inlineBarTop
import com.resonance.design.prefersReducedMotion
import com.resonance.geometry.seedFromString
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.PlainText
import com.resonance.kit.story.ReadTime
import com.resonance.kit.story.StoryScripts
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Writing a card (the web's write page), in two steps (writer.spec, round 8 §2). Writing: a bare
 * page — the one-line title and the story, set as the card page will set them (the story's type, at
 * the reading scale), the format bar on the keyboard while the story has the focus — under a bar
 * that says ← · its short title · how the writing is kept (儲存中⋯ · 已儲存 · 修改已暫存 · 未儲存) …
 * ✓ (完成; at the split no bar: the ✓ floats at the pane's top end, the state just before it). ✓
 * opens the second step in the same place — 發布這張卡片, 儲存草稿 with 草稿 chosen, 更新這張卡片 for a
 * card readers have: the mirror, the card as a list will show it with its cover editor in its
 * picture, 標籤, 卡片類型 (公開 · 匿名公開 · 草稿), whether a resonance reaches its original, then one
 * button whose verb follows the card and the choice (發布 · 匿名發布 · 儲存 · 儲存修改 · 轉為草稿; and
 * 捨棄修改 beside it for a published card's revision). The story stays composed under the step,
 * so its document, undo and selection survive the round trip; everything chosen in the step is the
 * draft's own value and autosaves like the words. Back from the step returns to writing; back from
 * writing with something written asks first.
 *
 * A page like the others pushed on a tab: the inline bar carries the back arrow and the writer's
 * title. Opened on one of your cards (`cardId`, write/[id]) it resumes a draft, or revises a
 * published card; one in the trash says so, with 還原並繼續寫. The twin of iOS's WriteScreen;
 * `onFinished` gets the card's slug or id.
 *
 * In the split workspace ([Workspace], round 5 E5) it is the editor pane's ([pane]): no bar and no
 * back of its own — the map's Leave and the system back are the workspace's, which asks through
 * [pane] what the writer holds, as the bar's arrow does — its content starting under the status bar.
 */
@Composable
fun WriteScreen(
    session: Session,
    referenceCardId: String?,
    cardId: String?,
    story: String?,
    close: () -> Unit,
    /** A new card was first saved, as the draft with this id (its route then names it: [rememberDraft]). */
    onCreated: (String) -> Unit = {},
    /** How the workspace around the writer reaches it ([Workspace]); null: the writer is a page of its own. */
    pane: WriterHandle? = null,
    /** Its own bar and back (a page of its own, or a pane covering the map below the split); false: the split workspace's pane. */
    bar: Boolean = true,
    /** It began on a new card in this visit, since saved as the draft [cardId] (a rotation, a restored process): still 新卡片. */
    beganNew: Boolean = false,
    /** A 私人卡's 公開發表 (round 12 §3): it opens on [cardId] at the publish step, offered to readers. */
    publishing: Boolean = false,
    onFinished: (String) -> Unit,
) {
    // A new card is saved as a draft as soon as there is something to keep, and its route then names
    // that draft. While the writer is open nothing changes under it; when it comes back (uncovered,
    // rotated, the app restored) it opens on the draft rather than a blank card.
    val id = remember { cardId }
    if (id == null) {
        WriteForm(session, referenceCardId, story, null, close, onFinished, onCreated, pane, bar)
        return
    }
    // The card loads straight from Firestore, painting a loader meanwhile; restored from the trash, it is read again.
    var attempt by remember(id) { mutableIntStateOf(0) }
    var loaded by remember(id) { mutableStateOf(false) }
    var opened by remember(id) { mutableStateOf<DraftService.OpenedCard?>(null) }
    LaunchedEffect(id, attempt) {
        loaded = false
        opened = session.drafts?.open(id)
        loaded = true
    }
    val card = opened
    when {
        !loaded -> {
            if (bar) BackHandler(onBack = close)
            Box(Modifier.fillMaxSize().cream(), contentAlignment = Alignment.TopCenter) {
                Box(Modifier.padding(top = writerTop(bar) + 58.dp)) { SketchLoader(64.dp) }
                if (bar) OrganicInlineBar(L10n.App.Nav.back, close)
            }
        }
        // The card isn't there (deleted, past its days in the trash) or isn't yours: the web's not-found note.
        card == null -> {
            if (bar) BackHandler(onBack = close)
            Box(Modifier.fillMaxSize().cream()) {
                Box(Modifier.padding(top = writerTop(bar))) {
                    OrganicEmptyState(title = L10n.Card.NotFound.title, titleSize = 24f, actionTitle = L10n.Card.NotFound.back, onAction = close, action = EmptyAction.Outline, verticalPadding = 58.dp)
                }
                if (bar) OrganicInlineBar(L10n.App.Nav.back, close)
            }
        }
        card.isTrashed -> TrashedWriter(session, card, bar, close) { attempt++ }
        else -> androidx.compose.runtime.key(card) { WriteForm(session, referenceCardId, null, card, close, onFinished, pane = pane, bar = bar, beganNew = beganNew, publishing = publishing) }
    }
}

/**
 * A card of yours in the trash, opened to write (trash.spec §5.5): nothing is written into it until
 * it is restored — the page's bar, then 「這張卡片在垃圾桶裡 · 還原之後就能繼續寫」 with 還原並繼續寫,
 * which brings it back and opens the editor on it ([onRestored] reads it again).
 */
@Composable
private fun TrashedWriter(session: Session, card: DraftService.OpenedCard, bar: Boolean, close: () -> Unit, onRestored: () -> Unit) {
    val scope = rememberCoroutineScope()
    val trash = LocalTrash.current
    val toasts = LocalToasts.current
    var restoring by remember { mutableStateOf(false) }
    if (bar) BackHandler(onBack = close)
    Box(Modifier.fillMaxSize().cream()) {
        Box(Modifier.fillMaxSize().padding(top = writerTop(bar))) {
            OrganicEmptyState(
                title = L10n.Card.Trashed.title,
                message = L10n.Write.Trashed.line,
                actionTitle = L10n.Write.Trashed.restore,
                actionLoading = restoring,
                onAction = {
                    if (!restoring) {
                        restoring = true
                        scope.launch {
                            try {
                                val ref = TrashRef(card.id, card.values.title)
                                val restored = trash?.restore(ref) ?: session.writing.restoreCard(card.id)
                                if (restored.droppedResonance) trash?.restoredAlone = true
                                onRestored()
                            } catch (e: CancellationException) {
                                throw e
                            } catch (e: Exception) {
                                toasts.show(L10n.Me.Actions.undoFailed)
                            } finally {
                                restoring = false
                            }
                        }
                    }
                },
                icon = IconName.Trash,
                seed = 61.0,
                fill = true,
            )
        }
        if (bar) OrganicInlineBar(L10n.App.Nav.back, close, title = writerTitle(editing = true, seen = card.isPublished && card.restoresVisibility != "private"))
    }
}

/** Which field the writer was in when the publish step opened: going back to writing puts them there again. */
private enum class WritingField { Title, Story }

@Composable
private fun WriteForm(
    session: Session,
    referenceCardId: String?,
    story: String?,
    opened: DraftService.OpenedCard?,
    close: () -> Unit,
    onFinished: (String) -> Unit,
    onCreated: (String) -> Unit = {},
    pane: WriterHandle? = null,
    bar: Boolean = true,
    beganNew: Boolean = false,
    publishing: Boolean = false,
) {
    val context = LocalContext.current
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val density = LocalDensity.current
    val trash = LocalTrash.current
    val toasts = LocalToasts.current
    // The story's island, as the writer's bare page: an empty one in the UI's own type, one opened in its own.
    val bridge = remember(opened) {
        val tag = Strings.language.tag
        val title = opened?.values?.title ?: ""
        val text = opened?.values?.story ?: story ?: ""
        StoryEditorBridge(
            context, L10n.Write.storyPlaceholder, canvas = true, locale = tag,
            script = StoryScripts.writerScript(StoryScripts.localeScript(tag), title, text),
            lang = StoryScripts.storyLang(title, text),
        )
    }
    // The step, kept across a restored process (a new card always starts writing).
    var savedStep by rememberSaveable { mutableStateOf(WriterStep.Write) }
    // 公開發表's offer is made once: a writer restored afterwards keeps the step and the choice it was left with.
    var offered by rememberSaveable { mutableStateOf(false) }
    val model = remember(opened) {
        WriteModel(
            session.drafts, session.writing.writerCalls(), referenceCardId, bridge, opened, initialStep = savedStep, beganNew = beganNew,
            publishing = publishing && !offered,
        ).apply {
            this.onCreated = onCreated
            // A picture for the story that didn't go in is said where the writing is, whatever has scrolled.
            onStoryPictureError = { toasts.show(it) }
            // What the screens behind the writer read again for once it closes (nothing, if nothing was written).
            onWrote = { id -> session.writerWrote(Session.CardChange(id, this.referenceCardId)) }
            // Debug `writeTitle` / `writeStory` extras fill a new card (screen checks; the emulator's keyboard is slow to drive).
            if (BuildConfig.DEBUG && opened == null) {
                DebugLaunch.writeTitle?.let(::setTitle)
                DebugLaunch.writeCover?.let { c -> update { copy(imageUrl = c) } }
                DebugLaunch.writeStory?.let { s ->
                    editor.setMarkdown(s)
                    update { copy(story = s) }
                }
            }
            // Words to start from: a note grown into a resonance (the web drops them; the apps keep them).
            if (opened == null) story?.let { words ->
                editor.setMarkdown(words)
                update { copy(story = words) }
            }
        }
    }
    val step = model.step
    LaunchedEffect(step) { savedStep = step }
    LaunchedEffect(model) { if (publishing) offered = true }
    // Whatever way the screen goes (close, back, a tab switch), the last edit is saved.
    DisposableEffect(model) { onDispose { model.leave() } }
    // Leaving the app saves what is written now, not 1.5s later.
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { model.flush() }
    var pickingCard by remember { mutableStateOf(false) }
    val coverPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { model.setCover(context, it) } }
    // Back from the picker, picked or not, the story has its caret, keyboard and format bar where they were — before the upload ends.
    val inlinePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        bridge.refocusWhenBack()
        uri?.let { model.insertImage(context, it) }
    }
    val images = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
    // The leave question showing (null: none), as it was asked: its words don't change under the person reading them.
    var confirmingLeave by remember(model) { mutableStateOf<LeaveQuestion?>(null) }
    // What confirming the leave does when the workspace asked it (its Leave over the map); null: this writer's own leave.
    var leaveThen by remember(model) { mutableStateOf<(() -> Unit)?>(null) }
    // The arrow, the system back and the buttons can land twice before the page has gone: it closes once.
    var leaving by remember(model) { mutableStateOf(false) }
    val leave: () -> Unit = {
        if (!leaving) {
            leaving = true
            bridge.releaseKeyboard()
            scope.launch {
                model.saveNow()
                close()
            }
        }
    }
    // Back while writing (the bar's arrow, the system's key or swipe) with something written asks first; with nothing, it leaves at once.
    // A card in the trash keeps nothing: it asks only for words it holds nowhere, and says so ([WriteModel.leaveQuestion]).
    val goBack: () -> Unit = {
        if (!leaving && !model.back()) {
            val question = model.leaveQuestion
            if (question != null) {
                bridge.releaseKeyboard()
                confirmingLeave = question
            } else leave()
        }
    }
    // A tap beside the fields puts the keyboard away, whichever field held it.
    val dismissKeyboard: () -> Unit = {
        focusManager.clearFocus()
        bridge.releaseKeyboard()
    }
    // In the workspace's pane the back is the workspace's: it asks here first ([WriterHandle.askToLeave]).
    BackHandler(enabled = bar && step == WriterStep.Write, onBack = goBack)
    // The publish step's back is to writing, wherever the writer is (declared after, so it wins).
    BackHandler(enabled = step == WriterStep.Publish) { model.back() }
    SideEffect {
        pane?.attach(
            hasWork = { model.leaveQuestion != null },
            saveNow = { model.saveNow() },
            releaseKeyboard = { bridge.releaseKeyboard() },
            askToLeave = { then ->
                val question = model.leaveQuestion
                if (question == null) then()
                else {
                    bridge.releaseKeyboard()
                    leaveThen = then
                    confirmingLeave = question
                }
            },
        )
    }
    DisposableEffect(pane, model) { onDispose { pane?.detach() } }

    val window = LocalWindowLayout.current
    val compactWindow = window.cls == LayoutClass.Compact
    val pad = window.pad
    val columnMax = Tokens.Measure.dp + pad * 2
    val writeScroll = rememberScrollState()
    val publishScroll = rememberScrollState()
    val titleFocus = remember(model) { FocusRequester() }
    var titleFocused by remember(model) { mutableStateOf(false) }
    var lastField by remember(model) { mutableStateOf<WritingField?>(null) }
    // The publish step is composed the first time it shows, and stays (a cover on its way, the mirror's answer).
    var publishOpened by remember(model) { mutableStateOf(step == WriterStep.Publish) }
    val reduced = context.prefersReducedMotion()
    val shown by animateFloatAsState(
        if (step == WriterStep.Publish) 1f else 0f,
        tween(if (reduced) 150 else 220, easing = EaseOut),
        label = "writerStep",
    )
    val shift = with(density) { 16.dp.toPx() }

    // Into the step: the keyboard goes, the step starts at its top and asks its mirror; TalkBack hears its name.
    // Back to writing: the field the writer was in takes the focus again.
    var stepSeen by remember(model) { mutableStateOf(step) }
    LaunchedEffect(step) {
        bridge.setHidden(step == WriterStep.Publish)
        if (step == stepSeen) {
            if (step == WriterStep.Publish) model.reflect()
            return@LaunchedEffect
        }
        stepSeen = step
        if (step == WriterStep.Publish) {
            publishOpened = true
            publishScroll.scrollTo(0)
            model.reflect()
            view.announce(model.stepTitle)
        } else {
            model.stopReflecting()
            when (lastField) {
                WritingField.Title -> runCatching { titleFocus.requestFocus() }
                WritingField.Story -> bridge.refocus()
                null -> {}
            }
        }
    }
    // No title at 下一步 or 發布: the title takes the focus, its error under it.
    LaunchedEffect(model.titleFocus) { if (model.titleFocus > 0) runCatching { titleFocus.requestFocus() } }

    val goNext: () -> Unit = {
        lastField = when {
            titleFocused -> WritingField.Title
            bridge.focused -> WritingField.Story
            else -> null
        }
        scope.launch {
            if (model.next()) dismissKeyboard()
        }
    }

    // At the split, how wide the floating ✓ and its save state are: a line beside them keeps clear of them.
    var pillWidth by remember(model) { mutableIntStateOf(0) }
    // The keyboard's format bar: while the story has the focus, gone 120 ms after it lets go (a tap on a tool keeps it).
    var docked by remember(model) { mutableStateOf(false) }
    LaunchedEffect(bridge.focused, step) {
        if (bridge.focused && step == WriterStep.Write) docked = true
        else {
            if (step == WriterStep.Write) delay(120)
            docked = false
        }
    }
    // How tall the docked bar is as drawn (px; 0 while it isn't): its row, its wave, and — the keyboard down — the navigation bar its paper covers.
    var dockPx by remember(model) { mutableIntStateOf(0) }
    // What the bar says of the writing after its title (round 8 §2.1): its live region stands from the start.
    val status = model.saveState?.let { BarStatus(saveStateWord(it), failed = it == SaveState.Failed) }

    BoxWithConstraints(Modifier.fillMaxSize().cream()) {
        // The page's whole height, the keyboard up or down: the story's least height follows this, never the keyboard.
        val page = maxHeight
        Box(Modifier.fillMaxSize().imePadding()) {
        // Step 1: writing. Composed whatever step shows, so the story keeps its document and selection.
        Box(
            Modifier
                .fillMaxSize()
                // A layer only while the steps cross: the story's WebView, drawn inside a standing layer,
                // kept the size it had when the layer was made (its words cut off as they grew).
                .then(
                    if (shown > 0f) Modifier.graphicsLayer {
                        alpha = 1f - shown
                        translationX = if (reduced) 0f else -shift * shown
                    } else Modifier,
                )
                .then(if (step == WriterStep.Publish) Modifier.clearAndSetSemantics { } else Modifier),
        ) {
            WritingStep(
                model, bridge, bar = bar, compact = compactWindow, pad = pad, columnMax = columnMax, scroll = writeScroll,
                page = page, docked = docked, dockPx = if (docked) dockPx else 0, pillWidth = pillWidth,
                titleFocus = titleFocus, onTitleFocus = { titleFocused = it },
                onRestore = {
                    scope.launch {
                        if (model.restore() == true) trash?.restoredAlone = true
                    }
                },
                dismissKeyboard = dismissKeyboard,
            )
        }
        // Step 2: 發布這張卡片. Placed only while it shows (or fades), so it never takes a touch meant for the story.
        if (publishOpened) Box(
            Modifier
                .fillMaxSize()
                .placedWhen(step == WriterStep.Publish || shown > 0f)
                .graphicsLayer {
                    alpha = shown
                    translationX = if (reduced) 0f else shift * (1f - shown)
                }
                .background(Tokens.Cream)
                .then(if (step == WriterStep.Write) Modifier.clearAndSetSemantics { } else Modifier),
        ) {
            PublishStep(
                session, model, bar = bar, compact = compactWindow, pad = pad, columnMax = columnMax, scroll = publishScroll,
                status = status,
                pickCover = { coverPicker.launch(images) },
                dismissKeyboard = dismissKeyboard,
                onFinished = { key ->
                    bridge.releaseKeyboard()
                    onFinished(key)
                },
            )
        }
        // The format bar rides the keyboard (this box stops at it), over the page's foot — its paper on to the
        // screen's edge when the keyboard is down (StoryFormatBar).
        AnimatedVisibility(
            docked,
            Modifier.align(Alignment.BottomCenter).onSizeChanged { dockPx = it.height },
            enter = fadeIn(tween(120)),
            exit = fadeOut(tween(80)),
        ) {
            StoryFormatBar(
                bridge,
                // The keyboard stays the story's: the picker takes the window a moment, and the caret, the keyboard
                // and this bar come back where they were as it closes, picked or not (refocusWhenBack).
                onInsertImage = { inlinePicker.launch(images) },
                onInsertCard = { pickingCard = true },
                uploadingImage = model.uploadingInline,
            )
        }
        if (bar) {
            // Leaving keeps what's written: the draft is saved on the way out.
            if (step == WriterStep.Write) OrganicInlineBar(
                L10n.App.Nav.back, goBack, title = model.title, scrolled = writeScroll.scrolledPast20(),
                hasStatus = true, status = status,
                trailing = { if (model.showsNext) FinishButton(model, onPress = goNext) },
            ) else OrganicInlineBar(
                L10n.Write.leaveStay, { model.back() }, title = model.stepTitle, scrolled = publishScroll.scrolledPast20(),
                hasStatus = true, status = status,
            )
        } else if (model.showsNext) {
            // At the split: no bar — ✓ floats at the pane's top end, level with the Leave over the map, the save state
            // just before it on the same line, and never scrolls.
            Row(
                Modifier.align(Alignment.TopEnd).padding(top = splitTop() - (FINISH_BOX - SPLIT_ROW_HEIGHT) / 2, end = pad - (FINISH_BOX - 22.dp) / 2).onSizeChanged { pillWidth = it.width },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SaveStateText(status)
                FinishButton(model, onPress = goNext)
            }
        }
        }
    }

    confirmingLeave?.let { question -> OrganicConfirmDialog(
        title = L10n.Write.leaveTitle,
        body = leaveBody(question),
        cancelLabel = L10n.Write.leaveStay,
        confirmLabel = L10n.Write.leaveConfirm,
        onCancel = {
            confirmingLeave = null
            leaveThen = null
        },
        onConfirm = {
            confirmingLeave = null
            val then = leaveThen
            leaveThen = null
            if (then != null) then() else leave()
        },
    ) }

    // 插入卡片: the modal takes the window a moment; picked or not, the story has its caret, keyboard and bar back.
    if (pickingCard) OrganicModal(
        {
            pickingCard = false
            bridge.refocusWhenBack()
        },
        L10n.Write.Editor.CardModal.title,
        seed = 53.0, closeLabel = L10n.Write.Editor.CardModal.cancel, maxWidth = 480.dp,
    ) {
        CardPickerContent(session, L10n.Write.Editor.CardModal.title, L10n.Write.Editor.CardModal.subtitle, onPick = { card ->
            pickingCard = false
            bridge.exec("insertCard", mapOf("href" to "/card/${card.slug ?: card.id}", "title" to card.title))
            bridge.refocusWhenBack()
        }) {
            pickingCard = false
            bridge.refocusWhenBack()
        }
    }
}

/**
 * ✓ (完成, round 8 §2.1): the way to the second step — the bar's own bare icon button, the check
 * glyph at 22; faded and still for a new card with nothing in it, its glyph the small pen loop while a
 * new card's first save runs past 300 ms before the step opens.
 */
@Composable
private fun FinishButton(model: WriteModel, onPress: () -> Unit) {
    OrganicIconButton(IconName.Check, L10n.Write.finish, size = 22.dp, enabled = model.nextEnabled, busy = model.nextLoading, onClick = onPress)
}

/** The ✓'s hit box (the bar's icon buttons'). */
private val FINISH_BOX = 48.dp

/**
 * The writing step (writer.spec §1): the bare title in the card page's title type, then the story —
 * nothing else (a new writer's first card too: no guide stands between them and the page). Over the
 * title only what needs saying: a card moved to the trash meanwhile (its line, with 還原), or a ✓
 * whose new card couldn't be saved (how the writing is kept is the bar's: [SaveState]).
 */
@Composable
private fun WritingStep(
    model: WriteModel,
    bridge: StoryEditorBridge,
    bar: Boolean,
    compact: Boolean,
    pad: Dp,
    columnMax: Dp,
    scroll: androidx.compose.foundation.ScrollState,
    /** The page's whole height, the keyboard up or down. */
    page: Dp,
    docked: Boolean,
    /** The docked bar's height as drawn (px), 0 while it isn't. */
    dockPx: Int,
    /** At the split, how wide the floating ✓ and its save state are (px): a line beside them keeps clear of them. */
    pillWidth: Int,
    titleFocus: FocusRequester,
    onTitleFocus: (Boolean) -> Unit,
    onRestore: () -> Unit,
    dismissKeyboard: () -> Unit,
) {
    val density = LocalDensity.current
    var viewportCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var viewportPx by remember { mutableIntStateOf(0) }
    var storyCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val top = if (bar) inlineBarTop() else splitTop()
    // What the bars cover of the page, the caret kept clear of it: the bar (or the split's first row) above,
    // the docked format bar below — by the page's own follow, and by Compose's keep-the-focused-thing-in-view
    // as the keyboard rises (the story reports its caret's line as its focused area: StoryWebView).
    val clearAbove = with(density) { (top + CARET_CLEARANCE).roundToPx() }
    val clearBelow = (if (docked) dockPx.takeIf { it > 0 } ?: with(density) { DOCK_BAR_HEIGHT.roundToPx() } else 0) + with(density) { CARET_CLEARANCE.roundToPx() * 2 }
    SideEffect { bridge.keepCaretClear(clearAbove, clearBelow) }
    val clearBelowNow by rememberUpdatedState(clearBelow)
    // The caret above the keyboard's bar: the page scrolls only when the caret's line leaves the band it can see —
    // looked at again whenever the caret moves, and once the page has settled after its height or the bar's changed
    // (the keyboard rising, the bar docking), so a line they covered comes back into the band.
    LaunchedEffect(bridge, top) {
        var seen: IslandMessage.Caret? = null
        snapshotFlow { Triple(bridge.caret, viewportPx, clearBelowNow) }.collectLatest { (caret, _, below) ->
            if (caret == null) {
                seen = null
                return@collectLatest
            }
            val moved = caret != seen
            seen = caret
            // A caret that moved: a moment for the next word of it (the story taking the focus first says
            // where its old selection was, then where the finger put it). A page still resizing, or already
            // scrolling (a finger, Compose's own follow): its end is what counts.
            delay(if (moved) CARET_MOVE_MS else CARET_SETTLE_MS)
            snapshotFlow { scroll.isScrollInProgress }.first { !it }
            val vp = viewportCoords?.takeIf { it.isAttached } ?: return@collectLatest
            val story = storyCoords?.takeIf { it.isAttached } ?: return@collectLatest
            val storyTop = vp.localPositionOf(story, Offset.Zero).y
            val px = density.density
            val by = caretScroll(storyTop + caret.top * px, storyTop + caret.bottom * px, clearAbove.toFloat(), vp.size.height - below.toFloat())
            if (by != 0f) scroll.animateScrollBy(by)
        }
    }
    Column(
        Modifier
            .fillMaxSize()
            .onGloballyPositioned { viewportCoords = it }
            .onSizeChanged { viewportPx = it.height }
            .onBlankTap(bridge, dismissKeyboard)
            .verticalScroll(scroll)
            .then(if (compact) Modifier else Modifier.fillMaxWidth().wrapContentWidth().widthIn(max = columnMax))
            // The bar lies over the page, so what scrolls shows right up to its pen line.
            .padding(top = top)
            // Under the bar the page's first line stands where a card page's title does (round 11 §4: the reading head).
            .padding(start = pad, end = pad, top = if (bar) writerHead(compact) else 0.dp, bottom = 48.dp)
            // The page's end clears what covers it: the docked bar, else the system's navigation bar (the keyboard down).
            .then(if (docked) Modifier.padding(bottom = with(density) { dockPx.toDp() }.coerceAtLeast(DOCK_BAR_HEIGHT)) else Modifier.navigationBarsPadding()),
    ) {
        // At the split, the pane's first row, level with the floating ✓ (a card in the trash's line there, or nothing).
        val line: (@Composable () -> Unit)? = when {
            model.trashed -> { { TrashedLine(model, onRestore) } }
            else -> null
        }
        if (!bar || line != null) Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = if (bar) 0.dp else SPLIT_ROW_HEIGHT)
                .padding(end = if (bar) 0.dp else with(density) { pillWidth.toDp() } + 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) { line?.invoke() }
        model.saveError?.let {
            Spacer(Modifier.height(6.dp))
            BasicText(it, style = AppFonts.body(13f, lineHeight = 1.5f, color = Mixes.Danger), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
        }
        if (!bar || line != null || model.saveError != null) Spacer(Modifier.height(16.dp))
        TitleField(model, bridge, compact, titleFocus, onTitleFocus)
        // The title → the story's first line (round 11 §4); what the title says of itself lies in this gap.
        Spacer(Modifier.height(writerTitleGap(compact)))
        Box(Modifier.onGloballyPositioned { storyCoords = it }) {
            StoryCanvas(bridge, minHeight = maxOf(240.dp, page - 320.dp))
        }
    }
}

/** How far the caret's line keeps from what covers the page (the bar over it, the format bar under it). */
private val CARET_CLEARANCE = 8.dp

/** How long the page waits for its height to settle before it looks where the caret is again (the keyboard's rise). */
private const val CARET_SETTLE_MS = 90L

/** How long a caret that moved waits for a newer word of where it is (a frame or so) before the page follows it. */
private const val CARET_MOVE_MS = 48L

/** A card moved to the trash while open here: the save line's place says so, with 還原 beside it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TrashedLine(model: WriteModel, onRestore: () -> Unit) {
    Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            BasicText(L10n.Write.Trashed.status, style = AppFonts.body(14f, lineHeight = 1.5f, color = Tokens.TextMuted))
            OrganicButton(L10n.Me.Actions.restore, variant = ButtonVariant.Tonal, small = true, loading = model.restoring, onClick = onRestore)
        }
        model.restoreError?.let { BasicText(it, style = AppFonts.body(12f, lineHeight = 1.5f, color = Mixes.Danger)) }
    }
}

/**
 * The title (writer.spec §1.3): one line of intent, no frame, in the card page's title type — the
 * story's script's face and size (the island says how it sets the story), at the reading scale.
 * A typed Enter goes on to the story; a pasted line break is a space. From 50 characters it counts
 * toward its 60 in the gap below; without a title at 下一步 it says so there instead.
 */
@Composable
private fun TitleField(model: WriteModel, bridge: StoryEditorBridge, compact: Boolean, focus: FocusRequester, onFocus: (Boolean) -> Unit) {
    val type = StoryType(bridge.script, compact)
    val lang = bridge.lang
    val style = type.titleStyle().let { s -> if (lang != null) s.copy(localeList = LocaleList(lang)) else s }
    val title = model.values.title
    Box(Modifier.fillMaxWidth()) {
        ReadingTextScale {
            BasicTextField(
                value = title,
                onValueChange = { next ->
                    if (enteredLineBreak(title, next)) bridge.focus() else model.setTitle(next)
                },
                textStyle = style,
                cursorBrush = SolidColor(Tokens.Terracotta),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { bridge.focus() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus)
                    .onFocusChanged { onFocus(it.isFocused) }
                    .semantics {
                        contentDescription = L10n.Write.coreLabel
                        if (model.titleError) error(L10n.Write.titleRequired)
                    },
                decorationBox = { inner ->
                    Box {
                        // A bare field's hint stands in the field's own type, upright, in the placeholder's ink.
                        if (title.isEmpty()) BasicText(L10n.Write.titlePlaceholder, style = style.copy(color = Tokens.Placeholder))
                        inner()
                    }
                },
            )
        }
        // In the gap under it, so the story never moves (round 11 §4): the count from 50 on, at the end, or —
        // instead — the error, at the start; neither takes room of its own.
        val count = title.length
        when {
            model.titleError -> BasicText(
                L10n.Write.titleRequired,
                style = AppFonts.body(Tokens.HintSize, lineHeight = 1.4f, color = Mixes.Danger),
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .inTheGap()
                    .semantics { liveRegion = LiveRegionMode.Assertive },
            )
            count >= TITLE_COUNT_FROM -> BasicText(
                "$count / ${WriteModel.TITLE_MAX}",
                style = AppFonts.body(Tokens.HintSize, lineHeight = 1.4f, color = if (count >= WriteModel.TITLE_MAX) Tokens.Text else Tokens.TextMuted),
                modifier = Modifier.align(Alignment.BottomEnd).inTheGap(),
            )
        }
    }
}

/** What the title says of itself, laid in the gap under it: 1 below the title's box, taking no height. */
private fun Modifier.inTheGap(): Modifier = layout { measurable, constraints ->
    val p = measurable.measure(constraints)
    layout(p.width, 0) { p.place(0, 1.dp.roundToPx()) }
}

/** From this many characters on, the title says how many it holds. */
private const val TITLE_COUNT_FROM = 50

/**
 * Whether a change to the title is one Enter typed at the caret (a line break where there was
 * none, nothing else changed) — which goes on to the story — rather than a paste holding one.
 */
internal fun enteredLineBreak(before: String, after: String): Boolean {
    if (after.length != before.length + 1) return false
    val at = after.indexOfFirst { it == '\n' || it == '\r' }.takeIf { it >= 0 } ?: return false
    return after.removeRange(at, at + 1) == before
}

/**
 * The publish step (writer.spec §2, round 8 §2.2–§2.3): at the split its own first row (← 繼續寫, its
 * name — 發布這張卡片 · 儲存草稿 · 更新這張卡片, by the card and the choice — and the save state at its
 * end); a live card's update hint while readers have it and keep it; the mirror (a first publication
 * only); the card as a list will show it, its picture the cover editor, its byline the one the choice
 * gives; 標籤; 卡片類型 — 公開 · 匿名公開 · 草稿, no line under it (the byline above says it); whether a
 * resonance reaches its original; then, under the pen rule, what the verb waits for, why the last try
 * failed, and the foot: one button ([WriteModel.stepVerb]), and 捨棄修改 for a published card's revision.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PublishStep(
    session: Session,
    model: WriteModel,
    bar: Boolean,
    compact: Boolean,
    pad: Dp,
    columnMax: Dp,
    scroll: androidx.compose.foundation.ScrollState,
    /** The writing's save state, said at the end of the step's own heading at the split (the bar says it elsewhere). */
    status: BarStatus?,
    pickCover: () -> Unit,
    dismissKeyboard: () -> Unit,
    onFinished: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val updating = model.isPublished
    val pending = model.pending
    val reduced = LocalContext.current.prefersReducedMotion()
    // The mirror line is on screen while it is asked or answers — and while it folds away (composed till then).
    var lineComposed by remember { mutableStateOf(false) }
    val mirrorShows = !updating && model.mirror.let { it is Mirror.Loading || it is Mirror.Shown }
    // A phone's band under the bar may be the first thing there; with nothing above it, it is the feed's first card.
    val hint = model.showsUpdateHint
    val tucks = bar && compact && !hint
    val underBar = bandUnderBar(bar, compact, hint, mirrorOnScreen = mirrorShows || lineComposed)
    // A tablet's preview card first under the bar stands where a card page's cover would (round 11 §4): 8 lower
    // than the line a hint or the mirror would start on — eased, as the mirror folds away above it.
    val gap = publishSectionGap(compact)
    val coverLead by animateDpAsState(
        if (bar && !compact && cardFirstUnderBar(hint, mirrorOnScreen = mirrorShows || lineComposed)) writerHead(compact, cover = true) - writerHead(compact) else 0.dp,
        if (reduced) snap() else tween(200, easing = Ease), label = "previewLead",
    )
    // Every section keeps its gap above it, so one that folds away (the mirror with nothing to say) takes its gap along.
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .then(if (compact) Modifier else Modifier.fillMaxWidth().wrapContentWidth().widthIn(max = columnMax))
            // Where a band may tuck under the bar, the column starts at the bar's wave; what sits above the band keeps clear of it.
            .padding(top = if (bar) inlineBarTop() - (if (tucks) HeaderEdgeHeight else 0.dp) else splitTop())
            // Under the bar the step's first line stands where a card page's title does (round 11 §4: the reading head).
            .padding(start = pad, end = pad, top = if (bar && !tucks) writerHead(compact) else 0.dp, bottom = 48.dp),
    ) {
        if (!bar) {
            StepHeading(model, status)
            Spacer(Modifier.height(gap))
        }
        if (model.showsUpdateHint) {
            BasicText(L10n.Write.PublishPanel.updateHint, style = AppFonts.body(14f, lineHeight = 1.7f, color = Tokens.TextMuted))
            Spacer(Modifier.height(gap))
        }
        // The mirror line over the band: the band starts under the wave, as it does at the end of the line's folding.
        if (tucks && !underBar) Spacer(Modifier.height(HeaderEdgeHeight))
        if (!updating) MirrorLine(model.mirror, reduced, gap, lead = if (tucks) writerHead(compact) else 0.dp, twoLines = compact) { lineComposed = it }
        Spacer(Modifier.height(coverLead))

        // While it publishes, nothing in the step takes a tap (the web's fieldset disabled, iOS's .disabled):
        // the controls show it themselves. Never faded as a whole — an alpha layer is cut at this column's
        // box, and the card's pen line (a tablet's bordered card) or band (a phone's, edge to edge) runs past it.
        Column(Modifier.holdWhile(pending)) {
            Preview(session, model, compact, pad, underBar, pickCover, dismissKeyboard)
            Spacer(Modifier.height(gap))
            Tags(model, dismissKeyboard)
            Spacer(Modifier.height(gap))
            AudienceChoice(model)
            model.resonanceLine?.let { line ->
                Spacer(Modifier.height(gap))
                Row(
                    Modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OrganicIcon(IconName.Wave, size = 14.dp, color = Tokens.Terracotta)
                    BasicText(
                        if (line == ResonanceLine.Reaches) L10n.Write.PublishPanel.resonanceReaches else L10n.Write.PublishPanel.resonanceQuiet,
                        style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted),
                    )
                }
            }
        }

        // The rule over the foot stands in the middle of one section gap (round 11 §4 review): the verb stays near
        // the choice that names it.
        Spacer(Modifier.height(gap / 2))
        Column {
            WavyDivider(seed = 47.0)
            Spacer(Modifier.height(gap / 2))
            if (model.verbWaits) {
                BasicText(L10n.Write.mediaBusyHint, style = AppFonts.body(12f, lineHeight = 1.5f, color = Tokens.TextMuted))
                Spacer(Modifier.height(12.dp))
            }
            model.publishError?.let {
                Box(Modifier.semantics { liveRegion = LiveRegionMode.Assertive }) { ModalError(it) }
                Spacer(Modifier.height(12.dp))
            }
            StepFoot(
                compact = compact,
                verb = model.verb,
                verbBusyLabel = model.verbBusyLabel,
                wayOut = if (model.showsWayOut) L10n.Write.discardChanges else null,
                verbLoading = pending && model.busyVerb == BusyVerb.Publish,
                verbEnabled = !model.verbWaits && !(pending && model.busyVerb != BusyVerb.Publish),
                wayOutLoading = pending && model.busyVerb == BusyVerb.Leave,
                wayOutEnabled = !(pending && model.busyVerb != BusyVerb.Leave),
                onVerb = {
                    dismissKeyboard()
                    scope.launch {
                        model.finish()?.let { done -> onFinished(done.key) }
                    }
                },
                onWayOut = {
                    dismissKeyboard()
                    scope.launch { model.discardEdit()?.let(onFinished) }
                },
            )
        }
    }
}

/** Two lines of the mirror's words (14 on 1.7): the room its loader keeps on a phone. */
private val MIRROR_TWO_LINES = (14f * 1.7f * 2).dp

/** The publish step's gap between its sections (round 11 §4, `--publish-section-gap`): 48, 40 on a phone — the preview, 標籤, 卡片類型, the rule and the button alike. */
internal fun publishSectionGap(compact: Boolean): Dp = (if (compact) Tokens.PublishSectionGapCompact else Tokens.PublishSectionGap).dp

/** A section's label → its control in the publish step (`--publish-label-gap`). */
internal val PublishLabelGap: Dp = Tokens.PublishLabelGap.dp

/**
 * The writer's head under its bar (round 11 §4): from the bar's foot to the first line's box — the
 * title's, or the publish step's first line — as far under the bar's pen line as a card page's title
 * ([storyHeadGap]: 48 on a phone, 64 wider); to a card's top edge with [cover] (56 / 72).
 */
internal fun writerHead(compact: Boolean, cover: Boolean = false): Dp =
    (if (compact) LayoutClass.Compact else LayoutClass.Medium).storyHeadGap(cover)

/** The writer's title → its story's first line (round 11 §4, `--writer-title-gap`): 32, 24 on a phone. */
internal fun writerTitleGap(compact: Boolean): Dp = (if (compact) Tokens.WriterTitleGapCompact else Tokens.WriterTitleGap).dp

/** Whether the publish step's card is the first thing under the bar: no update hint, no mirror line on screen. */
internal fun cardFirstUnderBar(hint: Boolean, mirrorOnScreen: Boolean): Boolean = !hint && !mirrorOnScreen

/**
 * Whether the publish step's card band is the first thing under the writer's bar, and so drawn as
 * the home feed's first card is (StoryCard `isFirst`): its paper running up under the bar's wave,
 * the bar's pen line its top edge — not a rule of its own just below that line. Only a phone's band
 * ([compact]) under the bar (at the split the step's heading leads), with no update [hint] above it
 * (a card readers have, which keeps them) and no mirror line on screen — asked, answered or still
 * folding away.
 */
internal fun bandUnderBar(bar: Boolean, compact: Boolean, hint: Boolean, mirrorOnScreen: Boolean): Boolean =
    bar && compact && !hint && !mirrorOnScreen

/** At the split, the pane's first row: as tall as the floating pill and the Leave over the map. */
private val SPLIT_ROW_HEIGHT = 38.dp

/**
 * Lays a split row out with its middle on the middle of [SPLIT_ROW_HEIGHT] — the Leave's and the
 * floating ✓'s line — however tall it is: what is taller stands out over the row's top as much as
 * under its foot, and what follows starts under its foot.
 */
private fun Modifier.onSplitRowLine(): Modifier = layout { measurable, constraints ->
    val p = measurable.measure(constraints.copy(minHeight = 0))
    val row = SPLIT_ROW_HEIGHT.roundToPx()
    val top = (row - p.height) / 2
    layout(p.width, maxOf(row, p.height + top)) { p.place(0, top) }
}

/**
 * At the split, the step's own first row: ← 繼續寫 and its name (22/1.2 bold, the bar title's style),
 * level with the Leave, and the writing's save state at its end (no bar says it there).
 */
@Composable
private fun StepHeading(model: WriteModel, status: BarStatus?) {
    // Its middle on the Leave's line, the row's 38 (round 11 review): the name with its save state under it is
    // taller than the row, so the two lines stand out over it evenly rather than pushing the arrow down.
    Row(Modifier.fillMaxWidth().onSplitRowLine(), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.layout { measurable, constraints ->
            // The arrow's 48 hit box hangs into the pad and over the row's 38 (its glyph on the column's
            // edge, level with the Leave's), the row keeping the Leave's height.
            val p = measurable.measure(constraints)
            val row = SPLIT_ROW_HEIGHT.roundToPx()
            layout(p.width - 15.dp.roundToPx(), row) { p.place(-15.dp.roundToPx(), (row - p.height) / 2) }
        }) {
            OrganicIconButton(IconName.ArrowRight, L10n.Write.leaveStay, mirrored = true) { model.back() }
        }
        Spacer(Modifier.widthIn(min = 4.dp))
        // The writing's save state under the step's name (round 11 §5), as the bar says it below the split.
        TitleWithStatus(
            { m -> BasicText(model.stepTitle, style = AppFonts.heading(22f, 700, lineHeight = 1.2f), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = m.semantics { heading() }) },
            status, centred = false, Modifier.weight(1f),
        )
    }
}

/**
 * The mirror moment (publish only): the loader and 正在讀你的故事⋯ while it is asked, the sparkle and
 * 你想說的，也許是——「…」 once it answers; an answer of nothing folds the line away with its gap
 * (200 ms; at once with the system's animations off). The line grows as it changes, so what is under
 * it glides rather than jumps. [lead]: air above the line that folds with it (a phone's, under the
 * bar); [twoLines]: the room of two lines of words kept while it is asked (a phone's); [onComposed] says
 * when the line is on screen and when it has gone, folding done.
 */
@Composable
private fun MirrorLine(mirror: Mirror?, reduced: Boolean, gap: Dp, lead: Dp = 0.dp, twoLines: Boolean = false, onComposed: (Boolean) -> Unit = {}) {
    // What it last had to say stays drawn while the line folds away.
    var said by remember { mutableStateOf<Mirror?>(null) }
    if (mirror is Mirror.Loading || mirror is Mirror.Shown) said = mirror
    val composed by rememberUpdatedState(onComposed)
    AnimatedVisibility(
        mirror is Mirror.Loading || mirror is Mirror.Shown,
        enter = if (reduced) EnterTransition.None else fadeIn(tween(200)) + expandVertically(tween(200)),
        exit = if (reduced) ExitTransition.None else fadeOut(tween(200)) + shrinkVertically(tween(200, easing = Ease)),
    ) {
        DisposableEffect(Unit) {
            composed(true)
            onDispose { composed(false) }
        }
        Column(Modifier.fillMaxWidth().animateContentSize(if (reduced) snap() else tween(200, easing = Ease))) {
            if (lead > 0.dp) Spacer(Modifier.height(lead))
            // On a phone the echo is mostly two lines: the loader's one keeps that room, so the card under it
            // doesn't move when the words come (round 11 §4 review).
            Box(Modifier.heightIn(min = if (twoLines) MIRROR_TWO_LINES else 0.dp)) { when (val m = said) {
                is Mirror.Shown -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OrganicIcon(IconName.Sparkle, Modifier.padding(top = 3.dp), size = 16.dp, color = Tokens.Terracotta)
                    BasicText(L10n.Write.PublishPanel.insight(m.text), style = AppFonts.body(14f, lineHeight = 1.7f))
                }
                else -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SketchLoader(28.dp)
                    BasicText(L10n.Write.PublishPanel.insightLoading, style = AppFonts.body(14f, lineHeight = 1.7f, color = Tokens.TextMuted))
                }
            } }
            Spacer(Modifier.height(gap))
        }
    }
}

/**
 * The card as a list will show it, from what is on screen (writer.spec §2.1.3): a phone's feed band
 * edge to edge — the first card under the bar when nothing stands above it ([underBar]) — a wider
 * window's bordered card at most 360, start-aligned — the viewer's byline, or the anonymous one —
 * its picture the cover editor ([CoverSlot]), edited where it is, and where its picture's trouble is
 * said: nothing under it (round 8 §3). 卡片在列表裡的樣子 is what TalkBack calls it, not a caption.
 */
@Composable
private fun Preview(session: Session, model: WriteModel, compact: Boolean, pad: Dp, underBar: Boolean, pickCover: () -> Unit, dismissKeyboard: () -> Unit) {
    val content = previewContent(model, session.me)
    // The card's own family (round 9 §8): its cover's hue, else a stable one from its id — so a coverless card,
    // and its cover buttons, wear one of the six rather than always the first.
    val family = previewFamily(model.values.accentHue, model.draftId)
    val cover: @Composable BoxScope.(CoverFrame) -> Unit = { frame -> CoverSlot(frame, CardPalette.of(family), model, pickCover, dismissKeyboard) }
    Column(Modifier.fillMaxWidth().semantics { isTraversalGroup = true }) {
        Box(Modifier.semantics { contentDescription = L10n.Write.previewCaption }) {
            if (compact) StoryCard(content, 0, isLast = true, modifier = Modifier.bleed(pad), isFirst = underBar, inset = pad + 18.dp, cover = cover, preview = true, palette = family)
            else BorderedStoryCard(content, 0, Modifier.widthIn(max = 360.dp), cover = cover, preview = true, palette = family)
        }
    }
}

/**
 * The publish step's preview's colour family (round 9 §8): the family nearest its cover's hue, as any
 * card's; a coverless card's from its id ([CardPalette.ofId]: the bubbles' hash, the web's and iOS's
 * twin), family 0 until it has one. The feed keeps colouring coverless cards by their place in it.
 */
internal fun previewFamily(accentHue: Double?, cardId: String?): Int =
    accentHue?.let(CardPalette::nearest) ?: CardPalette.ofId(cardId)

/** What the preview shows of the card being written: StoryCard's content from the live values (cardToStory's rules). */
internal fun previewContent(model: WriteModel, me: com.resonance.api.models.Me?): StoryCardContent {
    val v = model.values
    val anonymous = v.anonymous
    return StoryCardContent(
        id = model.draftId ?: "draft",
        title = v.title,
        excerpt = PlainText.excerpt(PlainText.plainText(v.story)),
        authorName = if (anonymous) L10n.Write.PublishPanel.anonymousName else me?.handle ?: "",
        authorInitials = if (anonymous) "·" else me?.initials ?: "?",
        authorImageUrl = if (anonymous) null else me?.avatarUrl,
        avatarSeed = if (anonymous || me == null) 217.0 else seedFromString(me.id).toDouble(),
        readTime = L10n.App.readMinutes(ReadTime.minutes(v.story)),
        tags = v.tags,
        imageUrl = v.imageUrl,
        imageLabel = v.imageLabel ?: v.title.take(24),
        accentHue = v.accentHue,
    )
}

/**
 * The preview's picture as the cover editor (StoryCard's cover slot): no cover — the card's stripes
 * with 加一張圖片 · 生成圖片 (the second waiting for a story), and under them why the last picture
 * didn't work, in the error ink, in place of the hint (round 8 §3); a photo going up or an illustration
 * painting — the loader in the card's deep pen, over the cover it replaces or the rough pass, blurred
 * under a wash of the card's paper (the stripes, when there is neither, stay bare); a cover — the
 * picture, with one 更換封面 chip on its bottom end corner ([CoverMenu]) and, when a replacement or a
 * drawing failed, a paper chip on its top start corner saying why ([CoverErrorChip]) — no ✕, and
 * nothing under the card: the picture is where it is changed, and where its trouble is said. Its
 * next action (pick, draw, remove) takes the trouble away.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BoxScope.CoverSlot(frame: CoverFrame, palette: CardPalette, model: WriteModel, pickCover: () -> Unit, dismissKeyboard: () -> Unit) {
    val url = model.values.imageUrl
    val partial = model.partialPreview
    val busy = model.mediaBusy
    StoryCardCover(
        // Under the two pills the card's stripes say nothing of their own.
        url, if (url == null) frame.copy(label = "") else frame,
        overlay = {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                when {
                    busy -> {
                        // The cover it replaces, or the model's rough pass while it paints: veiled — blurred and
                        // washed in the card's paper — so the loader and its words read over it. The overlay is
                        // the picture's own bled, clipped box: the veil reaches its whole outline.
                        val veiled = (model.generating && partial != null) || url != null
                        if (model.generating && partial != null) {
                            Image(partial.asImageBitmap(), null, Modifier.fillMaxSize().blur(14.dp), contentScale = ContentScale.Crop)
                        } else if (url != null) {
                            AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().blur(14.dp))
                        }
                        if (veiled) Box(Modifier.fillMaxSize().background(palette.interior.copy(alpha = 0.45f)))
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            SketchLoader(64.dp, color = palette.deep)
                            BasicText(
                                if (model.generating) L10n.Write.mediaGenerating else L10n.Write.mediaUploading,
                                style = AppFonts.body(14f, 600, color = palette.deep),
                            )
                        }
                    }
                    url == null -> Column(
                        Modifier.padding(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        // In the card's own family (round 9 §8): its deep pen as the face, its paper as the words.
                        val faces = remember(palette.index) { CoverFaces.of(palette) }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OrganicButton(L10n.Write.mediaPlaceholder, icon = IconName.Image, small = true, face = faces.solid) {
                                dismissKeyboard()
                                pickCover()
                            }
                            OrganicButton(
                                L10n.Write.mediaGenerate, icon = IconName.Sparkle, small = true, enabled = model.canGenerate,
                                face = faces.solid, disabledFace = faces.resting,
                            ) {
                                dismissKeyboard()
                                model.generateCover()
                            }
                        }
                        val error = model.mediaError
                        if (error != null) BasicText(
                            error,
                            style = AppFonts.body(12f, lineHeight = 1.4f, color = Mixes.Danger).copy(textAlign = TextAlign.Center),
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                        )
                        else if (model.values.story.isBlank()) {
                            BasicText(L10n.Write.mediaGenerateNeedStory, style = AppFonts.body(12f, lineHeight = 1.4f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
                        }
                    }
                }
            }
        },
    )
    if (url != null && !busy) {
        Box(Modifier.align(Alignment.BottomEnd).padding(10.dp)) {
            CoverMenu(model, frame.seed, palette, pickCover, dismissKeyboard)
        }
        model.mediaError?.let { error ->
            BoxWithConstraints(Modifier.matchParentSize().padding(10.dp), contentAlignment = Alignment.TopStart) {
                CoverErrorChip(error, maxWidth = maxWidth * 0.7f, seed = frame.seed + 17)
            }
        }
    }
}

/**
 * Why a cover's replacement (or its drawing) didn't work, on the cover that stayed (round 8 §3): the
 * 更換封面 chip's sibling — the same paper pill with its hand-drawn edge and grain — in the error
 * ink, its words wrapping within [maxWidth] (70 % of the picture). Not a control: TalkBack reads it
 * politely as it comes.
 */
@Composable
private fun CoverErrorChip(text: String, maxWidth: Dp, seed: Double) {
    val face = remember { ButtonFace.of(ButtonVariant.Paper) }
    val shape = remember(seed) { OrganicButtonShape(seed) }
    BasicText(
        text,
        style = AppFonts.body(13f, 600, lineHeight = 1.35f, color = Mixes.Danger),
        modifier = Modifier
            .widthIn(max = maxWidth)
            .drawWithCache {
                val o = shape.createOutline(size, layoutDirection, this)
                val grain = Grain.brush(GrainMode.Tile, face.grainTile, size, density, face.grainAlpha)
                onDrawBehind {
                    drawOutline(o, face.fill)
                    grain?.let { drawOutline(o, it, alpha = face.grainAlpha) }
                }
            }
            .padding(horizontal = 14.dp, vertical = 8.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/**
 * 更換封面 (round 7 §1.3; round 9 §8): a chip on a cover's corner in the card's own colours — its
 * family's fill, opaque, its pen line round it at INK (a chip floating over a picture), the words and
 * glyph in the family's deep pen — opening the organic menu in the same hue: 換一張圖片 · 生成圖片
 * (faded with no story to draw from) · 移除圖片.
 */
@Composable
private fun CoverMenu(model: WriteModel, seed: Double, palette: CardPalette, pickCover: () -> Unit, dismissKeyboard: () -> Unit) {
    val items = listOf(
        OrganicMenuItem(L10n.Write.mediaReplace, IconName.Image) { pickCover() },
        OrganicMenuItem(L10n.Write.mediaGenerate, IconName.Sparkle, enabled = model.canGenerate) { model.generateCover() },
        OrganicMenuItem(L10n.Write.mediaRemove, IconName.Trash, destructive = true) { model.removeCover() },
    )
    val faces = remember(palette.index) { CoverFaces.of(palette) }
    OrganicMenuFrom(items, seed = seed + 11, hue = palette.hue) { _, toggle ->
        OrganicButton(L10n.Write.coverChange, icon = IconName.Image, small = true, face = faces.chip, outline = palette.border) {
            dismissKeyboard()
            toggle()
        }
    }
}

/**
 * The writer's cover controls in a card's family (round 9 §8): [solid] — 加一張圖片 · 生成圖片 on a
 * coverless card — the family's deep pen as the face and its paper as the words; [resting], 生成圖片
 * with no story to draw from yet, the family's tonal step with a muted label (never alpha); [chip],
 * 更換封面 over the picture, the family's fill with its deep pen for the words. A press washes black at
 * 0.14 on the deep face, the family's own ink on the light ones.
 */
internal class CoverFaces private constructor(val solid: ButtonFace, val resting: ButtonFace, val chip: ButtonFace) {
    companion object {
        fun of(palette: CardPalette): CoverFaces = CoverFaces(
            solid = ButtonFace.custom(palette.deep, palette.interior, OrganicIndication.OnFill, seed = 3.0),
            resting = ButtonFace.custom(palette.accent, Tokens.TextMuted, OrganicIndication.OnFill, seed = 3.0),
            chip = ButtonFace.custom(palette.fill, palette.deep, palette.deep.copy(alpha = 0.14f), seed = 401.0),
        )
    }
}

/** A section's label in the step (PublishStep's `.label`): the label size, its tracking, muted. */
@Composable
private fun StepLabel(text: String) {
    BasicText(text, style = AppFonts.body(Tokens.LabelSize, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.06.em))
}

/**
 * 標籤 (CardEditor's TagField): one field holding the chosen tags, the input and its one action (AI
 * suggestions, or Add once something is typed) — and under it nothing but an error, when there is one
 * (round 8 §2.2: no help line). Tags show in the preview at once.
 */
@Composable
private fun Tags(model: WriteModel, dismissKeyboard: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(PublishLabelGap)) {
        StepLabel(L10n.Write.tagsLabel)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            TagField(
                tags = model.values.tags,
                draft = model.tagDraft,
                onDraftChange = model::typeTag,
                placeholder = L10n.Write.tagsPlaceholder,
                suggesting = model.suggestingTags,
                onRemove = model::removeTag,
                onRemoveLast = model::removeLastTag,
                onAdd = model::addTag,
                onSuggest = {
                    dismissKeyboard()
                    model.suggestTags()
                },
            )
            model.tagError?.let { error ->
                BasicText(
                    error,
                    style = AppFonts.body(Tokens.HintSize, lineHeight = 1.5f, color = Tokens.Terracotta),
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
    }
}

/**
 * 卡片類型 (round 8 §2.2): what the card is, as one segmented choice — 公開 · 匿名公開 · 草稿 — with
 * no pen line (its options are buttons): a quiet paper-dark track shows the control's extent, the
 * chosen side wears the tonal peach with the deep label (4.8:1), the others a muted ink deep enough
 * to read on the track. No line under it: the preview's byline above follows the choice (匿名 with
 * the「·」avatar). A card kept for connections only (older ones) shows none chosen, and keeps its
 * audience until one is.
 */
@Composable
private fun AudienceChoice(model: WriteModel) {
    val chosen = model.audience
    Column(verticalArrangement = Arrangement.spacedBy(PublishLabelGap)) {
        StepLabel(L10n.Write.Visibility.label)
        SegmentedActionBar(
            Audience.entries.map { audience ->
                val on = chosen == audience
                Segment(
                    audience.name, audienceLabel(audience), audienceIcon(audience),
                    fill = if (on) Mixes.ButtonTonal else null,
                    textColor = if (on) Mixes.ButtonOnTonal else VisibilityInk,
                    press = Color.Black.copy(alpha = 0.05f),
                    selected = on,
                ) { model.choose(audience) }
            },
            fill = Tokens.CreamDark,
            enabled = !model.pending,
        )
    }
}

/** A choice's words in 卡片類型: 公開 · 匿名公開 · 草稿. */
internal fun audienceLabel(audience: Audience): String = when (audience) {
    Audience.Public -> L10n.Write.Visibility.public
    Audience.Anonymous -> L10n.Write.Visibility.anonymous
    Audience.Private -> L10n.Write.Visibility.draft
}

private fun audienceIcon(audience: Audience): IconName = when (audience) {
    Audience.Public -> IconName.Globe
    Audience.Anonymous -> IconName.Mask
    Audience.Private -> IconName.Lock
}

/**
 * The step's foot: its one button solid and rightmost, and — only for a published card's revision —
 * 捨棄修改 tonal beside it; on a phone (a compact window, the web's ≤ 640) the verb across the width
 * on top and 捨棄修改 under it, 10 apart. While one works it shows its loader and the other rests.
 */
@Composable
private fun StepFoot(
    compact: Boolean,
    verb: String,
    verbBusyLabel: String?,
    wayOut: String?,
    verbLoading: Boolean,
    verbEnabled: Boolean,
    wayOutLoading: Boolean,
    wayOutEnabled: Boolean,
    onVerb: () -> Unit,
    onWayOut: () -> Unit,
) {
    if (compact) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OrganicButton(verb, Modifier.fillMaxWidth(), small = true, enabled = verbEnabled, loading = verbLoading, loadingTitle = verbBusyLabel, onClick = onVerb)
            if (wayOut != null) OrganicButton(wayOut, Modifier.fillMaxWidth(), variant = ButtonVariant.Tonal, small = true, enabled = wayOutEnabled, loading = wayOutLoading, onClick = onWayOut)
        }
    } else {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End), verticalAlignment = Alignment.CenterVertically) {
            if (wayOut != null) OrganicButton(wayOut, variant = ButtonVariant.Tonal, small = true, enabled = wayOutEnabled, loading = wayOutLoading, onClick = onWayOut)
            OrganicButton(verb, small = true, enabled = verbEnabled, loading = verbLoading, loadingTitle = verbBusyLabel, onClick = onVerb)
        }
    }
}

/** The visibility choice's other side: color-mix(text-muted, black 10%), deep enough to read on the paper-dark track. */
private val VisibilityInk = OklchColor.parse("oklch(46.8% 0.036 70)") ?: Tokens.TextMuted

/**
 * A tap on the page itself — one nothing under it took (a field, a button, the story) and that
 * didn't turn into a scroll — as tapping beside a field does on the web. Nothing is consumed.
 * The story's WebView takes its touches after the page has seen them, so a tap there is told
 * apart by when it went down ([StoryEditorBridge.lastTouchDown]).
 */
private fun Modifier.onBlankTap(bridge: StoryEditorBridge, onTap: () -> Unit): Modifier = pointerInput(bridge) {
    awaitEachGesture {
        // The final pass: what lies under the finger has had the touch first, and taken it if it was theirs.
        val down = awaitFirstDown(pass = PointerEventPass.Final)
        while (true) {
            val change = awaitPointerEvent(PointerEventPass.Final).changes.firstOrNull { it.id == down.id } ?: return@awaitEachGesture
            if (change.isConsumed || (change.position - down.position).getDistance() > viewConfiguration.touchSlop) return@awaitEachGesture
            if (!change.pressed) break
        }
        if (bridge.lastTouchDown != down.uptimeMillis) onTap()
    }
}

/** Laid out always, placed (drawn, touched) only while [visible]: a step kept composed off screen. */
private fun Modifier.placedWhen(visible: Boolean): Modifier = layout { measurable, constraints ->
    val p = measurable.measure(constraints)
    layout(p.width, p.height) { if (visible) p.place(0, 0) }
}

/** A phone's band runs edge to edge: out past the column's [pad] on both sides. */
private fun Modifier.bleed(pad: Dp): Modifier = layout { measurable, constraints ->
    val extra = (pad * 2).roundToPx()
    val p = measurable.measure(constraints.copy(minWidth = constraints.maxWidth + extra, maxWidth = constraints.maxWidth + extra))
    layout(constraints.maxWidth, p.height) { p.place(-pad.roundToPx(), 0) }
}

/** Where the writer's content starts: under its bar, or in the workspace's pane (no bar there) under the status bar. */
@Composable
private fun writerTop(bar: Boolean): Dp =
    if (bar) inlineBarTop() else WindowInsets.statusBars.asPaddingValues().calculateTopPadding()

/** At the split, the pane's first row: level with the Leave over the map (the status bar, then 8). */
@Composable
private fun splitTop(): Dp = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 8.dp

/**
 * How the split workspace reaches the writer in its editor pane (round 5 E5): what it holds, and
 * its own ways to save, to put the keyboard away and to ask before leaving written work (the
 * writer's leave dialog, whose confirm runs the workspace's leave). Empty while the pane's card is
 * still being read.
 */
@Stable
class WriterHandle {
    private var hasWork: () -> Boolean = { false }
    private var save: suspend () -> Unit = {}
    private var keyboard: () -> Unit = {}
    private var ask: ((() -> Unit) -> Unit)? = null

    val holdsWork: Boolean get() = hasWork()
    suspend fun saveNow() = save()
    fun releaseKeyboard() = keyboard()

    /** Asks, as the writer's back does, then [then] on a confirm; with no writer in the pane, [then] at once. */
    fun askToLeave(then: () -> Unit) = ask?.invoke(then) ?: then()

    internal fun attach(hasWork: () -> Boolean, saveNow: suspend () -> Unit, releaseKeyboard: () -> Unit, askToLeave: (() -> Unit) -> Unit) {
        this.hasWork = hasWork
        save = { saveNow() }
        keyboard = releaseKeyboard
        ask = askToLeave
    }

    internal fun detach() {
        hasWork = { false }
        save = {}
        keyboard = {}
        ask = null
    }
}
