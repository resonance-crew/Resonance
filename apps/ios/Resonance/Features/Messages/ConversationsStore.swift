import FirebaseFirestore
import Foundation
import Observation
import ResonanceKit

/// Someone in Messages: what a row or a thread header draws of them.
nonisolated struct Person: Identifiable, Equatable, Sendable {
    let id: String
    let handle: String
    let initials: String
    let avatarURL: URL?
    let accentColor: String?
    let avatarSeed: String?

    init?(id: String, data: [String: Any]?) {
        guard let data, let handle = data["handle"] as? String, !handle.isEmpty else { return nil }
        self.id = id
        self.handle = handle
        initials = data["initials"] as? String ?? String(handle.prefix(2)).uppercased()
        avatarURL = (data["avatarUrl"] as? String).flatMap(URL.init(string:))
        accentColor = data["accentColor"] as? String
        avatarSeed = data["avatarSeed"] as? String
    }

    /// Someone as the API answers them (a conversation's `other`, a connection's or GET /users' `author`).
    init?(author: InboxAPI.Author) {
        guard !author.handle.isEmpty else { return nil }
        id = author.id
        handle = author.handle
        initials = author.initials.isEmpty ? String(author.handle.prefix(2)).uppercased() : author.initials
        avatarURL = author.avatarUrl.flatMap(URL.init(string:))
        accentColor = author.accentColor
        avatarSeed = author.avatarSeed
    }
}

/// The signed-in person's conversations, live — the web's useConversations
/// (listConversations + listMyConnectionUids + getMyBlockedIds). Drives the Messages tab and its badge.
///
/// Each of its sources takes one of two paths, chosen as it starts (Phase 2 of the middleware decouple): the
/// conversations through GET /api/v1/conversations with `features.apiInbox`, the connections and the block list
/// through GET /me/connections and /me/blocks with `features.apiSocial` — pulled again when `signals/{uid}` moves
/// (`inbox`, `graph`) and on the 60 s foreground pull, each a 304 when nothing changed — or, the older path kept one
/// release, as Firestore snapshot listeners.
@Observable
final class ConversationsStore {
    struct Conversation: Identifiable, Equatable {
        let id: String
        let other: Person
        let lastText: String?
        let lastFromMe: Bool
        /// The last message was a picture (`lastMessage.image`).
        var lastImage = false
        /// The last message was unsent (`lastMessage.unsent`, round 16 §3): the row says so, as the thread does.
        var lastUnsent = false
        /// The last message was a sticker (`lastMessage.sticker`, round 22): its words are the fallback for older builds.
        var lastSticker = false
        /// The last message was one of several pictures sent together (`lastMessage.album.count`, round 22).
        var lastAlbum: Int?
        let sentAt: Date?
        let unread: Int
    }

    private(set) var conversations: [Conversation] = []
    /// Connected, no conversation yet (the list's second section).
    private(set) var starters: [Person] = []
    private(set) var loaded = false
    /// A listener failed (offline for good, the backend refusing): what is
    /// shown is as last read until the app is back in the foreground (`resume`).
    private(set) var failed = false
    /// The tab's badge: every conversation's unread count added up. Kept apart from `conversations`
    /// (and set only through `publish`), so what reads only the badge — the tab bar — isn't drawn
    /// again for each new last message, only when the count changes.
    private(set) var unreadTotal = 0
    /// The ids of the conversations listed, and the other person's pen name in each (in list order):
    /// what a thread asks of the list ("is this conversation in Messages?") without reading every row,
    /// so it is told only when a conversation comes or goes.
    private(set) var listedIds: Set<String> = []
    private(set) var listedHandles: [String] = []
    /// The people this account is connected with, live (nil until the first read of the list).
    var connectedIds: Set<String>? { ready.contains("connections") ? Set(connectionUids) : nil }
    /// The people this account has blocked, live (nil until the first read of the list).
    private(set) var blockedIds: Set<String>?
    /// Called when the block list changes (not for the first read of it at sign-in).
    @ObservationIgnored var onBlocksChange: (() -> Void)?
    /// Called with every read of the block list, the first included.
    @ObservationIgnored var onBlocks: ((Set<String>) -> Void)?
    /// Called with the people whose connection with this account began or ended (not for the first
    /// read at sign-in) — a resonance or an answered letter, a take-back or a block, here or on any
    /// device, theirs or this account's.
    @ObservationIgnored var onConnectionsChange: ((Set<String>) -> Void)?

