package com.resonance.design

import android.graphics.text.LineBreaker
import android.text.Spanned
import android.text.style.MetricAffectingSpan
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.StoryParser
import com.resonance.kit.story.StoryScript
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * The reader sets a story in its type (reading-type §6 and §8): a CJK story's words in Noto Sans
 * TC, tracked, justified (API 35) with strict breaks, under Noto Serif TC headings sized from the
 * body (`#` and `##` alike); a Latin story ragged in DM Sans under Playfair; quotes upright and
 * muted, their headings too; story.css's room between blocks, in the story's own numbers; an
 * apostrophe inside a Latin word in the Latin face; the story's language on its text; and a CJK
 * title broken after its punctuation rather than mid-phrase.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryProseTest {
    @get:Rule val compose = createComposeRule()

    private val cjkPhone = StoryType(StoryScript.Cjk, compact = true)
    private val latinPhone = StoryType(StoryScript.Latin, compact = true)
    private val one = Density(1f, 1f)

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
    }

    @Test fun aCjkStorysWordsAreItsSansTrackedAndJustified() {
        val body = ProseStyle.body(cjkPhone, "zh-TW")
        assertEquals(AppFonts.Family.BodyCJK, body.family)
        assertEquals(Tokens.StorySizeCompact, body.size)
        assertEquals(Tokens.StoryLeadingCompact, body.lineHeight)
        assertEquals(Tokens.StoryTracking, body.tracking)
        assertEquals(Tokens.StoryBold.toInt(), body.boldWeight)
        assertTrue(body.justified)
        assertTrue(body.latinMarks)
        // A quote: the same words, muted and upright.
        val quoted = body.quoted
        assertEquals(Tokens.TextMuted, quoted.color)
        assertFalse(quoted.italic)
        assertEquals(body.size, quoted.size)
        assertTrue(quoted.justified)

        val (layout, _) = buildRichLayout(listOf(InlineRun("每年五月，外婆都會把青梅一顆顆擦乾，排在竹篩上曬。她說梅子要曬過太陽才會甜，人也是。")), body, 320, one)
        // Robolectric runs API 35: justified between characters, its last line natural.
        assertEquals(LineBreaker.JUSTIFICATION_MODE_INTER_CHARACTER, layout.justificationMode)
        assertEquals("zh-TW", layout.paint.textLocale.toLanguageTag())
        assertEquals(Tokens.StoryTracking, layout.paint.letterSpacing, 1e-6f)
    }

    @Test fun aLatinStoryIsRaggedAndUntracked() {
        val body = ProseStyle.body(latinPhone, "en")
        assertEquals(AppFonts.Family.Body, body.family)
        assertEquals(Tokens.StorySizeLatinCompact, body.size)
        assertEquals(0f, body.tracking)
        assertFalse(body.justified)
        assertFalse(body.latinMarks)
        val (layout, _) = buildRichLayout(listOf(InlineRun("What two thousand four hundred meters taught me about slowing down, at last.")), body, 240, one)
        assertEquals(LineBreaker.JUSTIFICATION_MODE_NONE, layout.justificationMode)
    }

    @Test fun headingsAreSizedFromTheBodyAndHashIsAnH2() {
        val h1 = ProseStyle.heading(cjkPhone, 1)
        val h2 = ProseStyle.heading(cjkPhone, 2)
        val h4 = ProseStyle.heading(cjkPhone, 4)
        assertEquals(h2, h1)
        assertEquals(Tokens.StorySizeCompact * Tokens.StoryH2, h2.size, 1e-4f)
        assertEquals(Tokens.StorySizeCompact * Tokens.StoryH3, h4.size, 1e-4f)
        assertEquals(AppFonts.Family.HeadingCJK, h2.family)
        assertEquals(Tokens.StoryHeadingWeight.toInt(), h2.weight)
        assertEquals(Tokens.StoryHeadingTracking, h2.tracking)
        assertTrue(h2.lining)
        assertTrue(h2.balanced)
        // Never justified: a heading stands at its start.
        assertFalse(h2.justified)
        assertEquals(Tokens.StoryHeadingWeightLatin.toInt(), ProseStyle.heading(latinPhone, 2).weight)
        assertEquals(0f, ProseStyle.heading(latinPhone, 2).tracking)
    }

    @Test fun anApostropheInsideALatinWordIsSetInTheLatinFaceInACjkStory() {
        val text = "教練只說：don’t rush."
        val mark = text.indexOf('’')
        val (_, cjk) = buildRichLayout(listOf(InlineRun(text)), ProseStyle.body(cjkPhone), 320, one)
        assertTrue(cjk.getSpans(mark, mark + 1, MetricAffectingSpan::class.java).any { cjk.getSpanStart(it) == mark && cjk.getSpanEnd(it) == mark + 1 })
        // 他’s: a CJK character before it, so no Latin word — the CJK face's own.
        val (_, other) = buildRichLayout(listOf(InlineRun("他’s")), ProseStyle.body(cjkPhone), 320, one)
        assertTrue(other.getSpans(1, 2, MetricAffectingSpan::class.java).none { other.getSpanStart(it) == 1 && other.getSpanEnd(it) == 2 })
        // A Latin story's are its face's already.
        val (_, latin) = buildRichLayout(listOf(InlineRun("don’t")), ProseStyle.body(latinPhone), 320, one)
        assertTrue(latin.getSpans(3, 4, MetricAffectingSpan::class.java).none { latin.getSpanStart(it) == 3 && latin.getSpanEnd(it) == 4 })
    }

    @Test fun inlineCodeIsSmallerAndUntracked() {
        val (layout, spanned) = buildRichLayout(listOf(InlineRun("看 "), InlineRun("code", code = true)), ProseStyle.body(cjkPhone), 320, one)
        val code = (spanned as Spanned).getSpans(2, 6, MetricAffectingSpan::class.java)
        assertTrue(code.isNotEmpty())
        val paint = android.text.TextPaint(layout.paint)
        code.forEach { it.updateMeasureState(paint) }
        assertEquals(layout.paint.textSize * Tokens.StoryCode, paint.textSize, 1e-3f)
        assertEquals(0f, paint.letterSpacing)
    }

    @Test fun aTitleBreaksBetweenItsClauses() {
        assertEquals(listOf("湖中央，", "我看見了知行合一"), TitleClauses.split("湖中央，我看見了知行合一"))
        assertEquals(listOf("跑完 2400 公尺那天"), TitleClauses.split("跑完 2400 公尺那天"))
        assertEquals(listOf("一句話。"), TitleClauses.split("一句話。"))
        // Fits on one line: nothing to break.
        assertEquals(emptyList<Int>(), TitleClauses.breaks(listOf(100f, 200f), 320f))
        // Two lines: after the comma, never inside a clause.
        assertEquals(listOf(1), TitleClauses.breaks(listOf(114f, 228f), 335f))
        // Three clauses on two lines: the more even split, 150 | 140 + 60 (150 + 140 | 60 would leave 290 on one line).
        assertEquals(listOf(1), TitleClauses.breaks(listOf(150f, 140f, 60f), 300f))
        // A clause wider than the line: no clause breaking, the whole title balanced.
        assertNull(TitleClauses.breaks(listOf(80f, 400f), 335f))
    }

    @Test fun aCjkTitleWrapsAfterItsComma() {
        val style = ProseStyle.title(cjkPhone, "zh-TW")
        assertEquals(AppFonts.Family.HeadingCJK, style.family)
        assertEquals(Tokens.StoryTitleCompact, style.size)
        val title = "湖中央，我看見了知行合一"
        // A phone's column at 28: about 11 characters a line, so the title takes two.
        val layout = titleLayout(title, style, 335, one, clauses = true)
        assertEquals(2, layout.lineCount)
        assertEquals("湖中央，", layout.text.subSequence(0, layout.getLineVisibleEnd(0)).toString())
        // A Latin title isn't split by clause.
        val latin = titleLayout("The summer my grandmother taught me", ProseStyle.title(latinPhone), 200, one, clauses = false)
        assertTrue(latin.lineCount >= 2)
    }

    @Test fun theStoryKeepsStoryCssRoomInItsOwnNumbers() {
        val story = StoryParser.parse("第一段，寫一點東西。\n\n第二段，也寫一點。\n\n## 小標\n\n第三段。\n\n> 引用的話\n\n- 一\n- 二")
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.width(320.dp)) { StoryMarkdown(story, cjkPhone, "zh-TW", onOpenUrl = {}) { _, _, _ -> } }
            }
        }
        val first = compose.onNodeWithText("第一段，寫一點東西。").getBoundsInRoot()
        val second = compose.onNodeWithText("第二段，也寫一點。").getBoundsInRoot()
        val heading = compose.onNodeWithText("小標").getBoundsInRoot()
        val third = compose.onNodeWithText("第三段。").getBoundsInRoot()
        // Between paragraphs: 1.3em of the body (17 on a phone).
        assertEquals(cjkPhone.paragraphGap, (second.top - first.bottom).value, 0.6f)
        // Above the h2: its own 2em (it wins over the paragraph's); below it, its 0.6em.
        assertEquals(cjkPhone.headingAbove(2), (heading.top - second.bottom).value, 0.6f)
        assertEquals(cjkPhone.headingBelow(2), (third.top - heading.bottom).value, 0.6f)
        // The heading reads as one, the quote's words are there, each list item once.
        compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)).assertCountEquals(1)
        compose.onNodeWithText("引用的話").getBoundsInRoot()
        compose.onAllNodesWithText("一").assertCountEquals(1)
    }
}
