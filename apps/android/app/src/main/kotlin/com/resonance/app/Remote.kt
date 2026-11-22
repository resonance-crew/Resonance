package com.resonance.app

import com.google.firebase.firestore.ListenerRegistration
import com.resonance.api.models.Author
import com.resonance.kit.api.InboxApi
import com.resonance.kit.api.SocialApi
import com.resonance.kit.config.Features
import com.resonance.kit.realtime.SignalHub
import com.resonance.kit.realtime.Signals
import kotlinx.coroutines.flow.StateFlow

/**
 * What a live list needs for its /api/v1 path (Phase 2: 中間層去平台綁定): the contract's clients,
 * the signal it pulls on, whether the app is on screen (the minute's safety pull), and
 * client-config's switches — read when a list starts, so the server can send this build back to
 * its old Firestore listeners for a release. The twin of iOS's LiveRemote.
 */
class LiveRemote(
    val inbox: InboxApi,
    val social: SocialApi,
    val signals: SignalHub,
    val onScreen: StateFlow<Boolean>,
    val features: () -> Features,
)

/**
 * The one listener on `signals/{uid}` (while someone is signed in and client-config's `signals` is
 * on): its counters go to [hub], where each store pulls the GET its topic names. A refusal (rules
 * not deployed yet, a server that has none) or an error ends it until [resume]; meanwhile the
 * stores' minute pull keeps them current.
 */
class SignalListener(private val hub: SignalHub) {
    private val listeners = LiveListeners()

    fun start(uid: String) {
        stop()
        listeners.add(NAME) {
            val registration: ListenerRegistration = AppFirebase.db.collection("signals").document(uid)
                .addSnapshotListener { snap, error ->
                    if (error != null || snap == null) {
                        // The list's delta reads nothing it can't vouch for: until the next answer, it reads whole.
                        hub.fail()
                        return@addSnapshotListener listeners.fail(NAME)
                    }
                    hub.publish(Signals.of(snap.data))
                }
            registration::remove
        }
    }

    fun resume() {
        listeners.resume()
    }

    fun stop() {
        listeners.removeAll()
        hub.publish(null)
    }

    private companion object {
        const val NAME = "signals"
    }
}

/** Someone as the contract draws them (a conversation's other person, a connection, a bell row's sender). */
fun Person.Companion.of(author: Author): Person? {
    if (author.handle.isEmpty()) return null
    return Person(
        id = author.id,
        handle = author.handle,
        initials = author.initials.ifEmpty { author.handle.take(2).uppercase() },
        avatarUrl = author.avatarUrl,
        accentColor = author.accentColor.ifEmpty { null },
        avatarSeed = author.avatarSeed,
    )
}

/** The person [uid] by the contract (GET /users?ids=): null when the account is gone or has no pen name. */
suspend fun SocialApi.person(uid: String): Person? = users(listOf(uid)).firstOrNull { it.id == uid }?.takeIf { !it.gone }?.author?.let { Person.of(it) }
