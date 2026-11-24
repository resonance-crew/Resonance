package com.resonance.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.ButtonVariant
import com.resonance.design.ModalActionMinWidth
import com.resonance.design.ModalScrollFade
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicModal
import com.resonance.design.scrollFadeUnder
import com.resonance.design.toModalPaperEdges
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * The tap dialogs' family (round 33 — the owner: 「谁共振了」弹窗 … 同家族一并排查; 列表项高亮延伸到左右边缘; 「關閉」与「略過」
 * 固定浮在滚动区底部渐变之上 … 用有颜色的浮动按钮): who resonated (a reader's list, the author's), who picked a sentence, and
 * which passage stayed with you. One shell for the four, the twin of the web's and iOS's:
 *
 * - §Q2: the paper's inset is [TapListInset] (24 top and sides, the house's 32 / 28 elsewhere; 0 at the foot); one scroll region from the paper's left
 *   edge to its right ([toModalPaperEdges]), clipped to its wobble under its pen line (`clipToPaper`), so a row's band
 *   reaches both edges — the rows pad themselves the inset back, their faces and words on the title's edge.
 * - §Q3: the region reaches the paper's foot; the one way out ([exit]) floats over it at the foot's end, its right edge
 *   on the content's, [FloatingExitBottom] above the paper's edge — the design system's tonal small pill
 *   ([OrganicButton] `Tonal`, `small`), never moving with the content. The list's end keeps [FloatingExitRoom] (the
 *   button's height + 16) so the last row scrolls clear of it; a short list is as tall as it is plus that room. The
 *   region's foot fades under the button while there is more below ([scrollFadeUnder]).
 *
 * [cap]: the region's tallest (the passages' min(560, 70 %)); otherwise the window less the modal's margins.
 */
@Composable
internal fun TapListModal(
    onDismiss: () -> Unit,
    title: String,
    seed: Double,
    exit: String,
    maxWidth: Dp,
    exitModifier: Modifier = Modifier,
    regionModifier: Modifier = Modifier,
    cap: Dp? = null,
    scroll: ScrollState = rememberScrollState(),
    content: @Composable ColumnScope.() -> Unit,
) {
    OrganicModal(
        onDismiss, title, seed = seed, closeLabel = exit, maxWidth = maxWidth,
        clipToPaper = true, scrollsItself = true, sideInset = TapListInset, topInset = TapListInset, bottomInset = 0.dp,
    ) {
        Box(Modifier.fillMaxWidth().weight(1f, fill = false)) {
            Column(
                Modifier
                    .toModalPaperEdges(TapListInset)
                    .fillMaxWidth()
                    .then(regionModifier)
                    .then(if (cap != null) Modifier.heightIn(max = cap) else Modifier)
                    .scrollFadeUnder(scroll, ModalScrollFade, FloatingExitRoom)
                    .verticalScroll(scroll)
                    .padding(bottom = FloatingExitRoom),
                content = content,
            )
            OrganicButton(
                exit,
                exitModifier
                    .align(Alignment.BottomEnd)
                    .padding(bottom = FloatingExitBottom)
                    .height(FloatingExitHeight)
                    .widthIn(min = ModalActionMinWidth),
                variant = ButtonVariant.Tonal, small = true, onClick = onDismiss,
            )
        }
    }
}

/** The family's paper inset, top and sides (round 33 §Q2: 28 → 24, 32 → 24 on top — these dialogs only; every other modal keeps 28 / 32). */
internal val TapListInset: Dp = 24.dp

/** The floating way out's height (§Q3: 44, a finger's, as the web's and iOS's). */
internal val FloatingExitHeight: Dp = 44.dp

/** From the paper's bottom edge to the floating button's (§Q3: ~16). */
internal val FloatingExitBottom: Dp = 16.dp

/** The room the list's end keeps under its last row (§Q3: the button's height + 16), the button standing in it. */
internal val FloatingExitRoom: Dp = FloatingExitHeight + FloatingExitBottom

/**
 * How long a press that opens a list of the family waits for its first page before the dialog opens without it (round
 * 32 §P3, round 33 §Q1: one constant for who resonated, the author's list and who picked — the web's `PICKED_HOLD_MS`,
 * iOS's `firstPageWait`).
 */
internal const val TAP_LIST_OPEN_WAIT_MS = 300L

/**
 * Waits until [list]'s first page has answered (or failed), [wait] at most (§Q1): the dialog's first frame then holds
 * the rows it keeps — their quotes and notes too — instead of rows that change its height a moment later.
 */
internal suspend fun awaitFirstPage(list: TapPeople, wait: Long = TAP_LIST_OPEN_WAIT_MS) {
    withTimeoutOrNull(wait) { snapshotFlow { list.loaded || list.failed }.first { it } }
}

/**
 * Reads [list]'s first page and says when its dialog may be drawn (§Q1): once that page has answered, or after
 * [TAP_LIST_OPEN_WAIT_MS] — then with the known faces as its rows ([TapRows]' `expected`).
 */
@Composable
internal fun rememberFirstPageReady(list: TapPeople): Boolean {
    var ready by remember(list) { mutableStateOf(false) }
    LaunchedEffect(list) {
        launch { list.first() }
        awaitFirstPage(list)
        ready = true
    }
    return ready
}
