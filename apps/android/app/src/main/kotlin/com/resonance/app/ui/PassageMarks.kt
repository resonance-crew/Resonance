package com.resonance.app.ui

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.api.models.TapPicked
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.StoryBlock
import kotlin.math.min

/**
 * Where a picked sentence lies in one drawn text of the story (round 29 §P3): src/lib/markdown/passageRange.ts read line
 * by line — the one rule the web's rehype plugin and iOS's story view share, and the cases all three run
 * (test/vectors/passageMarks.json, [com.resonance.app.ui.PassageMarksTest]).
 *
 * 1. Both texts are read with runs of whitespace as one space and trimmed, and a space with a CJK character on either
 *    side of it dropped.
 * 2. The first occurrence in the leaf; where the sentence starts (or ends) with a letter or a digit that is not CJK, the
 *    character before (after) the match must not be one: "at the door" is not inside "that the door".
 * 3. The answer is a range of the leaf's own text in UTF-16 code units (as Kotlin strings count), end exclusive.
 * 4. Not there is null: no wash, never a guess.
 */
internal object PassageRange {
    /** The code points read as CJK (inclusive): passageRange.ts' CJK_RANGES, and the cases file's `cjkRanges`. */
    val CJK_RANGES: List<IntRange> = listOf(
        0x1100..0x11ff, // Hangul Jamo
        0x2e80..0x2fdf, // CJK and Kangxi radicals
        0x2ff0..0x303f, // ideographic description, CJK symbols and punctuation
        0x3040..0x31ff, // kana, Bopomofo, Hangul compatibility jamo, kanbun, strokes, katakana extensions
        0x3200..0x4dbf, // enclosed CJK, compatibility, extension A
        0x4e00..0x9fff, // unified ideographs
        0xa960..0xa97f, // Hangul Jamo extended A
        0xac00..0xd7ff, // Hangul syllables, Jamo extended B
        0xf900..0xfaff, // compatibility ideographs
        0xfe30..0xfe4f, // CJK compatibility forms
        0xff00..0xffef, // half-width and full-width forms
        0x20000..0x3ffff, // extensions B onward
    )

    fun isCjk(cp: Int): Boolean = CJK_RANGES.any { cp in it }

    /** JavaScript's `\s` (with the `u` flag): what passageRange.ts reads as whitespace — Java's isWhitespace leaves out the no-break spaces. */
    private fun whitespace(cp: Int): Boolean = when (cp) {
        0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff -> true
        else -> cp in 0x2000..0x200a
    }

    /** `\p{L}` or `\p{N}`. */
    private fun letterOrDigit(cp: Int): Boolean = Character.isLetter(cp) || when (Character.getType(cp)) {
        Character.DECIMAL_DIGIT_NUMBER.toInt(), Character.LETTER_NUMBER.toInt(), Character.OTHER_NUMBER.toInt() -> true
        else -> false
    }

    /** A letter or a digit that is not CJK: a word's character in a Latin-script match. */
    private fun wordChar(cp: Int): Boolean = !isCjk(cp) && letterOrDigit(cp)

    /** One code point as rule 1 reads a text: what it is, where it starts in the original, how long it is there. */
    private class At(val cp: Int, val at: Int, val len: Int)

