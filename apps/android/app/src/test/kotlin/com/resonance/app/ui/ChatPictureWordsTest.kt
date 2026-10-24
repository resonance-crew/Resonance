package com.resonance.app.ui

import com.resonance.kit.chat.ReplyQuote
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * What the app says of a picture sent in chat where there are no words to show (round 7 §4.3): the
 * conversation list's 傳送了一張圖片 (你： before your own), and a reply's quote of it, 一張圖片 — as
 * a card alone is 一張卡片. Words, when the picture came with some, are said as they are.
 */
class ChatPictureWordsTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun theListSaysAPictureWasSent() {
        assertEquals("傳送了一張圖片", conversationPreview("", image = true, fromMe = false))
        assertEquals("你：傳送了一張圖片", conversationPreview("", image = true, fromMe = true))
        // A preview from before pictures (no `text`) of one: the same.
        assertEquals("傳送了一張圖片", conversationPreview(null, image = true, fromMe = false))
        // With words, the words.
        assertEquals("你：看這個", conversationPreview("看這個", image = true, fromMe = true))
        assertEquals("早安", conversationPreview("早安", image = false, fromMe = false))
        assertEquals("還沒有訊息——說聲嗨吧", conversationPreview(null, image = false, fromMe = false))
    }

    @Test fun aQuoteOfAPictureAloneSaysSo() {
        assertEquals("一張圖片", quoteStandIn(ReplyQuote("m1", "bob", "", image = true)))
        assertEquals("一張卡片", quoteStandIn(ReplyQuote("m1", "bob", "", cardRef = "walk")))
        Strings.language = Strings.Language.En
        assertEquals("Sent a photo", conversationPreview("", image = true, fromMe = false))
        assertEquals("A photo", quoteStandIn(ReplyQuote("m1", "bob", "", image = true)))
    }
}
