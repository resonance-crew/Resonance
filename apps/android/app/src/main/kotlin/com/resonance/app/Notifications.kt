package com.resonance.app

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.QueryDocumentSnapshot
import com.resonance.api.models.FeedCard
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.tasks.await
import java.util.Date

/**
 * The signed-in person's notifications, live (a Firestore snapshot listener on
 * the same query the web's bell reads). Drives the tab badge too. The twin of
 * iOS's NotificationsStore.
 */
class NotificationsStore {
    data class Item(
        val id: String,
        val type: String,
        val fromHandle: String?,
        /** Who it is from (their conversation opens by it, whatever their pen name is now). */
        val fromUserId: String?,
        val cardId: String?,
        val preview: String?,
        /** A note's id (to quote it when replying). */
        val noteId: String?,
        val count: Int?,
        val readAt: Date?,
        val createdAt: Date?,
        /**
         * A note or resonance on one of your anonymous cards (`payload.anonymous`): it opens the
         * card, never a conversation with whoever wrote it (see [onAnonymousCard]).
         */
        val anonymous: Boolean = false,
    ) {
        val isUnread get() = readAt == null

        /**
         * A note or resonance on an anonymous card of yours. Opening its writer's conversation would
         * zero their unread count there, which they can watch, and a reply would answer the card
         * under your name: the row leads to the card instead, as its push does.
         */
        val onAnonymousCard: Boolean get() = anonymous && (type == "note" || type == "resonance")
    }

    private val _items = MutableStateFlow<List<Item>>(emptyList())
    val items: StateFlow<List<Item>> = _items
    private val _loaded = MutableStateFlow(false)
    val loaded: StateFlow<Boolean> = _loaded
    private val _failed = MutableStateFlow(false)
    /**
     * The listener failed: the list stays as last read (or, with nothing read yet, the screen
     * offers a retry rather than a loader forever) until it listens again ([resume]).
     */
    val failed: StateFlow<Boolean> = _failed

    private val listeners = LiveListeners()

    /**
     * What the rows draw beside their words (round 21; the web's useBellExtras): who each is from —
     * their face — and the card it is about. A key there has been read: its value the person or the
     * card, or null when there is none to show (a profile gone, a card the viewer can't read any
     * more). A key in [Extras.failedPeople] / [Extras.failedCards] couldn't be read this time: the row
     * draws without it (initials, no card) and the next appearance of the screen asks again. Kept
     * until sign-out, so coming back to the bell shows them at once.
     */
    data class Extras(
        val people: Map<String, Person?> = emptyMap(),
        val cards: Map<String, FeedCard?> = emptyMap(),
        val failedPeople: Set<String> = emptySet(),
        val failedCards: Set<String> = emptySet(),
    ) {
        /** Whether the row from [uid] knows all it will about them (read, or not readable now). */
        fun personSettled(uid: String): Boolean = uid in people || uid in failedPeople
        fun cardSettled(cardId: String): Boolean = cardId in cards || cardId in failedCards
    }

    private val _extras = MutableStateFlow(Extras())
    val extras: StateFlow<Extras> = _extras

