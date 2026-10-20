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
import androidx.compose.ui.draw.drawWithContent
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.resonance.app.BuildConfig
import com.resonance.app.DebugLaunch
import com.resonance.app.DraftService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.BorderedStoryCard
import com.resonance.design.ButtonVariant
import com.resonance.design.CoverFrame
import com.resonance.design.CssText
import com.resonance.design.EmptyAction
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.ImageRemoveButton
import com.resonance.design.LayoutClass
import com.resonance.design.LocalToasts
import com.resonance.design.LocalWindowLayout
import com.resonance.design.Mixes
import com.resonance.design.ModalError
import com.resonance.design.OklchColor
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicIconButton
import com.resonance.design.OrganicInlineBar
import com.resonance.design.OrganicModal
import com.resonance.design.OrganicToggle
import com.resonance.design.ReadingTextScale
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
import com.resonance.design.inlineBarTop
import com.resonance.design.prefersReducedMotion
import com.resonance.design.toggleRow
import com.resonance.geometry.seedFromString
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.PlainText
import com.resonance.kit.story.ReadTime
import com.resonance.kit.story.StoryScripts
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Writing a card (the web's write page), in two steps (writer.spec). Writing: a bare page — the
 * one-line title and the story, set as the card page will set them (the story's type, at the
 * reading scale), the save line above them, the format bar on the keyboard while the story has the
 * focus — and one 下一步 in the bar (floating at the pane's top end at the split). 下一步 opens 發布這張卡片
 * (更新這張卡片 for a live card) in the same place: the mirror, the card as a list will show it with
 * its cover editor in its picture, 標籤, 誰可以看見, 以匿名發布, whether a resonance reaches its
 * original, then 存成草稿，稍後再寫 | 發布 (捨棄修改 | 儲存修改). The story stays composed under the step,
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
        else -> androidx.compose.runtime.key(card) { WriteForm(session, referenceCardId, null, card, close, onFinished, pane = pane, bar = bar) }
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
        if (bar) OrganicInlineBar(L10n.App.Nav.back, close, title = if (card.isPublished) L10n.Write.editPublishedTitle else L10n.Write.editTitle)
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
) {
    val context = LocalContext.current
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val density = LocalDensity.current
    val trash = LocalTrash.current
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
    val model = remember(opened) {
        WriteModel(session.drafts, session.writing.writerCalls(), referenceCardId, bridge, opened, initialStep = savedStep).apply {
            this.onCreated = onCreated
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
    // Whatever way the screen goes (close, back, a tab switch), the last edit is saved.
    DisposableEffect(model) { onDispose { model.leave() } }
    // Leaving the app saves what is written now, not 1.5s later.
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { model.flush() }
    var pickingCard by remember { mutableStateOf(false) }
    // The first-card guide (ux §5): a brand-new writer's fresh card only.
    var showGuide by remember(model) { mutableStateOf(false) }
    // The anonymous-publishing hint, for this writer's first few visits (counted per visit, as the web).
    var showsAnonymousHint by remember(model) { mutableStateOf(false) }
    LaunchedEffect(model) {
        if (opened == null && referenceCardId == null) session.drafts?.let { showGuide = !it.hasAnyCards() }
    }
    LaunchedEffect(model) { showsAnonymousHint = session.hints?.claim("anonymous-publish") ?: false }
    val coverPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { model.setCover(context, it) } }
    val inlinePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { model.insertImage(context, it) } }
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

    // At the split, how wide the floating 下一步 is: the save line beside it keeps clear of it.
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

    BoxWithConstraints(Modifier.fillMaxSize().cream().imePadding()) {
        val viewport = maxHeight
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
                viewport = viewport, docked = docked, pillWidth = pillWidth, showGuide = showGuide,
                titleFocus = titleFocus, onTitleFocus = { titleFocused = it },
                onPickGuide = { question ->
                    // Seeded into the story as a quote to write against; the guide steps aside.
                    model.seed("> $question\n\n")
                    showGuide = false
                },
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
                showsAnonymousHint = showsAnonymousHint,
                pickCover = { coverPicker.launch(images) },
                dismissKeyboard = dismissKeyboard,
                onLeave = leave,
                onFinished = { key ->
                    bridge.releaseKeyboard()
                    onFinished(key)
                },
            )
        }
        // The format bar rides the keyboard (this box stops at it), over the page's foot.
        AnimatedVisibility(
            docked,
            Modifier.align(Alignment.BottomCenter).navigationBarsPadding(),
            enter = fadeIn(tween(120)),
            exit = fadeOut(tween(80)),
        ) {
            StoryFormatBar(
                bridge,
                onInsertImage = {
                    dismissKeyboard()
                    inlinePicker.launch(images)
                },
                onInsertCard = {
                    dismissKeyboard()
                    pickingCard = true
                },
                uploadingImage = model.uploadingInline,
            )
        }
        if (bar) {
            // Leaving keeps what's written: the draft is saved on the way out.
            if (step == WriterStep.Write) OrganicInlineBar(
                L10n.App.Nav.back, goBack, title = model.title, scrolled = writeScroll.scrolledPast20(),
                trailing = { if (model.showsNext) NextButton(model, onPress = goNext) },
            ) else OrganicInlineBar(
                L10n.Write.leaveStay, { model.back() }, title = model.stepTitle, scrolled = publishScroll.scrolledPast20(),
            )
        } else if (model.showsNext) {
            // At the split: no bar — 下一步 floats at the pane's top end, level with the Leave over the map, and never scrolls.
            Box(Modifier.align(Alignment.TopEnd).padding(top = splitTop(), end = pad).onSizeChanged { pillWidth = it.width }) {
                NextButton(model, onPress = goNext)
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

    if (pickingCard) OrganicModal(
        { pickingCard = false }, L10n.Write.Editor.CardModal.title,
        seed = 53.0, closeLabel = L10n.Write.Editor.CardModal.cancel, maxWidth = 480.dp,
    ) {
        CardPickerContent(session, L10n.Write.Editor.CardModal.title, L10n.Write.Editor.CardModal.subtitle, onPick = { card ->
            pickingCard = false
            bridge.exec("insertCard", mapOf("href" to "/card/${card.slug ?: card.id}", "title" to card.title))
        }) { pickingCard = false }
    }
}

/** 下一步: the one way forward while writing, solid and small; its loader while a new card's first save is on its way. */
@Composable
private fun NextButton(model: WriteModel, onPress: () -> Unit) {
    OrganicButton(L10n.Write.next, small = true, enabled = model.nextEnabled, loading = model.nextLoading, onClick = onPress)
}

/**
 * The writing step (writer.spec §1): the save line (or, for a card moved to the trash meanwhile,
 * its line with 還原), the first-card guide, the bare title in the card page's title type, then
 * the story — nothing else.
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
    viewport: Dp,
    docked: Boolean,
    /** At the split, how wide the floating 下一步 is (px): the save line keeps clear of it. */
    pillWidth: Int,
    showGuide: Boolean,
    titleFocus: FocusRequester,
    onTitleFocus: (Boolean) -> Unit,
    onPickGuide: (String) -> Unit,
    onRestore: () -> Unit,
    dismissKeyboard: () -> Unit,
) {
    val density = LocalDensity.current
    var viewportCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var storyCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val top = if (bar) inlineBarTop() else splitTop()
    val dockedNow by rememberUpdatedState(docked)
    // The caret above the keyboard's bar: the page scrolls only when the caret's line leaves the band it can see.
    LaunchedEffect(bridge, top) {
        snapshotFlow { bridge.caret }.collect { caret ->
            val vp = viewportCoords?.takeIf { it.isAttached } ?: return@collect
            val story = storyCoords?.takeIf { it.isAttached } ?: return@collect
            if (caret == null) return@collect
            val storyTop = vp.localPositionOf(story, Offset.Zero).y
            val px = density.density
            val bandBottom = vp.size.height - (if (dockedNow) DOCK_BAR_HEIGHT.value * px else 0f) - 16 * px
            val by = caretScroll(storyTop + caret.top * px, storyTop + caret.bottom * px, top.value * px + 8 * px, bandBottom)
            if (by != 0f) scroll.animateScrollBy(by)
        }
    }
    Column(
        Modifier
            .fillMaxSize()
            .onGloballyPositioned { viewportCoords = it }
            .onBlankTap(bridge, dismissKeyboard)
            .verticalScroll(scroll)
            .then(if (compact) Modifier else Modifier.fillMaxWidth().wrapContentWidth().widthIn(max = columnMax))
            // The bar lies over the page, so what scrolls shows right up to its pen line.
            .padding(top = top)
            .padding(start = pad, end = pad, top = if (bar) 16.dp else 0.dp, bottom = 48.dp + if (docked) DOCK_BAR_HEIGHT else 0.dp),
    ) {
        // The save line (an unsaved draft has none), level with the floating 下一步 at the split.
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = if (bar) 0.dp else SPLIT_ROW_HEIGHT)
                .padding(end = if (bar) 0.dp else with(density) { pillWidth.toDp() } + 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (model.trashed) TrashedLine(model, onRestore)
            else model.saveStatus?.let { BasicText(it, style = AppFonts.body(14f, lineHeight = 1.5f, color = Tokens.TextMuted)) }
        }
        model.saveError?.let {
            Spacer(Modifier.height(6.dp))
            BasicText(it, style = AppFonts.body(13f, lineHeight = 1.5f, color = Mixes.Danger), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
        }
        Spacer(Modifier.height(16.dp))
        if (showGuide) {
            FirstCardGuide(onPickGuide)
            Spacer(Modifier.height(28.dp))
        }
        TitleField(model, bridge, compact, titleFocus, onTitleFocus)
        Spacer(Modifier.height(16.dp))
        Box(Modifier.onGloballyPositioned { storyCoords = it }) {
            StoryCanvas(bridge, minHeight = maxOf(240.dp, viewport - 320.dp))
        }
    }
}

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
        // In the gap under it, so the story never moves: the count from 50 on (the error, below, in its place).
        val count = title.length
        when {
            model.titleError -> {}
            count >= TITLE_COUNT_FROM -> BasicText(
                "$count / ${WriteModel.TITLE_MAX}",
                style = AppFonts.body(Tokens.HintSize, lineHeight = 1.4f, color = if (count >= WriteModel.TITLE_MAX) Tokens.Text else Tokens.TextMuted),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .layout { measurable, constraints ->
                        val p = measurable.measure(constraints)
                        layout(p.width, 0) { p.place(0, 1.dp.roundToPx()) }
                    },
            )
        }
    }
    if (model.titleError) BasicText(
        L10n.Write.titleRequired,
        style = AppFonts.body(Tokens.HintSize, lineHeight = 1.5f, color = Mixes.Danger),
        modifier = Modifier.padding(top = 6.dp).semantics { liveRegion = LiveRegionMode.Assertive },
    )
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
 * The publish step (writer.spec §2): at the split its own first row (← 繼續寫 and its name); the
 * update hint for a live card; the mirror (a first publication only); the card as a list will show
 * it, its picture the cover editor; 標籤; 誰可以看見; 以匿名發布 with the byline it gives; whether a
 * resonance reaches its original; then, under the pen rule, what the verb waits for, why the last
 * try failed, and the foot.
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
    showsAnonymousHint: Boolean,
    pickCover: () -> Unit,
    dismissKeyboard: () -> Unit,
    onLeave: () -> Unit,
    onFinished: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val updating = model.isPublished
    val pending = model.pending
    val reduced = LocalContext.current.prefersReducedMotion()
    // Every section keeps its gap above it, so one that folds away (the mirror with nothing to say) takes its gap along.
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .then(if (compact) Modifier else Modifier.fillMaxWidth().wrapContentWidth().widthIn(max = columnMax))
            .padding(top = if (bar) inlineBarTop() else splitTop())
            .padding(start = pad, end = pad, top = if (bar) 16.dp else 0.dp, bottom = 48.dp),
    ) {
        if (!bar) {
            StepHeading(model)
            Spacer(Modifier.height(STEP_GAP))
        }
        if (updating) {
            BasicText(L10n.Write.PublishPanel.updateHint, style = AppFonts.body(14f, lineHeight = 1.7f, color = Tokens.TextMuted))
            Spacer(Modifier.height(STEP_GAP))
        }
        if (!updating) MirrorLine(model.mirror, reduced)

        // While it publishes, nothing in the step takes a tap (the web's fieldset disabled).
        Column(Modifier.holdWhile(pending).graphicsLayer { alpha = if (pending) 0.7f else 1f }) {
            Preview(session, model, compact, pad, pickCover, dismissKeyboard)
            Spacer(Modifier.height(STEP_GAP))
            Tags(model, dismissKeyboard)
            Spacer(Modifier.height(STEP_GAP))
            Audience(model)
            Spacer(Modifier.height(STEP_GAP))
            Anonymity(session, model, showsAnonymousHint)
            model.resonanceLine?.let { line ->
                Spacer(Modifier.height(STEP_GAP))
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

        Spacer(Modifier.height(STEP_GAP))
        Column {
            WavyDivider(seed = 47.0)
            Spacer(Modifier.height(STEP_GAP))
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
                verb = if (updating) L10n.Write.PublishPanel.update else L10n.Write.PublishPanel.publish,
                verbBusyLabel = if (updating) L10n.Write.saveShort else null,
                wayOut = if (!model.showsWayOut) null else if (updating) L10n.Write.discardChanges else L10n.Write.saveDraftAndLeave,
                verbLoading = pending && model.busyVerb == BusyVerb.Publish,
                verbEnabled = !model.verbWaits && !(pending && model.busyVerb != BusyVerb.Publish),
                wayOutLoading = pending && model.busyVerb == BusyVerb.Leave,
                wayOutEnabled = !(pending && model.busyVerb != BusyVerb.Leave),
                onVerb = {
                    dismissKeyboard()
                    scope.launch { (if (updating) model.applyEdit() else model.publish())?.let(onFinished) }
                },
                onWayOut = {
                    dismissKeyboard()
                    scope.launch {
                        if (updating) model.discardEdit()?.let(onFinished)
                        else if (model.saveForLater()) onLeave()
                    }
                },
            )
        }
    }
}

