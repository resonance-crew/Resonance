package com.resonance.app

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.QueryDocumentSnapshot
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import com.resonance.api.models.ConversationLastMessage
import com.resonance.kit.config.Features
import com.resonance.kit.realtime.Signals
import com.resonance.kit.realtime.launchPulls
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.Date

/** Someone in Messages: what a row or a thread header draws of them. */
data class Person(
    val id: String,
    val handle: String,
    val initials: String,
    val avatarUrl: String?,
    val accentColor: String?,
    val avatarSeed: String?,
) {
    companion object {
        /** The person a `users/{id}` document describes; null when it is missing or has no pen name. */
        fun from(id: String, data: Map<String, Any?>?): Person? {
            val handle = data?.get("handle") as? String
            if (handle.isNullOrEmpty()) return null
            return Person(
                id = id,
                handle = handle,
                initials = data["initials"] as? String ?: handle.take(2).uppercase(),
                avatarUrl = data["avatarUrl"] as? String,
                accentColor = data["accentColor"] as? String,
                // Text from the web's signup, a number from older seeds.
                avatarSeed = (data["avatarSeed"] as? String) ?: (data["avatarSeed"] as? Number)?.toLong()?.toString(),
            )
        }
    }
}

/**
 * The signed-in person's conversations, live — the web's useConversations
 * (listConversations + listMyConnectionUids + getMyBlockedIds), as snapshot
 * listeners instead of a 30s poll. Drives the Messages tab and its badge. The
 * twin of iOS's ConversationsStore.
 *
 * Phase 2: with client-config's `apiInbox` on, the conversations are pulled from GET
 * /conversations instead (on the `inbox` signal, back in the foreground, and each minute on
 * screen; only the conversations whose `threads` counters moved, `?pairs=`, and nothing at all when
 * none did while the listener is live — whole when no one can say, and every ten minutes:
 * [ConversationsReader]), and with `apiSocial` the connections and blocks
 * from GET /me/connections and /me/blocks (on `graph`). Which path a list takes is read at
 * [start]; the Firestore listeners stay for a release, for the server to send this build back.
 */
class ConversationsStore {
    data class Conversation(
        val id: String,
        val other: Person,
        val lastText: String?,
        val lastFromMe: Boolean,
        val sentAt: Date?,
        val unread: Int,
        /** The last message sent a picture (`lastMessage.image`): without words, it previews as 傳送了一張圖片. */
        val lastImage: Boolean = false,
        /** The last message was unsent (`lastMessage.unsent`, round 16 §3): it previews as its ghost row says. */
        val lastUnsent: Boolean = false,
        /** The last message was a sticker (`lastMessage.sticker`, round 22): it previews as 傳送了一張貼圖. */
        val lastSticker: Boolean = false,
        /** The last message was a picture of an album of this many (`lastMessage.album.count`, should the server say): 傳送了 3 張圖片. */
        val lastAlbum: Int? = null,
    )

