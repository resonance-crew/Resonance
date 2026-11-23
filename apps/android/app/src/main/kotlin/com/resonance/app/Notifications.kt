package com.resonance.app

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.QueryDocumentSnapshot
import com.resonance.api.models.Author
import com.resonance.api.models.FeedCard
import com.resonance.api.models.BellItem
import com.resonance.kit.chat.isoDate
import com.resonance.kit.realtime.Signals
import com.resonance.kit.realtime.launchPulls
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.tasks.await
import java.util.Collections
import java.util.Date

/**
 * The signed-in person's notifications, live (a Firestore snapshot listener on
 * the same query the web's bell reads). Drives the tab badge too. The twin of
 * iOS's NotificationsStore.
 *
 * Phase 2: with client-config's `apiBell` on, the rows are pulled from GET /me/bell instead (on
 * the `bell` signal, back in the foreground, each minute on screen — only the rows changed since the
 * last read, nothing at all when the counter didn't move, whole when no one can say: [BellReader])
 * and read through POST /notifications/read, drawn read at once. The answer's people are the rows'
 * faces (no read of their own), and after each read the rows' cards — their covers too — are read in
 * the background ([extrasSource], [prefetchCovers]), so the screen opens on them. Chosen at [start];
 * the listener stays for a release.
 */
