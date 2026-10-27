package com.resonance.app.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.MutableFloatState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.resonance.design.CappedTextScale
import com.resonance.design.MessageAction
import com.resonance.design.MessageActionSheet
import com.resonance.design.ModalScrim
import com.resonance.design.ReactionTray
import com.resonance.design.ReactionTrayHeight
import com.resonance.design.ReactionTrayWidth
import com.resonance.design.generated.IconName
import com.resonance.design.generated.ReactionId
import com.resonance.design.messageActionsHeight
import com.resonance.design.plainClickable
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.chat.Delivery
import com.resonance.kit.chat.MessageReactions
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * What a press and hold on a message offers (round 16 §3), in this order: when the press was on a link,
 * its two rows first (round 16 review S8: 開啟連結 with the arrow, 複製連結 with the link — no longer the
 * copy glyph twice two rows apart) · 回覆 · 複製 · 收回 (your own, delivered, not a note, within 24 h;
 * asked first) · 檢舉這則訊息 (theirs, delivered: the report flow for that one message) · and for one that
 * didn't go, 重試 and 刪除. The full time is the list's quiet foot.
 */
internal fun messageActions(
    menu: MessageMenu,
    model: ThreadModel,
    opener: LinkOpener,
    context: Context,
    open: (Route) -> Unit,
    reply: () -> Unit,
    unsend: () -> Unit,
    report: () -> Unit,
): List<MessageAction> {
    val message = menu.row.message
    val mine = model.isMine(message)
    val kinds = messageActionKinds(
        // A reply needs a composer to go in: not while you can't write here.
        canReply = message.canReply && model.foot.composes,
        hasText = message.text.isNotEmpty(),
        onLink = menu.link != null,
        canUnsend = MessageReactions.canUnsend(message, model.me),
        canReport = !mine && message.delivery == Delivery.Delivered && !message.isUnsent,
        failed = message.delivery == Delivery.Failed,
    )
    return kinds.map { kind ->
        when (kind) {
            // A card of the site opens in the app, as a tap on the bubble does.
            MessageActionKind.OpenLink -> MessageAction(L10n.Messages.openLink, IconName.ArrowRight) { menu.link?.let { model.openLink(it, opener, open) } }
            MessageActionKind.CopyLink -> MessageAction(L10n.Messages.copyLink, IconName.Link) { menu.link?.let { copyText(context, it) } }
            MessageActionKind.Reply -> MessageAction(L10n.Messages.reply, IconName.Reply) { reply() }
            MessageActionKind.Copy -> MessageAction(L10n.Native.copy, IconName.Copy) { copyText(context, message.text) }
            MessageActionKind.Unsend -> MessageAction(L10n.Messages.unsend, IconName.Restore) { unsend() }
            MessageActionKind.Report -> MessageAction(L10n.Safety.reportThisMessage, IconName.Flag) { report() }
            MessageActionKind.Retry -> MessageAction(L10n.Messages.retry, IconName.Send) { model.retry(message.key) }
            MessageActionKind.Discard -> MessageAction(L10n.Messages.discardFailed, IconName.Trash, destructive = true) { model.discard(message.key) }
        }
    }
}

/** The rows a held message's action list can have ([messageActionKinds] orders them). */
internal enum class MessageActionKind { OpenLink, CopyLink, Reply, Copy, Unsend, Report, Retry, Discard }

/**
 * The held message's rows, in order: the link's two first when the press was on one ([onLink]), then
 * 回覆 · 複製 · 收回 · 檢舉這則訊息 · 重試 · 刪除 as each applies.
 */
internal fun messageActionKinds(
    canReply: Boolean,
    hasText: Boolean,
    onLink: Boolean,
    canUnsend: Boolean,
    canReport: Boolean,
    failed: Boolean,
): List<MessageActionKind> = buildList {
    if (onLink) {
        add(MessageActionKind.OpenLink)
        add(MessageActionKind.CopyLink)
    }
    if (canReply) add(MessageActionKind.Reply)
    if (hasText) add(MessageActionKind.Copy)
    if (canUnsend) add(MessageActionKind.Unsend)
    if (canReport) add(MessageActionKind.Report)
    if (failed) {
        add(MessageActionKind.Retry)
        add(MessageActionKind.Discard)
    }
}

