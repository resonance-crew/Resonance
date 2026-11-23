package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.BellPage
import com.resonance.api.models.Conversation
import com.resonance.api.models.MarkNotificationsReadRequest
import com.resonance.api.models.MessagePage
import okhttp3.OkHttpClient

/**
 * Conversations, their messages and the bell through the contract (Phase 2, behind client-config's
 * `apiInbox` / `apiBell`), in place of the Firestore listeners. Every read answers an ETag and
 * `private, no-cache`, so the app's HTTP cache asks again with `If-None-Match` and an unchanged
 * answer comes back as a 304 with no body — what makes the pulls a signal (`signals/{uid}`) or the
 * foreground's minute asks for cheap. The twin of iOS's InboxAPI.
 */
class InboxApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, apiClient(http, configuration)),
    )

    /** Every conversation of the viewer's, newest first (pages of 50 followed, up to [maxPages]). */
    suspend fun conversations(maxPages: Int = 10): List<Conversation> = conversationList(maxPages).conversations

    /** A whole read of the list: the conversations, and whether they are all of them (false: [maxPages] ended it with more to come). */
    data class Listed(val conversations: List<Conversation>, val complete: Boolean)

    /** [conversations], saying whether the pages ran out before [maxPages] did. */
    suspend fun conversationList(maxPages: Int = 10): Listed {
        val all = ArrayList<Conversation>()
        var token: String? = null
        var pages = 0
        do {
            val page = call { api.listConversations(pageToken = token) }
            all += page.conversations
            token = page.nextPageToken
        } while (token != null && ++pages < maxPages)
        return Listed(all, complete = token == null)
    }

    /**
     * Only these conversations (GET /conversations?pairs=, 1–[PAIRS_MAX] ids): the viewer's of them,
     * most recently active first, each with its person; one deleted, or not theirs, is left out.
     */
    suspend fun conversations(pairs: Collection<String>): List<Conversation> {
        require(pairs.size in 1..PAIRS_MAX) { "1–$PAIRS_MAX pairs a request" }
        return call { api.listConversations(pairs = pairs.joinToString(",")) }.conversations
    }

    companion object {
        /** The most conversations one `?pairs=` asks for (the API's cap). */
        const val PAIRS_MAX = 20
    }

    /** One conversation; null when there is none the viewer is in (the server says the same 404 either way). */
    suspend fun conversation(pair: String): Conversation? = try {
        call { api.getConversation(pair) }
    } catch (e: ApiFailure) {
        if (e.status == 404) null else throw e
    }

    /**
     * A page of [pair]'s messages, newest first: no cursor, the newest [limit]; [before] the page
     * older than a message's cursor; [after] the [limit] right after one (`hasNewer`: ask again from
     * `newerCursor`). A conversation the viewer isn't in (or none) is a 404 [ApiFailure].
     */
    suspend fun messages(pair: String, before: String? = null, after: String? = null, limit: Int = 50): MessagePage =
        call { api.listMessages(pair, before = before, after = after, limit = limit) }

    /** The viewer read [pair] (their unread count there goes to 0). */
    suspend fun markRead(pair: String) = call { api.markConversationRead(pair) }

    /**
     * The bell's newest rows (and the people they name). [changes]: the answer carries an
     * `updatedCursor`; [updatedAfter] (an earlier answer's cursor): only the rows changed since it,
     * `delta: true` — or, when the server can't tell them all, the newest page whole (no `delta`).
     * The bell's delta reader is BellReader (the web's `bellReader`).
     */
    suspend fun bell(limit: Int = 50, updatedAfter: String? = null, changes: Boolean = false): BellPage = call {
        api.getBell(
            pageToken = null, limit = limit, updatedAfter = updatedAfter,
            // `updatedAfter` implies it: asked only for a whole read.
            changes = if (changes && updatedAfter == null) DefaultApi.ChangesGetBell._1 else null,
        )
    }

    /** These bell rows were read (1–50 ids a request). */
    suspend fun markBellRead(ids: Collection<String>) {
        ids.filter { it.isNotEmpty() }.distinct().chunked(50).forEach { chunk ->
            call { api.markNotificationsRead(MarkNotificationsReadRequest(ids = chunk)) }
        }
    }
}