class NotificationsStore {
    /** The /api/v1 path's clients and switches (Phase 2); null: Firestore only. */
    var remote: LiveRemote? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var pull: Job? = null
    private val kicks = MutableStateFlow(0)
    /** Rows read here that the last pull may not show read yet: drawn read meanwhile. */
    private val readHere = HashMap<String, Date>()

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
        /**
         * A `resonance_tap` row's people (round 26 §R2.2), newest first: the first is the one named (their face, their
         * pen name — read by [fromUserId], which is them), the rest are 「和另外 {count} 人」.
         */
        val fromUserIds: List<String> = emptyList(),
        /** A `read_summary` row's readers who read the card to the end last week (three or more, never named). */
        val readers: Int? = null,
        /** …and someone came back to read it again. */
        val reread: Boolean = false,
    ) {
        val isUnread get() = readAt == null

        /** How many besides the one named resonated (a `resonance_tap` row's 「和另外 {count} 人」). */
        val others: Int get() = (fromUserIds.size - 1).coerceAtLeast(0)

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

    /** Where the rows' extras are read from outside a screen (Session's): a pull reads its rows' cards with it. */
    class ExtrasSource(
        val person: suspend (String) -> Person?,
        val cards: suspend (List<String>) -> Map<String, FeedCard?>,
    )

    var extrasSource: ExtrasSource? = null

    /** Warms the image loader with these covers (ResonanceApp's: Coil's disk and memory caches); null: no prefetch. */
    var prefetchCovers: ((List<String>) -> Unit)? = null

    /** Extras being read now (`u:` / `c:` keys), by a screen or a pull: never asked twice at once. */
    private val asking: MutableSet<String> = Collections.synchronizedSet(HashSet())

    /**
     * What the rows draw beside their words (round 21; the web's useBellExtras): who each is from —
     * their face — and the card it is about. A key there has been read: its value the person or the
     * card, or null when there is none to show (a profile gone, a card the viewer can't read any
     * more). A key in [Extras.failedPeople] / [Extras.failedCards] couldn't be read this time: the row
     * draws without it (initials, no card) and the next appearance of the screen asks again — still
     * drawn without it while it is asked, never back to the skeleton. Kept until sign-out, so coming
     * back to the bell shows them at once.
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
     * this appearance of the screen (not asked twice in one); each one asked is added to it. One that
     * failed before is asked again only with [retryFailed] (a screen's appearance; a pull's background
     * read leaves it be), and stays failed — drawn as it was — until an answer says otherwise. The
     * cards' covers go to [prefetchCovers] as they arrive.
     */
    suspend fun loadExtras(
        items: List<Item>,
        skip: MutableSet<String>,
        person: suspend (String) -> Person?,
        cards: suspend (List<String>) -> Map<String, FeedCard?>,
        retryFailed: Boolean = true,
    ) {
        val known = _extras.value
        val uids = items.mapNotNull { it.fromUserId?.takeIf(String::isNotEmpty) }.distinct()
            .filter { it !in known.people && "u:$it" !in skip && (retryFailed || it !in known.failedPeople) }
            .filter { asking.add("u:$it") }
        val cardIds = items.mapNotNull { it.cardId?.takeIf(String::isNotEmpty) }.distinct()
            .filter { it !in known.cards && "c:$it" !in skip && (retryFailed || it !in known.failedCards) }
            .filter { asking.add("c:$it") }
        uids.forEach { skip.add("u:$it") }
        cardIds.forEach { skip.add("c:$it") }
        if (uids.isEmpty() && cardIds.isEmpty()) return
        // What couldn't be read last time stays failed while it is asked again: its row keeps drawing
        // without it (initials, no card) rather than flashing back to the skeleton on every visit.
        try {
            readExtras(uids, cardIds, person, cards)
        } finally {
            uids.forEach { asking.remove("u:$it") }
            cardIds.forEach { asking.remove("c:$it") }
        }
    }

    private suspend fun readExtras(
        uids: List<String>,
        cardIds: List<String>,
        person: suspend (String) -> Person?,
        cards: suspend (List<String>) -> Map<String, FeedCard?>,
    ) {
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
            val readPeople = found.filter { it.second.isSuccess }.map { it.first }
            val readCards = cardIds.filter { it in answered }
            _extras.update { now ->
                now.copy(
                    people = now.people + found.filter { it.second.isSuccess }.map { it.first to it.second.getOrNull() },
                    failedPeople = now.failedPeople - readPeople.toSet() + found.filter { it.second.isFailure }.map { it.first },
                    cards = now.cards + readCards.associateWith { answered[it] },
                    failedCards = now.failedCards - readCards.toSet() + cardIds.filter { it !in answered },
                )
            }
            val covers = readCards.mapNotNull { answered[it]?.imageUrl?.takeIf(String::isNotEmpty) }
            if (covers.isNotEmpty()) prefetchCovers?.invoke(covers)
        }
    }

    /** The people a bell answer named: the rows' faces, with no read of their own. */
    private fun rememberPeople(people: List<Author>) {
        if (people.isEmpty()) return
        val named = people.filter { it.id.isNotEmpty() }.associate { it.id to Person.of(it) }
        _extras.update { now -> now.copy(people = now.people + named, failedPeople = now.failedPeople - named.keys) }
    }

    /** After a read: the rows' cards (and their covers), and anyone the answer didn't name, read in the background. */
    private fun prefetchExtras(items: List<Item>) {
        val source = extrasSource ?: return
        scope.launch {
            try {
                loadExtras(items, HashSet(), source.person, source.cards, retryFailed = false)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // The screen asks again when it appears.
            }
        }
    }

    /**
     * A sender's profile as a row draws it: `users/{uid}` (the rules let anyone signed in get one), or
     * null when it is gone or has no pen name. Anything passing (offline, a timeout) throws.
     */
    suspend fun readPerson(uid: String): Person? = try {
        val social = remote?.takeIf { it.features().apiSocial }?.social
        if (social != null) social.person(uid) else Person.from(uid, AppFirebase.db.collection("users").document(uid).get().await().data)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        if (FirestoreFailure.isGone(e)) null else throw e
    }

    fun start(uid: String) {
        stop()
        val remote = remote
        if (remote != null && remote.features().apiBell) {
            // Only what changed since the last read (?updatedAfter=), whole when no one can say: BellReader.
            val reader = BellReader(remote.inbox, remote.signals::live, LIMIT)
            pull = scope.launchPulls(merge(remote.signals.topic(Signals.Topic.Bell), kicks), remote.onScreen) {
                val read = try {
                    reader.read()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    _failed.value = true
                    return@launchPulls
                }
                if (pull == null) return@launchPulls
                if (read is BellReader.Read.Same && _loaded.value) {
                    // Nothing moved: the rows stand (and a pull that failed since is current again).
                    _failed.value = false
                    return@launchPulls
                }
                rememberPeople(read.people)
                val items = read.items.map(::bellItemOf)
                // A row the server shows read no longer needs this device's mark.
                items.forEach { if (it.readAt != null) readHere.remove(it.id) }
                _items.value = items.map { item -> readHere[item.id]?.let { item.copy(readAt = it) } ?: item }
                _loaded.value = true
                _failed.value = false
                prefetchExtras(items)
            }
            return
        }
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
        if (pull != null) kicks.value++
    }

    fun stop() {
        listeners.removeAll()
        pull?.cancel()
        pull = null
        readHere.clear()
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
        val remote = remote
        if (pull != null && remote != null) {
            // Drawn read at once (the badge too), then told.
            val now = Date()
            readHere[id] = now
            _items.update { list -> list.map { if (it.id == id) it.copy(readAt = now) else it } }
            scope.launch {
                try {
                    remote.inbox.markBellRead(listOf(id))
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    // Not told: the next pull draws it as the server has it.
                    readHere.remove(id)
                }
                kicks.value++
            }
            return
        }
        AppFirebase.db.collection("notifications").document(id).update("readAt", FieldValue.serverTimestamp())
    }

    /** Who a notification (a tapped push's row) is from, once the list has it. */
    fun sender(id: String?): String? = id?.let { i -> _items.value.firstOrNull { it.id == i }?.fromUserId }

    private companion object {
        const val NAME = "notifications"
        /** As many rows as the listener read. */
        const val LIMIT = 50
    }

    private fun item(doc: QueryDocumentSnapshot): Item {
        @Suppress("UNCHECKED_CAST")
        val payload = doc.get("payload") as? Map<String, Any?> ?: emptyMap()
        return bellItem(doc.id, doc.getString("type") ?: "", payload, doc.getTimestamp("readAt")?.toDate(), doc.getTimestamp("createdAt")?.toDate())
    }
}