    data class State(
        val conversations: List<Conversation> = emptyList(),
        /** Connected, no conversation yet (the list's second section). */
        val starters: List<Person> = emptyList(),
        val loaded: Boolean = false,
        /**
         * A listener failed (offline for good, the backend refusing): the list is as last read
         * until the app is back in the foreground ([resume]); with nothing read, a retry.
         */
        val failed: Boolean = false,
    ) {
        val unreadTotal: Int get() = conversations.sumOf { it.unread }
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    /**
     * The ids of every conversation the person is in, as soon as Firestore has them (before the
     * rows are built, blocked people included): an open thread with no conversation yet watches
     * for its own to appear here.
     */
    private val _ids = MutableStateFlow<Set<String>>(emptySet())
    val ids: StateFlow<Set<String>> = _ids

    /**
     * Whom the person is connected with, live (null until Firestore has said): an open thread
     * follows it, so a connection that ends — a take-back by either of them — or begins shows in
     * its composer at once.
     */
    private val _connected = MutableStateFlow<Set<String>?>(null)
    val connectedIds: StateFlow<Set<String>?> = _connected

    /** The /api/v1 path's clients and switches (Phase 2); null: Firestore only (a test, a build without them). */
    var remote: LiveRemote? = null

    /** Called when the person's blocks change after they were first read. */
    var onBlocksChanged: (() -> Unit)? = null

    /** Whom the person has blocked, live (null until Firestore has said). */
    private val _blocked = MutableStateFlow<Set<String>?>(null)
    val blockedIds: StateFlow<Set<String>?> = _blocked

    private var uid: String? = null
    private val listeners = LiveListeners()
    private var rawConversations: List<RawConversation> = emptyList()

    /**
     * A conversation's document as the list reads it, taken out of its snapshot off the main thread
     * (A12: the listener's results are read on [parsing], then handed to the main thread).
     */
    private class RawConversation(val id: String, val participants: List<*>?, val last: Map<String, Any?>?, val unread: Map<*, *>?)

    /** Where the conversations listener's snapshots are read (one thread, in order). */
    private val parsing = java.util.concurrent.Executors.newSingleThreadExecutor()
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    private var connectionUids: List<String> = emptyList()
    private val blocked: Set<String> get() = _blocked.value.orEmpty()
    private val people = HashMap<String, Person>()
    /** People with no profile (or none readable): not asked about again this session. */
    private val missing = HashSet<String>()
    /** People whose profile read failed for now (offline, a timeout): asked about again on the next change or back in the foreground. */
    private val retry = HashSet<String>()
    private val ready = HashSet<String>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var rebuilding: Job? = null
    /** The /api/v1 pulls running ([remote]'s path), stopped with the lists. */
    private var pulls: List<Job> = emptyList()
    /** Asks for a pull now (back in the foreground, after the person's own change). */
    private val inboxKicks = MutableStateFlow(0)
    private val graphKicks = MutableStateFlow(0)
    /** Pulls whose last try failed (the list stays as last read; the next ask tries again). */
    private val pullsFailed = HashSet<String>()
    /**
     * Conversations read here, drawn read at once (the API path: nothing local echoes the write as
     * Firestore's cache did): `false` while the server is told, `true` once it has been — then the
     * next pull to start says what the server has, and the mark goes.
     */
    private val readHere = HashMap<String, Boolean>()

    /**
     * Conversations deleted from their thread a moment ago (round 21), left out of the list before the
     * server answers: `true` once it has (they stay out until Firestore no longer lists them, then are
     * forgotten — a new conversation between the two has the same id).
     */
    private val hidden = HashMap<String, Boolean>()

    /** Conversation [pair] leaves the list at once (its deletion asked for). */
    fun hide(pair: String) {
        hidden[pair] = false
        rebuildSoon()
    }

    /** The server deleted [pair]: it stays out until Firestore says so too. */
    fun deleted(pair: String) {
        if (pair in hidden) hidden[pair] = true
        rebuildSoon()
    }

    /** The deletion of [pair] was refused: it is back in the list, as Firestore has it. */
    fun unhide(pair: String) {
        if (hidden.remove(pair) != null) rebuildSoon()
    }

    private fun rebuildSoon() {
        if (uid == null) return
        rebuilding?.cancel()
        rebuilding = scope.launch { rebuild() }
    }

    fun start(uid: String) {
        stop()
        this.uid = uid
        val remote = remote
        val features = remote?.features?.invoke() ?: Features.LEGACY
        if (remote != null && features.apiInbox) pullConversations(uid, remote) else listenToConversations(uid)
        if (remote != null && features.apiSocial) pullGraph(uid, remote) else listenToGraph(uid)
    }

    /** The conversation [pair] was read here: drawn read at once; [done] once the server has it. */
    fun readHere(pair: String, done: Boolean = false) {
        if (uid == null) return
        if (done) {
            if (pair in readHere) readHere[pair] = true
            inboxKicks.value++
        } else {
            readHere[pair] = false
            rebuildSoon()
        }
    }

    /** The person blocked or unblocked someone here: the graph is read again at once (a block alone may raise no signal). */
    fun graphChanged() {
        graphKicks.value++
    }

    private fun pullConversations(uid: String, remote: LiveRemote) {
        // Only what moved (?pairs=), whole when no one can say: ConversationsReader.
        val reader = ConversationsReader(remote.inbox, remote.signals::live)
        pulls = pulls + scope.launchPulls(merge(remote.signals.topic(Signals.Topic.Inbox), inboxKicks), remote.onScreen) {
            val settled = readHere.filterValues { it }.keys
            val read = try {
                reader.read()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (this.uid == uid) pullFailed("conversations")
                return@launchPulls
            }
            if (this.uid != uid) return@launchPulls
            if (read is ConversationsReader.Read.Same) {
                // Nothing moved since the last read: the list stands (and one that failed since is current again).
                if (pullsFailed.remove("conversations")) arrived("conversations")
                return@launchPulls
            }
            pullsFailed.remove("conversations")
            // A read mark goes once a read has said what the server has of that conversation.
            val told = if (read is ConversationsReader.Read.Delta) settled.filter { it in read.pairs } else settled
            told.forEach { readHere.remove(it) }
            val list = read.conversations
            for (c in if (read is ConversationsReader.Read.Delta) list.filter { it.id in read.pairs } else list) {
                val person = c.other?.let { Person.of(it) }
                if (person != null) people[person.id] = person else missing.add(c.otherId)
            }
            rawConversations = list.map { c -> RawConversation(c.id, c.participants, c.lastMessage?.let(::lastOf), mapOf(uid to c.unread)) }
            _ids.value = list.map { it.id }.toSet()
            arrived("conversations")
        }
    }

    private fun pullGraph(uid: String, remote: LiveRemote) {
        pulls = pulls + scope.launchPulls(merge(remote.signals.topic(Signals.Topic.Graph), graphKicks), remote.onScreen) {
            val (connections, blocks) = try {
                coroutineScope {
                    val c = async { remote.social.connections() }
                    val b = async { remote.social.blocks() }
                    c.await() to b.await()
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (this.uid == uid) pullFailed("graph")
                return@launchPulls
            }
            if (this.uid != uid) return@launchPulls
            pullsFailed.remove("graph")
            for (c in connections) c.person.author?.let { Person.of(it) }?.let { people[it.id] = it }
            connectionUids = connections.map { it.userId }
            _connected.value = connectionUids.toSet()
            val next = blocks.map { it.userId }.toSet()
            val changed = "blocks" in ready && next != blocked
            _blocked.value = next
            if (changed) onBlocksChanged?.invoke()
            ready.add("connections")
            arrived("blocks")
        }
    }

    /** A pull failed: the list stays as last read (with nothing read, the screen offers a retry) until one goes through. */
    private fun pullFailed(name: String) {
        pullsFailed.add(name)
        _state.value = _state.value.copy(failed = true)
    }

    /** A conversation's `lastMessage` as the contract has it, in the shape the list reads a document's. */
    private fun lastOf(m: ConversationLastMessage): Map<String, Any?> = mapOf(
        "text" to m.text,
        "senderId" to m.senderId,
        "sentAt" to com.resonance.kit.chat.isoDate(m.sentAt),
        "image" to m.image,
        "unsent" to m.unsent,
        "sticker" to m.sticker,
        "album" to m.albumCount?.let { mapOf("count" to it) },
    )

    private fun listenToConversations(uid: String) {
        listen("conversations") {
            AppFirebase.db.collection("conversations").whereArrayContains("participants", uid)
                .orderBy("updatedAt", Query.Direction.DESCENDING)
                .addSnapshotListener(parsing) { snap, _ ->
                    if (snap == null) {
                        main.post { if (this.uid == uid) failed("conversations") }
                        return@addSnapshotListener
                    }
                    val raw = snap.documents.filterIsInstance<QueryDocumentSnapshot>().map { doc ->
                        @Suppress("UNCHECKED_CAST")
                        RawConversation(
                            doc.id,
                            doc.get("participants") as? List<*>,
                            doc.get("lastMessage", DocumentSnapshot.ServerTimestampBehavior.ESTIMATE) as? Map<String, Any?>,
                            doc.get("unread") as? Map<*, *>,
                        )
                    }
                    val ids = raw.map { it.id }.toSet()
                    main.post {
                        // Stopped (signed out) or started for another account since: not this list's any more.
                        if (this.uid != uid) return@post
                        rawConversations = raw
                        _ids.value = ids
                        arrived("conversations")
                    }
                }
        }
    }

    private fun listenToGraph(uid: String) {
        listen("connections") {
            AppFirebase.db.collection("connections").whereArrayContains("userIds", uid)
                .addSnapshotListener { snap, _ ->
                    snap ?: return@addSnapshotListener failed("connections")
                    connectionUids = snap.documents.mapNotNull { doc -> (doc.get("userIds") as? List<*>)?.firstOrNull { it != uid } as? String }
                    _connected.value = connectionUids.toSet()
                    arrived("connections")
                }
        }
        listen("blocks") {
            AppFirebase.db.collection("users").document(uid).collection("blocks")
                .addSnapshotListener { snap, _ ->
                    snap ?: return@addSnapshotListener failed("blocks")
                    val next = snap.documents.map { it.id }.toSet()
                    val changed = "blocks" in ready && next != blocked
                    _blocked.value = next
                    if (changed) onBlocksChanged?.invoke()
                    arrived("blocks")
                }
        }
    }

    private fun listen(name: String, attach: () -> ListenerRegistration) {
        listeners.add(name) {
            val registration = attach()
            registration::remove
        }
    }

    /** A listener reported an error and is over: the list stays as last read until [resume] attaches it again. */
    private fun failed(name: String) {
        listeners.fail(name)
        _state.value = _state.value.copy(failed = true)
    }

    /** Back in the foreground: listeners that failed listen again, and people whose profile couldn't be read are asked for again. */
    fun resume() {
        if (uid == null) return
        if (listeners.resume()) _state.value = _state.value.copy(failed = false)
        // The API path reads at once (the minute's pull waits a minute).
        if (pulls.isNotEmpty()) {
            inboxKicks.value++
            graphKicks.value++
        }
        if (retry.isNotEmpty()) {
            rebuilding?.cancel()
            rebuilding = scope.launch { rebuild() }
        }
    }

    fun stop() {
        listeners.removeAll()
        pulls.forEach { it.cancel() }
        pulls = emptyList()
        pullsFailed.clear()
        readHere.clear()
        rebuilding?.cancel()
        people.clear()
        missing.clear()
        retry.clear()
        hidden.clear()
        uid = null
        rawConversations = emptyList()
        _ids.value = emptySet()
        connectionUids = emptyList()
        _connected.value = null
        _blocked.value = null
        ready.clear()
        _state.value = State()
    }

    private fun arrived(source: String) {
        ready.add(source)
        rebuilding?.cancel()
        rebuilding = scope.launch { rebuild() }
    }

    private suspend fun rebuild() {
        val uid = uid ?: return
        val others = rawConversations.mapNotNull { other(it, uid) }
        val wanted = (others + connectionUids).toSet() - people.keys - missing
        coroutineScope {
            wanted.map { id ->
                async {
                    val social = remote?.takeIf { it.features().apiSocial }?.social
                    val person = try {
                        if (social != null) social.person(id) else Person.from(id, AppFirebase.db.collection("users").document(id).get().await().data)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        // Refused is gone; anything else is asked again on the next change, or back in the foreground.
                        if (FirestoreFailure.isGone(e)) missing.add(id) else retry.add(id)
                        return@async
                    }
                    retry.remove(id)
                    person?.let { people[id] = it } ?: missing.add(id)
                }
            }.awaitAll()
        }
        // A deletion the server has made and Firestore now shows is over: the id may come back as a new conversation.
        hidden.entries.removeAll { (pair, done) -> done && rawConversations.none { it.id == pair } }
        // A row whose profile is gone is skipped; blocked people drop out entirely, and so does one being deleted.
        val conversations = rawConversations.mapNotNull { doc ->
            if (doc.id in hidden) return@mapNotNull null
            val otherId = other(doc, uid)
            val person = otherId?.let { people[it] }
            if (otherId == null || otherId in blocked || person == null) return@mapNotNull null
            val last = doc.last
            val unread = if (doc.id in readHere) 0 else (doc.unread?.get(uid) as? Number)?.toInt() ?: 0
            Conversation(
                id = doc.id,
                other = person,
                lastText = last?.get("text") as? String,
                lastFromMe = last?.get("senderId") == uid,
                sentAt = when (val at = last?.get("sentAt")) {
                    is Timestamp -> at.toDate()
                    is Date -> at
                    else -> null
                },
                unread = unread,
                lastImage = last?.get("image") == true,
                lastUnsent = last?.get("unsent") == true,
                lastSticker = last?.get("sticker") == true,
                lastAlbum = ((last?.get("album") as? Map<*, *>)?.get("count") as? Number)?.toInt()?.takeIf { it in 2..10 },
            )
        }
        val talking = conversations.map { it.other.id }.toSet()
        val starters = connectionUids.filter { it !in talking && it !in blocked }.mapNotNull { people[it] }
        _state.value = State(conversations, starters, loaded = ready.containsAll(SOURCES), failed = listeners.failed.value.isNotEmpty() || pullsFailed.isNotEmpty())
    }

    /** Someone this list has read (with their pen name as it is now), if it has. */
    fun person(id: String): Person? = people[id]

    private fun other(doc: RawConversation, me: String): String? =
        doc.participants?.firstOrNull { it != me } as? String

    private companion object {
        val SOURCES = setOf("conversations", "connections", "blocks")
    }
}