    @ObservationIgnored private var uid: String?
    @ObservationIgnored private let listeners = LiveListeners()
    @ObservationIgnored private var rawConversations: [RawConversation] = []
    @ObservationIgnored private var connectionUids: [String] = []
    @ObservationIgnored private var blocked: Set<String> = []
    @ObservationIgnored private var people = PeopleBook()
    @ObservationIgnored private var ready: Set<String> = []
    /// Conversations deleted here, left out of the list at once (round 21) until the listener no longer
    /// has them — or the server refused, and they are back (``unhide(_:)``).
    @ObservationIgnored private var hidden: Set<String> = []

    /// Leaves conversation `id` out of the list now, before the server deletes it.
    func hide(_ id: String) {
        hidden.insert(id)
        publish(conversations.filter { $0.id != id })
        let talking = Set(conversations.map(\.other.id))
        starters = connectionUids.filter { !talking.contains($0) && !blocked.contains($0) }.compactMap { people.found[$0] }
    }

    /// The deletion didn't go through: the conversation is listed again, as the listener has it.
    func unhide(_ id: String) {
        guard hidden.remove(id) != nil else { return }
        Task { await rebuild() }
    }

    /// The `/api/v1` paths this run takes (nil: that source listens to Firestore), and the signals that say when to pull.
    @ObservationIgnored private var inbox: InboxAPI?
    @ObservationIgnored private var social: SocialAPI?
    @ObservationIgnored private var subscription: SignalSubscription?
    /// The signals the list compares with its last read, and the read that asks only for what moved.
    @ObservationIgnored private weak var signals: SignalListener?
    @ObservationIgnored private var reader: ConversationsReader?
    @ObservationIgnored private var pulls = PullGate()
    /// Someone's profile, by the path the session takes (GET /users with `apiSocial`, else Firestore).
    @ObservationIgnored var readPeople: @Sendable (Set<String>) async -> [String: PeopleBook.Read] = { ids in
        await PeopleBook.readEach(ids) { await ConversationsStore.read($0) }
    }

    /// Which path each source takes this run: the conversations, and the connections with the blocks (true: the API).
    var paths: (conversations: Bool, graph: Bool) { (inbox != nil, social != nil) }

