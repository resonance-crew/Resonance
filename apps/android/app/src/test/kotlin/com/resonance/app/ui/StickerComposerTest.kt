package com.resonance.app.ui

import com.resonance.design.ReactionChipItem
import com.resonance.design.generated.ReactionId
import com.resonance.kit.chat.ChatSticker
import com.resonance.kit.chat.StickerCatalog
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * Round 22's rules that aren't drawing: the sticker panel's sections (🕘 first once there is a recent,
 * then each character's pack) and which one the pack bar marks as the grid scrolls; what the list says
 * of a sticker or pictures sent together; an album's reactions as one row of chips.
 */
class StickerComposerTest {
    private val language = Strings.language
    private val catalog = StickerCatalog.parse(File("../../../public/stickers/catalog.json").readText())!!

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun recentsLeadOnceThereAreAnyThenEveryPackHeadedByItsCharacter() {
        val none = stickerSections(catalog, emptyList(), "zh-TW", "最近用過")
        assertEquals(listOf("摺摺", "牽牽", "聆聆", "點點", "悄悄"), none.map { it.title })
        val recent = stickerSections(catalog, listOf(ChatSticker("twine", "thanks"), ChatSticker("gone", "x")), "en", "Recent")
        assertEquals(RECENT_KEY, recent.first().key)
        // A recent this build no longer knows is left out.
        assertEquals(listOf("thanks"), recent.first().stickers.map { it.id })
        assertEquals("Tuck", recent[1].title)
    }

    @Test fun thePackBarMarksThePackWhoseHeadingTheGridHasPassed() {
        val sections = stickerSections(catalog, emptyList(), "zh-TW", "最近用過")
        val starts = sectionStarts(sections)
        // Each heading, then its stickers: tuck's six put twine's heading at 7.
        assertEquals(0, starts[0])
        assertEquals(1 + sections[0].stickers.size, starts[1])
        assertEquals(0, sectionAt(starts, 0))
        assertEquals(0, sectionAt(starts, starts[1] - 1))
        assertEquals(1, sectionAt(starts, starts[1]))
        assertEquals(4, sectionAt(starts, 999))
    }

    @Test fun theListSaysAStickerOrPicturesWereSentNotTheFallbackWords() {
        assertEquals("傳送了一張貼圖", conversationPreview("〔貼圖：謝謝〕", image = false, fromMe = false, sticker = true))
        assertEquals("你：傳送了一張貼圖", conversationPreview("〔貼圖：謝謝〕", image = false, fromMe = true, sticker = true))
        assertEquals("傳送了 3 張圖片", conversationPreview("", image = true, fromMe = false, album = 3))
        // The album's words, when the first picture came with some, are said as they are.
        assertEquals("那天河堤", conversationPreview("那天河堤", image = true, fromMe = false, album = 3))
        assertEquals("傳送了一張圖片", conversationPreview("", image = true, fromMe = false))
    }

    @Test fun anAlbumsReactionsAreOneRowOfChipsTheirCountsAdded() {
        val merged = mergedChips(
            listOf(
                listOf(ReactionChipItem(ReactionId.Heart, 1)),
                listOf(ReactionChipItem(ReactionId.Laugh, 1), ReactionChipItem(ReactionId.Heart, 1)),
                emptyList(),
            ),
        )
        assertEquals(listOf(ReactionId.Heart to 2, ReactionId.Laugh to 1), merged.map { it.id to it.count })
    }

    @Test fun aQuotedStickerIsNamedInThisLanguageElseItsFallbackWords() {
        val known = com.resonance.kit.chat.ReplyQuote("m1", "bob", "〔貼圖：謝謝〕", sticker = ChatSticker("twine", "thanks"))
        // Without the bundle (a JVM test), the server's fallback words.
        assertEquals("〔貼圖：謝謝〕", quoteWords(known))
        assertEquals("貼圖", quoteWords(known.copy(text = "")))
        assertEquals("一張圖片", quoteWords(com.resonance.kit.chat.ReplyQuote("m2", "bob", "", image = true)))
    }

    @Test fun stickerButtonOnlyWithoutWordsSendABlockPastOneLineTheGrowToolOverIt() {
        // One line, nothing typed: ☺ beside a full-height Send.
        assertEquals(ComposerTools(sticker = true, block = false, expand = false, collapse = false), composerTools("", 1, expanded = false))
        // Words: no ☺ (words and a sticker don't go together) — white space alone is no words.
        assertEquals(false, composerTools("嗨", 1, expanded = false).sticker)
        assertEquals(true, composerTools("  \n", 1, expanded = false).sticker)
        // Past one line Send is the corner block; ⤢ over it from the third line.
        assertEquals(ComposerTools(sticker = false, block = true, expand = false, collapse = false), composerTools("a\nb", 2, expanded = false))
        assertEquals(ComposerTools(sticker = false, block = true, expand = true, collapse = false), composerTools("a\nb\nc", 3, expanded = false))
        // Grown: ⤡ in ⤢'s place, never ☺ (even emptied).
        assertEquals(ComposerTools(sticker = false, block = true, expand = false, collapse = true), composerTools("", 1, expanded = true))
    }
}
