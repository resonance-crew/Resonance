package com.resonance.design

import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextPaint
import android.text.style.MetricAffectingSpan
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.kit.story.InlineRun
import java.util.IdentityHashMap
import kotlin.math.max

/** One picked sentence in a leaf of the story (round 29 §P3): [start]–[end] (end exclusive) of the leaf's own text. */
@Immutable
data class LeafPassage(val id: String, val start: Int, val end: Int)

/**
 * The author's picked sentences on their own page (round 29 §S1–§S4), handed to [StoryMarkdown] by the card page alone:
 * each sentence's leaf (found by the very list of runs the story draws: [leaves]), its faces ([faces], at most three,
 * nothing after them), where the groups stand — [inLine] after their sentence, else in the right margin, 8 right of
 * the column — and at what [face] size; what a screen reader says of a group ([label]), its flows' name ([tag]), and
 * what a press on a group or on its sentence's wash opens ([onOpen]). [alpha] is the washes' and groups' fade in
 * (§S3), read while drawing.
 */
@Immutable
class StoryPassages(
    private val leaves: IdentityHashMap<List<InlineRun>, List<LeafPassage>>,
    val faces: Map<String, List<GroupFace>>,
    val inLine: Boolean,
    val face: Dp,
    val label: (String) -> String,
    val tag: (String) -> Modifier,
    val onOpen: (String) -> Unit,
    val alpha: () -> Float,
) {
    /** The sentences that lie in [runs] (a leaf the story draws), or none. */
    fun of(runs: List<InlineRun>): List<LeafPassage> = leaves[runs].orEmpty()

    /** The same, with every group in the line: a table's cells (a margin there would be the next column). */
    fun inLineOnly(): StoryPassages = if (inLine) this else StoryPassages(leaves, faces, true, face, label, tag, onOpen, alpha)

    /** How wide a group of [id]'s faces is at [size]: the house stack's width, no disc after it. */
    fun groupWidth(id: String, size: Dp): Dp = AvatarGroup.width(faces[id].orEmpty().size, size)

    /** Everything a leaf's layout takes from these but its runs: the leaf's sentences, the place, the size, the groups' widths. */
    internal fun keyFor(leaf: List<LeafPassage>): Any = PassagesKey(leaf, inLine, face, leaf.map { faces[it.id].orEmpty().size })

    private data class PassagesKey(val leaf: List<LeafPassage>, val inLine: Boolean, val face: Dp, val counts: List<Int>)

    companion object {
        /** From a sentence's last character to its group in the line, and from the group to the next character (§S1.2). */
        val InLineGap = 4.dp

        /** From the column's right edge to a group in the margin (§S1.1). */
        val MarginGap = 8.dp

        /** How far the wash runs past a piece's first and last glyph (§U2.1). */
        val WashReach = 2.dp

        /** The wash is the line box less this, half above and half below (§U2.1: two lines' pieces never touch). */
        val WashShort = 6.dp

        /** The wash's corners (§U2.1). */
        val WashCorner = 6.dp

        /** A group's least hit area, centred on it (§S2: Android's 48). */
        val Hit = 48.dp

        /**
         * What is put after a sentence for its group in the line: a no-break space — never parted from the character
         * before it (UAX #14 LB12a), stretched to the group's room — then a zero-width space, where a line may break.
         * (A replacement span would not do: the line breaker breaks at every replacement run's edge.)
         */
        internal const val PLACEHOLDER = "\u00A0\u200B"
    }
}

/** A piece of a sentence's wash: one line's, in layout pixels. */
internal data class WashPiece(val id: String, val rect: Rect)

/** Where a sentence's group stands, in layout pixels: its [left] edge and the [centre] of its height. */
internal data class GroupSpot(val id: String, val left: Float, val centre: Float)

/** Marks a sentence's range in the text while placeholders go in after others (the spans move with the text). */
private class PassageRangeSpan(val id: String)

/**
 * The room a group takes in the line (§S1.2), on the placeholder's no-break space: its width and 4 on each side — the
 * space stretched to it — and the line's own height, so the line is as tall as it was.
 */
internal class PassageGroupSpan(val id: String, val widthPx: Int) : MetricAffectingSpan() {
    private fun stretch(tp: TextPaint) {
        tp.letterSpacing = 0f
        tp.textScaleX = 1f
        val space = tp.measureText("\u00A0")
        if (space <= 0f) return
        tp.textScaleX = widthPx / space
        // Once more: a stretched glyph's advance is not quite proportional (its hinting).
        val stretched = tp.measureText("\u00A0")
        if (stretched > 0f) tp.textScaleX *= widthPx / stretched
    }

    override fun updateMeasureState(tp: TextPaint) = stretch(tp)
    override fun updateDrawState(tp: TextPaint) = stretch(tp)
}

/**
 * [leaf]'s sentences marked in [text] (its runs' spans on it), and — [inLine] — a group's room put right after each
 * sentence's last character, glued to it ([StoryPassages.PLACEHOLDER]: never a line break between them), [roomPx] wide
 * for each id. A link running on past the sentence is cut around the room, so its wave never runs under the faces.
 */
