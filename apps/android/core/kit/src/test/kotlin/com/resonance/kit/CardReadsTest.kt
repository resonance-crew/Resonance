package com.resonance.kit

import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.reading.CardReads
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.Test
import kotlin.test.assertEquals

/** A reader's reads of a card told to the server: which pages count, once per account and card, and a failure retried. */
class CardReadsTest {
    private val lenient = Json { ignoreUnknownKeys = true }

    private fun page(id: String = "c1", owner: Boolean = false): CardDetail =
        lenient.decodeFromString(CardDetail.serializer(), detailJson(id, null, owner = owner))

    @Test fun countsSomeoneElsesPublishedCardOncePerAccountAndCard() = runBlocking {
        val sent = mutableListOf<String>()
        val reads = CardReads { sent += it }
        reads.count("ann", page("c1"))
        reads.count("ann", page("c1"))
        reads.count("ann", page("c2"))
        reads.count("cat", page("c1"))
        reads.count(null, page("c3"))
        assertEquals(listOf("c1", "c2", "c1"), sent)
    }

    @Test fun leavesOutOwnPrivateUnpublishedAndTrashedCards() = runBlocking {
        val sent = mutableListOf<String>()
        val reads = CardReads { sent += it }
        val p = page()
        reads.count("ann", page(owner = true))
        reads.count("ann", p.copy(card = p.card.copy(visibility = FeedCard.Visibility.`private`)))
        reads.count("ann", p.copy(card = p.card.copy(publishedAt = null)))
        reads.count("ann", p.copy(card = p.card.copy(trashedAt = "2026-10-30T08:00:00.000Z")))
        assertEquals(emptyList(), sent)
        // A card for connections only is the server's to judge.
        reads.count("ann", p.copy(card = p.card.copy(visibility = FeedCard.Visibility.connections)))
        assertEquals(listOf("c1"), sent)
    }

    @Test fun aFailureIsSwallowedAndALaterVisitAsksAgain() = runBlocking {
        var attempts = 0
        val reads = CardReads { attempts++; if (attempts == 1) throw ApiFailure("internal", "HTTP 500", 500) }
        reads.count("ann", page())
        reads.count("ann", page())
        reads.count("ann", page())
        assertEquals(2, attempts)
    }

    @Test fun postsToTheCardsReadRoute() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(MockResponse().setResponseCode(204))
            ReadingApi(ApiConfiguration(server.url("/").toString()) { "token" }).countRead("c1")
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/v1/cards/c1/read", request.path)
        } finally {
            server.shutdown()
        }
    }
}
