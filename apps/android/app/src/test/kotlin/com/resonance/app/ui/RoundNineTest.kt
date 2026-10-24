package com.resonance.app.ui

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.app.thoughtmap.MapCard
import com.resonance.app.thoughtmap.mapNodeIcon
import com.resonance.design.BarLineInset
import com.resonance.design.CardPalette
import com.resonance.design.LayoutClass
import com.resonance.design.generated.IconName
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Round 9's rules that aren't drawing: which card is a 私人卡 (its page's lock and 編輯 pen; the map's
 * lock), where the card page's head starts (the reading head, from the bar's pen line), how many
 * resonances show before 查看全部, the writer's coverless preview's family, what the card picker
 * offers, and the room the floating composer keeps at the thread's foot.
 */
class RoundNineTest {
    private fun card(
        id: String = "c1",
        published: Boolean = true,
        visibility: FeedCard.Visibility = FeedCard.Visibility.`public`,
        imageUrl: String? = null,
        trashedAt: String? = null,
    ) = FeedCard(
        id = id, slug = id, title = "雨中散步", excerpt = "…", tags = emptyList(),
        publishedAt = if (published) "2026-09-01T08:00:00Z" else null,
        author = null, anonymous = false, visibility = visibility, imageUrl = imageUrl, imageLabel = null,
        accentHue = null, readMinutes = 1, referenceCardId = null, reason = null,
        trashedAt = trashedAt, purgeAt = null, restoresTo = null,
    )

    private fun detail(c: FeedCard, owner: Boolean = true) = CardDetail(
        card = c, story = "", visibility = CardDetail.Visibility.`public`, anonymous = false, resonanceCount = 0,
        coreInsight = null, isOwner = owner, referenceCard = null,
    )

    // §1 私人卡

    @Test fun aPrivateCardIsTheOwnersNeverPublishedOrKeptPrivateOutOfTheTrash() {
        assertTrue(isPrivateCard(detail(card(published = false))))
        assertTrue(isPrivateCard(detail(card(visibility = FeedCard.Visibility.`private`))))
        assertFalse(isPrivateCard(detail(card())))
        assertFalse(isPrivateCard(detail(card(visibility = FeedCard.Visibility.connections))))
        // Someone else's page never says so (and never offers the pen).
        assertFalse(isPrivateCard(detail(card(published = false), owner = false)))
        // In the trash its banner says where it stands.
        assertFalse(isPrivateCard(detail(card(published = false, trashedAt = "2026-10-20T00:00:00Z"))))
    }

    @Test fun theMapLocksEveryPrivateCardPublishedOrNot() {
        fun node(published: Boolean, visibility: String) =
            MapCard("m", "alice", slug = null, title = "t", story = "", tags = emptyList(), visibility = visibility, publishedAt = if (published) 1L else null, mediaUrl = null, accentHue = null)
        assertEquals(IconName.Lock, mapNodeIcon(node(published = false, visibility = "public")))
        assertEquals(IconName.Lock, mapNodeIcon(node(published = true, visibility = "private")))
        assertEquals(IconName.Globe, mapNodeIcon(node(published = true, visibility = "public")))
        assertEquals(IconName.Users, mapNodeIcon(node(published = true, visibility = "connections")))
        assertTrue(node(published = false, visibility = "public").isPrivateCard)
        assertFalse(node(published = true, visibility = "public").isPrivateCard)
    }

    // §2 the reading head

    @Test fun theArticleStartsAtTheReadingHeadUnderTheBarsPenLine() {
        val line = BarLineInset.value
        assertEquals(48f - line, articleTop(LayoutClass.Compact, card(), trashed = false).value, 0.001f)
        assertEquals(56f - line, articleTop(LayoutClass.Compact, card(imageUrl = "https://img/x.avif"), trashed = false).value, 0.001f)
        assertEquals(64f - line, articleTop(LayoutClass.Medium, card(), trashed = false).value, 0.001f)
        assertEquals(72f - line, articleTop(LayoutClass.Expanded, card(imageUrl = "https://img/x.avif"), trashed = false).value, 0.001f)
        // The trash's banner heads the owner's trashed card: a box's edge, as a cover's.
        assertEquals(56f - line, articleTop(LayoutClass.Compact, card(), trashed = true).value, 0.001f)
    }

    // C1

    @Test fun threeResonancesShowThenTheRestWhenAskedFor() {
        val five = (1..5).map { card("r$it") }
        assertEquals(listOf("r1", "r2", "r3"), resonancesShown(five, all = false).map { it.id })
        assertEquals(five, resonancesShown(five, all = true))
        assertEquals(2, resonancesShown(five.take(2), all = false).size)
    }

    // §8

    @Test fun theCoverlessPreviewWearsItsIdsFamilyAndACoverItsHues() {
        assertEquals(0, previewFamily(null, null))
        assertEquals(CardPalette.ofId("d-42"), previewFamily(null, "d-42"))
        // A cover's hue wins over the id: the family nearest it.
        assertEquals(CardPalette.nearest(140.0), previewFamily(140.0, "d-42"))
        assertEquals(2, previewFamily(138.0, "d-42"))
    }

    // C2

    @Test fun thePickerOffersPublishedPublicCardsOnly() {
        val cards = listOf(
            card("pub"),
            card("draft", published = false),
            card("mine", visibility = FeedCard.Visibility.`private`),
            card("friends", visibility = FeedCard.Visibility.connections),
        )
        assertEquals(listOf("pub"), publicCards(cards).map { it.id })
    }

    // §4

    @Test fun theThreadKeepsClearOfTheFloatingComposerAndTheKeyboard() {
        val density = Density(2f, 1f)
        // A 48 capsule (96 px) over a 24 px navigation bar: 8 of air, then 12 more for the newest message.
        val room = ComposerRoom(WindowInsets(bottom = 48), density)
        room.foot = 96
        assertEquals(48 + 16 + 96, room.above)
        assertEquals(48 + 16 + 96 + 24, room.clear)
        // The capsule grows (more lines, a reply on its slip): so does the room.
        room.foot = 220
        assertEquals(48 + 16 + 220 + 24, room.clear)
        // No composer at all (a letter still being heard of): the air over the bar alone.
        room.foot = 0
        assertEquals(48 + 16, room.above)
        assertEquals(8.dp, ComposerGap)
        assertEquals(12.dp, ComposerClear)
    }
}
