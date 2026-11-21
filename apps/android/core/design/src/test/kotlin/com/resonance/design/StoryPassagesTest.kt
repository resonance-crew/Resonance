package com.resonance.design

import android.text.SpannableStringBuilder
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Density
import com.resonance.kit.story.InlineRun
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.GraphicsMode

/**
 * A picked sentence in a laid-out line of the story (round 29 §U2, §S1): its wash one piece a line, the line box less 6;
 * in the line, its group's room right after its last character and glued to it — at every width the two stand on one
 * line, and no line grows taller; in the margin, past the column, a later group sharing a line moved down a line box.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryPassagesTest {
    private val one = Density(1f, 1f)
    private val style = ProseStyle(AppFonts.Family.BodyCJK, 17f, 400, 1.8f, Color.Black, latinMarks = true, lang = "zh-TW")
    private val lineBox = 17f * 1.8f

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
    }

    private val words = "箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。窗外有人在慢慢地收衣服。"
    private val runs = listOf(InlineRun("箱子堆滿了客廳，"), InlineRun("我坐在地上", bold = true), InlineRun("，第一次覺得安靜是屬於自己的。"), InlineRun("窗外有人在慢慢地收衣服", link = "https://example.com/"), InlineRun("。"))
    private val sentence = LeafPassage("a", 8, 28)

    private fun laid(width: Int, inLine: Boolean, leaf: List<LeafPassage> = listOf(sentence), room: Int = 60) =
        buildRichLayout(runs, style, width, one) { t -> markPassages(t, leaf, inLine) { room } }

    @Test fun inTheLineTheGroupIsGluedToTheSentencesLastCharacterAtEveryWidth() {
        for (width in 120..420 step 3) {
            val (layout, spanned) = laid(width, inLine = true)
            val text = spanned.toString()
            // The room right after 「。」, the word joiner first.
            assertEquals(StoryPassages.PLACEHOLDER, text.substring(28, 30))
            assertEquals(words.length + 2, text.length)
            val group = spanned.getSpans(0, spanned.length, PassageGroupSpan::class.java).single()
            assertEquals(28, spanned.getSpanStart(group))
            // Never parted from it by a break: it never begins a line alone.
            assertEquals("at $width", layout.getLineForOffset(27), layout.getLineForOffset(28))
            // No line taller than the story's line box: the faces fit inside it.
            for (line in 0 until layout.lineCount) assertEquals(lineBox, (layout.getLineBottom(line) - layout.getLineTop(line)).toFloat(), 1f)
            val (washes, spots) = passagePlaces(layout, spanned, inLine = true, reachPx = 2f, shortPx = 6f, gapPx = 4f, marginPx = 8f)
            // The group 4 into its room, centred on its line's box.
            val line = layout.getLineForOffset(28)
            assertEquals(layout.getPrimaryHorizontal(28) + 4f, spots.single().left, 0.5f)
            // The room as wide as asked: the next word starts 60 on, where it shares the line.
            if (layout.getLineForOffset(30) == line) assertEquals(layout.getPrimaryHorizontal(28) + 60f, layout.getPrimaryHorizontal(30), 1f)
            assertEquals((layout.getLineTop(line) + layout.getLineBottom(line)) / 2f, spots.single().centre, 0.5f)
            // A piece of wash for each line the sentence runs on, the line box less 6.
            assertEquals(layout.getLineForOffset(27) - layout.getLineForOffset(8) + 1, washes.size)
            washes.forEach { assertEquals(lineBox - 6f, it.rect.height, 1f) }
        }
    }

    @Test fun theLinkAfterTheSentenceKeepsItsWordsAndNoWaveRunsUnderTheFaces() {
        // A sentence ending inside the link: the link is cut round the room.
        val inLink = LeafPassage("b", 28, 33)
        val (_, spanned) = laid(400, inLine = true, leaf = listOf(inLink))
        val links = spanned.getSpans(0, spanned.length, LinkSpan::class.java).sortedBy { spanned.getSpanStart(it) }
        assertEquals(listOf(28 to 33, 35 to 41), links.map { spanned.getSpanStart(it) to spanned.getSpanEnd(it) })
        assertTrue(links.all { it.url == "https://example.com/" })
    }

    @Test fun inTheMarginNothingMovesAndAGroupSharingALineMovesDownOne() {
        val (plain, _) = buildRichLayout(runs, style, 300, one)
        val two = listOf(LeafPassage("a", 0, 8), LeafPassage("b", 8, 14))
        val (layout, spanned) = laid(300, inLine = false, leaf = two)
        // The words exactly as without: the same text, the same lines.
        assertEquals(words, spanned.toString())
        assertEquals(plain.lineCount, layout.lineCount)
        assertEquals(plain.height, layout.height)
        val (_, spots) = passagePlaces(layout, spanned, inLine = false, reachPx = 2f, shortPx = 6f, gapPx = 4f, marginPx = 8f)
        assertEquals(listOf("a", "b"), spots.map { it.id })
        spots.forEach { assertEquals(300f + 8f, it.left, 0f) }
        assertEquals(lineBox / 2f, spots[0].centre, 1f)
        // Both end on the first line: the later one stands a line box below.
        assertEquals(spots[0].centre + lineBox, spots[1].centre, 1f)
    }

    @Test fun aRangeOutsideTheLeafIsLeftAlone() {
        val text = SpannableStringBuilder(words)
        markPassages(text, listOf(LeafPassage("x", 30, 99)), inLine = true) { 40 }
        assertEquals(words, text.toString())
    }
}