    private fun normalized(text: String): List<At> {
        val raw = ArrayList<At>(text.length)
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            val len = Character.charCount(cp)
            if (whitespace(cp)) {
                // A run of whitespace as one space, at its first character.
                if (raw.isNotEmpty() && raw.last().cp != 0x20) raw += At(0x20, i, len)
            } else {
                raw += At(cp, i, len)
            }
            i += len
        }
        while (raw.isNotEmpty() && raw.last().cp == 0x20) raw.removeAt(raw.lastIndex)
        // A space with a CJK character on either side of it dropped.
        return raw.filterIndexed { k, c -> c.cp != 0x20 || !(isCjk(raw.getOrNull(k - 1)?.cp ?: 0) || isCjk(raw.getOrNull(k + 1)?.cp ?: 0)) }
    }

    /** The sentence's range in the leaf's own text (UTF-16, [Span.end] exclusive), or null when the leaf doesn't hold it. */
    fun find(leaf: String, sentence: String): Span? {
        val hay = normalized(leaf)
        val needle = normalized(sentence).map { it.cp }
        if (needle.isEmpty() || needle.size > hay.size) return null
        val edgeStart = wordChar(needle.first())
        val edgeEnd = wordChar(needle.last())
        var s = 0
        while (s + needle.size <= hay.size) {
            var k = 0
            while (k < needle.size && hay[s + k].cp == needle[k]) k++
            if (k == needle.size) {
                val before = hay.getOrNull(s - 1)
                val after = hay.getOrNull(s + needle.size)
                val edgesKept = !(edgeStart && before != null && wordChar(before.cp)) && !(edgeEnd && after != null && wordChar(after.cp))
                if (edgesKept) {
                    val last = hay[s + needle.size - 1]
                    return Span(hay[s].at, last.at + last.len)
                }
            }
            s++
        }
        return null
    }

    /** The first leaf, in the story's order, that holds the sentence, and its range there. */
    fun findIn(leaves: List<String>, sentence: String): Hit? {
        leaves.forEachIndexed { leaf, text -> find(text, sentence)?.let { return Hit(leaf, it.start, it.end) } }
        return null
    }

    data class Span(val start: Int, val end: Int)
    data class Hit(val leaf: Int, val start: Int, val end: Int)
}

/**
 * The story's leaves in its order (§P3): every text drawn as one run — a paragraph, a heading, a paragraph standing
 * alone as a link, a quote's and a list item's paragraphs, a table's cells (its head, then its rows) — as the very
 * lists of runs [com.resonance.design.StoryMarkdown] draws, so a mark finds its leaf by identity.
 */
internal fun storyLeaves(blocks: List<StoryBlock>): List<List<InlineRun>> {
    val out = ArrayList<List<InlineRun>>()
    fun walk(list: List<StoryBlock>) {
        for (b in list) when (b) {
            is StoryBlock.Paragraph -> out += b.runs
            is StoryBlock.Heading -> out += b.runs
            is StoryBlock.SoleLink -> out += b.runs
            is StoryBlock.Quote -> walk(b.children)
            is StoryBlock.ListBlock -> b.items.forEach(::walk)
            is StoryBlock.Table -> {
                b.head.forEach { out += it }
                b.rows.forEach { row -> row.forEach { out += it } }
            }
            else -> Unit
        }
    }
    walk(blocks)
    return out
}

/** A washed sentence: the author's [picked] entry and where it lies ([leaf] of [storyLeaves], [start]–[end]). */
internal data class PassageMark(val picked: TapPicked, val leaf: Int, val start: Int, val end: Int) {
    val id: String get() = picked.id

    /** The faces drawn: at most three, newest first — and nothing after them, ever (§S2: no blank disc, no number). */
    val shown get() = picked.people.take(PASSAGE_FACES_MAX)
}

/** The faces a sentence's group draws at most (§S2; the server's PICKED_FACES_MAX). */
internal const val PASSAGE_FACES_MAX = 3

/**
 * The author's picked sentences as they lie in [blocks] (§P3, §S1.4): each found in the first leaf that holds it, in the
 * story's order (the leaf, then where it starts) — which is also the order of the groups' ids; one not found, or with
 * no one to show, is left out (no wash, no faces).
 */
internal fun passageMarks(blocks: List<StoryBlock>, picked: List<TapPicked>?): List<PassageMark> {
    if (picked.isNullOrEmpty()) return emptyList()
    val leaves = storyLeaves(blocks).map { runs -> runs.joinToString("") { it.text } }
    return picked.mapNotNull { p ->
        if (p.people.isEmpty()) return@mapNotNull null
        PassageRange.findIn(leaves, p.text)?.let { PassageMark(p, it.leaf, it.start, it.end) }
    }.sortedWith(compareBy({ it.leaf }, { it.start }))
}

/** The white right of the column needed for the faces to stand in it (§S1.1). */
internal val PassageMarginMin: Dp = 70.dp

/**
 * The white right of the story's column (§S1.1): to the contents rail when one stands — always its gap,
 * [Tokens.StoryRailGap] — else to the window's edge ([columnEnd], the column's inset at its end).
 */
internal fun passageRoom(railed: Boolean, columnEnd: Dp): Dp = if (railed) Tokens.StoryRailGap.dp else columnEnd