    /// Starts reading `uid`'s lists: `inbox` / `social` non-nil take the API for the conversations / the
    /// connections and blocks, pulled when `signals` says so; nil listens to Firestore as before.
    func start(uid: String, inbox: InboxAPI? = nil, social: SocialAPI? = nil, signals: SignalListener? = nil) {
        stop()
        self.uid = uid
        self.inbox = inbox
        self.social = social
        self.signals = signals
        reader = inbox.map { ConversationsReader(inbox: $0) }
        let db = FirebaseBootstrap.db
        if inbox != nil || social != nil {
            var topics: Set<SignalTopic> = []
            if inbox != nil { topics.insert(.inbox) }
            if social != nil { topics.insert(.graph) }
            subscription = signals?.observe(topics) { [weak self] moved in self?.pull(moved) }
            pull([])
        }
        if inbox == nil {
            listen("conversations") { [weak self] in
                db.collection("conversations").whereField("participants", arrayContains: uid)
                    .order(by: "updatedAt", descending: true)
                    .addSnapshotListener { snap, error in
                        MainActor.assumeIsolated {
                            guard let self else { return }
                            guard let snap else { return self.failed("conversations", error) }
                            self.rawConversations = snap.documents.map { RawConversation(doc: $0, me: uid) }
                            self.arrived("conversations")
                        }
                    }
            }
        }
        guard social == nil else { return }
        listen("connections") { [weak self] in
            db.collection("connections").whereField("userIds", arrayContains: uid)
                .addSnapshotListener { snap, error in
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        guard let snap else { return self.failed("connections", error) }
                        self.connectionsRead(snap.documents.compactMap { ($0.get("userIds") as? [String])?.first { $0 != uid } })
                    }
                }
        }
        listen("blocks") { [weak self] in
            db.collection("users").document(uid).collection("blocks")
                .addSnapshotListener { snap, error in
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        guard let snap else { return self.failed("blocks", error) }
                        self.blocksRead(Set(snap.documents.map(\.documentID)))
                    }
                }
        }
    }

    private func connectionsRead(_ uids: [String]) {
        let moved = Self.moved(from: connectionUids, to: uids)
        connectionUids = uids
        if ready.contains("connections"), !moved.isEmpty { onConnectionsChange?(moved) }
        arrived("connections")
    }

    private func blocksRead(_ ids: Set<String>) {
        if ready.contains("blocks"), ids != blocked { onBlocksChange?() }
        blocked = ids
        if blockedIds != ids { blockedIds = ids }
        onBlocks?(ids)
        arrived("blocks")
    }

    /// A block or an unblock asked for through the API (`SafetyService`): the list follows at once, and the server's
    /// list is asked for again (a block alone touches no signal of the blocker's).
    func blockChanged(_ other: String, blocked isBlocked: Bool) {
        guard uid != nil, social != nil else { return }
        var ids = blocked
        if isBlocked { ids.insert(other) } else { ids.remove(other) }
        if ids != blocked { blocksRead(ids) }
        pull([.graph])
    }

    /// Pulls what moved (`[]`: everything this run reads through the API). One pull of a kind at a time: one asked
    /// for meanwhile runs once more after it.
    private func pull(_ moved: Set<SignalTopic>) {
        guard let uid else { return }
        if let reader, moved.isEmpty || moved.contains(.inbox) {
            pulls.run("inbox") { [weak self] in await self?.pullConversations(reader, uid: uid) }
        }
        if let social, moved.isEmpty || moved.contains(.graph) {
            pulls.run("graph") { [weak self] in await self?.pullGraph(social, uid: uid) }
        }
    }

    /// The list through `reader`: only the conversations whose `threads[pair]` counters moved since its last read
    /// (`?pairs=`), merged into what it holds — nothing at all when nothing moved and the listener is live — or the
    /// whole list when no one can say what moved, and every 10 minutes (``ConversationsReader``).
    private func pullConversations(_ reader: ConversationsReader, uid: String) async {
        do {
            let before = reader.held
            // Taken before the read: a touch heard while it is on its way is compared again by the next pull.
            let list = try await reader.read(heard: signals?.heard ?? .unknown)
            guard self.uid == uid else { return }
            // Nothing asked (nothing moved): the list stands as it was.
            if let before, before == list, ready.contains("conversations") { return pullSucceeded(nil) }
            for conversation in list {
                // Who it is with, as the server read them now (null: their account is gone).
                if let author = conversation.other?.value1, let person = Person(author: author) {
                    people.record(conversation.otherId, .found(person))
                } else {
                    people.record(conversation.otherId, .gone)
                }
            }
            rawConversations = list.map { RawConversation(api: $0) }
            pullSucceeded("conversations")
        } catch {
            guard self.uid == uid else { return }
            failed = true
        }
    }

    private func pullGraph(_ social: SocialAPI, uid: String) async {
        do {
            async let connections = social.connections()
            async let blocks = social.blocks()
            let (linked, blockList) = try await (connections, blocks)
            guard self.uid == uid else { return }
            for connection in linked {
                let person = connection.person
                if !person.gone, let author = person.author?.value1, let found = Person(author: author) {
                    people.record(connection.userId, .found(found))
                } else {
                    people.record(connection.userId, .gone)
                }
            }
            blocksRead(Set(blockList.map(\.userId)))
            connectionsRead(linked.map(\.userId))
            pullSucceeded(nil)
        } catch {
            guard self.uid == uid else { return }
            failed = true
        }
    }

    private func pullSucceeded(_ source: String?) {
        if listeners.failed.isEmpty { failed = false }
        if let source { arrived(source) }
    }

    private func listen(_ name: String, _ attach: @escaping () -> ListenerRegistration) {
        listeners.add(name) {
            let registration = attach()
            return { registration.remove() }
        }
    }

    /// A listener reported an error and is over: the list stays as last read
    /// until `resume()` attaches it again.
    private func failed(_ name: String, _ error: Error?) {
        listeners.fail(name)
        failed = true
    }

    /// Back in the foreground: listeners that failed listen again, and people
    /// whose profile couldn't be read are asked for again.
    func resume() {
        guard uid != nil else { return }
        if listeners.resume() { failed = false }
        // The API's lists are asked for again.
        if inbox != nil || social != nil { pull([]) }
        if people.hasRetries { Task { await rebuild() } }
    }

    func stop() {
        listeners.removeAll()
        subscription?.cancel()
        subscription = nil
        signals = nil
        reader = nil
        inbox = nil
        social = nil
        pulls = PullGate()
        uid = nil
        rawConversations = []
        connectionUids = []
        blocked = []
        blockedIds = nil
        people = PeopleBook()
        ready = []
        hidden = []
        publish([])
        starters = []
        loaded = false
        failed = false
    }

    /// A person already seen here (a thread opened from the list starts with them).
    func person(_ id: String) -> Person? { people.found[id] }

    private func arrived(_ source: String) {
        ready.insert(source)
        Task { await rebuild() }
    }

    private func rebuild() async {
        guard let uid else { return }
        let others = rawConversations.compactMap(\.otherId)
        let wanted = people.toRead(Set(others + connectionUids))
        if !wanted.isEmpty {
            for (id, read) in await readPeople(wanted) { people.record(id, read) }
        }
        // Signed out, or someone else signed in, meanwhile.
        guard self.uid == uid else { return }
        // A row whose profile is gone is skipped (one that couldn't be read yet waits for the next try);
        // blocked people drop out entirely.
        let found = people.found
        // A conversation deleted here stays out until the listener drops it too (then it is forgotten: the pair
        // may talk again, under the same id).
        hidden.formIntersection(rawConversations.map(\.id))
        publish(rawConversations.compactMap { raw in
            guard !hidden.contains(raw.id) else { return nil }
            guard let otherId = raw.otherId, !blocked.contains(otherId), let other = found[otherId] else { return nil }
            return Conversation(id: raw.id, other: other, lastText: raw.lastText, lastFromMe: raw.lastSender == uid,
                                lastImage: raw.lastImage, lastUnsent: raw.lastUnsent, lastSticker: raw.lastSticker,
                                lastAlbum: raw.lastAlbum, sentAt: raw.sentAt, unread: raw.unread)
        })
        let talking = Set(conversations.map(\.other.id))
        starters = connectionUids.filter { !talking.contains($0) && !blocked.contains($0) }.compactMap { found[$0] }
        loaded = ready.isSuperset(of: ["conversations", "connections", "blocks"])
    }

    /// The list as it is now, and what is kept beside it. Each is told to its readers only when it
    /// changed (an equal value set again notifies no one).
    private func publish(_ list: [Conversation]) {
        conversations = list
        unreadTotal = list.reduce(0) { $0 + $1.unread }
        listedIds = Set(list.map(\.id))
        listedHandles = list.map(\.other.handle)
    }

    /// Someone's profile (users/{uid} is public). A missing one, or one without
    /// a pen name, is someone who's gone; so is a refusal. Anything else failed
    /// for now. (The bell reads its senders the same way.)
    nonisolated static func read(_ id: String) async -> PeopleBook.Read {
        do {
            let data = try await FirebaseBootstrap.db.collection("users").document(id).getDocument().data()
            return Person(id: id, data: data).map(PeopleBook.Read.found) ?? .gone
        } catch {
            return FirestoreFailure.isGone(error) ? .gone : .failed
        }
    }

    /// Whose connection began or ended between two reads of the list.
    nonisolated static func moved(from before: [String], to after: [String]) -> Set<String> {
        Set(before).symmetricDifference(after)
    }

    /// The last message was unsent: `unsent: true` and none of what a message says beside it (a preview
    /// written over an older one may keep a stale flag next to new words — the words win).
    nonisolated static func unsent(_ last: [String: Any]?) -> Bool {
        guard let last, last["unsent"] as? Bool == true else { return false }
        return last["text"] == nil && last["image"] == nil && last["cardRef"] == nil
    }

    nonisolated fileprivate static func other(in doc: QueryDocumentSnapshot, me: String) -> String? {
        (doc.get("participants") as? [String])?.first { $0 != me }
    }

    /// A conversation as either path reads it, before its person is known.
    nonisolated struct RawConversation: Sendable {
        let id: String
        let otherId: String?
        let lastText: String?
        let lastSender: String?
        let lastImage: Bool
        let lastUnsent: Bool
        let lastSticker: Bool
        let lastAlbum: Int?
        let sentAt: Date?
        let unread: Int

        init(doc: QueryDocumentSnapshot, me: String) {
            id = doc.documentID
            otherId = ConversationsStore.other(in: doc, me: me)
            let last = doc.get("lastMessage") as? [String: Any]
            lastText = last?["text"] as? String
            lastSender = last?["senderId"] as? String
            lastImage = last?["image"] as? Bool == true
            lastUnsent = ConversationsStore.unsent(last)
            lastSticker = last?["sticker"] as? Bool == true
            lastAlbum = ((last?["album"] as? [String: Any])?["count"] as? NSNumber)?.intValue
            sentAt = (last?["sentAt"] as? Timestamp)?.dateValue()
            unread = ((doc.get("unread") as? [String: Any])?[me] as? NSNumber)?.intValue ?? 0
        }

        /// GET /conversations' row: the server read the document by the same rules (an unsent preview with words or
        /// a picture beside it is the words).
        init(api conversation: InboxAPI.Conversation) {
            id = conversation.id
            otherId = conversation.otherId.isEmpty ? nil : conversation.otherId
            let last = conversation.lastMessage?.value1
            lastText = last.map(\.text)
            lastSender = last?.senderId
            lastImage = last?.image == true
            lastUnsent = last.map { $0.unsent && $0.text.isEmpty && !$0.image } ?? false
            lastSticker = last?.sticker == true
            lastAlbum = last?.albumCount
            sentAt = last?.sentAt.flatMap(ISO8601.date)
            unread = conversation.unread
        }
    }
}

