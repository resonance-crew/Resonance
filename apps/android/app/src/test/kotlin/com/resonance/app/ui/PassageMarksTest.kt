package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.CardDetail
import com.resonance.api.models.CardTap
import com.resonance.api.models.FeedCard
import com.resonance.api.models.TapPicked
import com.resonance.design.AppFonts
import com.resonance.design.AvatarGroup
import com.resonance.design.Grain
import com.resonance.design.LayoutClass
import com.resonance.design.LocalWindowLayout
import com.resonance.design.StoryMarkdown
import com.resonance.design.StoryType
import com.resonance.design.WindowLayout
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryParser
import com.resonance.kit.story.StoryScript
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.junit.runners.model.Statement
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * The author's picked sentences on their own page (round 29 §P3, §S1, §S2): the one finder the web and iOS share, run
 * on the very cases file they run (test/vectors/passageMarks.json); the sentences found in the story's leaves in its
 * order; the faces' size by the reading scale and the room; the place by the white left of the column — the left
 * margin from 70 (an 820 window; §S10), else in the line glued after the sentence — drawn for real.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PassageMarksTest {
    private val compose = createComposeRule()

    @get:Rule val rules: RuleChain = RuleChain.outerRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                val app = RuntimeEnvironment.getApplication()
                shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
                base.evaluate()
            }
        }
    }.around(compose)

    private val language = Strings.language

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    private val vectors: JsonObject by lazy { Json.parseToJsonElement(File("../../../test/vectors/passageMarks.json").readText()).jsonObject }

    @Test fun theCodePointsReadAsCjkAreTheCasesFiles() {
        val ranges = vectors["cjkRanges"]!!.jsonArray.map { r -> r.jsonArray.let { it[0].jsonPrimitive.int..it[1].jsonPrimitive.int } }
        assertEquals(ranges, PassageRange.CJK_RANGES)
    }

    @Test fun everyCaseOfTheSharedFileFindsWhatTheWebFinds() {
        val cases = vectors["cases"]!!.jsonArray.map { it.jsonObject }
        assertTrue(cases.size >= 10)
        for (c in cases) {
            val name = c["name"]!!.jsonPrimitive.content
            val sentence = c["sentence"]!!.jsonPrimitive.content
            val expect = c["expect"]
            if (c.containsKey("leaves")) {
                val got = PassageRange.findIn(c["leaves"]!!.jsonArray.map { it.jsonPrimitive.content }, sentence)
                if (expect == null || expect is JsonNull) assertNull(name, got)
                else expect.jsonObject.let { e ->
                    assertEquals(name, PassageRange.Hit(e["leaf"]!!.jsonPrimitive.int, e["start"]!!.jsonPrimitive.int, e["end"]!!.jsonPrimitive.int), got)
                }
            } else {
                val got = PassageRange.find(c["leaf"]!!.jsonPrimitive.content, sentence)
                if (expect == null || expect is JsonNull) assertNull(name, got)
                else expect.jsonObject.let { e -> assertEquals(name, PassageRange.Span(e["start"]!!.jsonPrimitive.int, e["end"]!!.jsonPrimitive.int), got) }
            }
        }
    }

    private fun person(id: String) = Author(id, id, id.take(2).uppercase(), "oklch(88% 0.08 55)", null, "7", false, null)
    private val gus = person("gus")
    private val bob = person("bob")
    private val carol = person("carol")

    private val story = """
        箱子堆滿了客廳，**我坐在地上**，第一次覺得安靜是屬於自己的。窗外有人在慢慢地收衣服。

        > 你不是失去了一個家，
        > 你是多了一個可以回去的地方。

        - 把書按照顏色排好
        - 在窗台放一盆薄荷
    """.trimIndent()

    @Test fun theSentencesStandInTheStorysOrderAndOneNotFoundWearsNothing() {
        val blocks = StoryParser.parse(story)
        val picked = listOf(
            // The server's order may differ; the page's is the story's: the leaf, then where it starts.
            TapPicked("b", "你不是失去了一個家，你是多了一個可以回去的地方。", listOf(carol), more = false),
            TapPicked("a", "我坐在地上，第一次覺得安靜是屬於自己的。", listOf(gus, bob), more = false),
            // Across two list items: in neither leaf (§P3.4) — no wash, no faces.
            TapPicked("c", "把書按照顏色排好 在窗台放一盆薄荷", listOf(gus), more = false),
            // No one to show: nothing.
            TapPicked("d", "窗外有人在慢慢地收衣服。", emptyList(), more = true),
        )
        val marks = passageMarks(blocks, picked)
        assertEquals(listOf("a", "b"), marks.map { it.id })
        // The first paragraph's own text, through the bold run; the quote's paragraph is the next leaf.
        assertEquals(PassageMark(picked[1], 0, 8, 28), marks[0])
        assertEquals(1, marks[1].leaf)
        val leaves = storyLeaves(blocks)
        assertTrue(leaves[marks[1].leaf] === ((blocks[1] as StoryBlock.Quote).children[0] as StoryBlock.Paragraph).runs)
        // A list item's paragraphs and a table's cells are leaves too, in the story's order.
        assertEquals(4, leaves.size)
        assertTrue(passageMarks(blocks, null).isEmpty())
    }

    @Test fun onlyTheAuthorsPublishedCardReadersSeeWearsThePicks() {
        val blocks = StoryParser.parse(story)
        val picked = listOf(TapPicked("a", "我坐在地上，第一次覺得安靜是屬於自己的。", listOf(gus, bob), more = false))
        fun detail(
            visibility: FeedCard.Visibility = FeedCard.Visibility.`public`,
            published: Boolean = true,
            owner: Boolean = true,
            trashedAt: String? = null,
        ) = CardDetail(
            card = FeedCard(
                id = "c1", slug = "c1", title = "搬家", excerpt = "…", tags = emptyList(),
                publishedAt = if (published) "2026-09-01T08:00:00Z" else null,
                author = null, anonymous = false, visibility = visibility, imageUrl = null, imageLabel = null,
                accentHue = null, readMinutes = 1, referenceCardId = null, reason = null,
                trashedAt = trashedAt, purgeAt = null, restoresTo = null,
            ),
            story = story, visibility = CardDetail.Visibility.`public`, anonymous = false, resonanceCount = 0,
            coreInsight = null, isOwner = owner, referenceCard = null,
            tap = CardTap(mine = false, faces = emptyList(), more = false, mayNote = false, picked = picked),
        )
        fun marks(d: CardDetail, original: Boolean = true) = passageMarks(blocks, ownPickedPassages(d, original))
        assertEquals(listOf("a"), marks(detail()).map { it.id })
        assertEquals(listOf("a"), marks(detail(FeedCard.Visibility.connections)).map { it.id })
        // Published, then kept private: bare, as on the web and iOS (§U1: never a private card).
        assertTrue(marks(detail(FeedCard.Visibility.`private`)).isEmpty())
        assertTrue(marks(detail(published = false)).isEmpty())
        assertTrue(marks(detail(owner = false)).isEmpty())
        assertTrue(marks(detail(trashedAt = "2026-10-20T00:00:00Z")).isEmpty())
        // A translation showing: the story is not as written.
        assertTrue(marks(detail(), original = false).isEmpty())
    }

    @Test fun atMostThreeFacesAndNothingAfterThemSaidWithAndOthers() {
        val four = TapPicked("a", "x", listOf(gus, bob, carol, person("hana")), more = true)
        val mark = PassageMark(four, 0, 0, 1)
        assertEquals(listOf("gus", "bob", "carol"), mark.shown.map { it.id })
        assertEquals("gus、bob、carol等人對這一段有共鳴", passageFacesLabel(mark))
        assertEquals("gus、bob對這一段有共鳴", passageFacesLabel(PassageMark(TapPicked("b", "x", listOf(gus, bob), false), 0, 0, 1)))
        Strings.language = Strings.Language.En
        assertEquals("This part stayed with gus, bob", passageFacesLabel(PassageMark(TapPicked("b", "x", listOf(gus, bob), false), 0, 0, 1)))
        assertEquals("passage-faces-0", passageFacesTag(0))
    }

    @Test fun aFaceIs24TimesTheReadingScaleCappedInTheMargin() {
        assertEquals(24f, passageFaceSize(1f, latin = false, compact = true).value, 0.01f)
        // The owner's phone at 1.5: 36.
        assertEquals(36f, passageFaceSize(1.5f, latin = false, compact = true).value, 0.01f)
        // A Latin story on a phone: 22.
        assertEquals(22f, passageFaceSize(1f, latin = true, compact = true).value, 0.01f)
        assertEquals(24f, passageFaceSize(1f, latin = true, compact = false).value, 0.01f)
        // With 80 of white left of the column at 1×: 24, three faces 16 from the window's edge; at 1.5 capped to (80 − 14) ÷ 2.32.
        assertEquals(24f, passageFaceSize(1f, latin = false, compact = false, room = 80.dp).value, 0.01f)
        val big = passageFaceSize(1.5f, latin = false, compact = false, room = 80.dp)
        assertEquals(28.45f, big.value, 0.01f)
        assertEquals(16f, 80f - 8f - AvatarGroup.width(3, 24.dp).value, 0.5f)
        assertTrue(8f + AvatarGroup.width(3, big).value <= 80f - 6f + 0.01f)
    }

    @Test fun theLeftMarginFromSeventyOfWhiteLeftOfTheColumnElseTheLine() {
        fun room(width: Dp, rail: Boolean): Dp = passageRoom(WindowLayout(width).cardPage(rail).start)
        // Every phone: the line.
        assertTrue(!passageInMargin(room(390.dp, rail = false)))
        assertTrue(!passageInMargin(room(390.dp, rail = true)))
        // A tablet upright at 820 with no contents: (820 − 680) ÷ 2 = 70 on the left, the margin.
        assertEquals(70f, room(820.dp, rail = false).value, 0.5f)
        assertTrue(passageInMargin(room(820.dp, rail = false)))
        // §S10: the contents rail on the right no longer is the room — it only shifts the column. A turned 1024 tablet
        // whose story has contents keeps under 70 on the left: the line (beside its rail's 80 it stood in the margin).
        assertTrue(room(1024.dp, rail = true).value < 70f)
        assertTrue(!passageInMargin(room(1024.dp, rail = true)))
        // A wide window with contents: what is left of the column, the margin.
        assertEquals(WindowLayout(1280.dp).cardPage(true).start.value, room(1280.dp, rail = true).value, 0f)
        assertTrue(passageInMargin(room(1280.dp, rail = true)))
        // A narrower window with no contents: (768 − 680) ÷ 2 = 44, the line.
        assertTrue(!passageInMargin(room(768.dp, rail = false)))
    }

    private val opened = mutableListOf<String>()

    private fun draw(width: Dp, inMargin: Boolean, blocks: List<StoryBlock>, picked: List<TapPicked>, start: Dp = 20.dp) = compose.setContent {
        CompositionLocalProvider(LocalWindowLayout provides WindowLayout(width)) {
            val marks = passageMarks(blocks, picked)
            val passages = rememberStoryPassages(marks, blocks, inMargin, 24.dp, reducedMotion = true) { opened += it }
            Box(Modifier.padding(start = start).width(300.dp).testTag("story")) {
                StoryMarkdown(blocks, StoryType.of(StoryScript.Cjk, LayoutClass.of(width.value)), "zh-TW", {}, passages = passages) { _, _, _ -> }
            }
        }
    }

    private val one = listOf(TapPicked("a", "我坐在地上，第一次覺得安靜是屬於自己的。", listOf(gus, bob), more = false))

    @Test fun onAPhoneTheFacesStandInTheLineRightAfterTheSentenceAndAPressOpensThem() {
        val blocks = StoryParser.parse(story)
        draw(390.dp, inMargin = false, blocks, one)
        compose.waitForIdle()
        val story = compose.onNodeWithTag("story").getBoundsInRoot()
        val node = compose.onNodeWithTag(passageFacesTag(0), useUnmergedTree = true)
        val b = node.getBoundsInRoot()
        // Inside the column, over the words (its 48 reaching into the lines round it).
        assertTrue("group $b in $story", b.left >= story.left - 1.dp && b.right <= story.right + 1.dp)
        // A button, said as who picked it — what TalkBack activates.
        assertEquals(listOf("gus、bob對這一段有共鳴"), node.fetchSemanticsNode().config.getOrNull(SemanticsProperties.ContentDescription))
        node.performSemanticsAction(SemanticsActions.OnClick)
        assertEquals(listOf("a"), opened)
        // A press on the group's place in the line, through the text: the same.
        compose.onNodeWithTag(passageFacesTag(0), useUnmergedTree = true).performTouchInput { click(center) }
        assertEquals(listOf("a", "a"), opened)
    }

    @Config(qualifiers = "w1280dp-h800dp")
    @Test fun inTheLeftMarginTheFacesEnd8LeftOfTheColumnOnTheLineTheWashBeginsAndTheWashOpensThemToo() {
        val blocks = StoryParser.parse(story)
        draw(1280.dp, inMargin = true, blocks, one, start = 120.dp)
        compose.waitForIdle()
        val story = compose.onNodeWithTag("story").getBoundsInRoot()
        val b = compose.onNodeWithTag(passageFacesTag(0), useUnmergedTree = true).getBoundsInRoot()
        // Its hit area is at least 48, centred on the group: the faces' right edge 8 short of the column's left (§S10).
        val faces = AvatarGroup.width(2, 24.dp).value
        val right = b.right.value - ((b.right - b.left).value - faces) / 2
        assertEquals(story.left.value - 8f, right, 1f)
        // Centred on the line box of the line the wash begins on — 「我坐在地上」 starts on the first line and the
        // sentence ends on the second: the group stands on the first.
        val type = StoryType.of(StoryScript.Cjk, LayoutClass.of(1280f))
        val lineBox = type.bodySize * type.bodyLeading
        assertEquals(story.top.value + lineBox / 2, (b.top.value + b.bottom.value) / 2, 1.5f)
        compose.onNodeWithTag(passageFacesTag(0), useUnmergedTree = true).performClick()
        assertEquals(listOf("a"), opened)
        // The wash under 「我坐在地上…」 (the first line's ninth character on): a press there opens the same people.
        compose.onNodeWithTag("story").performTouchInput { click(Offset(230.dp.toPx(), 14.dp.toPx())) }
        assertEquals(listOf("a", "a"), opened)
    }

    @Test fun withNoPicksTheStoryIsDrawnAsBefore() {
        val blocks = StoryParser.parse(story)
        draw(390.dp, inMargin = false, blocks, emptyList())
        compose.waitForIdle()
        val plain = compose.onNodeWithTag("story").getBoundsInRoot()
        assertEquals(0, compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.TestTag).and(
            SemanticsMatcher("a group") { it.config.getOrNull(SemanticsProperties.TestTag)?.startsWith("passage-faces") == true },
        ), useUnmergedTree = true).fetchSemanticsNodes().size)
        assertTrue((plain.bottom - plain.top).value > 0f)
    }
}
