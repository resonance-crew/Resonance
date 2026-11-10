package com.resonance.app.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.isOutOfBounds
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.LayoutClass
import com.resonance.design.generated.Tokens
import com.resonance.design.toPath
import com.resonance.geometry.PathCommand
import com.resonance.geometry.Pt
import com.resonance.geometry.dividerPath
import com.resonance.geometry.jsRound
import com.resonance.geometry.rowBoundary
import com.resonance.geometry.seedFromString
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max

/**
 * A list's rows parted into bands (round 23 §4/§5, the owner: 「沒有真的一個 border，只是…用這一條有機的曲線分開的
 * 區塊」): no rule between them — each row is the paper between two hand-drawn curves it shares with its neighbours,
 * seen only as the edge of its wash: a finger's press ([PressAlpha], from [PressDelayMs] in, gone the moment the list
 * scrolls) or a pointer over it ([HoverAlpha]); at rest nothing is drawn. The rows touch ([RowPad] above and below each
 * row's content, no gap), a phone's band runs the screen edge to edge, and its curves swing [Amp] about the rows'
 * edges, drawn unclipped. On a tablet the band is cut where the reading column ends, [ContentInset] past the content,
 * its corners rounded [CutRadius] (round 24, part 4, the owner: 「左邊、右邊，它就要這個區塊就要切斷了，這樣延伸到兩邊
 * 好像怪怪的」): a card's piece of the band.
 *
 * Each curve is seeded by the key of the row BELOW it, never by a place in the list: a row arriving on top moves no
 * other curve. A row's top curve is its own key's, its bottom one the next row's — or, above a part's title, that
 * title's key ([bandsBelow]); the list's last row ends on [EndKey]. A part's title sits on bare paper, [TitleClear]
 * clear of the swing above and below it. The web's bell list and iOS's NotificationsScreen are the twins.
 */
internal object ListBands {
    /** How far a band's curve swings about the row's edge: the menu sheets' 2. */
    const val Amp = 2.0

    /** Above and below each row's content; the bands touch (gap 0). */
    val RowPad: Dp = 12.dp

    /** A title between the bands: this much bare paper past the farthest a band's curve can reach. */
    val TitleClear: Dp = 4.dp

    /** A title's own padding toward a band: the curve's swing ([Amp]) and [TitleClear]. */
    val TitleToBand: Dp = (Amp.toFloat() + TitleClear.value).dp

    /** The content's side inset from the band's ends on a phone (and inside a tablet's reading column). */
    val ContentInset: Dp = 20.dp

    /**
     * A band cut at the reading column's sides (a tablet): its corners' radius. The cut's box stands [Amp] and 1 past the
     * row's frame above and below, so the curves keep every swing and only the corners round.
     */
    const val CutRadius = 16.0

    /** A finger held this long on a row before its band shows (a scroll starting sooner shows nothing). */
    const val PressDelayMs = 80L

    /** The pressed band's wash toward the ink, and a hovering pointer's (the same mixes at night). */
    const val PressAlpha = 0.12f
    const val HoverAlpha = 0.06f

    /** Where the last band of the list ends: its bottom curve's key. */
    const val EndKey = "bands:end"

    /** A band's turns across [width] (dp): one every ~100, never fewer than a menu's 4. */
    fun steps(width: Double): Int = max(4, jsRound(width / 100).toInt())

    /** A curve's seed: its key's (the row below it), never its index. */
    fun seed(key: String): Double = seedFromString(key).toDouble()

    /** The curve [key] draws at [y] across a band [w] wide (flat where it meets the band's ends). */
    fun curve(y: Double, w: Double, key: String): List<Pt> = rowBoundary(y, w, seed(key), Amp, 0.0, steps(w))

    /** A row's band, [w] × [h]: its own curve along the top, the one under it ([bottomKey]'s) along the bottom. */
    fun region(w: Double, h: Double, topKey: String, bottomKey: String): List<PathCommand> {
        val top = curve(0.0, w, topKey)
        val back = curve(h, w, bottomKey).reversed()
        return dividerPath(top) + PathCommand.Line(back[0].x, back[0].y) + dividerPath(back).drop(1) + PathCommand.Close
    }

    /**
     * A row's band as drawn, [w] × [h] dp at [density]: [cut], its ends cut at the frame's sides with rounded corners
     * (a tablet's: the frame is the reading column).
     */
    fun path(w: Double, h: Double, topKey: String, bottomKey: String, cut: Boolean, density: Float): Path {
        val band = region(w, h, topKey, bottomKey).toPath(density)
        if (!cut) return band
        val reach = ((Amp + 1) * density).toFloat()
        val radius = (CutRadius * density).toFloat()
        val box = Path().apply {
            addRoundRect(RoundRect(0f, -reach, (w * density).toFloat(), (h * density).toFloat() + reach, CornerRadius(radius, radius)))
        }
        return Path().apply { op(band, box, PathOperation.Intersect) }
    }
}

