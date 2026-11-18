package com.resonance.app.ui

import com.resonance.api.models.Author
import com.resonance.api.models.FeedCard
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * Writing a reply card (round 26 §U6, S10): over its title, a 44 band names the story it answers — 「回應〈一場雨後的
 * 散步〉」 with the original's cover at 36 — and opens the original in a centred dialog. Nothing while the original isn't
 * known.
 */
class ReplyingBandTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun card(title: String) = FeedCard(
        id = "rain", slug = "rain-walk", title = title, excerpt = "", tags = emptyList(),
        publishedAt = "2026-11-01T00:00:00Z", author = Author("bob", "bob", "BO", "#c96442", null, null, false, null), anonymous = false,
        visibility = FeedCard.Visibility.`public`, imageUrl = null, imageLabel = null, accentHue = null, readMinutes = 2,
        referenceCardId = null, reason = null,
    )

    @Test fun theBandNamesTheStoryItAnswers() {
        assertEquals("回應〈一場雨後的散步〉", replyingLabel(card("一場雨後的散步")))
        Strings.language = Strings.Language.En
        assertEquals("Replying to “A walk after the rain”", replyingLabel(card(" A walk after the rain ")))
    }

    @Test fun nothingWhileTheOriginalIsntKnown() {
        assertNull(replyingLabel(null))
        assertNull(replyingLabel(card("  ")))
    }

    @Test fun aCoverWithNoPictureWearsTheTitlesFirstCharacter() {
        assertEquals("一", coverInitial("一場雨後的散步"))
        // A whole code point, never half of one.
        assertEquals("𠮷", coverInitial("𠮷野家"))
        assertEquals("", coverInitial(" "))
    }

    @Test fun theBandIsFortyFourWithACoverOfThirtySix() {
        assertEquals(44f, ReplyingBandHeight.value)
        assertEquals(36f, ReplyingCover.value)
    }
}
