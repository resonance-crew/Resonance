package com.resonance.kit.config

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.ClientConfig
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.apiClient
import com.resonance.kit.api.call
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient

/**
 * Which of the paths `client-config` can switch (GET /api/v1/client-config `features`) this build
 * takes: each converged reading or writing through /api/v1 instead of Firestore, and the one
 * listener on `signals/{uid}`. The old Firestore paths stay in this build for one release, so the
 * server can send an app back to them. The twin of iOS's ClientFeatures.
 */
data class Features(
    val signals: Boolean = false,
    val apiSocial: Boolean = false,
    val apiInbox: Boolean = false,
    val apiBell: Boolean = false,
    val apiThoughtMap: Boolean = false,
    val apiDrafts: Boolean = false,
) {
    companion object {
        /** What a build that has never heard from client-config does: everything as before (Firestore). */
        val LEGACY = Features()

        fun of(config: ClientConfig?): Features = config?.features?.let {
            Features(it.signals, it.apiSocial, it.apiInbox, it.apiBell, it.apiThoughtMap, it.apiDrafts)
        } ?: LEGACY
    }
}

/** Whether this build may go on, as client-config's builds say. */
enum class UpdateNeed {
    None,
    /** A newer build is out (`recommendedBuild`): a note the person may let go. */
    Recommended,
    /** This build is below `minBuild`: the app shows nothing but the way to the store. */
    Required;

    companion object {
        /** [build] is this app's versionCode; no config (never fetched) asks nothing. */
        fun of(config: ClientConfig?, build: Int): UpdateNeed {
            config ?: return None
            return when {
                build < config.minBuild.android -> Required
                build < config.recommendedBuild.android -> Recommended
                else -> None
            }
        }
    }
}

/** GET /api/v1/client-config — public: the token rides along when there is one, and is not needed. */
class ClientConfigApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, apiClient(http, configuration)),
    )

    suspend fun fetch(): ClientConfig = call { api.getClientConfig() }
}

/**
 * client-config as this install last read it: read from [storage] at once (a cold start decides
 * with what it had, never waits for the network), asked again at launch and back in the foreground
 * at most once per [throttleMillis], and written back. Never read → [Features.LEGACY], no update
 * asked. A failed read keeps what was kept.
 */
class ClientConfigStore(
    private val fetch: suspend () -> ClientConfig,
    private val storage: Storage,
    private val now: () -> Long = System::currentTimeMillis,
    private val throttleMillis: Long = THROTTLE_MILLIS,
) {
    /** Where the last answer is kept (the app: SharedPreferences). */
    interface Storage {
        fun read(): String?
        fun write(json: String)
    }

    private val _config = MutableStateFlow(storage.read()?.let(::decode))
    /** The last answer (null: never read on this install). */
    val config: StateFlow<ClientConfig?> = _config
    val features: Features get() = Features.of(_config.value)

    private val asking = Mutex()
    private var askedAt: Long? = null

    /** Asks the server, unless it was asked less than [throttleMillis] ago ([force]: asks anyway). Whether it answered. */
    suspend fun refresh(force: Boolean = false): Boolean = asking.withLock {
        val at = now()
        val last = askedAt
        if (!force && last != null && at - last < throttleMillis) return false
        askedAt = at
        val fresh = try {
            fetch()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Offline, a server error: what was kept stands, and the next return asks again.
            askedAt = null
            return false
        }
        _config.value = fresh
        runCatching { storage.write(json.encodeToString(ClientConfig.serializer(), fresh)) }
        true
    }

    companion object {
        /** At launch, then no more than this often on the way back to the foreground. */
        const val THROTTLE_MILLIS = 5 * 60_000L
        private val json = Json { ignoreUnknownKeys = true }

        /** A kept answer; one this build can't read is none (everything as before). */
        fun decode(text: String): ClientConfig? = runCatching { json.decodeFromString(ClientConfig.serializer(), text) }.getOrNull()
    }
}