internal fun markPassages(text: SpannableStringBuilder, leaf: List<LeafPassage>, inLine: Boolean, roomPx: (String) -> Int) {
    val length = text.length
    val found = leaf.filter { it.start in 0 until it.end && it.end <= length }
    for (p in found) text.setSpan(PassageRangeSpan(p.id), p.start, p.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    if (!inLine) return
    // From the last sentence back, so a room put in never moves where an earlier one goes.
    for (p in found.sortedByDescending { it.end }) {
        val at = text.getSpans(0, text.length, PassageRangeSpan::class.java).firstOrNull { it.id == p.id }?.let(text::getSpanEnd) ?: continue
        val links = text.getSpans(at, at, LinkSpan::class.java).filter { text.getSpanStart(it) < at && text.getSpanEnd(it) > at }
        val cut = links.map { Triple(it, text.getSpanStart(it), text.getSpanEnd(it)) }
        cut.forEach { (span, _, _) -> text.removeSpan(span) }
        text.insert(at, StoryPassages.PLACEHOLDER)
        val after = at + StoryPassages.PLACEHOLDER.length
        cut.forEach { (span, s, e) ->
            text.setSpan(span, s, at, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            text.setSpan(LinkSpan(span.url, span.color), after, e + StoryPassages.PLACEHOLDER.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        text.setSpan(PassageGroupSpan(p.id, roomPx(p.id)), at, at + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
}

/**
 * Where [spanned]'s marked sentences are drawn in [layout] (§U2, §S1): the wash's pieces, one a line — from the first
 * glyph to the last of the line and [reachPx] past each, the line box less [shortPx] — and each group's spot: in the line,
 * [gapPx] into its room; in the margin, [marginPx] right of the column, centred on the line box of the line its wash ends
 * on, a later group sharing that line moving down a line box.
 */
internal fun passagePlaces(layout: Layout, spanned: Spanned, inLine: Boolean, reachPx: Float, shortPx: Float, gapPx: Float, marginPx: Float): Pair<List<WashPiece>, List<GroupSpot>> {
    val ranges = spanned.getSpans(0, spanned.length, PassageRangeSpan::class.java).sortedBy { spanned.getSpanStart(it) }
    val washes = ranges.flatMap { r ->
        linkFragments(
            spanned.getSpanStart(r), spanned.getSpanEnd(r),
            layout::getLineForOffset, layout::getLineStart, layout::getLineVisibleEnd,
            { layout.getPrimaryHorizontal(it) },
            { line, o -> if (o == layout.getLineEnd(line)) layout.getLineRight(line) else layout.getPrimaryHorizontal(o) },
            { layout.getLineBaseline(it).toFloat() },
        ).map { f ->
            val line = layout.getLineForVertical(f.baseline.toInt())
            val top = layout.getLineTop(line) + shortPx / 2
            val bottom = layout.getLineBottom(line) - shortPx / 2
            WashPiece(r.id, Rect(f.left - reachPx, top, f.right + reachPx, bottom))
        }
    }
    val spots = if (inLine) {
        spanned.getSpans(0, spanned.length, PassageGroupSpan::class.java).sortedBy { spanned.getSpanStart(it) }.map { g ->
            val at = spanned.getSpanStart(g)
            val line = layout.getLineForOffset(at)
            // Centred in the room the line gave it (the stretched space may land a pixel or two off what was asked).
            val a = layout.getPrimaryHorizontal(at)
            val b = if (layout.getLineForOffset(at + 1) == line) layout.getPrimaryHorizontal(at + 1) else a + g.widthPx
            GroupSpot(g.id, (a + b) / 2f - (g.widthPx - 2 * gapPx) / 2f, (layout.getLineTop(line) + layout.getLineBottom(line)) / 2f)
        }
    } else {
        var below = Float.NEGATIVE_INFINITY
        ranges.map { r ->
            val line = layout.getLineForOffset(max(spanned.getSpanStart(r), spanned.getSpanEnd(r) - 1))
            val box = (layout.getLineBottom(line) - layout.getLineTop(line)).toFloat()
            val centre = max((layout.getLineTop(line) + layout.getLineBottom(line)) / 2f, below + box)
            below = centre
            GroupSpot(r.id, layout.width + marginPx, centre)
        }
    }
    return washes to spots
}

/**
 * A sentence's group (§S2): the house stack at [size], overlapped, the first face on top, at most three and nothing
 * after them; one button of at least [StoryPassages.Hit] centred on it, said as [StoryPassages.label]. In the line its
 * touch is the text's (a link's own box wins there); in the margin, its own ([clickable]).
 */
@Composable
internal fun PassageGroup(passages: StoryPassages, id: String, size: Dp, clickable: Boolean) {
    val label = passages.label(id)
    Box(
        Modifier
            .then(passages.tag(id))
            .sizeIn(minWidth = StoryPassages.Hit, minHeight = StoryPassages.Hit)
            .graphicsLayer { alpha = passages.alpha() }
            .then(
                if (clickable) Modifier.plainClickable(role = Role.Button) { passages.onOpen(id) }
                else Modifier.semantics {
                    role = Role.Button
                    onClick { passages.onOpen(id); true }
                },
            )
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { AvatarGroup(passages.faces[id].orEmpty(), size = size, reducedMotion = true) }
}
