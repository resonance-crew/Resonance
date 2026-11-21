package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.BlockedPerson
import com.resonance.api.models.Connection
import com.resonance.api.models.Me
import com.resonance.api.models.Person
import com.resonance.api.models.UpdateProfileRequest
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import okhttp3.OkHttpClient

/**
 * The social graph through the contract (Phase 2, behind client-config's `apiSocial`): people by
 * id, bookmarks, blocks, connections, and the profile fields the app used to write to
 * `users/{uid}` itself (the avatar's URL, the hints' counts). A block is one server transaction —
 * the block, the connection ended, the invites withdrawn both ways — so the app makes one call.
 * The twin of iOS's SocialAPI.
 */
class SocialApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, apiClient(http, configuration)),
    )

    /**
     * People by id (GET /users?ids=, 30 a request, side by side for more), in no promised order. A
     * deleted account answers `gone` with no author; one the viewer can't see, as their profile does.
     */
    suspend fun users(ids: Collection<String>): List<Person> = coroutineScope {
        ids.filter { it.isNotEmpty() && '/' !in it }.distinct().chunked(USERS_PER_REQUEST)
            .map { chunk -> async { call { api.getUsers(chunk.joinToString(",")).users } } }
            .awaitAll()
            .flatten()
    }

    suspend fun bookmark(cardId: String, on: Boolean) {
        if (on) call { api.putBookmark(cardId) } else call { api.deleteBookmark(cardId) }
    }

    /** Whom the viewer has blocked, newest first, each with their profile as it is now. */
    suspend fun blocks(): List<BlockedPerson> = call { api.getBlocks().blocks }

    suspend fun block(uid: String) = call { api.blockUser(uid) }
    suspend fun unblock(uid: String) = call { api.unblockUser(uid) }

    suspend fun connections(): List<Connection> = call { api.getConnections().connections }

    /** How often a hint was shown (PATCH /me `hintsSeen`: the server keeps the larger count per key). */
    suspend fun hintSeen(key: String, count: Int): Me = call { api.updateProfile(UpdateProfileRequest(hintsSeen = mapOf(key to count))) }

    /** The profile photo, by the public URL the upload answered (PATCH /me `avatarUrl`: only one of our pictures). */
    suspend fun setAvatar(url: String): Me = call { api.updateProfile(UpdateProfileRequest(avatarUrl = url)) }

    companion object {
        /** GET /users?ids= takes at most this many. */
        const val USERS_PER_REQUEST = 30
    }
}
