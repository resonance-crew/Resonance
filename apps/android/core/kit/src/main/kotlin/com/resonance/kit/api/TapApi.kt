package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.TapList
import com.resonance.api.models.TapPassageRequest
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

    /**
     * Says which of card [id]'s passages stayed with the viewer (round 27 §P4, `PUT …/tap/passage`, setTapPassage): one
     * of `CardTap.passages`' ids, or null to clear it; answers the pick as it stands now. Only the author learns it;
     * nothing rings. 409 when the viewer's tap is off, 400 when [passage] is not one the card offers now (its story
     * changed: read the card again), 404 wherever the card's `tap` is null — each an [ApiFailure].
     */
    suspend fun setPassage(id: String, passage: String?): String? = call { api.setTapPassage(id, TapPassageRequest(passage)) }.passage

    /**
     * A page of the people behind the faces ([pageToken]: the last page's `nextPageToken`). [passage] (round 29 §S4.4,
     * the author's alone): only the people who picked that sentence (one of `CardTap.picked`' ids), newest first; for a
     * reader it changes nothing.
     */
    suspend fun taps(id: String, pageToken: String? = null, passage: String? = null): TapList = call { api.getCardTaps(id, pageToken, passage) }
}
