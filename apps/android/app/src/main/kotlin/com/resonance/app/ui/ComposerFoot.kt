package com.resonance.app.ui

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.resonance.app.Session
import com.resonance.design.PanelGripMark
import com.resonance.design.Segment
import com.resonance.design.SegmentedActionBar
import com.resonance.design.WavyDivider
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.chat.ChatAlbum
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * The room a panel takes under the capsule, in the keyboard's place (round 22 §4.1–4.2), as px: [height]
 * as drawn — sliding up from nothing, standing in for the keyboard at once when it was up, growing with ↑
 * (or the attach panel's grip) to [max] (under the header) and back to [base] (the keyboard's height).
 * Scrolling a panel's grid never moves it (the owner: the grid only scrolls; ↑ is what grows it). Read while laying out,
 * so the thread and the capsule follow it frame by frame without composing again.
 */
@Stable
internal class PanelRoom(private val scope: CoroutineScope, private val still: Boolean) {
    var height by mutableFloatStateOf(0f)
        private set
    /** The keyboard's place: what the panel stands at (px). */
    var base by mutableFloatStateOf(0f)
    /** Under the header: the most the panel grows to (px). */
    var max by mutableFloatStateOf(0f)
    /** A finger is moving it (a drag on the grip, a scroll that grows it): nothing animates it meanwhile. */
    var held by mutableStateOf(false)
        private set
    private var job: Job? = null

    /** What the panel's content is laid out at: its height, but never less than [base] (it slides, it doesn't squeeze). */
    val contentHeight: Float get() = maxOf(height, base)

    fun snapTo(target: Float) {
        job?.cancel()
        height = target
    }

    fun animateTo(target: Float, then: () -> Unit = {}) {
        job?.cancel()
        job = scope.launch {
            if (still || abs(height - target) < 1f) height = target
            else animate(height, target, animationSpec = tween(PANEL_MILLIS, easing = FastOutSlowInEasing)) { v, _ -> height = v }
            then()
        }
    }

    /** Moved by [dy] px (positive: down, smaller), within nothing and [max]. */
    fun dragBy(dy: Float) {
        job?.cancel()
        held = true
        height = (height - dy).coerceIn(0f, max)
    }

    /**
     * Let go at [velocity] px/s (positive: down): where it settles — grown ([max]), the keyboard's place
     * ([base]), or, when [closes] and it was pulled well below that, gone. Answers which.
     */
    fun settle(velocity: Float, closes: Boolean): Stop {
        held = false
        val stop = when {
            closes && (height < base * CLOSE_BELOW || (velocity > FLING && height < base)) -> Stop.Closed
            velocity < -FLING -> Stop.Grown
            velocity > FLING -> Stop.Base
            height > (base + max) / 2 -> Stop.Grown
            else -> Stop.Base
        }
        return stop
    }

    enum class Stop { Base, Grown, Closed }

    private companion object {
        const val PANEL_MILLIS = 220
        const val FLING = 1200f
        const val CLOSE_BELOW = 0.6f
    }
}

/**
 * The attach panel (round 22 §4.2), in the keyboard's place: its top edge one hand-drawn pen line with a
 * short wavy grip in its middle — dragged up the panel grows to under the header, dragged down it closes
 * (TalkBack: the grip's actions) — the pictures or the cards, and at its foot the segmented 圖片｜卡片.
 *
 * 圖片 is our own grid of the phone's pictures ([GalleryGrid], §6.2): asked for only once it shows, after
 * one line and 「允許存取」; with some pictures allowed, the rest by 「選擇更多相片」; refused, the system's
 * picker instead, so a picture can always be sent. 卡片 is the viewer's cards
 * ([CardPickPanel]).
 */
@Composable
internal fun AttachPanel(
    session: Session,
    tab: AttachTab,
    onTab: (AttachTab) -> Unit,
    numberOf: (String) -> Int?,
    room: PanelRoom,
    onGrip: (PanelRoom.Stop) -> Unit,
    onToggle: (Uri) -> Unit,
    onSystemPicker: () -> Unit,
    onPickCard: (com.resonance.api.models.FeedCard) -> Unit,
    modifier: Modifier = Modifier,
    /** The card riding with the next message: ticked in 卡片. */
    chosenCard: String? = null,
    /** The navigation bar under the panel: the grid and the list run on under it to the screen's edge, the bar floats over it. */
    navigation: Dp = 0.dp,
) {
    Box(modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            PanelGrip(room, onGrip)
            Box(Modifier.fillMaxWidth().weight(1f)) {
                when (tab) {
                    AttachTab.Pictures -> GalleryPane(numberOf, onToggle, onSystemPicker, bottom = AttachBarRoom + navigation)
                    AttachTab.Cards -> CardPickPanel(session, onPickCard, Modifier.fillMaxSize(), bottom = AttachBarRoom + navigation, chosenId = chosenCard)
                }
            }
        }
        // The halves float over what they show (the owner's notes 6): no band behind them, and a tap beside them is the
        // grid's or the list's — nothing round the bar takes a touch. Smaller than a full-width bar, so it hides less.
        SegmentedActionBar(
            listOf(
                tabSegment(AttachTab.Pictures, tab, L10n.Messages.attachImage, IconName.Image, onTab),
                tabSegment(AttachTab.Cards, tab, L10n.Messages.attachCardShort, IconName.Cards, onTab),
            ),
            Modifier.align(Alignment.BottomCenter).padding(bottom = AttachBarGap + navigation).width(AttachBarWidth),
            seed = 79.0,
            minHeight = AttachBarHeight,
        )
    }
}

