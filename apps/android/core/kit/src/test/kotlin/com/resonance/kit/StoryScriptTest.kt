package com.resonance.kit

import com.resonance.kit.story.DraftScript
import com.resonance.kit.story.StoryScript
import com.resonance.kit.story.StoryScripts
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * How a story is set by its script — native/fixtures/story-script.json, the cases the web's
 * script.test.ts and iOS's twin read: CJK against Latin by a CJK character against a word, the
 * language tag, the empty draft by the writer's UI language, the writer's floor and lean, and the
 * apostrophes inside Latin words a CJK story sets in its Latin face.
 */
class StoryScriptTest {
    private val fixture: JsonObject =
        Json.parseToJsonElement(File(System.getProperty("repoRoot"), "native/fixtures/story-script.json").readText()).jsonObject

    private fun script(name: String) = when (name) {
        "cjk" -> StoryScript.Cjk
        "latin" -> StoryScript.Latin
        else -> error("script $name")
    }

    private fun JsonObject.text(key: String) = getValue(key).jsonPrimitive.content

    @Test fun everyCaseIsSetAndTaggedAsOnTheWeb() {
        val cases = fixture.getValue("cases").jsonArray.map { it.jsonObject }
        assertTrue(cases.size >= 10)
        for (case in cases) {
            val id = case.text("id")
            val fallback = case["fallback"]?.let { script(it.jsonPrimitive.content) } ?: StoryScript.Cjk
            val reading = StoryScripts.storyType(case.text("title"), case.text("story"), fallback)
            assertEquals(script(case.text("script")), reading.script, "$id: script")
            val lang = case.getValue("lang").let { if (it is JsonNull) null else it.jsonPrimitive.content }
            assertEquals(lang, reading.lang, "$id: lang")
            // The two halves alone say the same.
            assertEquals(reading.script, StoryScripts.storyScript(case.text("title"), case.text("story"), fallback), id)
            assertEquals(StoryScripts.storyType(case.text("title"), case.text("story")).lang, StoryScripts.storyLang(case.text("title"), case.text("story")), id)
        }
    }

    @Test fun aHintHoldingChineseIsCjkAndALatinOneIsNot() {
        // Round 16 review F6: what a placeholder's lean is decided by.
        assertTrue(StoryScripts.hasCjk("輸入標籤⋯"))
        assertTrue(StoryScripts.hasCjk("Add 標籤"))
        assertTrue(StoryScripts.hasCjk("ひらがな"))
        assertTrue(!StoryScripts.hasCjk("Add a tag…"))
        assertTrue(!StoryScripts.hasCjk("https://example.com"))
        assertTrue(!StoryScripts.hasCjk(""))
    }

    @Test fun anEmptyDraftStartsInItsWritersLanguage() {
        for (case in fixture.getValue("emptyByLocale").jsonArray.map { it.jsonObject }) {
            val locale = case.text("locale")
            val expected = script(case.text("script"))
            assertEquals(expected, StoryScripts.localeScript(locale), locale)
            // …and an empty story set with that fallback reads as it.
            assertEquals(expected, StoryScripts.storyScript("", "", StoryScripts.localeScript(locale)), locale)
        }
        // Any CJK locale is CJK, whatever its region; a language merely starting with the letters isn't.
        assertEquals(StoryScript.Cjk, StoryScripts.localeScript("ja-JP"))
        assertEquals(StoryScript.Cjk, StoryScripts.localeScript("ZH"))
        assertEquals(StoryScript.Latin, StoryScripts.localeScript("zhx"))
        assertEquals(StoryScript.Latin, StoryScripts.localeScript("es"))
    }

    @Test fun theWriterChangesTypeOnlyPastTheFloorAndTheLean() {
        for (case in fixture.getValue("writer").jsonArray.map { it.jsonObject }) {
            val id = case.text("id")
            assertEquals(script(case.text("script")), StoryScripts.writerScript(script(case.text("current")), case.text("title"), case.text("story")), id)
        }
    }

    @Test fun apostrophesInsideLatinWordsAreFoundByTheirUtf16Index() {
        for (case in fixture.getValue("latinMarks").jsonArray.map { it.jsonObject }) {
            val text = case.text("text")
            assertEquals(case.getValue("indices").jsonArray.map { it.jsonPrimitive.int }, StoryScripts.latinMarks(text), text)
        }
        // An index counts UTF-16 units, as the web's does: a letter outside the BMP before it moves it by two.
        assertEquals(listOf(6), StoryScripts.latinMarks("𝐀 don’t"))
    }

    @Test fun theMirrorReadsTheCjkScriptsOneByOne() {
        assertEquals(DraftScript.Han, StoryScripts.draftScript("", "那天早上下著小雨，我站在操場邊。"))
        assertEquals(DraftScript.Kana, StoryScripts.draftScript("朝", "はじめての朝、コーヒーを淹れた。"))
        assertEquals(DraftScript.Hangul, StoryScripts.draftScript("아침", "처음으로 혼자 맞는 아침이었다."))
        assertEquals(DraftScript.Latin, StoryScripts.draftScript("", "The first morning I woke up alone"))
        assertEquals(DraftScript.Other, StoryScripts.draftScript("Утро", "Я впервые проснулся один."))
        assertEquals(DraftScript.Other, StoryScripts.draftScript("", ""))
    }

    @Test fun theMarksCjkTextSharesWithHanCountAsHanAsTheWebsScriptExtensionsDo() {
        // 「」、。・ are Common by Script, Han by Script_Extensions (the web's \p{scx=Han}); ，and …… are neither.
        val m = StoryScripts.measure("「雨」、。・，……")
        assertEquals(6, m.han)
        // …and Kana's and Hangul's too, each set counting them, as the web's measure does (cjk = 6 + 5 + 5).
        assertEquals(16, m.cjk)
        assertEquals(0, m.words)
        // Kana and Hangul share 「」 too, so both count it.
        assertEquals(3, StoryScripts.measure("「あ」").kana)
        assertEquals(3, StoryScripts.measure("「아」").hangul)
        // Ext B and beyond (outside the BMP) are one character each, not two units.
        assertEquals(1, StoryScripts.measure("𠀀").han)
    }

    @Test fun onlyTheStartAndOnlyTheProseIsRead() {
        // Past the first 4000 characters nothing counts: a long Chinese story ending in English stays CJK.
        val story = "雨".repeat(StoryScripts.SCRIPT_READ_CHARS) + " the end".repeat(5_000)
        assertEquals(StoryScript.Cjk, StoryScripts.storyScript("", story))
        // A link's address is not words: the link's own text is what is read.
        assertEquals(StoryScript.Cjk, StoryScripts.storyScript("", "[下雨](https://example.com/many/english/words/in/a/very/long/address)"))
    }
}
