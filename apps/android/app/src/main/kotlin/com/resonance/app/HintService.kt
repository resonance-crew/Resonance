package com.resonance.app

import android.content.SharedPreferences
import com.resonance.api.models.Me
import com.resonance.kit.api.SocialApi
import kotlin.math.max
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await

/**
 * The web's first-time hints (lib/hints.ts): a hint shows for its first
 * three displays, then stays quiet. The count lives on the device
 * (`hint:{key}`, as the web's localStorage) and is mirrored to the profile's
 * `hintsSeen` map, so a hint seen on the web counts here too. The twin of
 * iOS's HintService.
 *
 * Phase 2: with client-config's `apiSocial` on ([api] non-null) the profile's counts are read
 * from /me as the session holds it and written with PATCH /me `hintsSeen` (the server keeps the
 * larger count per key) instead of the `users/{uid}` document.
 */
class HintService(private val uid: String, private val prefs: SharedPreferences, private val api: Api? = null) {
    /** The contract's path: the profile as last read, and where a count is told. */
    class Api(val social: SocialApi, val me: () -> Me?, val onMe: (Me) -> Unit = {})

    /** Whether to show the hint this time — asking counts as one display. */
    suspend fun claim(key: String): Boolean {
        val localKey = "hint:$key"
        val seen: Int = api?.let { it.me()?.hintsSeen?.get(key) ?: 0 } ?: firestoreSeen(key)
        val count = max(prefs.getInt(localKey, 0), seen)
        if (count >= LIMIT) return false
        prefs.edit().putInt(localKey, count + 1).apply()
        // Best effort, like syncHintCount: the device's count still governs here.
        try {
            if (api != null) api.onMe(api.social.hintSeen(key, count + 1))
            else AppFirebase.db.collection("users").document(uid).update("hintsSeen.$key", count + 1).await()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Offline, or no profile document yet.
        }
        return true
    }

    private suspend fun firestoreSeen(key: String): Int {
        val seen = try {
            AppFirebase.db.collection("users").document(uid).get().await().get("hintsSeen") as? Map<*, *>
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        return (seen?.get(key) as? Number)?.toInt() ?: 0
    }

    companion object {
        /** HINT_LIMIT. */
        const val LIMIT = 3
    }
}