    /**
     * Reads what the rows of [items] draw beside them and haven't got: the senders' profiles (one get
     * each, through [person], which may answer from a list that has them), the cards in one request
     * ([cards]: GET /cards?keys=, 30 a request — every key asked is in its answer, null when the
     * viewer can't read the card, left out when its request failed). [skip] are ids already asked in
     * this appearance of the screen (not asked twice in one); each one asked is added to it.
     */
    suspend fun loadExtras(
        items: List<Item>,
        skip: MutableSet<String>,
        person: suspend (String) -> Person?,
        cards: suspend (List<String>) -> Map<String, FeedCard?>,
    ) {
        val known = _extras.value
        val uids = items.mapNotNull { it.fromUserId?.takeIf(String::isNotEmpty) }.distinct()
            .filter { it !in known.people && "u:$it" !in skip }
        val cardIds = items.mapNotNull { it.cardId?.takeIf(String::isNotEmpty) }.distinct()
            .filter { it !in known.cards && "c:$it" !in skip }
        if (uids.isEmpty() && cardIds.isEmpty()) return
        uids.forEach { skip.add("u:$it") }
        cardIds.forEach { skip.add("c:$it") }
        // Asked again now: no longer failed (each row shows its skeleton while it is read).
        _extras.update { it.copy(failedPeople = it.failedPeople - uids.toSet(), failedCards = it.failedCards - cardIds.toSet()) }
        coroutineScope {
            val people = async {
                uids.map { uid ->
                    async {
                        val read = try {
                            Result.success(person(uid))
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            Result.failure(e)
                        }
                        uid to read
                    }
                }.awaitAll()
            }
            val read = async {
                if (cardIds.isEmpty()) emptyMap() else try {
                    cards(cardIds)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    emptyMap()
                }
            }
            val found = people.await()
            val answered = read.await()
            _extras.update { now ->
                now.copy(
                    people = now.people + found.filter { it.second.isSuccess }.map { it.first to it.second.getOrNull() },
                    failedPeople = now.failedPeople + found.filter { it.second.isFailure }.map { it.first },
                    cards = now.cards + cardIds.filter { it in answered }.associateWith { answered[it] },
                    failedCards = now.failedCards + cardIds.filter { it !in answered },
                )
            }
        }
    }

    /**
     * A sender's profile as a row draws it: `users/{uid}` (the rules let anyone signed in get one), or
     * null when it is gone or has no pen name. Anything passing (offline, a timeout) throws.
     */
    suspend fun readPerson(uid: String): Person? = try {
        Person.from(uid, AppFirebase.db.collection("users").document(uid).get().await().data)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        if (FirestoreFailure.isGone(e)) null else throw e
    }

    fun start(uid: String) {
        stop()
        listeners.add(NAME) {
            val registration: ListenerRegistration = AppFirebase.db.collection("notifications")
                .whereEqualTo("userId", uid)
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .limit(50)
                .addSnapshotListener { snapshot, _ ->
                    if (snapshot == null) {
                        listeners.fail(NAME)
                        _failed.value = true
                        return@addSnapshotListener
                    }
                    _items.value = snapshot.documents.filterIsInstance<QueryDocumentSnapshot>().map(::item)
                    _loaded.value = true
                    _failed.value = false
                }
            registration::remove
        }
    }

    /** Back in the foreground (or the retry tapped): a failed listener listens again. */
    fun resume() {
        if (listeners.resume()) _failed.value = false
    }

    fun stop() {
        listeners.removeAll()
        _extras.value = Extras()
        _items.value = emptyList()
        _loaded.value = false
        _failed.value = false
    }

    fun markRead(item: Item) {
        if (!item.isUnread) return
        markRead(item.id)
    }

    /** A tapped push reads its row (it may not have arrived in the list yet). */
    fun markRead(id: String) {
        // Not a document id (an empty one would point Firestore at the collection itself and throw).
        if (id.isEmpty() || '/' in id) return
        if (_items.value.firstOrNull { it.id == id }?.isUnread == false) return
        AppFirebase.db.collection("notifications").document(id).update("readAt", FieldValue.serverTimestamp())
    }

    /** Who a notification (a tapped push's row) is from, once the list has it. */
    fun sender(id: String?): String? = id?.let { i -> _items.value.firstOrNull { it.id == i }?.fromUserId }

    private companion object {
        const val NAME = "notifications"
    }

    private fun item(doc: QueryDocumentSnapshot): Item {
        @Suppress("UNCHECKED_CAST")
        val payload = doc.get("payload") as? Map<String, Any?> ?: emptyMap()
        return Item(
            id = doc.id,
            type = doc.getString("type") ?: "",
            fromHandle = payload["fromHandle"] as? String,
            fromUserId = payload["fromUserId"] as? String,
            cardId = payload["cardId"] as? String,
            preview = payload["preview"] as? String,
            noteId = payload["noteId"] as? String,
            count = (payload["count"] as? Number)?.toInt(),
            readAt = doc.getTimestamp("readAt")?.toDate(),
            createdAt = doc.getTimestamp("createdAt")?.toDate(),
            anonymous = payload["anonymous"] == true,
        )
    }
}