/** Puts [text] on the clipboard; Android 13 and later say so themselves. */
private fun copyText(context: Context, text: String) {
    context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("message", text))
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) Toast.makeText(context, L10n.Messages.copied, Toast.LENGTH_SHORT).show()
}

/** The tray stands this far over the lifted message, the list this far under it; both 12 from the window's edges. */
internal val TrayGap = 8.dp
internal val ListGap = 10.dp
internal val OverlayMargin = 12.dp
/** The least of a message shown when it is too tall for the room: past this it is clipped, its foot fading over 24. */
private val ClippedFade = 24.dp
private val ClippedLeast = 48.dp

/**
 * Where the held message goes so that the tray is right above it and the list right under it (round 16
 * §3: the menus never move round the message — the message moves). All px, in the overlay's frame.
 * [top]/[bottom] are the message where it lies; [safeTop]/[safeBottom] the room (the window less 12
 * margins, the bars and the keyboard). Both fitting round it where it is, nothing moves; else it moves
 * the least that fits both — up when the list would run off the bottom, down when the tray would run
 * off the top. A message too tall for the room left is shown from its top, clipped to [Placement.shown].
 */
internal fun placeHeldMessage(
    top: Int,
    bottom: Int,
    tray: Int,
    trayGap: Int,
    list: Int,
    listGap: Int,
    safeTop: Int,
    safeBottom: Int,
    least: Int = 0,
): HeldPlacement {
    val height = bottom - top
    val above = if (tray > 0) tray + trayGap else 0
    val below = listGap + list
    val room = safeBottom - safeTop
    if (above + height + below > room) {
        val shown = (room - above - below).coerceAtLeast(least)
        val messageTop = safeTop + above
        return HeldPlacement(messageTop - top, shown, messageTop - above, messageTop + shown + listGap)
    }
    var shift = 0
    if (top - above < safeTop) shift = safeTop - (top - above)
    if (bottom + shift + below > safeBottom) shift = safeBottom - below - bottom
    val messageTop = top + shift
    return HeldPlacement(shift, null, messageTop - above, messageTop + height + listGap)
}

/** [placeHeldMessage]'s answer: how far the message glides ([shift]), its height when clipped ([shown]), and the tray's and the list's tops. */
internal data class HeldPlacement(val shift: Int, val shown: Int?, val trayTop: Int, val listTop: Int)

/** The tray's left edge: flush with the message's side (yours: right edges; theirs: left edges), 12 from the window's edges. */
internal fun trayLeft(mine: Boolean, left: Int, right: Int, tray: Int, width: Int, margin: Int): Int {
    val x = if (mine) right - tray else left
    return x.coerceIn(margin, (width - margin - tray).coerceAtLeast(margin))
}

/** What the held message's tray offers: the viewer's own reaction (null: none) and what choosing does. */
internal class TrayOffer(val chosen: ReactionId?, val choose: (ReactionId) -> Unit)

/**
 * A message pressed and held (round 16 §3): the thread dims under the scrim and the message is lifted
 * where it lies — its bubble drawn again, all it carries, at 1.03 on a spring (the "selected" signal; their
 * face beside it stays in the thread under the scrim, round 17 review D3) — with the
 * five reactions floating right above it, no paper under them ([ReactionTray], when [tray] offers them)
 * and the actions on the menu sheet right under it ([MessageActionSheet]), both flush with its side.
 * When they don't fit round it the message glides (220 ms) the least that fits ([placeHeldMessage]);
 * one too tall is clipped from its top with a 24 fade at its foot. A reaction chosen: the selection
 * tick, the chip pops onto the bubble, and the overlay goes 150 ms later (its ink shown).
 *
 * The scrim itself is the screen's to draw (round 17 §2.1: over the thread's body only — from the foot of
 * the thread's bar down, the composer included — never the bar, the conversations or the rule between),
 * as far up as [over] says; this layer only takes the taps beside what it lifted, the bar's too, which
 * close it. [regionTop] is where that body starts (px, from this layer's top): the tray and the list
 * keep 12 under it as they keep 12 over the window's foot.
 */