/** Whether the faces stand in the right margin ([room] ≥ 70), or in the line after their sentence. */
internal fun passageInMargin(room: Dp): Boolean = room >= PassageMarginMin

/**
 * A face's size (§S2): 24 × the story's reading scale ([readingScale], [com.resonance.design.readingTextScale]: 36 at the
 * owner's 1.5) — 22 × it for a Latin-script story on a compact window, whose line box is shorter; in the margin
 * ([room]) never more than (room − 14) ÷ 2.32, so the widest group keeps 6 from the rail or the window's edge.
 */
internal fun passageFaceSize(readingScale: Float, latin: Boolean, compact: Boolean, room: Dp? = null): Dp {
    val base = (if (latin && compact) 22f else 24f) * readingScale
    val cap = room?.let { (it.value - 14f) / 2.32f } ?: Float.MAX_VALUE
    return min(base, cap).dp
}

/**
 * What a screen reader says of a sentence's faces (§S2): `card.tap.pickedBy` with the pen names shown, joined with 、 /
 * ", " — `pickedByMore` when there are others.
 */
internal fun passageFacesLabel(mark: PassageMark): String {
    val names = mark.shown.joinToString(if (Strings.language == Strings.Language.ZhTW) "、" else ", ") { it.handle }
    return if (mark.picked.more || mark.picked.people.size > PASSAGE_FACES_MAX) L10n.Card.Tap.pickedByMore(names) else L10n.Card.Tap.pickedBy(names)
}

/** The flows' and the screenshots' name of the [index]th group, in the story's order (§S2). */
internal fun passageFacesTag(index: Int): String = "passage-faces-$index"

/** How long the washes and the groups take to come in when the picks arrive after the story (§S3). */
internal const val PASSAGE_FADE_MILLIS = 150

/**
 * The [marks] as the story draws them ([com.resonance.design.StoryPassages]), or null for none: each leaf of [blocks]
 * holding a sentence, its faces, the place ([inMargin]) and the [face] size; a press on a group or a wash says its id to
 * [onOpen]. Picks that arrive after the story was drawn (an older page shown first) fade in over 150 ms — at once under
 * [reducedMotion], and when the story first comes with them (the screenshots).
 */
@androidx.compose.runtime.Composable
internal fun rememberStoryPassages(
    marks: List<PassageMark>,
    blocks: List<StoryBlock>,
    inMargin: Boolean,
    face: Dp,
    reducedMotion: Boolean,
    onOpen: (String) -> Unit,
): com.resonance.design.StoryPassages? {
    val shown = marks.isNotEmpty()
    val alpha = androidx.compose.runtime.remember { androidx.compose.animation.core.Animatable(if (shown) 1f else 0f) }
    androidx.compose.runtime.LaunchedEffect(shown) {
        when {
            !shown -> alpha.snapTo(0f)
            alpha.value >= 1f -> Unit
            reducedMotion -> alpha.snapTo(1f)
            else -> alpha.animateTo(1f, androidx.compose.animation.core.tween(PASSAGE_FADE_MILLIS))
        }
    }
    if (!shown) return null
    val faces = marks.associate { m -> m.id to m.shown.map { it.groupFace() } }
    val opener = androidx.compose.runtime.rememberUpdatedState(onOpen)
    return androidx.compose.runtime.remember(marks, blocks, faces, inMargin, face) {
        val leaves = storyLeaves(blocks)
        val byLeaf = java.util.IdentityHashMap<List<InlineRun>, List<com.resonance.design.LeafPassage>>()
        marks.groupBy { it.leaf }.forEach { (leaf, ms) -> byLeaf[leaves[leaf]] = ms.map { com.resonance.design.LeafPassage(it.id, it.start, it.end) } }
        val index = marks.withIndex().associate { (i, m) -> m.id to i }
        val labels = marks.associate { it.id to passageFacesLabel(it) }
        com.resonance.design.StoryPassages(
            byLeaf, faces, inLine = !inMargin, face = face,
            label = { id -> labels[id].orEmpty() },
            tag = { id -> androidx.compose.ui.Modifier.flowTag(passageFacesTag(index[id] ?: 0)) },
            onOpen = { id -> opener.value(id) },
            alpha = { alpha.value },
        )
    }
}
