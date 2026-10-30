package com.resonance.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
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
 * as drawn — sliding up from nothing, standing in for the keyboard at once when it was up, growing with a
 * drag or ↑ to [max] (under the header) and back to [base] (the keyboard's height). Read while laying out,
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

    /**
     * The panel's grid inside it (round 22 §4.1): a scroll up grows the panel first, to [max]; a scroll
     * down at the grid's top brings it back down to [base]. Letting go settles it ([onSettle]).
     */
    fun nested(onSettle: (Stop) -> Unit): NestedScrollConnection = object : NestedScrollConnection {
        override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
            if (source != NestedScrollSource.UserInput || available.y >= 0f || height >= max || max <= 0f) return Offset.Zero
            val grow = minOf(-available.y, max - height)
            dragBy(-grow)
            return Offset(0f, -grow)
        }

        override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
            if (source != NestedScrollSource.UserInput || available.y <= 0f || height <= base) return Offset.Zero
            val shrink = minOf(available.y, height - base)
            dragBy(shrink)
            return Offset(0f, shrink)
        }

        override suspend fun onPreFling(available: Velocity): Velocity {
            if (!held) return Velocity.Zero
            onSettle(settle(available.y, closes = false))
            return available
        }
    }

    private companion object {
        const val PANEL_MILLIS = 220
        const val FLING = 1200f
        const val CLOSE_BELOW = 0.6f
    }
}

/** Whether the window lies on its side (a phone's panel is kept lower there). */
internal fun isLandscape(widthPx: Int, heightPx: Int): Boolean = widthPx > heightPx

/** dp → px. */
internal fun Density.px(dp: Float): Float = dp * density

/**
 * The attach panel (round 22 §4.2), in the keyboard's place: its top edge one hand-drawn pen line with a
 * short wavy grip in its middle — dragged up the panel grows to under the header, dragged down it closes
 * (TalkBack: the grip's actions) — the pictures or the cards, and at its foot the segmented 圖片｜卡片.
 *
 * 圖片 is our own grid of the phone's pictures ([GalleryGrid], §6.2): asked for only once it shows, after
 * a word on why; with some pictures allowed, the rest by 「選擇更多相片」; refused, 「允許讀取相片」 again
 * (or 「前往設定」) and 「改用系統選擇器」, so a picture can always be sent. 卡片 is the viewer's cards
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
    gridScroll: NestedScrollConnection,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize()) {
        PanelGrip(room, onGrip)
        Box(Modifier.fillMaxWidth().weight(1f)) {
            when (tab) {
                AttachTab.Pictures -> GalleryPane(numberOf, gridScroll, onToggle, onSystemPicker)
                AttachTab.Cards -> CardPickPanel(session, onPickCard, Modifier.fillMaxSize())
            }
        }
        SegmentedActionBar(
            listOf(
                tabSegment(AttachTab.Pictures, tab, L10n.Messages.attachImage, IconName.Image, onTab),
                tabSegment(AttachTab.Cards, tab, L10n.Messages.attachCardShort, IconName.Cards, onTab),
            ),
            Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 6.dp, bottom = 8.dp),
            seed = 79.0,
        )
    }
}

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
 * 圖片: the gallery once it may read the phone's pictures, else the word on why with its two ways on. Where
 * the app stands is read again each time the screen comes back (the settings page may have changed it).
 */
@Composable
private fun GalleryPane(numberOf: (String) -> Int?, gridScroll: NestedScrollConnection, onToggle: (Uri) -> Unit, onSystemPicker: () -> Unit) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(GALLERY_PREFS, Context.MODE_PRIVATE) }
    var asked by remember { mutableStateOf(prefs.getBoolean(ASKED_KEY, false)) }
    var reads by remember { mutableIntStateOf(0) }
    val access = remember(asked, reads) { galleryAccess(context, asked) }
    LifecycleResumeEffect(Unit) {
        reads++
        onPauseOrDispose { }
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        prefs.edit().putBoolean(ASKED_KEY, true).apply()
        asked = true
        reads++
    }
    val request = { ask.launch(galleryPermissions()) }
    when (access) {
        GalleryAccess.Full, GalleryAccess.Partial -> GalleryGrid(
            numberOf, partial = access == GalleryAccess.Partial, nested = gridScroll, onToggle = onToggle, onMore = request,
            modifier = Modifier.fillMaxSize(),
        )
        GalleryAccess.NotAsked, GalleryAccess.Denied -> GalleryPrompt(forever = false, onAllow = request, onSystemPicker = onSystemPicker)
        GalleryAccess.DeniedForever -> GalleryPrompt(
            forever = true,
            onAllow = {
                context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            },
            onSystemPicker = onSystemPicker,
        )
    }
}

/** Where the gallery remembers that it has asked (the device's, outside the backup). */
private const val GALLERY_PREFS = "composer"
private const val ASKED_KEY = "gallery.asked"

/** How many more pictures can ride, for the system's picker. */
internal fun picturesLeft(riding: Int): Int = (ChatAlbum.MAX - riding).coerceAtLeast(0)
