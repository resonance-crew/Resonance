package com.resonance.app.ui

import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * An anonymous card is public or only its author's — never for connections only, which would say
 * whose it is — so turning a card kept for connections anonymous in the publish panel makes it
 * public; under a name, every audience stands. 卡片類型's three are 公開 · 匿名公開 · 草稿, with no
 * line under them (round 8 §2.2), and the ⋯'s one visibility row turns a card readers have into a
 * 草稿 (round 8 §1.2).
 */
class PublishVisibilityTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun anAnonymousCardIsPublicOrOnlyYours() {
        assertEquals("public", anonymousVisibility("connections", anonymous = true))
        assertEquals("private", anonymousVisibility("private", anonymous = true))
        assertEquals("public", anonymousVisibility("public", anonymous = true))
    }

    @Test fun underYourNameEveryAudienceStands() {
        assertEquals("connections", anonymousVisibility("connections", anonymous = false))
        assertEquals("private", anonymousVisibility("private", anonymous = false))
    }

    @Test fun theThreeChoicesAreWhatTheCardIs() {
        assertEquals(listOf("公開", "匿名公開", "私人卡"), Audience.entries.map(::audienceLabel))
        assertEquals("卡片類型", com.resonance.kit.l10n.L10n.Write.Visibility.label)
    }

    @Test fun theMenusVisibilityRowMakesACardReadersHaveADraft() {
        assertEquals("轉為私人卡", com.resonance.kit.l10n.L10n.Me.Actions.makePrivate)
    }
}