@Composable
internal fun MessageMenuOverlay(
    menu: MessageMenu,
    ctx: ThreadContext,
    actions: List<MessageAction>,
    footer: String,
    tray: TrayOffer?,
    onDismiss: () -> Unit,
    /** How far the overlay is up (0…1), for the screen to draw its scrim and soften what lies under it (round 16 review F8). */
    over: MutableFloatState? = null,
    /** Where the thread's body starts under its bar (px from this layer's top); null: under the status bar. */
    regionTop: Int? = null,
) {
    val message = menu.row.message
    val mine = ctx.model.isMine(message)
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val reduced = LocalContext.current.prefersReducedMotion()
    // The scrim, the lifted message and its sheets come and go together.
    val appear = remember { Animatable(0f) }
    val lift = remember { Animatable(1f) }
    val glide = remember { Animatable(0f) }
    var leaving by remember { mutableStateOf(false) }
    var choosing by remember { mutableStateOf(false) }
    val dismiss: () -> Unit = {
        if (!leaving) {
            leaving = true
            // The message settles back into its place as the scrim lifts, and the thread's own takes over.
            scope.launch { lift.animateTo(1f, tween(120)) }
            scope.launch { glide.animateTo(0f, tween(120)) }
            scope.launch {
                appear.animateTo(0f, tween(120))
                onDismiss()
            }
        }
    }
    BackHandler(onBack = dismiss)
    LaunchedEffect(Unit) { appear.animateTo(1f, tween(150)) }
    if (over != null) {
        LaunchedEffect(over) { snapshotFlow { appear.value }.collect { over.floatValue = it } }
        DisposableEffect(over) { onDispose { over.floatValue = 0f } }
    }
    LaunchedEffect(Unit) { lift.animateTo(1.03f, spring(dampingRatio = 0.55f, stiffness = 520f)) }

    val density = LocalDensity.current
    val topInset = WindowInsets.statusBars.getTop(density)
    val bottomInset = max(WindowInsets.navigationBars.getBottom(density), WindowInsets.ime.getBottom(density))
    var origin by remember { mutableStateOf<Offset?>(null) }
    // The message as the thread holds it now (a reaction chosen here shows on the lifted copy too).
    val row = ctx.model.find(message.id)?.let { menu.row.copy(message = it) } ?: menu.row
    // A popup would be a window of its own with the system's whole text scale; this lies in the screen's, which has the capped one.
    BoxWithConstraints(Modifier.fillMaxSize().onGloballyPositioned { origin = it.positionInRoot() }) {
        val screenW = constraints.maxWidth
        val screenH = constraints.maxHeight
        val margin = with(density) { OverlayMargin.roundToPx() }
        val trayH = if (tray != null) with(density) { ReactionTrayHeight.roundToPx() } else 0
        val trayW = with(density) { ReactionTrayWidth.roundToPx() }
        val listH = with(density) { messageActionsHeight(actions.size).roundToPx() }
        val at = origin ?: Offset.Zero
        val left = (menu.bounds.left - at.x).toInt()
        val right = (menu.bounds.right - at.x).toInt()
        val top = (menu.bounds.top - at.y).toInt()
        val bottom = (menu.bounds.bottom - at.y).toInt()
        val place = placeHeldMessage(
            top, bottom, trayH, with(density) { TrayGap.roundToPx() }, listH, with(density) { ListGap.roundToPx() },
            safeTop = (regionTop ?: topInset) + margin, safeBottom = screenH - bottomInset - margin, least = with(density) { ClippedLeast.roundToPx() },
        )
        LaunchedEffect(place.shift, origin != null) {
            if (origin == null || leaving) return@LaunchedEffect
            if (reduced) glide.snapTo(place.shift.toFloat()) else glide.animateTo(place.shift.toFloat(), tween(GLIDE_MILLIS, easing = FastOutSlowInEasing))
        }
        // A tap beside what is lifted — on the dimmed thread, or on the bar left sharp above it — closes it.
        Box(Modifier.fillMaxSize().plainClickable(onClick = dismiss))
        if (origin == null) return@BoxWithConstraints
        CappedTextScale {
            val fade = with(density) { ClippedFade.toPx() }
            Box(
                Modifier
                    .offset { IntOffset(left, top + glide.value.roundToInt()) }
                    .requiredWidth(with(density) { (right - left).toDp() })
                    .then(if (place.shown != null) Modifier.height(with(density) { place.shown.toDp() }).clipToBounds() else Modifier)
                    .graphicsLayer {
                        scaleX = lift.value
                        scaleY = lift.value
                        transformOrigin = TransformOrigin(if (mine) 1f else 0f, 0.5f)
                        if (place.shown != null) compositingStrategy = CompositingStrategy.Offscreen
                    }
                    .then(
                        if (place.shown == null) Modifier
                        else Modifier.drawWithContent {
                            drawContent()
                            // Too tall for the room: its foot fades out over 24.
                            drawRect(
                                Brush.verticalGradient(listOf(Color.Black, Color.Transparent), startY = size.height - fade, endY = size.height),
                                topLeft = Offset(0f, size.height - fade), size = Size(size.width, fade), blendMode = BlendMode.DstIn,
                            )
                        },
                    ),
            ) {
                Box(Modifier.wrapContentHeight(Alignment.Top, unbounded = true)) { MessageCore(row, ctx, interactive = false) }
            }
            // The bubble alone is lifted (round 17 review D3): their face stays in the thread, under the scrim, as on
            // iOS and the web.

            if (tray != null) {
                val x = trayLeft(mine, left, right, trayW, screenW, margin)
                Box(
                    Modifier
                        .offset { IntOffset(x, place.trayTop + (glide.value - place.shift).roundToInt()) }
                        .graphicsLayer {
                            alpha = appear.value
                            transformOrigin = TransformOrigin(if (mine) 1f else 0f, 1f)
                            val s = 0.94f + 0.06f * appear.value
                            scaleX = s
                            scaleY = s
                        },
                ) {
                    ReactionTray(
                        tray.chosen,
                        label = { L10n.Messages.reactWith(reactionName(it)) },
                        removeLabel = L10n.Messages.removeReaction,
                        groupLabel = L10n.Messages.reactionsLabel,
                        onChoose = { id ->
                            if (!choosing) {
                                choosing = true
                                haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                                tray.choose(id)
                                scope.launch {
                                    delay(CHOSEN_LINGER_MILLIS)
                                    dismiss()
                                }
                            }
                        },
                        seed = seedFromMessage(message.key) + 3,
                    )
                }
            }

            Box(
                Modifier
                    .offset { IntOffset(0, place.listTop + (glide.value - place.shift).roundToInt()) }
                    .fillMaxWidth()
                    .padding(
                        start = if (mine) margin.pxToDp(density) else max(left, margin).pxToDp(density),
                        end = if (mine) max(screenW - right, margin).pxToDp(density) else margin.pxToDp(density),
                    )
                    .graphicsLayer {
                        alpha = appear.value
                        transformOrigin = TransformOrigin(if (mine) 1f else 0f, 0f)
                        val s = 0.94f + 0.06f * appear.value
                        scaleX = s
                        scaleY = s
                    },
                contentAlignment = if (mine) Alignment.TopEnd else Alignment.TopStart,
            ) {
                MessageActionSheet(
                    actions, footer, seed = seedFromMessage(message.key),
                    onChoose = { action ->
                        if (!choosing) {
                            choosing = true
                            scope.launch {
                                // A tap is shorter than the ink's spread: the sheet stays long enough to show it.
                                delay(CHOSEN_LINGER_MILLIS)
                                dismiss()
                                action.onClick()
                            }
                        }
                    },
                )
            }
        }
    }
}

/** The held message's glide, and how long the overlay stays after a choice (its ink shown). */
private const val GLIDE_MILLIS = 220
private const val CHOSEN_LINGER_MILLIS = 150L

private fun Int.pxToDp(density: androidx.compose.ui.unit.Density) = with(density) { toDp() }

private fun seedFromMessage(key: String): Double = com.resonance.design.seedFromId(key, 23)
