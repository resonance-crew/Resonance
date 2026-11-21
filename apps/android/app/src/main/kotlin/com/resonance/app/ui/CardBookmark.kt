package com.resonance.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.AlignmentLine
import androidx.compose.ui.layout.HorizontalAlignmentLine
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import com.resonance.app.Session
import com.resonance.design.LocalToasts
import com.resonance.design.TagPill
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * 收藏 at a story's end (round 28): one state for the card page, read once, drawn where the room puts it
 * ([EndRowLayout.placement]) — the end of the tags' row on a phone ([StoryTagsRow]), the end of the capsule's row on a
 * tablet ([CardViewerActions]). Flipped at once, then written; a refusal puts it back ([write] gives what the server
 * has). [writer] is the account's bookmarks as they are at the press (none signed out: the press does nothing);
 * [onPressed] says it (the haptic, and 收藏到卡片盒了 when saving); [onWrote] tells the session of its own write.
 */
@Stable
class BookmarkToggle internal constructor(
    private val launch: (suspend CoroutineScope.() -> Unit) -> Job,
    private val writer: () -> (suspend (Boolean) -> Boolean)?,
    private val onPressed: (saving: Boolean) -> Unit = {},
    private val onWrote: () -> Unit = {},
) {
    var saved by mutableStateOf(false)
        private set

    /** What the server says, read as the page comes. */
    fun read(now: Boolean) {
        saved = now
    }

    fun toggle(): Job? {
        val write = writer() ?: return null
        // Optimistic, then reconciled with what the write returns.
        val saving = !saved
        saved = saving
        onPressed(saving)
        return launch { saved = runCatching { write(saving) }.onSuccess { onWrote() }.getOrElse { !saving } }
    }
}

/** The card page's 收藏 for [cardId]: read from the account's bookmarks once, as the page comes. */
@Composable
internal fun rememberCardBookmark(session: Session, cardId: String): BookmarkToggle {
    val toasts by rememberUpdatedState(LocalToasts.current)
    val haptic by rememberUpdatedState(LocalHapticFeedback.current)
    val scope = rememberCoroutineScope()
    val toggle = remember(cardId) {
        BookmarkToggle(
            launch = { work -> scope.launch(block = work) },
            writer = { session.bookmarks?.let { bookmarks -> { on: Boolean -> bookmarks.set(cardId, on) } } },
            onPressed = { saving ->
                haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                // Said as it is drawn, as the web does: 收藏到卡片盒了.
                if (saving) toasts.show(L10n.Card.saved)
            },
            onWrote = { session.noteOwnWrite() },
        )
    }
    LaunchedEffect(cardId) { toggle.read(runCatching { session.bookmarks?.isBookmarked(cardId) }.getOrNull() ?: false) }
    return toggle
}

/** Where 收藏's glyph ends in from its box's end on a wide row: centred in its 48, as the byline's ⋯ (a bare 48, its 20 glyph centred). */
internal val BylineGlyphEnd = ((EndRowLayout.BOOKMARK_BOX - 20f) / 2f).dp

/**
 * The tags under a story (§S3): they wrap 8 apart in their own column; on a phone, with a reader's 收藏 ([bookmark]),
 * 收藏 ends their row on the first line ([EndBeside]) — the row stays the tags' height; no tags, 收藏 alone ends it.
 * Wide, or with no 收藏, the tags alone, as before. [tagsModifier] is the tags' own (the puppets' mark).
 */
@Composable
internal fun StoryTagsRow(tags: List<String>, bookmark: BookmarkToggle?, modifier: Modifier = Modifier, tagsModifier: Modifier = Modifier) {
    val pills: @Composable () -> Unit = { tags.forEach { TagPill(it, fill = Tokens.TerracottaLight) } }
    BoxWithConstraints(modifier) {
        if (bookmark != null && EndRowLayout.placement(maxWidth.value) == EndRowPlacement.Phone) {
            EndBeside(
                main = { TagFlow(tagsModifier, content = pills) },
                end = { BookmarkButton(bookmark.saved) { bookmark.toggle() } },
            )
        } else {
            TagFlow(tagsModifier, content = pills)
        }
    }
}

/** A flow's first line's height (px): what [EndBeside] centres its end on. */
internal val FirstLineHeight = HorizontalAlignmentLine { a, b -> minOf(a, b) }

/** The tags' flow: lines 8 apart, pills 8 apart ([EndRowLayout.tagLines]), each line its tallest pill's height; [FirstLineHeight] says the first's. */
@Composable
internal fun TagFlow(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Layout(content, modifier) { measurables, constraints ->
        val gap = 8.dp.roundToPx()
        val max = constraints.maxWidth
        val placeables = measurables.map { it.measure(Constraints(maxWidth = max)) }
        val lines = EndRowLayout.tagLines(placeables.map { it.width }, max, gap)
        val heights = lines.map { line -> line.maxOf { placeables[it].height } }
        val height = if (lines.isEmpty()) 0 else heights.sum() + gap * (lines.size - 1)
        val width = if (constraints.hasBoundedWidth) max else lines.maxOfOrNull { line -> line.sumOf { placeables[it].width } + gap * (line.size - 1) } ?: 0
        layout(width.coerceAtLeast(constraints.minWidth), height.coerceIn(constraints.minHeight, constraints.maxHeight), mapOf(FirstLineHeight to (heights.firstOrNull() ?: 0))) {
            var y = 0
            lines.forEachIndexed { n, line ->
                var x = 0
                line.forEach { i ->
                    placeables[i].place(x, y)
                    x += placeables[i].width + gap
                }
                y += heights[n] + gap
            }
        }
    }
}

/**
 * [main] with [end] at the row's end, [EndRowLayout.BESIDE_GAP] between (§S2, §S3): [main] takes what is left; [end]
 * stands centred on [main]'s first line ([FirstLineHeight], else its whole height) — above and below the row when it is
 * the taller, so the row is [main]'s height (an empty [main]: [end]'s). Heard [main] first, then [end] (§S6).
 */
@Composable
internal fun EndBeside(main: @Composable () -> Unit, end: @Composable () -> Unit, modifier: Modifier = Modifier) {
    Layout(
        contents = listOf(
            { Box(Modifier.semantics { isTraversalGroup = true; traversalIndex = 0f }) { main() } },
            { Box(Modifier.semantics { isTraversalGroup = true; traversalIndex = 1f }) { end() } },
        ),
        modifier = modifier.semantics { isTraversalGroup = true },
    ) { (mains, ends), constraints ->
        val e = ends.first().measure(Constraints())
        val gap = EndRowLayout.BESIDE_GAP.dp.roundToPx()
        val width = constraints.maxWidth
        val m = mains.first().measure(Constraints(maxWidth = (width - e.width - gap).coerceAtLeast(0)))
        val line = m[FirstLineHeight].takeIf { it != AlignmentLine.Unspecified } ?: m.height
        val empty = m.height == 0
        val height = if (empty) e.height else m.height
        layout(width, height) {
            m.place(0, 0)
            e.place(width - e.width, if (empty) 0 else EndRowLayout.besideTop(line, e.height))
        }
    }
}
