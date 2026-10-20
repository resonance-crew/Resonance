package com.resonance.kit

import com.resonance.kit.story.ReadTime
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The read time a list shows beside a card, counted as the server counts it (src/lib/readTime.test.ts,
 * case for case): CJK by the character at 320 a minute, the rest by the word at 230, added up, never
 * under a minute. The writer's publish step shows it on the card it previews.
 */
class ReadTimeTest {
    private val zhProse =
        "那天傍晚，雨終於停了。我沿著河堤慢慢走，路燈一盞一盞亮起來，水面浮著碎碎的光。「你還記得嗎？」她忽然問——我沒有回答……只是點點頭。後來我們在橋邊坐了很久；風把那首“城南的歌”吹得斷斷續續，像《舊事》裡寫的那樣：有些話，說出口就散了。"
    private val enProse = "The rain stopped just before dusk, and the street outside the bakery shone like a river of glass."

    private fun zh(n: Int) = zhProse.repeat((n + zhProse.length - 1) / zhProse.length).take(n)
    private fun en(n: Int): String {
        val words = enProse.split(' ')
        return List(n) { words[it % words.size] }.joinToString(" ")
    }

    @Test fun chineseIsReadACharacterAtATime() {
        assertEquals(1, ReadTime.minutes(zh(320)))
        assertEquals(1, ReadTime.minutes(zh(479)))
        assertEquals(2, ReadTime.minutes(zh(480)))
        assertEquals(5, ReadTime.minutes(zh(1600)))
    }

    @Test fun englishIsReadAWordAtATime() {
        assertEquals(1, ReadTime.minutes(en(180)))
        assertEquals(1, ReadTime.minutes(en(344)))
        assertEquals(2, ReadTime.minutes(en(345)))
        assertEquals(5, ReadTime.minutes(en(1150)))
    }

    @Test fun aWordWithMarksInItIsStillOneWord() {
        for (word in listOf("don't", "well-known", "3.14", "“quoted,”", "**rain**", "[link](https://example.com/a/long/path.avif)")) {
            for (n in listOf(345, 575, 805)) assertEquals(Math.round(n / 230.0).toInt(), ReadTime.minutes(List(n) { word }.joinToString(" ")), word)
        }
    }

    @Test fun aStoryMixingThemAddsTheTwoUp() {
        assertEquals(2, ReadTime.minutes("${zh(480)}\n\n${en(115)}"))
        assertEquals(1, ReadTime.minutes("${zh(160)} ${en(115)}"))
        // English set in unspaced Chinese is still words: 4 characters and a word, 115 times over.
        assertEquals(2, ReadTime.minutes("我用iPhone拍照".repeat(115)))
    }

    @Test fun neverLessThanAMinute() {
        for (text in listOf("", " \n\t　", "Hi.", "好。", "——")) assertEquals(1, ReadTime.minutes(text), text)
    }
}
