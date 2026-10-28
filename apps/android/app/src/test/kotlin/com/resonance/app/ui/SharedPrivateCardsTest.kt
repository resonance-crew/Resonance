package com.resonance.app.ui

import com.resonance.api.models.Author
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.time.LocalDate

/**
 * Sharing a 私人卡 in a conversation (the web's ThreadComposer / InsertCardModal `privateLabel`): the
 * thread's picker offers your public cards, then your 私人卡 — never an anonymous or untitled one, nor
 * one twice — each row marked 私人卡; the pending row and the bubble say 私人卡 where 卡片 / 共振
 * would; and someone else's 私人卡 opened from the bubble reads as shared with you, to read only.
 */
class SharedPrivateCardsTest {
    private val language = Strings.language
    private val today = LocalDate.of(2026, 10, 28)

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
    }

    @After fun restore() {
        Strings.language = language
    }

    private val bob = Author(
        id = "a1", handle = "bob", initials = "B", accentColor = "", avatarUrl = null, avatarSeed = null, verified = false, region = null,
    )

    private fun card(
        id: String,
        title: String = "雨中散步",
        published: String? = "2026-09-01T08:00:00Z",
        visibility: FeedCard.Visibility = FeedCard.Visibility.`public`,
        anonymous: Boolean = false,
        editedAt: String? = null,
        trashedAt: String? = null,
    ) = FeedCard(
        id = id, slug = null, title = title, excerpt = "…", tags = emptyList(), publishedAt = published,
        author = bob, anonymous = anonymous, visibility = visibility, imageUrl = null, imageLabel = null,
        accentHue = null, readMinutes = 3, referenceCardId = null, reason = null, editedAt = editedAt,
        trashedAt = trashedAt, purgeAt = null, restoresTo = null,
    )

    private fun detail(c: FeedCard, owner: Boolean) = CardDetail(
        card = c, story = "", visibility = CardDetail.Visibility.`private`, anonymous = c.anonymous, resonanceCount = 0,
        coreInsight = null, isOwner = owner, referenceCard = null,
    )

    @Test fun thePickerListsPublicCardsFirstThenPrivateCardsTheLatestChangedFirst() {
        val published = listOf(
            card("pub1"),
            card("pub2"),
            // Published but not public: never on the public part (a kept one comes with the private shelf).
            card("kept", visibility = FeedCard.Visibility.`private`),
            card("friends", visibility = FeedCard.Visibility.connections),
        )
        val private = listOf(card("kept", visibility = FeedCard.Visibility.`private`, editedAt = "2026-10-20T00:00:00Z"))
        val drafts = listOf(
            card("draft1", published = null, editedAt = "2026-10-25T00:00:00Z"),
            card("draft2", published = null, editedAt = "2026-10-01T00:00:00Z"),
        )
        assertEquals(listOf("pub1", "pub2", "draft1", "kept", "draft2"), shareableCards(published, private, drafts).map { it.id })
    }

    @Test fun anonymousUntitledTrashedAndDuplicateCardsStayOut() {
        val published = listOf(card("pub"), card("anonPub", anonymous = true))
        val private = listOf(
            card("anonKept", visibility = FeedCard.Visibility.`private`, anonymous = true),
            // A card on both reads (a change between them) shows once, where it stands now.
            card("pub", visibility = FeedCard.Visibility.`private`),
            card("binned", visibility = FeedCard.Visibility.`private`, trashedAt = "2026-10-27T00:00:00Z"),
        )
        val drafts = listOf(card("blank", title = "  ", published = null), card("draft", published = null))
        // An anonymous public card is shared as any public card (it reaches the thread without its author).
        assertEquals(listOf("pub", "anonPub", "draft"), shareableCards(published, private, drafts).map { it.id })
        // Either private half unread: the other still comes.
        assertEquals(listOf("pub", "anonPub", "draft"), shareableCards(published, null, drafts).map { it.id })
        assertEquals(listOf("pub", "anonPub"), shareableCards(published, null, null).map { it.id })
    }

    @Test fun theEditorsPickerStaysPublicOnly() {
        val cards = listOf(card("pub"), card("draft", published = null), card("kept", visibility = FeedCard.Visibility.`private`))
        assertEquals(listOf("pub"), publicCards(cards).map { it.id })
    }

    @Test fun aPrivateCardsRowIsLedByTheWord() {
        Strings.language = Strings.Language.ZhTW
        val label = L10n.Messages.privateCard
        assertEquals("私人卡 · 9月28日", pickMeta(false, "2026-09-28T04:00:00Z", null, today, privateLabel = label))
        // Never published: the word alone.
        assertEquals("私人卡", pickMeta(false, null, null, today, privateLabel = label))
        Strings.language = Strings.Language.En
        assertEquals("Private card · Sep 28", pickMeta(false, "2026-09-28T04:00:00Z", null, today, privateLabel = L10n.Messages.privateCard))
        // A public card's row (no label given for it) says only its date.
        assertEquals("Sep 28", pickMeta(false, "2026-09-28T04:00:00Z", null, today))
    }

    @Test fun aPrivateCardSaysSoInTheBubbleAndOnThePendingRow() {
        Strings.language = Strings.Language.ZhTW
        assertTrue(card("d", published = null).keptPrivate)
        assertTrue(card("k", visibility = FeedCard.Visibility.`private`).keptPrivate)
        assertFalse(card("p").keptPrivate)
        assertFalse(card("c", visibility = FeedCard.Visibility.connections).keptPrivate)
        assertEquals("私人卡", sharedCardSource(card("d", published = null)))
        assertEquals("私人卡", sharedCardSource(card("k", visibility = FeedCard.Visibility.`private`)))
        assertEquals(L10n.Messages.cardSource, sharedCardSource(card("p")))
        // The pending row's 私人卡 outlives the screen being covered.
        val attachment = ThreadModel.Attachment("k", "雨中散步", null, keptPrivate = true)
        assertTrue(attachment.keptPrivate)
        assertFalse(ThreadModel.Attachment("p", "t").keptPrivate)
    }

    @Test fun someoneElsesPrivateCardReadsAsSharedWithYou() {
        val kept = card("k", visibility = FeedCard.Visibility.`private`)
        val draft = card("d", published = null)
        assertTrue(isSharedPrivateCard(detail(kept, owner = false)))
        assertTrue(isSharedPrivateCard(detail(draft, owner = false)))
        // Your own 私人卡 is yours (its pen, its ⋯), never "shared with you".
        assertFalse(isSharedPrivateCard(detail(kept, owner = true)))
        assertTrue(isPrivateCard(detail(kept, owner = true)))
        // A public card of theirs keeps its response row.
        assertFalse(isSharedPrivateCard(detail(card("p"), owner = false)))
        // A shared 私人卡 is never shared on: no share glyph on its page.
        assertFalse(com.resonance.app.ui.share.ShareLinks.canShare(detail(kept, owner = false)))
        Strings.language = Strings.Language.ZhTW
        assertEquals("bob 私下分享給你的私人卡，只有你讀得到", L10n.Card.sharedPrivately("bob"))
    }
}
