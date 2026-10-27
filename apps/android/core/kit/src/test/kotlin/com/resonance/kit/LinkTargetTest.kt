package com.resonance.kit

import com.resonance.kit.story.StoryLinks
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * The writer's link sheet links only what the link rules take (round 16 §6, the web's `linkTarget` in
 * src/lib/links/soleLink.ts): http(s); a bare `www.…` or `example.com/x` gets `https://`; another scheme,
 * a user name or a host without a dot is refused — never a `javascript:` or `data:` href.
 */
class LinkTargetTest {
    @Test fun anAddressTypedOrPastedBecomesAnHttpsLink() {
        assertEquals("https://example.com/rain", StoryLinks.linkTarget("https://example.com/rain"))
        assertEquals("http://example.com/", StoryLinks.linkTarget("  http://example.com/  "))
        assertEquals("https://www.example.com", StoryLinks.linkTarget("www.example.com"))
        assertEquals("https://example.com/rain", StoryLinks.linkTarget("example.com/rain"))
        assertEquals("https://example.com/x", StoryLinks.linkTarget("//example.com/x"))
        // The writer's spelling is kept; one the story can't carry as written is the normalized form.
        assertEquals("https://zh.wikipedia.org/wiki/中文", StoryLinks.linkTarget("https://zh.wikipedia.org/wiki/中文"))
    }

    @Test fun anythingElseIsRefused() {
        listOf(
            "", "   ", "javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>x</b>", "mailto:a@example.com",
            "ftp://example.com/file", "https://user@example.com/", "localhost:3000", "just words", "https://",
        ).forEach { assertNull(StoryLinks.linkTarget(it), it) }
    }
}
