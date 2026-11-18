package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.TapList
import okhttp3.OkHttpClient

/**
 * The resonance tap (round 26 §R1): 共振 on a card someone else wrote, and the people who did.
 * `PUT` / `DELETE /api/v1/cards/{id}/tap` answer `{ on, changed }`; a named card across a block is
 * 403 `blocked`, the viewer's own card 400, a missing pen name 403 — each an [ApiFailure]. Taking a
 * tap back tells no one. `GET …/taps` is the list behind the faces: the author's everyone (30 a
 * page, each with the first line of their latest note on a named card), a reader's their
 * connections (one page). The twin of iOS's TapAPI.
 */
class TapApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, apiClient(http, configuration)),
    )

    /** Turns the viewer's tap on card [id] on ([on]) or takes it back; answers whether it is on now. */
    suspend fun set(id: String, on: Boolean): Boolean = call { if (on) api.tapCard(id) else api.untapCard(id) }.on

    /** A page of the people behind the faces ([pageToken]: the last page's `nextPageToken`). */
    suspend fun taps(id: String, pageToken: String? = null): TapList = call { api.getCardTaps(id, pageToken) }
}
