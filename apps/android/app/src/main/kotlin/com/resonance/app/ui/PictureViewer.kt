package com.resonance.app.ui

import androidx.compose.animation.core.animate
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.ImageLoader
import coil3.compose.AsyncImage
import com.resonance.design.ChatPictureSource
import com.resonance.design.OrganicIcon
import com.resonance.design.OnDarkDisc
import com.resonance.design.OnDarkIconButton
import com.resonance.design.SketchLoader
import com.resonance.design.generated.IconName
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * A picture sent in chat, opened whole (round 7 §4.3): over everything on a dark backdrop, the
 * picture as kept, fitted to the screen — pinched or double-tapped to zoom, moved about once zoomed;
 * swiped down (unzoomed), the system back or the close put it away. One sent from here is its own
 * copy; anyone else's is read with the account's token ([loader]). Nothing to save or share yet.
 */
@Composable
internal fun PictureViewer(picture: ChatPictureSource, loader: ImageLoader?, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        val scope = rememberCoroutineScope()
        val reduced = LocalContext.current.prefersReducedMotion()
        var size by remember { mutableStateOf(IntSize.Zero) }
        var scale by remember { mutableFloatStateOf(1f) }
        var offset by remember { mutableStateOf(Offset.Zero) }
        // How far an unzoomed picture has been pulled down: past a fifth of the screen, letting go puts it away.
        var drop by remember { mutableFloatStateOf(0f) }
        var state by remember { mutableStateOf(Loading.Busy) }
        fun clamp(o: Offset, s: Float): Offset {
            val x = size.width * (s - 1f) / 2f
            val y = size.height * (s - 1f) / 2f
            return Offset(o.x.coerceIn(-x, x), o.y.coerceIn(-y, y))
        }
        val backdrop = (1f - if (size.height > 0) drop / size.height * 1.6f else 0f).coerceIn(0.35f, 1f)
        Box(
            Modifier
                .fillMaxSize()
                .onSizeChanged { size = it }
                .background(Color.Black.copy(alpha = 0.94f * backdrop))
                .pointerInput(Unit) {
                    detectTapGestures(onDoubleTap = { at ->
                        if (scale > 1f) {
                            scale = 1f
                            offset = Offset.Zero
                        } else {
                            scale = DOUBLE_TAP_ZOOM
                            offset = clamp((Offset(size.width / 2f, size.height / 2f) - at) * (DOUBLE_TAP_ZOOM - 1f), DOUBLE_TAP_ZOOM)
                        }
                    })
                }
                .pointerInput(Unit) {
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false)
                        do {
                            val event = awaitPointerEvent()
                            val zoom = event.calculateZoom()
                            val pan = event.calculatePan()
                            if (zoom != 1f || scale > 1f) {
                                scale = (scale * zoom).coerceIn(1f, MAX_ZOOM)
                                offset = clamp(offset + pan, scale)
                                if (zoom != 1f || pan != Offset.Zero) event.changes.forEach { it.consume() }
                            } else if (event.changes.size == 1 && (drop > 0f || (pan.y > 0f && abs(pan.y) > abs(pan.x)))) {
                                drop = (drop + pan.y).coerceAtLeast(0f)
                                event.changes.forEach { it.consume() }
                            }
                        } while (event.changes.any { it.pressed })
                        if (scale <= 1f) {
                            scale = 1f
                            offset = Offset.Zero
                        }
                        if (drop > size.height / 5f) onDismiss()
                        else if (drop > 0f) {
                            val from = drop
                            if (reduced) drop = 0f else scope.launch { animate(from, 0f) { v, _ -> drop = v } }
                        }
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            val model: Any = when (picture) {
                is ChatPictureSource.Local -> picture.bytes
                is ChatPictureSource.Remote -> picture.full
            }
            if (loader != null) AsyncImage(
                model = model, contentDescription = L10n.Messages.attachImage, imageLoader = loader,
                modifier = Modifier.fillMaxSize().graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = offset.x
                    translationY = offset.y + drop
                },
                contentScale = ContentScale.Fit,
                onLoading = { state = Loading.Busy },
                onSuccess = { state = Loading.Done },
                onError = { state = Loading.Failed },
            )
            when (state) {
                Loading.Busy -> SketchLoader(40.dp, Color.White.copy(alpha = 0.8f))
                Loading.Failed -> OrganicIcon(IconName.Image, size = 30.dp, color = Color.White.copy(alpha = 0.7f))
                Loading.Done -> {}
            }
            // The ✕ on its disc of the viewer's dark (round 12 §1–2), the disc's centre 16 + 22 in from the
            // top and end, inside the system bars and a cutout: it reads on a light picture that fills the screen.
            Box(Modifier.align(Alignment.TopEnd).windowInsetsPadding(ViewerCloseInsets).padding(top = ViewerCloseInset, end = ViewerCloseInset)) {
                OnDarkIconButton(IconName.Close, L10n.Native.close, onClick = onDismiss)
            }
        }
    }
}

private enum class Loading { Busy, Done, Failed }

/** The ✕'s disc centre from the top and end edges (round 12 §1–2: 16 + half its 44 on the web), and so its target's inset. */
internal val ViewerCloseCentre = 38.dp
internal val ViewerCloseInset = ViewerCloseCentre - OnDarkDisc.Target / 2

/** What the ✕ keeps clear of: the status bar, a cutout, a navigation bar at the end (landscape). */
private val ViewerCloseInsets: WindowInsets
    @Composable get() = WindowInsets.systemBars.union(WindowInsets.displayCutout).only(WindowInsetsSides.Top + WindowInsetsSides.End)

/** How far a double tap zooms in, and how far a pinch may go. */
private const val DOUBLE_TAP_ZOOM = 2.5f
private const val MAX_ZOOM = 5f
