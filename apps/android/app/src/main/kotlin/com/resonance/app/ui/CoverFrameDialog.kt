package com.resonance.app.ui

import android.content.Context
import android.view.InputDevice
import com.resonance.design.prefersReducedMotion
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.COVER_STAGE_MAX
import com.resonance.design.CoverFraming
import com.resonance.design.CropMoveLabels
import com.resonance.design.CropState
import com.resonance.design.FrameCrop
import com.resonance.design.FrameCropStage
import com.resonance.design.ModalActions
import com.resonance.design.ModalGap
import com.resonance.design.ModalTitle
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicImageShape
import com.resonance.design.OrganicModal
import com.resonance.design.OrganicSlider
import com.resonance.design.QuietButton
import com.resonance.design.QuietButtonPadX
import com.resonance.design.cropStageWidth
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n

/** The feed card's cover shape (height ÷ width): the frame a cover is framed in (round 25 §G2.3). */
internal const val COVER_FRAME_RATIO = 0.62f

/** TalkBack's moves on a crop stage (round 25 §G3.8). */
internal val CropMoves: CropMoveLabels
    get() = CropMoveLabels(L10n.Crop.moveUp, L10n.Crop.moveDown, L10n.Crop.moveLeft, L10n.Crop.moveRight)

/** Whether a mouse or a trackpad is attached: the hint then speaks of the wheel, not a pinch (round 25 §G2.3). */
internal fun Context.hasPointer(): Boolean =
    InputDevice.getDeviceIds().any { id ->
        InputDevice.getDevice(id)?.let { !it.isVirtual && (it.supportsSource(InputDevice.SOURCE_MOUSE) || it.supportsSource(InputDevice.SOURCE_TOUCHPAD)) } == true
    }

/**
 * The zoom row under a crop stage (round 25 §G3.3): − · the slider · +, the slider on a multiplying scale (ln z: a
 * slide, a pinch and a wheel are one control) from 1 to [maxZoom], named [label] for TalkBack. At its end 重設
 * (§G3.2), once the picture has [moved]: a quiet word that puts it back at the start (centred, zoom 1), the slider
 * giving it the room — as on iOS (AvatarCrop.swift's CropZoomRow) and the web. The row is [CropZoomRowHeight] tall
 * whether 重設 shows or not, so nothing under it jumps when it appears.
 */
@Composable
internal fun CropZoomRow(
    z: Double,
    maxZoom: Double,
    label: String,
    moved: Boolean,
    enabled: Boolean = true,
    onReset: () -> Unit,
    onZoom: (Double) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = CropZoomRowHeight),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        OrganicIcon(IconName.Minus, size = 16.dp, color = Tokens.TextMuted)
        OrganicSlider(
            FrameCrop.sliderOf(z), { v -> if (enabled) onZoom(FrameCrop.zoomOf(v)) },
            0f..FrameCrop.sliderOf(maxZoom), label,
            Modifier.weight(1f), step = 0.005f,
        )
        OrganicIcon(IconName.Plus, size = 16.dp, color = Tokens.TextMuted)
        if (moved) {
            // Its words hang on the column's end (the quiet button's air pushed out past it, the mirror of a
            // start-aligned one's pull), so they line up with 完成 below.
            QuietButton(
                L10n.Crop.reset, Modifier.offset(x = QuietButtonPadX).testTag(CropResetTag),
                minHeight = CropZoomRowHeight, enabled = enabled, onClick = onReset,
            )
        }
    }
}

/** The zoom row's height, 重設 or not (the small pill 重設 replaced, as iOS's `minHeight: 36`). */
internal val CropZoomRowHeight = 36.dp

/**
 * 放大後才能移動 under the cover's frame (round 33 §Q5), once a drag found no room on its axis at this zoom, until the
 * zoom gives it room. Its line is held whether it shows or not (it only fades), so nothing under the frame jumps.
 */
