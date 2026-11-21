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
    suspend fun conversations(maxPages: Int = 10): List<Conversation> {
        val all = ArrayList<Conversation>()
        var token: String? = null
        var pages = 0
        do {
            val page = call { api.listConversations(token) }
            all += page.conversations
            token = page.nextPageToken
        } while (token != null && ++pages < maxPages)
        return all
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
        call { api.listMessages(pair, before, after, limit) }

    /** The viewer read [pair] (their unread count there goes to 0). */
    suspend fun markRead(pair: String) = call { api.markConversationRead(pair) }

    /** The bell's newest rows (and the people they name). */
    suspend fun bell(limit: Int = 50): BellPage = call { api.getBell(null, limit) }

    /** These bell rows were read (1–50 ids a request). */
    suspend fun markBellRead(ids: Collection<String>) {
        ids.filter { it.isNotEmpty() }.distinct().chunked(50).forEach { chunk ->
            call { api.markNotificationsRead(MarkNotificationsReadRequest(ids = chunk)) }
        }
    }
}
