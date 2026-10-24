package com.resonance.app.ui

import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.app.thoughtmap.MapNode
import com.resonance.app.thoughtmap.ThoughtMapService.Companion.mapCardOf
import com.resonance.app.thoughtmap.ThoughtMapStore.Companion.parkNodes
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.WritingApi
import com.resonance.kit.l10n.Strings
import java.io.File
import java.time.Instant
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The trash in the app (trash.spec §6): which 刪除 asks first; the card box's 垃圾桶 shelf (always
 * last, read on its own, never a card past its days, each opening its page or its writer); the
 * card page's banner, for the owner's card in the trash only; the thought map leaving trashed cards
 * out and putting them back in place on a restore; and the calls the app's moves send.
 */
class TrashShelfTest {
    private val language = Strings.language
    private val server = MockWebServer()
    private val now = Instant.parse("2026-10-20T08:00:00Z")

    @Before fun start() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
        server.start()
    }

    @After fun stop() {
        Strings.language = language
        server.shutdown()
    }

    private fun card(
        id: String = "c1",
        slug: String? = "a-walk",
        published: Boolean = true,
        trashedAt: Instant? = now.minusSeconds(86_400),
        purgeAt: Instant? = trashedAt?.plusSeconds(30 * 86_400L),
        anonymous: Boolean = false,
    ) = FeedCard(
        id = id, slug = slug, title = "雨中散步", excerpt = "…", tags = emptyList(),
        publishedAt = if (published) "2026-09-01T08:00:00Z" else null,
        author = null, anonymous = anonymous, visibility = FeedCard.Visibility.`private`, imageUrl = null, imageLabel = null,
        accentHue = null, readMinutes = 1, referenceCardId = null, reason = null,
        trashedAt = trashedAt?.toString(), purgeAt = purgeAt?.toString(), restoresTo = FeedCard.RestoresTo.`public`,
    )

    // Which 刪除 asks

    @Test fun mostDeletesGoToTheTrashAtOnce() {
        // A draft, a private card, a card answering nothing, a hidden resonance (private, for connections, anonymous).
        assertEquals(TrashAsk.AtOnce, trashAsk("orig", published = false, visibility = "public", anonymous = false, referenceAnonymous = false))
        assertEquals(TrashAsk.AtOnce, trashAsk(null, published = true, visibility = "public", anonymous = false, referenceAnonymous = null))
        assertEquals(TrashAsk.AtOnce, trashAsk("orig", published = true, visibility = "private", anonymous = false, referenceAnonymous = false))
        assertEquals(TrashAsk.AtOnce, trashAsk("orig", published = true, visibility = "connections", anonymous = false, referenceAnonymous = false))
        assertEquals(TrashAsk.AtOnce, trashAsk("orig", published = true, visibility = "public", anonymous = true, referenceAnonymous = false))
        // A resonance to an anonymous original never connected anyone.
        assertEquals(TrashAsk.AtOnce, trashAsk("orig", published = true, visibility = "public", anonymous = false, referenceAnonymous = true))
    }

    @Test fun aPublicNamedResonanceToANamedOriginalAsksAndAnUnknownOneIsLookedUp() {
        assertEquals(TrashAsk.Ask, trashAsk("orig", published = true, visibility = "public", anonymous = false, referenceAnonymous = false))
        assertEquals(TrashAsk.LookUp, trashAsk("orig", published = true, visibility = "public", anonymous = false, referenceAnonymous = null))
    }

    @Test fun deletingForGoodACardRestoredElsewhereIsNoFailure() {
        assertEquals(DeleteForever.Deleted, deleteForeverOutcome(null))
        assertEquals(DeleteForever.NotInTrash, deleteForeverOutcome(ApiFailure("conflict", ApiFailure.NOT_IN_TRASH_MESSAGE, 409)))
        assertEquals(DeleteForever.Failed, deleteForeverOutcome(ApiFailure("conflict", ApiFailure.IN_TRASH_MESSAGE, 409)))
        assertEquals(DeleteForever.Failed, deleteForeverOutcome(ApiFailure("internal", "Something went wrong.", 500)))
    }

    // The shelf

    @Test fun theTrashIsTheLastShelfAndIsReadOnItsOwn() {
        assertEquals(TabGetCardBox.trash, ShelfOrder.last())
        // 已發布 · 草稿 · 我共振過的 · 被連結 · 收藏 · 垃圾桶 (no 私人卡 shelf: round 8 §1.1).
        assertEquals(6, ShelfOrder.size)
        assertEquals(listOf(TabGetCardBox.trash), shelvesToRead(TabGetCardBox.trash) { false })
        // My own shelves are read together, the trash never among them.
        assertFalse(TabGetCardBox.trash in shelvesToRead(TabGetCardBox.published) { false })
    }

    @Test fun theShelfNeverShowsACardPastItsDays() {
        val fresh = card("fresh")
        val lastDay = card("last", trashedAt = now.minusSeconds(29 * 86_400L + 3_600))
        val gone = card("gone", trashedAt = now.minusSeconds(30 * 86_400L + 60))
        assertEquals(listOf("fresh", "last"), inTrash(listOf(fresh, lastDay, gone), now).map { it.id })
    }

    @Test fun aPublishedCardOpensItsPageADraftItsWriter() {
        assertEquals(Route.Card("a-walk"), trashTap(card()))
        assertEquals(Route.Card("c2"), trashTap(card("c2", slug = null)))
        assertEquals(Route.Write(cardId = "d1"), trashTap(card("d1", slug = null, published = false)))
    }

    // The card page

    @Test fun theBannerIsTheOwnersAndSaysHowLongAndForWhom() {
        fun detail(owner: Boolean, c: FeedCard) = CardDetail(
            card = c, story = "", visibility = CardDetail.Visibility.`private`, anonymous = false, resonanceCount = 0,
            coreInsight = null, isOwner = owner, referenceCard = null,
        )
        assertTrue(ownTrashed(detail(owner = true, c = card())))
        assertFalse(ownTrashed(detail(owner = false, c = card())))
        assertFalse(ownTrashed(detail(owner = true, c = card(trashedAt = null))))
        assertEquals("29 天後永久刪除 · 只有你看得到", trashBannerCaption(card(), now))
    }

    // The thought map

    @Test fun aCardInTheTrashIsOffTheMapAndComesBackToItsPlace() {
        val doc = mapOf("authorId" to "alice", "thoughtCore" to "雨", "visibility" to "private", "accentHue" to 140)
        assertEquals("雨", mapCardOf("c1", doc)?.title)
        assertNull(mapCardOf("c1", doc + ("trashedAt" to "2026-10-19T08:00:00Z")))

        val nodes = mutableMapOf("a" to MapNode("a", 10.0, 20.0, null), "b" to MapNode("b", 300.0, 40.0, "g1"))
        val order = mutableListOf("a", "b")
        val parked = mutableMapOf<String, MapNode>()
        // b went to the trash: out of view, its place kept.
        parkNodes(nodes, order, parked) { it == "a" }
        assertEquals(listOf("a"), order)
        assertEquals(setOf("b"), parked.keys)
        // Restored: back where it was, in its region.
        parkNodes(nodes, order, parked) { true }
        assertEquals(listOf("a", "b"), order)
        assertEquals(300.0, nodes.getValue("b").x, 0.0)
        assertEquals("g1", nodes.getValue("b").groupId)
        assertTrue(parked.isEmpty())
    }

    // The calls

    @Test fun theAppsMovesSendTheTrashsCalls() = runBlocking {
        val api = WritingApi(ApiConfiguration(server.url("/").toString()) { "token" })
        val trash = api.trashCalls(ReadingApi(ApiConfiguration(server.url("/").toString()) { "token" }))
        val cardJson = """{"id":"c1","slug":null,"title":"t","excerpt":"","tags":[],"publishedAt":null,"author":null,"anonymous":false,"visibility":"private","imageUrl":null,"imageLabel":null,"accentHue":null,"readMinutes":1,"referenceCardId":null,"reason":null}"""
        fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)
        server.enqueue(json("""{"card":$cardJson,"changed":true}"""))
        server.enqueue(json("""{"card":$cardJson,"changed":true,"droppedResonance":false}"""))
        server.enqueue(MockResponse().setResponseCode(204))
        server.enqueue(json("""{"deleted":2,"remaining":0,"before":"2026-10-20T08:00:00.000Z"}"""))
        server.enqueue(json("""{"card":$cardJson,"changed":true,"droppedResonance":true}"""))
        // The trash read again: one card in it, one past its days (gone to its owner too).
        val trashed = cardJson.trimEnd('}') + ""","trashedAt":"2026-10-20T08:00:00.000Z","purgeAt":"2099-11-19T08:00:00.000Z","restoresTo":"private"}"""
        val expired = cardJson.replace("\"c1\"", "\"c2\"").trimEnd('}') + ""","trashedAt":"2020-01-01T08:00:00.000Z","purgeAt":"2020-01-31T08:00:00.000Z","restoresTo":"private"}"""
        server.enqueue(json("""{"cards":[$trashed,$expired]}"""))

        trash.trash("c1")
        trash.restore("c1")
        trash.deleteForever("c1")
        assertEquals(WritingApi.EmptiedTrash(2, 0), trash.emptyTrash())
        // The writer's 還原 is the same restore.
        assertTrue(api.writerCalls().restoreCard("c1").droppedResonance)
        assertEquals(1, trash.trashLeft())

        val requests = List(6) { server.takeRequest() }.map { "${it.method} ${it.path}" }
        assertEquals(
            listOf(
                "POST /api/v1/cards/c1/trash",
                "POST /api/v1/cards/c1/restore",
                "DELETE /api/v1/cards/c1?onlyIfTrashed=true",
                "DELETE /api/v1/me/trash",
                "POST /api/v1/cards/c1/restore",
                "GET /api/v1/me/cards?tab=trash",
            ),
            requests,
        )
    }
}