/** The step's gap between its sections (the web's clamp(22px, 3vw, 32px); the apps' 28). */
private val STEP_GAP = 28.dp

/** At the split, the pane's first row: as tall as the floating pill and the Leave over the map. */
private val SPLIT_ROW_HEIGHT = 38.dp

/** At the split, the step's own first row: ← 繼續寫 and its name (22/1.2 bold, the bar title's style), level with the Leave. */
@Composable
private fun StepHeading(model: WriteModel) {
    Row(Modifier.heightIn(min = SPLIT_ROW_HEIGHT).padding(start = 0.dp), verticalAlignment = Alignment.CenterVertically) {
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
        BasicText(model.stepTitle, style = AppFonts.heading(22f, 700, lineHeight = 1.2f), modifier = Modifier.semantics { heading() })
    }
}

/**
 * The mirror moment (publish only): the loader and 正在讀你的故事⋯ while it is asked, the sparkle and
 * 你想說的，也許是——「…」 once it answers; an answer of nothing folds the line away with its gap
 * (200 ms; at once with the system's animations off). The line grows as it changes, so what is under
 * it glides rather than jumps.
 */
@Composable
private fun MirrorLine(mirror: Mirror?, reduced: Boolean) {
    // What it last had to say stays drawn while the line folds away.
    var said by remember { mutableStateOf<Mirror?>(null) }
    if (mirror is Mirror.Loading || mirror is Mirror.Shown) said = mirror
    AnimatedVisibility(
        mirror is Mirror.Loading || mirror is Mirror.Shown,
        enter = if (reduced) EnterTransition.None else fadeIn(tween(200)) + expandVertically(tween(200)),
        exit = if (reduced) ExitTransition.None else fadeOut(tween(200)) + shrinkVertically(tween(200, easing = Ease)),
    ) {
        Column(Modifier.fillMaxWidth().animateContentSize(if (reduced) snap() else tween(200, easing = Ease))) {
            when (val m = said) {
                is Mirror.Shown -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OrganicIcon(IconName.Sparkle, Modifier.padding(top = 3.dp), size = 16.dp, color = Tokens.Terracotta)
                    BasicText(L10n.Write.PublishPanel.insight(m.text), style = AppFonts.body(14f, lineHeight = 1.7f))
                }
                else -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SketchLoader(28.dp)
                    BasicText(L10n.Write.PublishPanel.insightLoading, style = AppFonts.body(14f, lineHeight = 1.7f, color = Tokens.TextMuted))
                }
            }
            Spacer(Modifier.height(STEP_GAP))
        }
    }
}

