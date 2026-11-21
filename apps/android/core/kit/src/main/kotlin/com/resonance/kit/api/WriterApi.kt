package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.CreateDraftRequest
import com.resonance.api.models.CreatedDraft
import com.resonance.api.models.DraftSaved
import com.resonance.api.models.MapOp
import com.resonance.api.models.MapOpsRequest
import com.resonance.api.models.MapOpsResponse
import com.resonance.api.models.PendingEdit
import com.resonance.api.models.PendingEditRequest
import com.resonance.api.models.ThoughtMap
import com.resonance.api.models.UpdateDraftRequest
import okhttp3.OkHttpClient

/**
 * The writer's own documents through the contract (Phase 2, behind client-config's `apiDrafts` and
 * `apiThoughtMap`), in place of the app's straight Firestore writes: a draft made under the id the
 * device chose, its autosaves numbered by `rev` (a late or repeated one never overwrites newer
 * words), a published card's pending edit, and the thought map read whole and changed in batches of
 * ops. The twin of iOS's WriterAPI.
 */
class WriterApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, apiClient(http, configuration)),
    )

    /** POST /cards: 201 made, 200 resent for your own draft (`created: false`); 409 an id in use or deleted for good. */
    suspend fun createDraft(request: CreateDraftRequest): CreatedDraft = call { api.createDraft(request) }

    /** PATCH /cards/{id}/draft: applied only when `rev` is above the stored one (else `applied: false` and the stored rev). */
    suspend fun saveDraft(id: String, request: UpdateDraftRequest): DraftSaved = call { api.saveDraft(id, request) }

    /** GET /cards/{id}/edits/current: the published card's working copy, or null when it has none. */
    suspend fun pendingEdit(id: String): PendingEdit? = call { api.getPendingEdit(id) }.edit

    /** PUT /cards/{id}/edits/current: the whole working copy, by the same `rev` rule as a draft's save. */
    suspend fun savePendingEdit(id: String, request: PendingEditRequest): DraftSaved = call { api.savePendingEdit(id, request) }

    /** DELETE /cards/{id}/edits/current: whether there was one. */
    suspend fun discardPendingEdit(id: String): Boolean = call { api.discardPendingEdit(id) }.deleted

    /** GET /me/thought-map: the whole map (ETag: an unchanged one is a 304 the HTTP cache answers). */
    suspend fun thoughtMap(): ThoughtMap = call { api.getThoughtMap() }

    /** POST /me/thought-map/ops: 1–[MAX_OPS] changes, in order and all together. */
    suspend fun applyMapOps(ops: List<MapOp>): MapOpsResponse = call { api.applyThoughtMapOps(MapOpsRequest(ops)) }

    companion object {
        /** The most ops one batch may carry (MapOpsRequest's maxItems). */
        const val MAX_OPS = 200
    }
}