/** The key of the curve under each row of [keys]: the next row's, and after the last, [after] (a title's key, or the list's end). */
internal fun bandsBelow(keys: List<String>, after: String): List<String> = if (keys.isEmpty()) emptyList() else keys.drop(1) + after

/**
 * How the conversations list is laid out (round 23 §5, the owner: 「手機上私訊頁面左右 margin 減少…僅限於手機」): a phone's
 * rows are bands with their content 20 from each edge, the first row 4 under the bar's foot (its avatar 16 down, level
 * with the notifications' first title); a tablet and the two panes keep the page's 16 / 18 and the pane's own 14, the
 * tab's own gap and the rows' blob.
 */
internal data class ConversationsFrame(
    /** The rows' column inset from the list's edges (the band, or the blob's box). */
    val start: Dp,
    val end: Dp,
    /** Inside it, to the row's content. */
    val rowInset: Dp,
    /** Under the bar's foot to the first row; null keeps the tab's own ([titledBarGap]). */
    val headGap: Dp?,
    /** Bands (a phone) or the hand-drawn blob (a tablet, two panes). */
    val bands: Boolean,
) {
    companion object {
        fun of(cls: LayoutClass): ConversationsFrame =
            if (cls == LayoutClass.Compact) ConversationsFrame(0.dp, 0.dp, ListBands.ContentInset, 4.dp, bands = true)
            else ConversationsFrame(16.dp, 18.dp, 14.dp, null, bands = false)
    }
}

/**
 * The band behind a row: nothing at rest ([rest] when it has one: a chosen row), the press or the pointer's wash
 * filling it between its curves — [cut] at the row's sides on a tablet, where the row is the reading column. The row's
 * own `clickable` keeps the tap; this only watches the finger.
 */
@Composable
internal fun Modifier.listBand(
    topKey: String,
    bottomKey: String,
    source: MutableInteractionSource,
    scrolling: () -> Boolean,
    rest: Color? = null,
    cut: Boolean = false,
): Modifier {
    val hovered by source.collectIsHoveredAsState()
    var pressed by remember { mutableStateOf(false) }
    val press = Tokens.TowardInk.copy(alpha = ListBands.PressAlpha)
    val hover = Tokens.TowardInk.copy(alpha = ListBands.HoverAlpha)
    return this
        .delayedPress(scrolling) { pressed = it }
        .drawWithCache {
            val path = ListBands.path((size.width / density).toDouble(), (size.height / density).toDouble(), topKey, bottomKey, cut, density)
            onDrawBehind {
                if (rest != null) drawPath(path, rest)
                when {
                    pressed -> drawPath(path, press)
                    hovered -> drawPath(path, hover)
                }
            }
        }
}

/**
 * A finger's press as a list's band shows it: on after [delayMs] held still enough; off on lifting, on leaving the
 * row, or the moment the list takes the finger for a scroll (it consumes the move) — so scrolling never flickers.
 * A finger that stops a fling presses nothing. A tap lifted before the delay still shows the band for as long, as
 * a tap's ripple would. It only watches (never consumes), so the row's `clickable` keeps its tap.
 */
@Composable
internal fun Modifier.delayedPress(
    scrolling: () -> Boolean,
    delayMs: Long = ListBands.PressDelayMs,
    onPressed: (Boolean) -> Unit,
): Modifier {
    val isScrolling by rememberUpdatedState(scrolling)
    val report by rememberUpdatedState(onPressed)
    return pointerInput(delayMs) {
        coroutineScope {
            var flash: Job? = null
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                if (isScrolling()) return@awaitEachGesture
                flash?.cancel()
                val shown = launch {
                    delay(delayMs)
                    report(true)
                }
                var tapped = false
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Final)
                    if (event.changes.none { it.pressed }) {
                        tapped = true
                        break
                    }
                    val left = event.changes.any { it.isOutOfBounds(size, extendedTouchPadding) }
                    val taken = event.changes.any { it.isConsumed && it.positionChanged() }
                    if (left || taken || isScrolling()) break
                }
                val held = shown.isCompleted
                shown.cancel()
                if (tapped && !held) {
                    // Lifted before the delay: the band shows for as long, then goes.
                    flash = launch {
                        report(true)
                        delay(delayMs)
                        report(false)
                    }
                } else {
                    report(false)
                }
            }
        }
    }
}