/**
 * The card as a list will show it, from what is on screen (writer.spec §2.1.3): a phone's feed band
 * edge to edge, a wider window's bordered card at most 360, start-aligned — the viewer's byline, or
 * the anonymous one — its picture the cover editor ([CoverSlot]); under it 卡片在列表裡的樣子, then
 * 換一張圖片 once there is one, and why the last picture didn't work.
 */
@Composable
private fun Preview(session: Session, model: WriteModel, compact: Boolean, pad: Dp, pickCover: () -> Unit, dismissKeyboard: () -> Unit) {
    val content = previewContent(model, session.me)
    val cover: @Composable BoxScope.(CoverFrame) -> Unit = { frame -> CoverSlot(frame, model, pickCover, dismissKeyboard) }
    Column(Modifier.fillMaxWidth().semantics { isTraversalGroup = true }) {
        Box(Modifier.semantics { contentDescription = L10n.Write.previewCaption }) {
            if (compact) StoryCard(content, 0, isLast = true, modifier = Modifier.bleed(pad), inset = pad + 18.dp, cover = cover, preview = true)
            else BorderedStoryCard(content, 0, Modifier.widthIn(max = 360.dp), cover = cover, preview = true)
        }
        BasicText(L10n.Write.previewCaption, style = AppFonts.body(12f, lineHeight = 1.5f, color = Tokens.TextMuted), modifier = Modifier.padding(top = 8.dp).clearAndSetSemantics { })
        if (model.values.imageUrl != null && !model.mediaBusy) {
            Spacer(Modifier.height(10.dp))
            OrganicButton(L10n.Write.mediaReplace, variant = ButtonVariant.Tonal, icon = IconName.Image, small = true) {
                dismissKeyboard()
                pickCover()
            }
        }
        model.mediaError?.let {
            Spacer(Modifier.height(8.dp))
            BasicText(it, style = AppFonts.body(12f, lineHeight = 1.5f, color = Mixes.Danger), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }
    }
}

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
 * with 加一張圖片 · 生成圖片 (the second waiting for a story); a photo going up — the loader; an
 * illustration painting — its rough pass blurred under a cream wash, and the loader; a cover — the
 * picture, with the editor's ✕ at its top end.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BoxScope.CoverSlot(frame: CoverFrame, model: WriteModel, pickCover: () -> Unit, dismissKeyboard: () -> Unit) {
    val url = model.values.imageUrl
    val partial = model.partialPreview
    val busy = model.mediaBusy
    StoryCardCover(
        // Under the two pills the card's stripes say nothing of their own.
        if (model.generating) null else url, if (url == null) frame.copy(label = "") else frame,
        overlay = {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                when {
                    busy -> {
                        if (model.generating && partial != null) {
                            Image(partial.asImageBitmap(), null, Modifier.fillMaxSize().blur(14.dp), contentScale = ContentScale.Crop)
                        }
                        Box(Modifier.fillMaxSize().background(Tokens.Cream.copy(alpha = 0.45f)))
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            SketchLoader(64.dp)
                            BasicText(if (model.generating) L10n.Write.mediaGenerating else L10n.Write.mediaUploading, style = AppFonts.body(14f, 600))
                        }
                    }
                    url == null -> Column(
                        Modifier.padding(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OrganicButton(L10n.Write.mediaPlaceholder, variant = ButtonVariant.Tonal, icon = IconName.Image, small = true) {
                                dismissKeyboard()
                                pickCover()
                            }
                            OrganicButton(L10n.Write.mediaGenerate, variant = ButtonVariant.Tonal, icon = IconName.Sparkle, small = true, enabled = model.canGenerate) {
                                dismissKeyboard()
                                model.generateCover()
                            }
                        }
                        if (model.values.story.isBlank()) {
                            BasicText(L10n.Write.mediaGenerateNeedStory, style = AppFonts.body(12f, lineHeight = 1.4f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
                        }
                    }
                }
            }
        },
    )
    if (url != null && !busy) ImageRemoveButton(L10n.Write.mediaRemove, frame.seed + 5, Modifier.align(Alignment.TopEnd).padding(10.dp)) {
        dismissKeyboard()
        model.removeCover()
    }
}

