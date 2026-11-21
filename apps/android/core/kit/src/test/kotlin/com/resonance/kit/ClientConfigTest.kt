package com.resonance.kit

import com.resonance.api.models.ClientBuilds
import com.resonance.api.models.ClientConfig
import com.resonance.api.models.ClientFeatures
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.config.ClientConfigApi
import com.resonance.kit.config.ClientConfigStore
import com.resonance.kit.config.Features
import com.resonance.kit.config.UpdateNeed
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * client-config (Phase 2): the switches between the old Firestore paths and /api/v1, and the
 * builds below which the app only offers the store. A build that never heard from it changes
 * nothing; what it heard is kept for the next cold start; a failure keeps what was kept.
 */
class ClientConfigTest {
    private val server = MockWebServer()

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    private class Memory(var text: String? = null) : ClientConfigStore.Storage {
        override fun read() = text
        override fun write(json: String) {
            text = json
        }
    }

    private fun config(min: Int = 0, recommended: Int = 0, inbox: Boolean = true) = ClientConfig(
        minBuild = ClientBuilds(ios = 0, android = min),
        recommendedBuild = ClientBuilds(ios = 0, android = recommended),
        features = ClientFeatures(signals = true, apiSocial = true, apiInbox = inbox, apiBell = true, apiThoughtMap = true, apiDrafts = false),
    )

    private val body = """{"minBuild":{"ios":3,"android":18},"recommendedBuild":{"ios":0,"android":20},
        "features":{"signals":true,"apiSocial":true,"apiInbox":false,"apiBell":true,"apiThoughtMap":true,"apiDrafts":false,"later":true}}"""

    @Test fun neverFetchedKeepsEveryOldPathAndAsksNoUpdate() {
        val store = ClientConfigStore(fetch = { error("offline") }, storage = Memory())
        assertNull(store.config.value)
        assertEquals(Features.LEGACY, store.features)
        assertFalse(store.features.apiInbox || store.features.apiSocial || store.features.apiBell || store.features.signals)
        assertEquals(UpdateNeed.None, UpdateNeed.of(store.config.value, build = 1))
    }

    @Test fun readsTheContractsAnswerAndKeepsItForTheNextColdStart() = runBlocking {
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody(body))
        val api = ClientConfigApi(ApiConfiguration(server.url("/").toString()) { null })
        val disk = Memory()
        val store = ClientConfigStore(fetch = api::fetch, storage = disk)
        assertTrue(store.refresh())
        assertEquals("/api/v1/client-config", server.takeRequest().path)
        assertEquals(Features(signals = true, apiSocial = true, apiInbox = false, apiBell = true, apiThoughtMap = true, apiDrafts = false), store.features)
        // The next launch decides with what was kept, before any network.
        val next = ClientConfigStore(fetch = { error("offline") }, storage = disk)
        assertEquals(18, next.config.value?.minBuild?.android)
        assertFalse(next.features.apiInbox)
        assertTrue(next.features.apiBell)
    }

    @Test fun aFailedReadKeepsWhatWasKeptAndIsAskedAgainAtOnce() = runBlocking {
        val disk = Memory()
        var fail = false
        var asked = 0
        val store = ClientConfigStore(fetch = { asked++; if (fail) error("offline") else config(inbox = true) }, storage = disk, now = { 0L })
        assertTrue(store.refresh())
        fail = true
        assertFalse(store.refresh(force = true))
        assertTrue(store.features.apiInbox)
        // A failure doesn't count against the throttle.
        assertFalse(store.refresh())
        assertEquals(3, asked)
    }

    @Test fun theForegroundAsksAtMostOncePerThrottle() = runBlocking {
        var clock = 0L
        var asked = 0
        val store = ClientConfigStore(fetch = { asked++; config() }, storage = Memory(), now = { clock }, throttleMillis = 1000)
        store.refresh()
        clock = 999
        assertFalse(store.refresh())
        clock = 1000
        assertTrue(store.refresh())
        assertEquals(2, asked)
    }

    @Test fun aKeptAnswerThisBuildCantReadIsNone() {
        val store = ClientConfigStore(fetch = { error("offline") }, storage = Memory("{not json"))
        assertNull(store.config.value)
        assertEquals(Features.LEGACY, store.features)
    }

    @Test fun belowMinBuildOnlyTheStoreBelowRecommendedANote() {
        val c = config(min = 18, recommended = 20)
        assertEquals(UpdateNeed.Required, UpdateNeed.of(c, build = 17))
        assertEquals(UpdateNeed.Recommended, UpdateNeed.of(c, build = 18))
        assertEquals(UpdateNeed.Recommended, UpdateNeed.of(c, build = 19))
        assertEquals(UpdateNeed.None, UpdateNeed.of(c, build = 20))
        // The defaults (builds 0) ask nothing of anyone.
        assertEquals(UpdateNeed.None, UpdateNeed.of(config(), build = 1))
    }
}
