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
 * - §Q3, round 34 (the owner: 不需要滚动时恢复原本实色 footer … 需要滚动时用浮动 tonal 药丸 + 贴边渐变 … 两种状态按钮相对纸张右下角
 *   位置完全一致): the region reaches the paper's foot (the paper's bottom padding 0, its wobble cutting it) and the one
 *   way out ([exit]) — the design system's tonal small pill ([OrganicButton] `Tonal`, `small`), [FloatingExitHeight]
 *   tall — stands at one place in both states: its right edge on the content's (24 in), its bottom
 *   [FloatingExitBottom] (24) above the paper's. The list's end keeps [FloatingExitRoom] (24 + 44 + 18) under its last
 *   row, the pill standing in it. So:
 *   - content that fits the region's cap (with that room): the classic footer — the content, 18, the pill, 24 — no
 *     fade, nothing over the content (the region can't scroll: [scrollFadeUnder] draws nothing);
 *   - content taller: the region is the cap, scrolls, and fades at its foot down to the paper's border
 *     ([scrollFadeBelowSpan]), the pill floating over the fade at the same coordinates; the last row scrolls clear of it.
 *
 *   Which of the two is decided in the region's one measure pass — the scroll's viewport against its content
 *   ([verticalScroll] sets its `maxValue` there) — and read only when drawing: there is no state that changes the
 *   height after the first frame, and the geometry is the same in both, so nothing moves when content that grows
 *   (顯示更多, a late page) crosses the cap: the dialog only grows, then scrolls.
 *
 * - Round 34 (5): the region reaches the paper's top border too — the paper's top padding 0, the family's 24 the
 *   region's own first room ([TapListInset], inside the scroll) — so the content opens where it did and, scrolled, slides
 *   under the top fade into the border, no band of bare paper above it. [cap] keeps its meaning (the content's tallest
 *   under that 24): the region is at most cap + 24, the paper as tall as before.
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
        clipToPaper = true, scrollsItself = true, sideInset = TapListInset, topInset = 0.dp, bottomInset = 0.dp,
    ) {
        Box(Modifier.fillMaxWidth().weight(1f, fill = false)) {
            Column(
                Modifier
                    .toModalPaperEdges(TapListInset)
                    .fillMaxWidth()
                    .then(regionModifier)
                    .then(if (cap != null) Modifier.heightIn(max = cap + TapListInset) else Modifier)
                    .scrollFadeUnder(scroll, ModalScrollFade, FloatingExitBottom + FloatingExitHeight)
                    .verticalScroll(scroll)
                    .padding(top = TapListInset, bottom = FloatingExitRoom),
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

/** From the paper's bottom edge to the way out's (round 34: the family's 24, as the top and sides — in both states). */
internal val FloatingExitBottom: Dp = 24.dp

/** From the content's end to the way out's top (round 34: the classic footer's 18). */
internal val FloatingExitGap: Dp = 18.dp

/**
 * The room the list's end keeps under its last row (round 34: 24 + 44 + 18), the way out standing in it: the footer
 * when the content fits, the room the last row scrolls into above the floating pill when it doesn't.
 */
internal val FloatingExitRoom: Dp = FloatingExitBottom + FloatingExitHeight + FloatingExitGap

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