/** A section's label in the step (PublishStep's `.label`): the label size, its tracking, muted. */
@Composable
private fun StepLabel(text: String) {
    BasicText(text, style = AppFonts.body(Tokens.LabelSize, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.06.em))
}

/**
 * 標籤 (CardEditor's TagField): one field holding the chosen tags, the input and its one action (AI
 * suggestions, or Add once something is typed), and under it a muted line on how — the error in its
 * place when there is one. Tags show in the preview at once.
 */
@Composable
private fun Tags(model: WriteModel, dismissKeyboard: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
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
            val error = model.tagError
            BasicText(
                error ?: L10n.Write.tagsHelp,
                style = AppFonts.body(Tokens.HintSize, lineHeight = 1.5f, color = if (error != null) Tokens.Terracotta else Tokens.TextMuted),
            )
        }
    }
}

/**
 * 誰可以看見: a segmented choice with no pen line (its options are buttons) — a quiet paper-dark track
 * shows the control's extent, the chosen side wears the tonal peach with the deep label (4.8:1), the
 * other a muted ink deep enough to read on the track. A card kept for connections only (older ones)
 * shows neither chosen, and keeps its audience until one is. Anonymous, it says it is public or yours.
 */
@Composable
private fun Audience(model: WriteModel) {
    val visibility = model.values.visibility
    val anonymous = model.values.anonymous
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        StepLabel(L10n.Write.Visibility.label)
        SegmentedActionBar(
            listOf("public" to IconName.Globe, "private" to IconName.Lock).map { (v, icon) ->
                val chosen = visibility == v
                Segment(
                    v, if (v == "public") L10n.Write.Visibility.public else L10n.Write.Visibility.private, icon,
                    fill = if (chosen) Mixes.ButtonTonal else null,
                    textColor = if (chosen) Mixes.ButtonOnTonal else VisibilityInk,
                    press = Color.Black.copy(alpha = 0.05f),
                    selected = chosen,
                ) { model.setAudience(v, anonymous) }
            },
            fill = Tokens.CreamDark,
            enabled = !model.pending,
        )
        // Its room is kept while it isn't said, so flipping the switch below never moves the switch under the finger.
        BasicText(
            L10n.Write.PublishPanel.anonymousVisibility,
            style = AppFonts.body(Tokens.HintSize, color = Tokens.TextMuted),
            modifier = if (anonymous) Modifier else Modifier.drawWithContent { }.clearAndSetSemantics { },
        )
    }
}

