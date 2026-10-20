package com.resonance.app.ui.share

import com.resonance.api.models.Author
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.design.ShareByline
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.StoryScript
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.time.LocalDateTime

/**
 * What a card's share sends, and when it is offered (share.spec §1, §2, Owner revision): only a
 * published, public card not in the trash — never decided by the viewer — by a link with no locale
 * that names an anonymous card by its id; and the share card it draws never holds the author of an
 * anonymous card, even when the page's own copy of it names them (its owner's).
 */
class ShareLinksTest {
    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    private val bob = Author(id = "bob", handle = "念誠", initials = "念", accentColor = "oklch(90% 0.06 140)", avatarUrl = "https://img.resonance.channel/avatar/a.webp", avatarSeed = "42", verified = true, region = "TW")

    private fun detail(
        anonymous: Boolean = false,
        visibility: CardDetail.Visibility = CardDetail.Visibility.`public`,
        publishedAt: String? = "2026-10-10T08:00:00.000Z",
        trashedAt: String? = null,
        slug: String? = "plums-nian-cheng",
        isOwner: Boolean = false,
    ) = CardDetail(
        card = FeedCard(
            id = "Xy7kQ", slug = slug, title = "外婆的醃梅子", excerpt = "…", tags = listOf("家"), publishedAt = publishedAt,
            author = bob, anonymous = anonymous, visibility = FeedCard.Visibility.entries.first { it.value == visibility.value },
            imageUrl = null, imageLabel = null, accentHue = 55.0, readMinutes = 3, referenceCardId = null, reason = null, trashedAt = trashedAt,
        ),
        story = "每年五月，外婆都會把青梅一顆顆擦乾，排在竹篩上曬。\n\n她說梅子要曬過太陽才會甜，人也是。",
        visibility = visibility, anonymous = anonymous, resonanceCount = 0, coreInsight = null, isOwner = isOwner, referenceCard = null,
    )

    @Test fun onlyAPublishedPublicCardOutOfTheTrashIsShared() {
        assertTrue(ShareLinks.canShare(detail()))
        // An anonymous card too: its link names no one.
        assertTrue(ShareLinks.canShare(detail(anonymous = true)))
        assertFalse(ShareLinks.canShare(detail(visibility = CardDetail.Visibility.`private`)))
        assertFalse(ShareLinks.canShare(detail(visibility = CardDetail.Visibility.connections)))
        assertFalse(ShareLinks.canShare(detail(publishedAt = null)))
        assertFalse(ShareLinks.canShare(detail(trashedAt = "2026-10-19T08:00:00.000Z")))
        // Whose card it is changes nothing.
        assertEquals(ShareLinks.canShare(detail()), ShareLinks.canShare(detail(isOwner = true)))
    }

    @Test fun aCardIsSharedByItsSlugAndAnAnonymousOneByItsIdAlone() {
        val origin = "https://resonance.channel"
        assertEquals("https://resonance.channel/card/plums-nian-cheng", ShareLinks.card(origin, "Xy7kQ", "plums-nian-cheng", anonymous = false))
        // A slug that collided carries the author's pen name: an anonymous card never shares it.
        assertEquals("https://resonance.channel/card/Xy7kQ", ShareLinks.card(origin, "Xy7kQ", "plums-nian-cheng", anonymous = true))
        assertEquals("https://resonance.channel/card/Xy7kQ", ShareLinks.card("$origin/", "Xy7kQ", null, anonymous = false))
        assertEquals("https://resonance.channel/card/Xy7kQ", ShareLinks.card(origin, "Xy7kQ", "", anonymous = false))
        assertEquals("https://resonance.channel/u/%E5%BF%B5%E8%AA%A0", ShareLinks.profile(origin, "念誠"))
    }

    @Test fun keysAreEncodedAsTheWebEncodesThem() {
        assertEquals("a%20b%26c%23d%2Fe%3F", ShareLinks.encodeComponent("a b&c#d/e?"))
        assertEquals("-_.!~*'()", ShareLinks.encodeComponent("-_.!~*'()"))
        assertEquals("%E5%B0%8F%E5%B3%B6", ShareLinks.encodeComponent("小島"))
    }

    @Test fun theFilesAreNamedByTheKeyInSafeCharacters() {
        assertEquals("resonance-Xy7kQ.jpg", ShareLinks.imageName("Xy7kQ"))
        assertEquals("resonance-a-b-.jpg", ShareLinks.imageName("a/b."))
        assertEquals("resonance-plums-20261020-153005.jpg", ShareLinks.savedName("plums", LocalDateTime.of(2026, 10, 20, 15, 30, 5)))
    }

    @Test fun anAnonymousCardsShareCardHoldsNoOne() {
        // The owner's own copy of their anonymous card names them; the picture must not.
        val model = shareCardModel(detail(anonymous = true, isOwner = true))
        assertEquals(ShareByline.Anonymous, model.byline)
        val drawn = model.toString()
        for (told in listOf(bob.handle, bob.initials, bob.avatarUrl!!, bob.id, "TW", "plums-nian-cheng")) assertFalse(told, drawn.contains(told))
        // Its words are the story's opening, in its script.
        assertEquals("每年五月，外婆都會把青梅一顆顆擦乾，排在竹篩上曬。\n她說梅子要曬過太陽才會甜，人也是。", model.words)
        assertEquals(StoryScript.Cjk, model.script)
        assertEquals("外婆的醃梅子", model.title)
    }

    @Test fun aNamedCardsShareCardNamesItsAuthor() {
        val byline = shareCardModel(detail()).byline as ShareByline.Named
        assertEquals("念誠", byline.handle)
        assertEquals("念", byline.initials)
        assertEquals(42.0, byline.avatarSeed, 0.0)
        assertTrue(byline.verified)
    }
}
