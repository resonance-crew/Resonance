package com.resonance.kit

import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.Trash
import com.resonance.kit.api.WritingApi
import com.resonance.kit.api.isTrashed
import com.resonance.kit.api.purgeInstant
import com.resonance.kit.api.trashedInstant
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The trash through the contract (trash.spec §2 and §6 "Kits"): moving a card in and back out, the
 * guarded permanent delete, emptying it page by page under one moment, the trash shelf and its
 * cards' dates, and the refusals a writer meets when its card went to the trash elsewhere.
 */
class TrashApiTest {
    private val server = MockWebServer()
    private fun writing() = WritingApi(ApiConfiguration(server.url("/").toString()) { "token" })
    private fun reading() = ReadingApi(ApiConfiguration(server.url("/").toString()) { "token" })

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    /** Your card as the trash shows it: private while there, with when it went in, when it goes and what it comes back as. */
    private fun trashedJson(id: String, restoresTo: String = "public") = cardJson(id, "a-walk", authorId = "alice", visibility = "private")
        .trimEnd('}') + ""","trashedAt":"2026-10-01T08:00:00.000Z","purgeAt":"2026-10-31T08:00:00.000Z","restoresTo":"$restoresTo"}"""

    private fun refusal(status: Int, code: String, message: String) =
        MockResponse().setResponseCode(status).setHeader("Content-Type", "application/json").setBody("""{"error":{"code":"$code","message":"$message"}}""")

    @Test fun movesACardToTheTrashAndAnswersItAsTheTrashShowsIt() = runBlocking {
        server.enqueue(json("""{"card":${trashedJson("c1")},"changed":true}"""))
        val trashed = writing().trashCard("c1")
        assertTrue(trashed.changed)
        assertTrue(trashed.card.isTrashed)
        assertEquals("private", trashed.card.visibility.value)
        assertEquals(FeedCard.RestoresTo.`public`, trashed.card.restoresTo)
        assertEquals(Instant.parse("2026-10-01T08:00:00Z"), trashed.card.trashedInstant)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/cards/c1/trash", request.path)
        assertEquals("Bearer token", request.getHeader("Authorization"))
    }

    @Test fun aSecondTrashChangesNothingAndSomeoneElsesCardIsNotFound() = runBlocking {
        server.enqueue(json("""{"card":${trashedJson("c1")},"changed":false}"""))
        assertFalse(writing().trashCard("c1").changed)
        server.enqueue(refusal(404, "not_found", "No such card."))
        assertTrue(assertFailsWith<ApiFailure> { writing().trashCard("theirs") }.isNotFound)
    }

    @Test fun restoresACardAndSaysWhenItCameBackStandingAlone() = runBlocking {
        server.enqueue(json("""{"card":${cardJson("c1", "a-walk", authorId = "alice")},"changed":true,"droppedResonance":true}"""))
        val restored = writing().restoreCard("c1")
        assertTrue(restored.changed)
        assertTrue(restored.droppedResonance)
        assertFalse(restored.card.isTrashed)
        assertNull(restored.card.purgeInstant)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/cards/c1/restore", request.path)
    }