/**
 * 以匿名發布: the whole row is the switch (a tap on the words flips it too); turning it on makes a card
 * kept for connections public in the same change. Under it the byline the world will get, and — for
 * this writer's first visits — what anonymity means.
 */
@Composable
private fun Anonymity(session: Session, model: WriteModel, showsHint: Boolean) {
    val anonymous = model.values.anonymous
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            Modifier.toggleRow(anonymous, enabled = !model.pending) { model.setAudience(model.values.visibility, it) },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            BasicText(L10n.Write.PublishPanel.anonymousToggle, style = AppFonts.body(14f), modifier = Modifier.weight(1f))
            OrganicToggle(anonymous, seed = 57.0)
        }
        // Seeing is understanding: the exact byline the card will carry.
        val me = session.me
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (anonymous) HandDrawnAvatar("·", color = Tokens.CreamDark, size = 34.dp, seed = 97.0)
            else if (me != null) HandDrawnAvatar(me.initials, me.avatarUrl, OklchColor.parse(me.accentColor) ?: Tokens.TerracottaLight, 34.dp, 7.0)
            BasicText(
                if (anonymous) L10n.Write.PublishPanel.anonymousName else me?.handle ?: "",
                style = AppFonts.body(14f, 600, color = if (anonymous) Tokens.TextMuted else Tokens.Text),
            )
        }
        // The hint counts visits, not the toggle (useHint('anonymous-publish')).
        if (showsHint) BasicText(L10n.Write.PublishPanel.anonymousHint, style = AppFonts.body(Tokens.HintSize, color = Tokens.TextMuted))
    }
}

/**
 * The step's foot: the way out tonal, the verb solid and rightmost — on a phone (a compact window,
 * the web's ≤ 640) the verb across the width on top and the way out under it, 10 apart. While one
 * works it shows its loader and the other rests.
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

/** While [held], nothing under this takes a touch (a step whose verb is working). */
private fun Modifier.holdWhile(held: Boolean): Modifier = if (!held) this else pointerInput(Unit) {
    awaitPointerEventScope {
        while (true) awaitPointerEvent(PointerEventPass.Initial).changes.forEach { it.consume() }
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
