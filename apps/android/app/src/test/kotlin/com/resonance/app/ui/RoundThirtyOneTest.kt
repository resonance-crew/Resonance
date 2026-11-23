package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.CardDetail
import com.resonance.api.models.CardTap
import com.resonance.api.models.FeedCard
import com.resonance.api.models.TapPassage
import com.resonance.api.models.TapPicked
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.design.LocalWindowLayout
import com.resonance.design.WindowLayout
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.StoryParser
import com.resonance.kit.story.StoryScript
import com.resonance.kit.story.StoryScripts
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

/**
 * Round 31 — the passages in a translation (the owner, 2026-11-23: 「如果我讀翻譯的文章，譬如說中文翻成英文，那我這邊顯示的
 * 清單三句應該也要都翻成英文才對哦……它這個句子還要可以對應回去原本的那個標在畫面上」). §R1: while the story shows in
 * translation the dialog after 共振 offers the card's passages the translation's answer places — the card's order and
 * ids, the translation's words, in its script; a press sends the id; the earlier pick shows chosen. §R2: each picked id
 * the answer places is marked on the translated story, with that piece's words and the same people. No `passages`: as
 * before round 31. The words are the seed's (scripts/seed/pinned.ts: RICH_STORY, RICH_STORY_EN and their passages).
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class RoundThirtyOneTest {
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
        Strings.language = Strings.Language.En
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun person(id: String) = Author(id, id, id.take(2).uppercase(), "oklch(88% 0.08 55)", null, "7", false, null)

    // The card's passages (RICH_STORY_PASSAGES) and the translation's (RICH_STORY_EN_PASSAGES): same ids, the answer's
    // in its own order — the dialog takes the card's.
    private val original = listOf(
        TapPassage("569526aa", "箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。窗外有人在慢慢地收衣服。"),
        TapPassage("85007cbf", "你不是失去了一個家，你是多了一個可以回去的地方。"),
        TapPassage("8684820a", "The quiet after moving out felt like mine — finally."),
    )
    private val english = listOf(
        TapPassage("8684820a", "The quiet after moving out felt like mine — finally."),
        TapPassage("569526aa", "Boxes filled the living room. I sat on the floor and felt, for the first time, that the quiet was mine. Outside, someone was slowly taking in their washing."),
        TapPassage("85007cbf", "You did not lose a home; you gained a place to go back to."),
    )

    private val englishStory = listOf(
        "Boxes filled the living room. I sat on the floor and felt, for the first time, that **the quiet was mine**. Outside, someone was *slowly* taking in their washing.",
        "## The things that couldn’t come along",
        "Some things were left behind the moment I started packing: the old sofa, a cracked mirror, and [an essay I had read many times](https://example.com/essay).",
        "> You did not lose a home;\n> you gained a place to go back to.",
        "The quiet after moving out felt like mine — *finally*.",
    ).joinToString("\n\n")

    private fun faces(mine: Boolean = true, passage: String? = null, options: List<TapPassage>? = original) =
        TapFaces.of(CardTap(mine = mine, faces = if (mine) listOf(person("dora")) else emptyList(), more = false, mayNote = true, passages = options, passage = passage))

    // §R1 — the dialog's rows

    @Test fun inTranslationTheRowsAreTheTranslationsWordsInTheCardsOrderWithItsIds() {
        val rows = offeredPassages(faces(), translated = true, translation = english)
        assertEquals(original.map { it.id }, rows.map { it.id })
        assertEquals(listOf(english[1].text, english[2].text, english[0].text), rows.map { it.text })
        // The original as ever.
        assertEquals(original, offeredPassages(faces(), translated = false, translation = english))
        // Filtered to those the translation places; a piece of an id the card no longer offers is never a row.
        val some = offeredPassages(faces(), true, listOf(english[2], english[0], TapPassage("gone", "Not offered now.")))
        assertEquals(listOf("85007cbf", "8684820a"), some.map { it.id })
        assertEquals(listOf(english[2].text, english[0].text), some.map { it.text })
        // One placed is fewer than the original's two (the web's PASSAGES_MIN): no dialog in translation.
        assertTrue(offeredPassages(faces(), true, listOf(english[2], TapPassage("gone", "Not offered now."))).isEmpty())
        assertFalse(passagesOpenOnPress(true, faces(mine = false), translated = true, translation = listOf(english[2])))
    }

    @Test fun aTranslationThatPlacesNoneOffersNoDialogAsBefore() {
        // An answer with no `passages` (or from before round 31), or none of the card's ids: nothing, as round 27 §U1.9.
        assertTrue(offeredPassages(faces(), translated = true, translation = null).isEmpty())
        assertTrue(offeredPassages(faces(), translated = true, translation = emptyList()).isEmpty())
        assertTrue(offeredPassages(faces(), true, listOf(TapPassage("gone", "Elsewhere."))).isEmpty())
        assertFalse(passagesOpenOnPress(true, faces(mine = false), translated = true))
        assertFalse(passagesOpenOnPress(true, faces(mine = false), translated = true, translation = emptyList()))
        // A card offering fewer than two offers none in any language.
        assertTrue(offeredPassages(faces(options = original.take(1)), true, english).isEmpty())
        // With the answer's passages, a press that turns 共振 on opens it; taking it back still opens nothing.
        assertTrue(passagesOpenOnPress(true, faces(mine = false), translated = true, translation = english))
        assertFalse(passagesOpenOnPress(false, faces(mine = false), translated = true, translation = english))
    }

    @Test fun theRowsAreInTheTranslationsScriptAndTheEarlierPickShowsChosenAndAPressSendsTheId() {
        // The page's script for the dialog: the translation's (a Chinese story read in English takes Latin type).
        assertEquals(StoryScript.Cjk, StoryScripts.storyType("搬家後的第一個安靜夜晚", original.joinToString("") { it.text }).script)
        val script = StoryScripts.storyType("The first quiet night after moving", englishStory).script
        assertEquals(StoryScript.Latin, script)
        val rows = offeredPassages(faces(passage = "85007cbf"), true, english)
        val sent = mutableListOf<String?>()
        compose.setContent {
            CompositionLocalProvider(LocalWindowLayout provides WindowLayout(402.dp)) {
                TapPassages(
                    rows,
                    // The reader's earlier pick, an id: the translation's row of it shows chosen.
                    picked = passagesMarked(null, faces(passage = "85007cbf").passage, fromPress = false),
                    script = script,
                    reducedMotion = true,
                    hold = true,
                    onPick = { sent += it },
                    onDismiss = {},
                )
            }
        }
        compose.onNodeWithText(english[2].text).assertExists()
        compose.onNodeWithText(original[1].text).assertDoesNotExist()
        compose.onNodeWithTag("tap-passage-1").assertIsSelected()
        compose.onNodeWithTag("tap-passage-0").assertIsNotSelected()
        compose.onNodeWithTag("tap-passage-0").performClick()
        compose.waitForIdle()
        // The stored pick stays the original's: the press says the id.
        assertEquals(listOf<String?>("569526aa"), sent)
    }

    // §R2 — the marks

    private val gus = person("gus")
    private val bob = person("bob")
    private val carol = person("carol")
    private val picked = listOf(
        TapPicked("569526aa", original[0].text, listOf(gus, bob), more = false),
        TapPicked("85007cbf", original[1].text, listOf(carol), more = false),
        TapPicked("8684820a", original[2].text, listOf(person("eve")), more = false),
    )

    private fun detail() = CardDetail(
        card = FeedCard(
            id = "rich-story", slug = "rich-story", title = "搬家後的第一個安靜夜晚", excerpt = "…", tags = emptyList(),
            publishedAt = "2026-09-01T08:00:00Z", author = person("alice"), anonymous = false, visibility = FeedCard.Visibility.`public`,
            imageUrl = null, imageLabel = null, accentHue = null, readMinutes = 1, referenceCardId = null, reason = null,
            trashedAt = null, purgeAt = null, restoresTo = null,
        ),
        story = original.joinToString("\n\n") { it.text }, visibility = CardDetail.Visibility.`public`, anonymous = false, resonanceCount = 0,
        coreInsight = null, isOwner = false, referenceCard = null,
        tap = CardTap(mine = false, faces = emptyList(), more = false, mayNote = true, passages = original, picked = picked),
    )

    @Test fun inTranslationEachPickedSentenceIsMarkedOnTheTranslationsPieceWithItsPeople() {
        val blocks = StoryParser.parse(englishStory)
        val marks = passageMarks(blocks, pickedPassages(detail(), original = false, translation = english))
        // All three found in the English story, in its order, with the same ids and people.
        assertEquals(listOf("569526aa", "85007cbf", "8684820a"), marks.map { it.id })
        assertEquals(listOf("gus", "bob"), marks[0].shown.map { it.id })
        assertEquals(listOf("carol"), marks[1].shown.map { it.id })
        // The pop-up's sentence is the translation's words; its people are asked for by the same id.
        assertEquals(english[2].text, marks[1].picked.text)
        val leaves = storyLeaves(blocks).map { runs -> runs.joinToString("") { it.text } }
        assertEquals(english[1].text, leaves[marks[0].leaf].substring(marks[0].start, marks[0].end))
        assertTrue(leaves[marks[1].leaf].substring(marks[1].start, marks[1].end).startsWith("You did not lose a home;"))
    }

    @Test fun aPickedIdTheTranslationLacksIsNotMarkedAndNoPassagesMarksNone() {
        val blocks = StoryParser.parse(englishStory)
        // Only the quote's piece placed: only carol's mark.
        assertEquals(listOf("85007cbf"), passageMarks(blocks, pickedPassages(detail(), false, listOf(english[2]))).map { it.id })
        // No `passages` in the answer: the translated story bare, as before round 31.
        assertNull(pickedPassages(detail(), original = false))
        assertTrue(passageMarks(blocks, pickedPassages(detail(), original = false, translation = null)).isEmpty())
        // The original shown again: the original's marks (its words) as ever, whatever the translation said.
        assertEquals(picked, pickedPassages(detail(), original = true, translation = english))
        // The original's words are not found in the translation (why the translation's pieces are what it marks).
        assertTrue(passageMarks(blocks, picked.take(2)).isEmpty())
    }
}
