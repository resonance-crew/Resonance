package com.resonance.kit

import com.resonance.kit.story.SharePassages
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * What a share card quotes — native/fixtures/share-passages.json, the cases the web's
 * sharePassages.test.ts writes and iOS's twin reads: paragraphs in reading order (in quotes and list
 * items too) as plain text, headings, code, rules, HTML, pictures, standalone links and card embeds
 * skipped, short lines dropped, the opening cut at 600 graphemes.
 */
class SharePassagesTest {
    private val fixture: JsonObject =
        Json.parseToJsonElement(File(System.getProperty("repoRoot"), "native/fixtures/share-passages.json").readText()).jsonObject

    @Test fun theLimitsAreTheServers() {
        val limits = fixture.getValue("limits").jsonObject
        assertEquals(limits.getValue("readChars").jsonPrimitive.int, SharePassages.READ_CHARS)
        assertEquals(limits.getValue("minGraphemes").jsonPrimitive.int, SharePassages.MIN_GRAPHEMES)
        assertEquals(limits.getValue("max").jsonPrimitive.int, SharePassages.MAX)
        assertEquals(limits.getValue("maxGraphemes").jsonPrimitive.int, SharePassages.MAX_GRAPHEMES)
    }

    @Test fun everyCaseOpensAsOnTheWeb() {
        val cases = fixture.getValue("cases").jsonArray.map { it.jsonObject }
        assertTrue(cases.size >= 15)
        for (case in cases) {
            val id = case.getValue("id").jsonPrimitive.content
            val story = case.getValue("story").jsonPrimitive.content
            assertEquals(case.getValue("opening").jsonPrimitive.content, SharePassages.opening(story), id)
        }
    }

    @Test fun atMostFortyBlocksAreReadAndNoneIsCutBeforeTheOpeningIs() {
        val story = (1..50).joinToString("\n\n") { "第 $it 段，寫得夠長了。" }
        val blocks = SharePassages.blocks(story)
        assertEquals(SharePassages.MAX, blocks.size)
        assertEquals("第 1 段，寫得夠長了。", blocks.first())
        assertEquals("第 40 段，寫得夠長了。", blocks.last())
    }

    @Test fun graphemesAreCountedAsAReaderSeesThem() {
        // A family is one, a flag is one, a combining accent belongs to its letter.
        assertEquals(1, SharePassages.graphemeCount("👨‍👩‍👧‍👦"))
        assertEquals(2, SharePassages.graphemeCount("🇹🇼🇯🇵"))
        assertEquals(1, SharePassages.graphemeCount("é"))
        assertEquals("👨‍👩‍👧‍👦…", SharePassages.cut("👨‍👩‍👧‍👦👨‍👩‍👧‍👦", 1))
        assertEquals("短", SharePassages.cut("短", 1))
    }

    @Test fun aStoryIsReadOnlyToItsFirstTwentyThousandUnitsNeverHalfACharacter() {
        // The 20 000th unit is the first half of an emoji: the read stops before it, and nothing fails.
        val story = "a".repeat(SharePassages.READ_CHARS - 1) + "😀" + "，後面不會被讀到。"
        val opening = SharePassages.opening(story)
        assertTrue(opening.endsWith("…"))
        assertTrue(opening.none { Character.isSurrogate(it) })
    }

    @Test fun onlyACardKeyAfterSlashCardIsAnEmbed() {
        assertEquals("grandmas-plums", SharePassages.cardKeyOfHref("/card/grandmas-plums"))
        assertEquals("a_b", SharePassages.cardKeyOfHref("/card/a%5Fb?x=1"))
        assertNull(SharePassages.cardKeyOfHref("/card/"))
        assertNull(SharePassages.cardKeyOfHref("/card/%E4%B8%AD"))
        assertNull(SharePassages.cardKeyOfHref("/card/%zz"))
        assertNull(SharePassages.cardKeyOfHref("https://resonance.channel/card/x"))
        // A card link inside a sentence is a link, and its words are quoted.
        assertEquals("我讀了外婆的醃梅子三次。", SharePassages.opening("我讀了[外婆的醃梅子](/card/grandmas-plums)三次。"))
    }

    @Test fun theStoryIsReadWithoutGfmAsTheServerReadsIt() {
        // Pictures on two lines of one paragraph are still pictures alone (the line break is text there).
        assertEquals("真的寫得夠長了吧。", SharePassages.opening("![a](x)\n![b](y)\n\n真的寫得夠長了吧。"))
        // A table is a paragraph of pipes without GFM, as the server's opening has it.
        assertEquals("| a | b | |---|---| | 一二三四五六 | 七 |", SharePassages.opening("| a | b |\n|---|---|\n| 一二三四五六 | 七 |"))
    }
}
