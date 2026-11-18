package com.resonance.kit

import com.resonance.api.models.ReadingReportRequest
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.TapApi
import com.resonance.kit.story.ReadTime
import com.resonance.api.models.NotificationSettings
import com.resonance.kit.push.NotificationSwitch
import com.resonance.kit.push.default
import com.resonance.kit.push.get
import com.resonance.kit.push.with
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The resonance tap and the reading report (round 26 §R1, §R3) through the generated client, against a local server. */
class TapApiTest {
    private val server = MockWebServer()
    private val config get() = ApiConfiguration(server.url("/").toString()) { "token" }

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    private fun json(body: String, code: Int = 200) = MockResponse().setResponseCode(code).setBody(body).setHeader("Content-Type", "application/json")

    @Test fun tappingIsAPutTakingItBackADelete() = runBlocking {
        server.enqueue(json("""{"on":true,"changed":true}"""))
        server.enqueue(json("""{"on":false,"changed":true}"""))
        val api = TapApi(config)
        assertTrue(api.set("rain", on = true))
        assertFalse(api.set("rain", on = false))
        val put = server.takeRequest()
        assertEquals("PUT", put.method)
        assertEquals("/api/v1/cards/rain/tap", put.path)
        assertEquals("DELETE", server.takeRequest().method)
    }

    @Test fun aNamedCardAcrossABlockIsRefused() = runBlocking {
        server.enqueue(json("""{"error":{"code":"blocked","message":"Blocked."}}""", 409))
        val e = assertFailsWith<ApiFailure> { TapApi(config).set("rain", on = true) }
        assertEquals(409, e.status)
    }

    @Test fun theListComesAPageAtATime() = runBlocking {
        val author = """{"id":"carol","handle":"carol","initials":"CA","accentColor":"oklch(88% 0.08 55)","avatarUrl":null,"avatarSeed":"3","verified":false,"region":null}"""
        server.enqueue(json("""{"people":[{"author":$author,"note":{"excerpt":"讀到搬家那段"}}],"nextPageToken":"t2"}"""))
        server.enqueue(json("""{"people":[],"nextPageToken":null}"""))
        val api = TapApi(config)
        val first = api.taps("rich-story")
        assertEquals("讀到搬家那段", first.people.single().note?.excerpt)
        assertEquals("t2", first.nextPageToken)
        assertNull(api.taps("rich-story", "t2").nextPageToken)
        server.takeRequest()
        assertEquals("/api/v1/cards/rich-story/taps?pageToken=t2", server.takeRequest().path)
    }

    @Test fun aReadingReportCarriesItsRunningTotals() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))
        ReadingApi(config).reportReading("rain", ReadingReportRequest("view-0001", 42.5, 0.75, reachedEnd = true))
        val sent = server.takeRequest()
        assertEquals("POST", sent.method)
        assertEquals("/api/v1/cards/rain/reading", sent.path)
        val body = Json.parseToJsonElement(sent.body.readUtf8()).jsonObject
        assertEquals("view-0001", body["session"]!!.jsonPrimitive.content)
        assertEquals("42.5", body["activeSeconds"]!!.jsonPrimitive.content)
        assertEquals("true", body["reachedEnd"]!!.jsonPrimitive.content)
    }

    @Test fun theExpectedTimeIsUnrounded() {
        // 160 CJK characters: half a minute, though the list says 1 min.
        val text = "雨".repeat(160)
        assertEquals(30.0, ReadTime.seconds(text), 1e-9)
        assertEquals(1, ReadTime.minutes(text))
    }

    @Test fun someoneResonatingRingsUnlessTurnedOff() {
        // 有人共振 (§U8.3): a server without the switch rings them; a new account starts with it on.
        val old = NotificationSettings(picks = false, connectionCards = false)
        assertTrue(old[NotificationSwitch.ResonanceTaps])
        assertFalse(old.with(NotificationSwitch.ResonanceTaps, false)[NotificationSwitch.ResonanceTaps])
        assertTrue(NotificationSwitch.ResonanceTaps.default)
    }
}
