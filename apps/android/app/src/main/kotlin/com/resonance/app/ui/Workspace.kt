package com.resonance.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import com.resonance.app.Session
import com.resonance.app.thoughtmap.ThoughtMapScreen
import com.resonance.design.AppFonts
import com.resonance.design.LocalWindowLayout
import com.resonance.design.OrganicIcon
import com.resonance.design.WobRectShape
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * What the workspace's editor pane shows: the writer's own card (the route's, `slot` [ROUTE_SLOT]),
 * or one of mine opened on the map ([fromMap]). [slot] names the writer in the pane — it stays
 * while a new card is first saved as a draft, so the writer isn't rebuilt under the person typing.
 */
internal data class PaneCard(
    val slot: String,
    val referenceCardId: String?,
    val cardId: String?,
    val story: String?,
    val fromMap: Boolean,
    /** The writer began on a new card in this visit, since saved as the draft [cardId]: it is still 新卡片 (round 8 §2.1). */
    val beganNew: Boolean = false,
    /** Opened at the publish step, offered to readers (a 私人卡's 公開發表, round 12 §3: [Route.Write.publishing]). */
    val publishing: Boolean = false,
)

internal const val ROUTE_SLOT = "route"

/**
 * The divider between the map and the editor pane (round 5 E5; the web's WorkspaceShell), as
 * fractions of the window's width. Dragged, the editor is 32 % to 50 % of it; dragged on toward
 * the trailing edge past 32 % the pane follows the finger, and under 18 % it is in the hide zone:
 * let go there it hides, let go between 18 % and 32 % it springs back to 32 %. Dragged on toward
 * the leading edge past half it slides over the map, and from 75 % it is in the full zone: let go
 * there the pane takes the whole window ([WHOLE], the writer alone), let go between 50 % and 75 %
 * it springs back to half — dragged back from the whole window by the same rules.
 */
internal object PaneDrag {
    const val MIN = 0.32f
    const val MAX = 0.5f
    const val HIDE = 0.18f
    const val FULL = 0.75f
    const val WHOLE = 1f

    /** Where a drag that began at [start] leaves the pane after [dx] px (+ toward the trailing edge) across a [width] px window: never wider than the window. */
    fun follow(start: Float, dx: Float, width: Float): Float =
        if (width <= 0f) start else (start - dx / width).coerceIn(0f, WHOLE)

    fun inHideZone(fraction: Float): Boolean = fraction < HIDE

    fun inFullZone(fraction: Float): Boolean = fraction >= FULL

    enum class Release { Hide, SpringBack, Stay, SpringToHalf, Full }

    fun release(fraction: Float): Release = when {
        fraction < HIDE -> Release.Hide
        fraction < MIN -> Release.SpringBack
        fraction <= MAX -> Release.Stay
        fraction < FULL -> Release.SpringToHalf
        else -> Release.Full
    }

    /** The width a release leaves the pane at: hidden (0), sprung back to [MIN] or to half, where it was let go, or the whole window. */
    fun settle(fraction: Float): Float = when (release(fraction)) {
        Release.Hide -> 0f
        Release.SpringBack -> MIN
        Release.Stay -> fraction
        Release.SpringToHalf -> MAX
        Release.Full -> WHOLE
    }

    /** The width showing a hidden pane again brings back: where it was left beside the map — half, after the whole window. */
    fun showsAgainAt(frac: Float): Float = frac.coerceIn(MIN, MAX)

    /** A drag on the docked grip toward the leading side this far (px, of [reveal]) shows the pane again. */
    fun reveals(towardLeading: Float, reveal: Float): Boolean = towardLeading >= reveal

    /**
     * Where the grip's centre stands across a [window] px wide (px from the leading edge) with the
     * pane drawn at [fraction]: on the boundary, never nearer either edge than [dock] — so hidden
     * it waits docked at the trailing edge, and the pane taking the whole window, at the leading one.
     */
    fun gripCentre(fraction: Float, window: Float, dock: Float): Float =
        if (fraction <= 0f) window - dock else (window * (1f - fraction)).coerceIn(dock, max(dock, window - dock))
}

/** The pane: what it shows, whether it is open, its last width, and the width it is drawn at now (all of the window). */
@Stable
internal class PaneState(card: PaneCard?, open: Boolean, frac: Float, settled: Int = if (open && card != null) 1 else 0) {
    var card by mutableStateOf(card)
    var open by mutableStateOf(open && card != null)
    /** The width the person last left it at (32 %…50 %, or the whole window): showing it again brings it back there ([PaneDrag.showsAgainAt]). */
    var frac by mutableFloatStateOf(frac)
    /** The width it is drawn at (0: hidden), but while the grip is held. */
    val shown = Animatable(if (open && card != null) frac else 0f)
    /** The width the held grip puts it at; null while nobody holds it. */
    var drag by mutableStateOf<Float?>(null)
    /** Hiding with the system's animations off: it fades instead of sliding. */
    val fade = Animatable(1f)
    /**
     * Counts the times the map's width settled beside the pane (opened with it, shown again, another
     * card opened in it, the divider let go — never while it is held): the map frames everything again on each, or —
     * the reader having moved its camera — centres the pane's card.
     */
    var settled by mutableIntStateOf(settled)

    val drawn: Float get() = drag ?: shown.value
    val inHideZone: Boolean get() = drag?.let(PaneDrag::inHideZone) == true
    val inFullZone: Boolean get() = drag?.let(PaneDrag::inFullZone) == true
    /**
     * The writer alone: the pane left at the whole window (the map under it hidden from TalkBack, the writer in its
     * own bar) — while its grip is held too, so nothing changes under the finger until it lets go.
     */
    val full: Boolean get() = open && frac >= PaneDrag.WHOLE
    /** [full], and drawn all the way over the map: the map is no longer placed, so it neither draws nor takes a touch. */
    val covers: Boolean get() = full && drawn >= PaneDrag.WHOLE

    companion object {
        val Saver = listSaver<PaneState, Any?>(
            save = { listOf(it.card?.slot, it.card?.referenceCardId, it.card?.cardId, it.card?.story, it.card?.fromMap, it.open, it.frac, it.settled, it.card?.beganNew, it.card?.publishing) },
            restore = {
                val slot = it[0] as String?
                val card = slot?.let { s -> PaneCard(s, it[1] as String?, it[2] as String?, it[3] as String?, it[4] as Boolean? ?: false, beganNew = it.getOrNull(8) as Boolean? ?: false, publishing = it.getOrNull(9) as Boolean? ?: false) }
                PaneState(card, it[5] as Boolean, it[6] as Float, it[7] as Int)
            },
        )
    }
}

/**
 * The writer and the thought map as one page (round 5 E5, design note §12): at the split width
 * (≥ 1200) the map on the leading side and the editor pane on the trailing side, no bar over
 * either — the map's own floating Leave is the way back whichever way it was come into (from the
 * writer it keeps the writer's rule: written work asks first). The writer ([writer], a new card, a
 * draft or a published card's edit) opens it with the pane open; the thought map ([writer] null)
 * with the pane closed. A card of mine tapped on the map opens in the pane, in place (the card
 * there saved first); another's opens its page over the workspace ([open]).
 *
 * The divider's grip is the only way to hide the pane ([PaneDrag]); hidden, the map takes the
 * whole width and the grip waits docked at the trailing edge while there is a card to show again.
 * Hiding saves the draft at once and keeps the writer as it was, composed off screen.
 *
 * Dragged on toward the leading edge the pane slides over the map (which keeps its width at half)
 * and, let go from 75 %, takes the whole window: the writer alone, in its own bar as below the
 * split (the same writer, still composed), the map under it hidden and untouchable, the grip docked
 * at the leading edge — tapped, or dragged back past 75 %, the split at half again. Its back from
 * writing goes where the writer came from: a card from the map hides the pane (saved, no question;
 * showing it again is the split at half), any other leaves the page by the writer's rule. Never kept
 * from one visit to the next.
 *
 * The map opens framing everything on it (its 顯示全部), the writer's map too, and frames it again as
 * its width changes and each time it settles beside the pane — opened with it or shown again,
 * another card opened in it, the divider let go — until the reader pans or zooms it; after that a
 * settling glides the card the pane shows (one opened from the map; the writer's own card once it
 * has an id) to the middle of what the map shows, at its zoom (round 13).
 *
 * Below the split nothing changes: the writer is its own page with its bar, the map its own with
 * its Leave and its cards opening the writer pushed over it — but a card the pane held as the
 * window narrowed covers the map with its bar, its back hiding it again.
 */
@Composable
internal fun Workspace(
    session: Session,
    writer: Route.Write?,
    open: (Route) -> Unit,
    leave: () -> Unit,
    onCreated: (String) -> Unit = {},
    /** The writer's own card published, or its changes dropped (its slug or id): the card's page takes the writer's place. */
    onFinished: (String) -> Unit = {},
) {
    val split = LocalWindowLayout.current.writerSplit
    val mapShown = split || writer == null
    val pane = rememberSaveable(saver = PaneState.Saver) {
        PaneState(writer?.let { PaneCard(ROUTE_SLOT, it.referenceCardId, it.cardId, it.story, fromMap = false, beganNew = it.savedNew, publishing = it.publishing) }, open = writer != null, frac = PaneDrag.MAX)
    }
    val handle = remember { WriterHandle() }
    val scope = rememberCoroutineScope()
    val reduced = LocalContext.current.prefersReducedMotion()
    val haptic = LocalHapticFeedback.current
    var leaving by remember { mutableStateOf(false) }

    // What the writer wrote, for the screens that show cards (the map among them) to read again.
    fun noteWritten() {
        session.takeWriterChange()?.let(session::noteCardChange)
    }

    fun leaveNow() {
        if (leaving) return
        leaving = true
        handle.releaseKeyboard()
        scope.launch {
            handle.saveNow()
            noteWritten()
            leave()
        }
    }

    // The map's Leave and, at the split, the system back: from the writer, the writer's rule.
    fun leavePage() {
        if (leaving) return
        if (writer != null && handle.holdsWork) handle.askToLeave(::leaveNow) else leaveNow()
    }

    fun show() {
        if (pane.card == null) return
        pane.open = true
        scope.launch {
            pane.fade.snapTo(1f)
            if (reduced) pane.shown.snapTo(pane.frac) else pane.shown.animateTo(pane.frac, tween(PANE_SLIDE_MILLIS, easing = EaseOut))
            pane.settled++
        }
    }

    // Saves the draft at once and keeps the writer as it is; the pane slides out (or fades, without motion).
    // Hidden from the whole window, it comes back at half beside the map.
    fun hide() {
        if (!pane.open) return
        pane.open = false
        pane.frac = PaneDrag.showsAgainAt(pane.frac)
        handle.releaseKeyboard()
        scope.launch {
            handle.saveNow()
            noteWritten()
        }
        scope.launch {
            if (reduced) {
                pane.fade.animateTo(0f, tween(PANE_SLIDE_MILLIS))
                pane.shown.snapTo(0f)
                pane.fade.snapTo(1f)
            } else pane.shown.animateTo(0f, tween(PANE_SLIDE_MILLIS, easing = EaseOut))
        }
    }

    // The writer alone: the pane slides on over the map to the whole window (the map keeps its width under it).
    fun toFull() {
        if (!pane.open) return
        pane.frac = PaneDrag.WHOLE
        scope.launch {
            if (reduced) pane.shown.snapTo(PaneDrag.WHOLE) else pane.shown.animateTo(PaneDrag.WHOLE, tween(PANE_SLIDE_MILLIS, easing = EaseOut))
        }
    }

    // From the whole window back to the split at half (the docked grip tapped, TalkBack's 顯示思想地圖).
    fun toHalf() {
        if (!pane.open) return
        pane.frac = PaneDrag.MAX
        scope.launch {
            if (reduced) pane.shown.snapTo(PaneDrag.MAX) else pane.shown.animateTo(PaneDrag.MAX, tween(PANE_SLIDE_MILLIS, easing = EaseOut))
        }
    }

    // One of my cards tapped on the map: in the pane, in place (the card there saved first).
    fun openFromMap(id: String) {
        if (pane.card?.cardId == id) return show()
        scope.launch {
            handle.saveNow()
            noteWritten()
            pane.card = PaneCard("map:$id", null, id, null, fromMap = true)
            show()
        }
    }

    // The pane's writer let go of its card (its "save and leave", its bar's back, a missing card's way back).
    fun closeCard(card: PaneCard) {
        if (card.fromMap && mapShown) hide()
        else if (!leaving) {
            leaving = true
            noteWritten()
            leave()
        }
    }

    // Published, or its changes dropped.
    fun finishCard(card: PaneCard, key: String) {
        session.noteCardChange(session.takeWriterChange() ?: Session.CardChange())
        when {
            !card.fromMap -> onFinished(key)
            mapShown -> {
                pane.open = false
                pane.card = null
                pane.frac = PaneDrag.showsAgainAt(pane.frac)
                scope.launch { pane.shown.snapTo(0f) }
            }
            else -> leave()
        }
    }

    // At the split the back is the workspace's: the writer's leave, or — the map come into — the pane hidden first.
    BackHandler(enabled = split && writer != null) { leavePage() }
    BackHandler(enabled = split && writer == null && pane.open) { hide() }
    // A light tick on entering the hide zone, and the full zone.
    LaunchedEffect(pane) {
        snapshotFlow { pane.inHideZone }.collect { if (it) haptic.performHapticFeedback(HapticFeedbackType.GestureThresholdActivate) }
    }
    LaunchedEffect(pane) {
        snapshotFlow { pane.inFullZone }.collect { if (it) haptic.performHapticFeedback(HapticFeedbackType.GestureThresholdActivate) }
    }

    val boundary = Tokens.FieldBorder
    BoxWithConstraints(Modifier.fillMaxSize().cream()) {
        val window = constraints.maxWidth.toFloat()
        val card = pane.card
        // Below the split the writer come into is the whole page; the map come into shows the pane only as it held one.
        val paneOnScreen = when {
            split -> pane.drawn > 0f
            writer != null -> true
            else -> pane.open
        }
        // The writer alone, the map stays composed under it at half the window: hidden from TalkBack, and — once the
        // pane has slid all the way over it — not placed, so it takes no touch.
        val writerAlone = split && pane.full
        if (mapShown) Box(
            Modifier
                .layout { measurable, constraints ->
                    // Past half the pane slides over the map, which keeps the width it had beside it at half.
                    val w = if (split) (constraints.maxWidth * (1f - minOf(pane.drawn, PaneDrag.MAX))).roundToInt() else constraints.maxWidth
                    val placeable = measurable.measure(Constraints.fixed(w.coerceAtLeast(0), constraints.maxHeight))
                    layout(constraints.maxWidth, constraints.maxHeight) { if (!(split && pane.covers)) placeable.place(0, 0) }
                }
                .then(if (writerAlone) Modifier.clearAndSetSemantics { } else Modifier),
        ) {
            ThoughtMapScreen(
                session, session.thoughtMap, open,
                leave = { if (split) leavePage() else leave() },
                openMine = if (split) ::openFromMap else null,
                paneCardId = card?.cardId?.takeIf { split && pane.open },
                paneSettled = pane.settled,
            )
        }
        if (card != null) {
            val dim by animateFloatAsState(if (pane.inHideZone) 0.5f else 1f, tween(120), label = "paneDim")
            Box(
                Modifier
                    .layout { measurable, constraints ->
                        val full = constraints.maxWidth
                        val f = pane.drawn
                        // At the split it is its width of the window, sliding out past 32 % rather than squeezing, over the map past
                        // half; off screen when hidden.
                        val w = if (split) (full * max(f, PaneDrag.MIN)).roundToInt() else full
                        val x = when {
                            !paneOnScreen -> full
                            split -> (full * (1f - f)).roundToInt()
                            else -> 0
                        }
                        val placeable = measurable.measure(Constraints.fixed(w, constraints.maxHeight))
                        layout(full, constraints.maxHeight) {
                            placeable.placeWithLayer(x, 0) { alpha = (if (split) dim else 1f) * pane.fade.value }
                        }
                    }
                    .then(if (paneOnScreen) Modifier else Modifier.clearAndSetSemantics { })
                    // The boundary: a hair of the fields' border on the pane's own leading edge, over what it holds.
                    .drawWithContent {
                        drawContent()
                        if (split) drawLine(boundary, Offset(0.5f, 0f), Offset(0.5f, size.height), strokeWidth = 1.dp.toPx())
                    },
            ) {
                key(card.slot) {
                    WriteScreen(
                        session, card.referenceCardId, card.cardId, card.story,
                        close = { closeCard(card) },
                        beganNew = card.beganNew,
                        publishing = card.publishing,
                        onCreated = { id ->
                            pane.card = pane.card?.takeIf { it.slot == card.slot }?.copy(cardId = id, story = null, beganNew = true) ?: pane.card
                            if (!card.fromMap) onCreated(id)
                        },
                        pane = handle,
                        // Its own bar and back below the split, and at it with the writer alone; the workspace's at the split.
                        bar = !split || writerAlone,
                        // The writer alone on a card from the map: back from writing hides the pane, its draft saved, no question.
                        paneBack = if (writerAlone && card.fromMap) ::hide else null,
                    ) { key -> finishCard(card, key) }
                }
            }
        }
        if (split && card != null) {
            PaneGrip(
                pane, window, reduced,
                show = ::show,
                full = ::toFull,
                half = ::toHalf,
                hide = {
                    haptic.performHapticFeedback(HapticFeedbackType.GestureEnd)
                    hide()
                },
                resize = { f ->
                    pane.frac = f.coerceIn(PaneDrag.MIN, PaneDrag.MAX)
                    scope.launch {
                        pane.shown.snapTo(pane.frac)
                        pane.settled++
                    }
                },
            )
            if (pane.inHideZone) ReleasePill(pane, window, L10n.Write.releaseToClose, paneSide = false)
            // Near the leading edge there is no room on the map's side: this one stands on the pane's.
            if (pane.inFullZone) ReleasePill(pane, window, L10n.Write.releaseToFull, paneSide = true)
        }
    }
}

/**
 * The divider's grip (the web's railGrip): a small inked chip on the boundary, in the middle of
 * its height — 28 × 34, a hair of the fields' border, the arrows glyph — in a 44 × 48 touch
 * target. Dragged it resizes the pane, hides it from the hide zone, gives it the whole window from
 * the full zone, and — docked at the trailing edge while the pane is hidden — shows it again, as a
 * tap there does. With the writer alone it docks at the leading edge: dragged back toward the
 * trailing side by the same rules, tapped it returns to half. An adjustable control for TalkBack
 * (its value the editor's width), with hide / show and full width / show the map as its actions.
 */
@Composable
private fun PaneGrip(
    pane: PaneState,
    window: Float,
    reduced: Boolean,
    show: () -> Unit,
    hide: () -> Unit,
    full: () -> Unit,
    half: () -> Unit,
    resize: (Float) -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val dragged by source.collectIsDraggedAsState()
    val pressed by source.collectIsPressedAsState()
    val hovered by source.collectIsHoveredAsState()
    val density = LocalDensity.current
    val reveal = with(density) { GRIP_REVEAL.toPx() }
    val dock = with(density) { (GRIP_TOUCH_W / 2).toPx() }
    var start by remember { mutableFloatStateOf(0f) }
    var moved by remember { mutableFloatStateOf(0f) }
    val open = pane.open
    val alone = pane.full
    val drag = rememberDraggableState { dx ->
        moved += dx
        pane.drag = if (open) PaneDrag.follow(start, moved, window)
            // Docked: the pane comes out with the finger, as far as its last width.
            else PaneDrag.follow(0f, moved, window).coerceAtMost(pane.frac)
    }
    val active = dragged || pressed || hovered
    Box(
        Modifier
            .layout { measurable, constraints ->
                val placeable = measurable.measure(Constraints())
                val cx = PaneDrag.gripCentre(pane.drawn, window, dock)
                layout(constraints.maxWidth, constraints.maxHeight) {
                    placeable.place((cx - placeable.width / 2f).roundToInt(), (constraints.maxHeight - placeable.height) / 2)
                }
            }
            .size(GRIP_TOUCH_W, GRIP_TOUCH_H)
            .hoverable(source)
            .pointerHoverIcon(PointerIcon(android.view.PointerIcon.TYPE_HORIZONTAL_DOUBLE_ARROW))
            .draggable(
                drag, Orientation.Horizontal, interactionSource = source,
                onDragStarted = {
                    start = pane.shown.value
                    moved = 0f
                    pane.drag = pane.shown.value
                },
                onDragStopped = {
                    val f = pane.drag ?: return@draggable
                    pane.shown.snapTo(f)
                    pane.drag = null
                    if (open) when (PaneDrag.release(f)) {
                        PaneDrag.Release.Hide -> hide()
                        PaneDrag.Release.SpringBack, PaneDrag.Release.SpringToHalf -> {
                            val to = PaneDrag.settle(f)
                            pane.frac = to
                            if (reduced) pane.shown.snapTo(to)
                            else pane.shown.animateTo(to, spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMediumLow))
                            pane.settled++
                        }
                        PaneDrag.Release.Stay -> {
                            pane.frac = PaneDrag.settle(f)
                            pane.settled++
                        }
                        PaneDrag.Release.Full -> full()
                    } else if (PaneDrag.reveals(-moved, reveal)) show()
                    else if (reduced) pane.shown.snapTo(0f) else pane.shown.animateTo(0f, tween(PANE_SLIDE_MILLIS, easing = EaseOut))
                },
            )
            .clickable(
                source, indication = null, enabled = !open || alone,
                onClickLabel = if (alone) L10n.Write.showMap else L10n.Write.openEditor,
            ) { if (alone) half() else show() }
            .semantics(mergeDescendants = true) {
                contentDescription = L10n.Write.resizeDivider
                if (alone) {
                    // The writer alone: the whole window, on a scale running on from the split's.
                    progressBarRangeInfo = ProgressBarRangeInfo(PaneDrag.WHOLE, PaneDrag.MIN..PaneDrag.WHOLE)
                    setProgress { v ->
                        if (!PaneDrag.inFullZone(v)) resize(v)
                        true
                    }
                    customActions = listOf(
                        CustomAccessibilityAction(L10n.Write.showMap) { half(); true },
                        CustomAccessibilityAction(L10n.Write.closeEditor) { hide(); true },
                    )
                } else if (open) {
                    progressBarRangeInfo = ProgressBarRangeInfo(pane.frac, PaneDrag.MIN..PaneDrag.MAX)
                    setProgress { v ->
                        resize(v)
                        true
                    }
                    customActions = listOf(
                        CustomAccessibilityAction(L10n.Write.closeEditor) { hide(); true },
                        CustomAccessibilityAction(L10n.Write.fullEditor) { full(); true },
                    )
                } else {
                    customActions = listOf(CustomAccessibilityAction(L10n.Write.openEditor) { show(); true })
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(28.dp, 34.dp)
                .background(Tokens.Cream, GripShape)
                .border(1.dp, if (active) Tokens.FieldBorderHover else Tokens.FieldBorder, GripShape),
            contentAlignment = Alignment.Center,
        ) {
            OrganicIcon(IconName.ArrowsHorizontal, size = 16.dp, color = if (active) Tokens.Text else Tokens.TextMuted)
        }
    }
}

/**
 * What letting go of the held grip does, by it and level with it: 「放開以收起編輯區」in the hide zone on
 * the map's side of it, 「放開以全寬書寫」in the full zone on the pane's ([paneSide]: near the leading
 * edge the map's side has no room).
 */
@Composable
private fun ReleasePill(pane: PaneState, window: Float, text: String, paneSide: Boolean) {
    val density = LocalDensity.current
    val gap = with(density) { (GRIP_TOUCH_W / 2 + 4.dp).toPx() }
    val dock = with(density) { (GRIP_TOUCH_W / 2).toPx() }
    BasicText(
        text,
        style = AppFonts.body(13f, 600, lineHeight = 1.3f, color = Tokens.ButtonOnTonal),
        maxLines = 1,
        modifier = Modifier
            .layout { measurable, constraints ->
                val placeable = measurable.measure(Constraints())
                val cx = PaneDrag.gripCentre(pane.drawn, window, dock)
                val x = if (paneSide) cx + gap else cx - gap - placeable.width
                layout(constraints.maxWidth, constraints.maxHeight) {
                    placeable.place(x.roundToInt(), (constraints.maxHeight - placeable.height) / 2)
                }
            }
            // The same hand as iOS's pill and the app's other tonal faces: a wobbly rounded rectangle, never a plain capsule.
            .background(Tokens.ButtonTonal, ReleasePillShape)
            .padding(horizontal = 14.dp, vertical = 7.dp)
            .clearAndSetSemantics { },
    )
}

/** The release pill's face (iOS's ReleasePill: radius 14, seed 83). */
private val ReleasePillShape = WobRectShape(14.0, 83.0)

/** The web's grip: border-radius 11px 13px 12px 14px. */
private val GripShape = RoundedCornerShape(topStart = 11.dp, topEnd = 13.dp, bottomEnd = 12.dp, bottomStart = 14.dp)
private val GRIP_TOUCH_W = 44.dp
private val GRIP_TOUCH_H = 48.dp

/** How far the docked grip is dragged toward the map to show the pane again. */
private val GRIP_REVEAL = 16.dp

/** The pane sliding in or out. */
private const val PANE_SLIDE_MILLIS = 200

/** CSS's `ease-out`. */
private val EaseOut = CubicBezierEasing(0f, 0f, 0.58f, 1f)