@Composable
internal fun CropNoRoomHint(shown: Boolean) {
    val still = LocalContext.current.prefersReducedMotion()
    val alpha by animateFloatAsState(if (shown) 1f else 0f, if (still) snap() else tween(160), label = "no-room")
    BasicText(
        L10n.Write.CoverFrame.zoomToMove,
        Modifier
            .padding(top = 8.dp)
            .graphicsLayer { this.alpha = alpha }
            .testTag(CropNoRoomTag)
            .then(if (shown) Modifier.semantics { liveRegion = LiveRegionMode.Polite } else Modifier.clearAndSetSemantics {}),
        style = AppFonts.body(13.5f, lineHeight = 1.5f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center),
    )
}

/** 放大後才能移動's test tag. */
internal const val CropNoRoomTag = "crop-no-room"

/** 重設's test tag. */
internal const val CropResetTag = "crop-reset"

/**
 * 調整封面 (round 25 §G2.3): the house modal over the cover's picture, framed in the feed card's shape (0.62, the
 * cover's own outline), dimmed outside; the hint by input (touch: drag and pinch; a mouse: drag and wheel); the zoom
 * slider with 重設 at its end once something moved; 取消 · 完成. 完成 hands back the frame ([onDone]; null: the centre at zoom 1, as if
 * none) — nothing is uploaded. Opens where [frame] left it.
 */
@Composable
internal fun CoverFrameDialog(photo: ImageBitmap, frame: CoverFraming?, onCancel: () -> Unit, onDone: (CoverFraming?) -> Unit) {
    val context = LocalContext.current
    val pointer = remember(context) { context.hasPointer() }
    val windowHeight = LocalConfiguration.current.screenHeightDp.toFloat()
    var state by remember(photo) { mutableStateOf<CropState?>(null) }
    // Round 33 §Q5: a drag that found no room on its axis — 放大後才能移動 under the frame until the zoom gives it room.
    var pushed by remember(photo) { mutableStateOf(false) }
    OrganicModal(onCancel, L10n.Write.CoverFrame.title, seed = 91.0, closeLabel = L10n.Write.CoverFrame.cancel, maxWidth = 540.dp) {
        BoxWithConstraints {
            val width = cropStageWidth(maxWidth.value, windowHeight, COVER_STAGE_MAX, COVER_FRAME_RATIO).dp
            val fw = width.value - 48f
            val crop = remember(photo, fw) {
                FrameCrop(photo.width.toDouble(), photo.height.toDouble(), fw.toDouble(), (fw * COVER_FRAME_RATIO).toDouble(), CoverFraming.MAX_ZOOM)
            }
            val shown = state ?: crop.stateOf(frame)
            val noRoom = crop.lacksRoom(shown.z)
            LaunchedEffect(noRoom) { if (!noRoom) pushed = false }
            Column(verticalArrangement = Arrangement.spacedBy(ModalGap)) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    ModalTitle(L10n.Write.CoverFrame.title)
                    BasicText(
                        if (pointer) L10n.Write.CoverFrame.hintPointer else L10n.Write.CoverFrame.hintTouch,
                        style = AppFonts.body(13.5f, lineHeight = 1.5f, color = Tokens.TextMuted),
                    )
                }
                Column(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    FrameCropStage(
                        photo, width, COVER_FRAME_RATIO, CoverFraming.MAX_ZOOM, shown, { state = it },
                        L10n.Write.CoverFrame.stage, moves = CropMoves, onBlocked = { pushed = true },
                    ) { _, _ -> OrganicImageShape(91.0) }
                    CropNoRoomHint(pushed && noRoom)
                }
                CropZoomRow(
                    shown.z, CoverFraming.MAX_ZOOM, L10n.Crop.zoom, moved = shown != CropState(),
                    onReset = { state = CropState() },
                ) { z -> state = crop.zoomTo(shown, z) }
                ModalActions(
                    L10n.Write.CoverFrame.cancel, onCancel, L10n.Write.CoverFrame.done,
                    onVerb = { onDone(crop.framing(shown).takeUnless { it.isCentred }) },
                )
            }
        }
    }
}