/** A bell row as GET /me/bell answers it, read by the same [bellItem] as a document's. */
internal fun bellItemOf(row: BellItem): NotificationsStore.Item {
    val p = row.payload
    val payload = mapOf(
        "fromUserId" to p.fromUserId, "fromHandle" to p.fromHandle, "fromUserIds" to p.fromUserIds, "cardId" to p.cardId,
        "noteId" to p.noteId, "preview" to p.preview, "count" to p.count, "readers" to p.readers, "reread" to p.reread,
        "anonymous" to p.anonymous,
    )
    return bellItem(row.id, row.type, payload, isoDate(row.readAt), isoDate(row.createdAt))
}

/** A bell row from its document's fields (its [payload] as Firestore hands it). */
internal fun bellItem(id: String, type: String, payload: Map<String, Any?>, readAt: Date?, createdAt: Date?): NotificationsStore.Item {
        val people = (payload["fromUserIds"] as? List<*>)?.filterIsInstance<String>()?.filter { it.isNotEmpty() }.orEmpty()
        return NotificationsStore.Item(
            id = id,
            type = type,
            fromHandle = payload["fromHandle"] as? String,
            // A tap row names its newest (its face and pen name are read by this id).
            fromUserId = payload["fromUserId"] as? String ?: people.firstOrNull(),
            cardId = payload["cardId"] as? String,
            preview = payload["preview"] as? String,
            noteId = payload["noteId"] as? String,
            count = (payload["count"] as? Number)?.toInt(),
            readAt = readAt,
            createdAt = createdAt,
            anonymous = payload["anonymous"] == true,
            fromUserIds = people,
            readers = (payload["readers"] as? Number)?.toInt(),
            reread = payload["reread"] == true,
        )
}