/** The floating 圖片｜卡片: this wide and tall, this far over the panel's foot. */
private val AttachBarWidth = 232.dp
private val AttachBarHeight = 40.dp
private val AttachBarGap = 10.dp
/** What the grid and the list keep clear at their foot, so their last row can scroll out from under the bar. */
internal val AttachBarRoom = AttachBarHeight + AttachBarGap * 2

/** The attach panel's two halves. */
internal enum class AttachTab { Pictures, Cards }

@Composable
private fun tabSegment(which: AttachTab, chosen: AttachTab, label: String, icon: IconName, onTab: (AttachTab) -> Unit): Segment {
    val on = which == chosen
    return Segment(
        key = which.name, label = label, icon = icon,
        // The half in view on the accent's solid face, the other on the bar's tonal one.
        fill = if (on) Tokens.ButtonFill else null,
        textColor = if (on) Tokens.Cream else null,
        selected = on,
    ) { onTab(which) }
}

/**
 * The panel's top edge (round 22 §4.2): one pen line across, the short wavy grip on it — a 44-tall band
 * that drags the panel taller or down to close, and offers both to TalkBack.
 */
@Composable
private fun PanelGrip(room: PanelRoom, onGrip: (PanelRoom.Stop) -> Unit) {
    val source = remember { MutableInteractionSource() }
    val dragged by source.collectIsDraggedAsState()
    val drag = rememberDraggableState { dy -> room.dragBy(dy) }
    Box(
        Modifier
            .fillMaxWidth()
            .height(28.dp)
            .draggable(drag, Orientation.Vertical, interactionSource = source, onDragStopped = { v -> onGrip(room.settle(v, closes = true)) })
            .semantics {
                contentDescription = L10n.Messages.panelGrip
                customActions = listOf(
                    CustomAccessibilityAction(L10n.Messages.stickerPanelExpand) { onGrip(PanelRoom.Stop.Grown); true },
                    CustomAccessibilityAction(L10n.Messages.stickerPanelCollapse) { onGrip(PanelRoom.Stop.Base); true },
                    CustomAccessibilityAction(L10n.Safety.Report.close) { onGrip(PanelRoom.Stop.Closed); true },
                )
            },
        contentAlignment = Alignment.TopCenter,
    ) {
        // The pen line along the top, in the fields' quiet pen, and the grip over its middle on the paper.
        WavyDivider(color = Tokens.FieldBorder, seed = 67.0, amp = 1.2, lineWidth = Tokens.Ink, modifier = Modifier.padding(top = 2.dp))
        Box(Modifier.padding(top = 10.dp)) { PanelGripMark(active = dragged) }
    }
}

/**
 * 圖片: the gallery once it may read the phone's pictures, else one line and one button ([GalleryPrompt]):
 * 「允許存取」 asks, and a refusal opens the system's picker straight away — the person tapped it to send a
 * picture; once the system won't ask again, the button is that picker. Where the app stands is read again
 * each time the screen comes back (the settings page may have changed it).
 */
@Composable
private fun GalleryPane(numberOf: (String) -> Int?, onToggle: (Uri) -> Unit, onSystemPicker: () -> Unit, bottom: Dp) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(GALLERY_PREFS, Context.MODE_PRIVATE) }
    var asked by remember { mutableStateOf(prefs.getBoolean(ASKED_KEY, false)) }
    var reads by remember { mutableIntStateOf(0) }
    val access = remember(asked, reads) { galleryAccess(context, asked) }
    LifecycleResumeEffect(Unit) {
        reads++
        onPauseOrDispose { }
    }
    // Asked from the prompt (not 「選擇更多相片」): a refusal goes on to the system's picker.
    var fromPrompt by remember { mutableStateOf(false) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        prefs.edit().putBoolean(ASKED_KEY, true).apply()
        asked = true
        reads++
        // An empty answer is a request cut short (the activity went away), not a refusal.
        if (fromPrompt && result.isNotEmpty() && result.values.none { it }) onSystemPicker()
        fromPrompt = false
    }
    val request = { ask.launch(galleryPermissions()) }
    when (access) {
        GalleryAccess.Full, GalleryAccess.Partial -> GalleryGrid(
            numberOf, partial = access == GalleryAccess.Partial, onToggle = onToggle, onMore = request,
            modifier = Modifier.fillMaxSize(),
            bottom = bottom,
            // A permission answer (more pictures chosen) or a return from settings: the pictures allowed may differ.
            access = reads,
        )
        GalleryAccess.NotAsked, GalleryAccess.Denied -> GalleryPrompt(
            forever = false,
            onAction = {
                fromPrompt = true
                request()
            },
            bottom = bottom,
        )
        GalleryAccess.DeniedForever -> GalleryPrompt(forever = true, onAction = onSystemPicker, bottom = bottom)
    }
}

/** Where the gallery remembers that it has asked (the device's, outside the backup). */
private const val GALLERY_PREFS = "composer"
private const val ASKED_KEY = "gallery.asked"

/** How many more pictures can ride, for the system's picker. */
internal fun picturesLeft(riding: Int): Int = (ChatAlbum.MAX - riding).coerceAtLeast(0)