/// One pull of a kind at a time: one asked for while it runs runs once more after it (never a queue of them).
@MainActor
struct PullGate {
    private final class State {
        var running: Set<String> = []
        var again: Set<String> = []
    }

    private let state = State()

    func run(_ kind: String, _ work: @escaping @MainActor () async -> Void) {
        guard !state.running.contains(kind) else {
            state.again.insert(kind)
            return
        }
        state.running.insert(kind)
        let state = state
        Task { @MainActor in
            repeat {
                state.again.remove(kind)
                await work()
            } while state.again.contains(kind)
            state.running.remove(kind)
        }
    }
}

extension PeopleBook {
    /// Each of `ids` read on its own (the older path: one profile document each), all at once.
    nonisolated static func readEach(_ ids: Set<String>, _ read: @escaping @Sendable (String) async -> Read) async -> [String: Read] {
        await withTaskGroup(of: (String, Read).self) { group in
            for id in ids { group.addTask { (id, await read(id)) } }
            var out: [String: Read] = [:]
            for await (id, found) in group { out[id] = found }
            return out
        }
    }

    /// GET /users' answer as the book records it: a profile that is gone, or has no pen name, is someone who's gone.
    nonisolated static func reads(_ people: [SocialAPI.Person]) -> [String: Read] {
        var out: [String: Read] = [:]
        for person in people {
            if !person.gone, let author = person.author?.value1, let found = Person(author: author) {
                out[person.id] = .found(found)
            } else {
                out[person.id] = .gone
            }
        }
        return out
    }
}

/// The people Messages has asked about: those found, those gone (no profile,
/// or refused) — not asked about again this session — and those whose read
/// failed (offline, a timeout), asked about again on the next change or when
/// the app comes back to the foreground. A failed read never hides a
/// conversation for good.
nonisolated struct PeopleBook {
    enum Read: Sendable { case found(Person), gone, failed }

    private(set) var found: [String: Person] = [:]
    private var gone: Set<String> = []
    private var retry: Set<String> = []

    /// Of `ids`, those still to ask about.
    func toRead(_ ids: Set<String>) -> Set<String> {
        ids.subtracting(found.keys).subtracting(gone)
    }

    /// Some reads failed and wait for another try.
    var hasRetries: Bool { !retry.isEmpty }

    mutating func record(_ id: String, _ read: Read) {
        retry.remove(id)
        switch read {
        case let .found(person): found[id] = person
        case .gone: gone.insert(id)
        case .failed: retry.insert(id)
        }
    }
}
