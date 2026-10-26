package com.resonance.kit.api

import java.util.concurrent.TimeUnit
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient

/**
 * The app's one OkHttpClient — the API and the pictures share its connections and threads (the
 * twin of iOS's AppHTTP). How long a request may wait is set here instead of OkHttp's ten-second
 * defaults: room for the server's model-backed routes (tags, the insight, publishing's slug)
 * without a stalled connection holding a screen for a minute. Every request says which app and
 * version it comes from.
 */
object AppHttp {
    const val CONNECT_TIMEOUT_SECONDS = 15L
    /** Between two reads of an answer (the illustration's stream sets its own, longer one). */
    const val READ_TIMEOUT_SECONDS = 30L
    const val WRITE_TIMEOUT_SECONDS = 30L

    /** `Resonance/2.0.0 (Android 15; build 4)`. */
    fun userAgent(version: String, build: Long, osVersion: String): String = "Resonance/$version (Android $osVersion; build $build)"

    fun client(userAgent: String): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .addInterceptor(Interceptor { chain -> chain.proceed(chain.request().newBuilder().header("User-Agent", userAgent).build()) })
        // A network interceptor: asked again on every hop, so a redirect off our API never carries the token.
        .addNetworkInterceptor(Interceptor { chain ->
            val request = chain.request()
            val token = AppCheckHeader.token
            // Our API only, by its host: the same client loads every picture — a story's from any host an
            // author names, `/api/` in its path or not — and no other host has any business with the token.
            if (token == null || !AppCheckHeader.isApi(request.url)) chain.proceed(request)
            else chain.proceed(request.newBuilder().header(AppCheckHeader.NAME, token).build())
        })
        .build()
}

/**
 * The app's current Firebase App Check token, as the app last heard it (Play Integrity in release
 * builds; see AppFirebase) — the twin of iOS's AppCheckHeader. The API only watches it for now,
 * refusing nothing without one, so a request never waits for a token: it carries the one at hand.
 */
object AppCheckHeader {
    const val NAME = "X-Firebase-AppCheck"

    /** The API's origin (the session's ApiConfiguration sets it): the one host the token goes to. */
    @Volatile var apiOrigin: HttpUrl? = null

    /** Whether [url] is our API: the configured origin's scheme, host and port, under `/api/`. */
    fun isApi(url: HttpUrl): Boolean {
        val api = apiOrigin ?: return false
        return url.scheme == api.scheme && url.host == api.host && url.port == api.port && url.encodedPath.startsWith("/api/")
    }

    @Volatile var token: String? = null
        set(value) {
            field = value?.takeIf { it.isNotEmpty() }
        }
}