    @Test fun deletingForGoodFromTheTrashAsksTheServerToCheckItIsStillThere() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))
        writing().deleteCard("c1", onlyIfTrashed = true)
        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1/cards/c1?onlyIfTrashed=true", request.path)
        // Restored meanwhile on another device: the server keeps it, and says so.
        server.enqueue(refusal(409, "conflict", ApiFailure.NOT_IN_TRASH_MESSAGE))
        val refused = assertFailsWith<ApiFailure> { writing().deleteCard("c1", onlyIfTrashed = true) }
        assertTrue(refused.isNotInTrash)
        assertFalse(refused.isInTrash)
        // The delete older builds send carries no condition.
        server.enqueue(MockResponse().setResponseCode(204))
        writing().deleteCard("c2")
        server.takeRequest()
        assertEquals("/api/v1/cards/c2", server.takeRequest().path)
    }

    @Test fun emptiesTheTrashPageByPageUnderTheFirstAnswersMoment() = runBlocking {
        val first = "2026-10-20T03:00:00.123Z"
        server.enqueue(json("""{"deleted":50,"remaining":70,"before":"$first"}"""))
        server.enqueue(json("""{"deleted":50,"remaining":20,"before":"$first"}"""))
        server.enqueue(json("""{"deleted":20,"remaining":0,"before":"$first"}"""))
        assertEquals(WritingApi.EmptiedTrash(deleted = 120, remaining = 0), writing().emptyTrash())
        assertEquals(3, server.requestCount)
        val asks = List(3) { server.takeRequest() }
        asks.forEach {
            assertEquals("DELETE", it.method)
            assertEquals("/api/v1/me/trash", it.requestUrl!!.encodedPath)
        }
        // The first takes what is there now; every next one the first one's moment, so a card trashed meanwhile stays.
        assertNull(asks[0].requestUrl!!.queryParameter("before"))
        for (ask in asks.drop(1)) {
            assertEquals(OffsetDateTime.parse(first).toInstant(), OffsetDateTime.parse(ask.requestUrl!!.queryParameter("before")).toInstant())
        }
    }

    @Test fun emptyingStopsWhenAPageDeletesNothingAndAfterTwentyPages() = runBlocking {
        // Cards the server keeps failing to delete: no endless loop.
        server.enqueue(json("""{"deleted":0,"remaining":3,"before":"2026-10-20T03:00:00.000Z"}"""))
        assertEquals(WritingApi.EmptiedTrash(deleted = 0, remaining = 3), writing().emptyTrash())
        assertEquals(1, server.requestCount)
        repeat(WritingApi.EMPTY_TRASH_CALLS + 5) { server.enqueue(json("""{"deleted":1,"remaining":100,"before":"2026-10-20T03:00:00.000Z"}""")) }
        assertEquals(WritingApi.EmptiedTrash(deleted = WritingApi.EMPTY_TRASH_CALLS, remaining = 100), writing().emptyTrash())
        assertEquals(1 + WritingApi.EMPTY_TRASH_CALLS, server.requestCount)
    }

    @Test fun emptyingOverBudgetIsTheContractsError() = runBlocking {
        server.enqueue(refusal(429, "rate_limited", "Too many requests."))
        assertEquals("rate_limited", assertFailsWith<ApiFailure> { writing().emptyTrash() }.code)
    }

    @Test fun aWriteToACardInTheTrashIsToldApart() = runBlocking {
        server.enqueue(refusal(409, "conflict", ApiFailure.IN_TRASH_MESSAGE))
        val refused = assertFailsWith<ApiFailure> { writing().publish("c1") }
        assertTrue(refused.isInTrash)
        assertFalse(refused.isNotInTrash)
        server.enqueue(refusal(409, "conflict", ApiFailure.IN_TRASH_MESSAGE))
        assertTrue(assertFailsWith<ApiFailure> { writing().applyEdit("c1") }.isInTrash)
        server.enqueue(refusal(409, "conflict", ApiFailure.IN_TRASH_MESSAGE))
        assertTrue(assertFailsWith<ApiFailure> { writing().updateCard("c1", visibility = "public") }.isInTrash)
        // Another conflict is not the trash's.
        server.enqueue(refusal(409, "conflict", "That card already answers another card."))
        assertFalse(assertFailsWith<ApiFailure> { writing().resonate("theirs", "c1") }.isInTrash)
    }

    @Test fun theTrashShelfComesWithTheOtherShelvesAndAlone() = runBlocking {
        server.enqueue(json("""{"published":${listJson("p1")},"trash":{"cards":[${trashedJson("t1", restoresTo = "connections")}]}}"""))
        val box = reading().cardBox(listOf(TabGetCardBox.published, TabGetCardBox.trash))
        val trash = box.getValue(TabGetCardBox.trash)
        assertEquals(listOf("t1"), trash.map { it.id })
        assertEquals(FeedCard.RestoresTo.connections, trash.single().restoresTo)
        assertEquals(Instant.parse("2026-10-31T08:00:00Z"), trash.single().purgeInstant)
        assertEquals("published,trash", server.takeRequest().requestUrl!!.queryParameter("shelves"))

        server.enqueue(json("""{"cards":[${trashedJson("t1")}]}"""))
        assertEquals(listOf("t1"), reading().cardBox(TabGetCardBox.trash).map { it.id })
        val alone = server.takeRequest().requestUrl!!
        assertEquals("/api/v1/me/cards", alone.encodedPath)
        assertEquals("trash", alone.queryParameter("tab"))
    }

    @Test fun theTrashsClockCountsWholeDaysUpToItsLastDay() {
        val inAt = Instant.parse("2026-10-01T08:00:00Z")
        val purge = Trash.purgeAtOf(inAt)
        assertEquals(Instant.parse("2026-10-31T08:00:00Z"), purge)
        assertEquals(Trash.DaysLeft(lastDay = false, days = 30), Trash.daysLeft(purge, inAt))
        assertEquals(Trash.DaysLeft(lastDay = false, days = 2), Trash.daysLeft(purge, purge - Duration.ofHours(25)))
        assertEquals(Trash.DaysLeft(lastDay = true, days = 1), Trash.daysLeft(purge, purge - Duration.ofHours(24)))
        assertEquals(Trash.DaysLeft(lastDay = true, days = 1), Trash.daysLeft(purge, purge - Duration.ofMinutes(5)))
        // Past it (the purge not there yet): never fewer than one, and gone to its owner.
        assertEquals(Trash.DaysLeft(lastDay = true, days = 1), Trash.daysLeft(purge, purge + Duration.ofHours(3)))
        assertTrue(Trash.expired(purge, purge))
        assertFalse(Trash.expired(purge, purge - Duration.ofMillis(1)))
    }

    @Test fun aCardWithoutTheServersPurgeDateCountsThirtyDaysFromWhenItWentIn() {
        val json = cardJson("t1", authorId = "alice").trimEnd('}') + ""","trashedAt":"2026-10-01T08:00:00.000Z"}"""
        val card = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }.decodeFromString(FeedCard.serializer(), json)
        assertEquals(Instant.parse("2026-10-31T08:00:00Z"), card.purgeInstant)
        assertFalse(feedCard("x").isTrashed)
    }
}
