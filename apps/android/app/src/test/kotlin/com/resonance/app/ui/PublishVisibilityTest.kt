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
 * public; under a name, every audience stands. 誰可以看見 says what each of its three means in one
 * line (a card kept for connections: its own), and a private anonymous card's ⋯ says it comes back
 * anonymous.
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

    @Test fun theThreeChoicesAndTheLineUnderThem() {
        assertEquals(listOf("公開", "匿名公開", "只有自己"), Audience.entries.map(::audienceLabel))
        assertEquals("所有人都看得到，署名 alice", audienceLine(Audience.Public, "alice"))
        assertEquals("所有人都看得到，但不會知道是你寫的", audienceLine(Audience.Anonymous, "alice"))
        assertEquals("不公開，只有你看得到", audienceLine(Audience.Private, "alice"))
        assertEquals("只有連結的人看得到", audienceLine(null, "alice"))
    }

    @Test fun aPrivateAnonymousCardsMenuSaysItComesBackAnonymous() {
        assertEquals("轉為匿名公開", visibilityAction(isPrivate = true, anonymous = true))
        assertEquals("轉為公開", visibilityAction(isPrivate = true, anonymous = false))
        assertEquals("轉為私人", visibilityAction(isPrivate = false, anonymous = true))
        assertEquals("轉為私人", visibilityAction(isPrivate = false, anonymous = false))
    }
}
