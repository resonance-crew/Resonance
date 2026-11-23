package com.resonance.kit.api

import okhttp3.Cache
import okhttp3.CacheControl
import okhttp3.Dispatcher
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import java.util.concurrent.TimeUnit

/**
 * The app's HTTP cache for the API: OkHttp keeps what the server lets a private cache keep
 * (`Cache-Control: private, max-age=…` with an `ETag`) and answers from it while it is fresh.
 * What the server can't know is handled here:
 *
 * - **The viewer's own changes.** After a write — any successful non-GET under /api/v1 except a
 *   push registration, a read mark or a reader's own traces (a read counted, a reading report, a
 *   translation asked for), or [invalidate] for writes that go straight to Firestore (drafts,
 *   bookmarks) and for a change to the blocks — each address's next read goes to the server
 *   (`Cache-Control: max-age=0`: revalidated with the stored answer's `If-None-Match`, so what
 *   didn't change comes back as an empty 304), so nothing from before the change comes back
 *   unchecked from the cache.
 * - **Whose cache it is.** [clear] cancels the calls in flight (none can store an answer after
 *   it) and empties the cache: on sign-out, deletion, or another account.
 *
 * [client] is the API's client, built on the app's one OkHttpClient (its connections are
 * shared with the images); it has a dispatcher of its own, so [clear] cancels API calls only.
 */
class HttpCaching(private val cache: Cache?) {
    /** Bumped by every change of the viewer's; an address read before the latest one is read again. */
    @Volatile private var generation = 0L
    /** The generation each address was last read from the server in (the newest 512). */
    private val readIn = object : LinkedHashMap<String, Long>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?) = size > 512
    }
    private val dispatcher = Dispatcher()

    val interceptor: Interceptor = Interceptor { chain ->
        val sent = chain.request()
        if (sent.method != "GET") {
            val response = chain.proceed(sent)
            if (response.isSuccessful && changesReads(sent.url)) invalidate()
            return@Interceptor response
        }
        // This client keeps answers per account and re-asks after the viewer's own changes, so it
        // may reuse a private answer while fresh: the server allows max-age > 0 only to clients
        // that say so (src/lib/api/v1/cache.ts).
        val request = sent.newBuilder().header("X-Resonance-Cache", "1").build()
        val key = request.url.toString()
        val asked = generation
        val last = synchronized(readIn) { readIn[key] }
        // Never read since the latest change (an address first asked for after one counts too):
        // the server answers, not the cache.
        val stale = asked > 0 && (last == null || last < asked)
        // Revalidated, not refetched: OkHttp sends the stored answer's ETag (`If-None-Match`) and a
        // 304 is answered from the cache — `no-cache` / FORCE_NETWORK would drop the validator.
        val response: Response = chain.proceed(if (stale) request.newBuilder().cacheControl(REVALIDATE).build() else request)
        if (response.networkResponse != null) synchronized(readIn) { readIn[key] = asked }
        response
    }

    /** The API's client: [base]'s connections, this cache, and a dispatcher [clear] can cancel. */
    fun client(base: OkHttpClient): OkHttpClient =
        base.newBuilder().dispatcher(dispatcher).cache(cache).addInterceptor(interceptor).build()

    /** The viewer changed something the API reads back: every address is read afresh once. */
    fun invalidate() {
        synchronized(readIn) { generation += 1 }
    }

    /**
     * Forgets everything (blocking: call it off the main thread): [cancelCalls], then [evict].
     */
    fun clear() {
        cancelCalls()
        evict()
    }

    /**
     * The account is leaving: its calls still running are cancelled (none can store an answer
     * after this), and nothing read so far is trusted. Quick — call it before the next account's
     * first call, then [evict] off the main thread.
     */
    fun cancelCalls() {
        dispatcher.cancelAll()
        synchronized(readIn) {
            readIn.clear()
            generation += 1
        }
    }

    /** Empties the stored answers (blocking: disk). */
    fun evict() {
        runCatching { cache?.evictAll() }
    }

    private fun changesReads(url: HttpUrl): Boolean {
        val path = url.encodedPath
        return path.startsWith("/api/v1/") && !path.startsWith("/api/v1/me/devices/") && !isReadMark(path) && !isReaderTrace(path)
    }

    /**
     * A reader's own traces — a read counted (`POST /cards/{key}/read`), a reading report
     * (`/cards/{key}/reading`), a translation asked for (`/cards/{key}/translation`): they change
     * nothing the viewer reads, so one card opened doesn't send the feed, the box and the profile
     * past the cache (iOS `FreshnessMiddleware.unchanging`, audit I5).
     */
    private fun isReaderTrace(path: String): Boolean {
        val segments = path.removePrefix("/api/v1/").split('/')
        return segments.size == 3 && segments[0] == "cards" && segments[1].isNotEmpty() && segments[2] in READER_TRACES
    }

    /**
     * Marking a conversation or bell rows read (Phase 2): it changes only the inbox's and the bell's
     * reads, which the server answers `no-cache` (each read revalidated by its ETag anyway) — so
     * reading a thread as its messages arrive doesn't send every other read past the cache.
     */
    private fun isReadMark(path: String): Boolean =
        path == "/api/v1/notifications/read" || (path.startsWith("/api/v1/conversations/") && path.endsWith("/read"))

    private companion object {
        val READER_TRACES = setOf("read", "reading", "translation")
        /** A stale read: asked of the server with the cached answer's validator (a 304 keeps it). */
        val REVALIDATE: CacheControl = CacheControl.Builder().maxAge(0, TimeUnit.SECONDS).build()
    }
}
