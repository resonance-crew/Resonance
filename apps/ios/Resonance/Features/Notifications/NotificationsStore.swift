import FirebaseFirestore
import Foundation
import Observation
import ResonanceKit

/// The signed-in person's notifications, live. Drives the tab badge too. With `features.apiBell` (Phase 2 of the
/// middleware decouple) read through GET /api/v1/me/bell — pulled again when `signals/{uid}` `bell` moves and on the
/// 60 s foreground pull, a 304 when nothing changed — and read through POST /notifications/read, the row drawn read
/// at once; otherwise (the older path, kept one release) a Firestore snapshot listener on the same query the web's
/// bell read, its rows read by writing `readAt`.
@Observable
final class NotificationsStore {
    struct Item: Identifiable, Equatable {
        let id: String
        let type: String
        let fromHandle: String?
        /// Who it's from (a thread opened from it outlasts their change of pen name).
        let fromUserId: String?
        let cardId: String?
        let preview: String?
        /// A note's id (to quote it when replying).
        let noteId: String?
        let count: Int?
        let readAt: Date?
        let createdAt: Date?
        /// A note or resonance on one of this person's anonymous cards (`payload.anonymous`): it opens
        /// the card, never a thread with whoever wrote it (see `NotificationsScreen.route`).
        var anonymous = false
        /// A resonance tap's row (round 26 §R2): everyone it names, newest first (`fromUserId` is the first).
        var fromUserIds: [String] = []
        /// The weekly read summary's row (§R4): how many read the card to the end, and whether someone read it again.
        var readers: Int?
        var reread = false
        var isUnread: Bool { readAt == nil }

        /// The row read at `at`.
        func read(at: Date) -> Item {
            Item(id: id, type: type, fromHandle: fromHandle, fromUserId: fromUserId, cardId: cardId, preview: preview, noteId: noteId,
                 count: count, readAt: at, createdAt: createdAt, anonymous: anonymous, fromUserIds: fromUserIds, readers: readers,
                 reread: reread)
        }
    }

    private(set) var items: [Item] = []
    private(set) var loaded = false
    /// The listener failed: the list stays as last read (or the screen offers
    /// a retry, with nothing read yet) until it listens again (`resume`).
    private(set) var failed = false
    /// The tab's badge: the unread rows. Kept apart from `items` (and set beside it), so what reads
    /// only the badge — the tab bar — is drawn again when the count changes, not for every row's.
    private(set) var unreadCount = 0

    @ObservationIgnored private let listeners = LiveListeners()
    /// The API path this run takes (nil: Firestore), and the bell signal that says when to pull.
    @ObservationIgnored private var bell: InboxAPI?
    /// The read that asks only for what changed since the last (``BellReader``), and the signals it compares with.
    @ObservationIgnored private var reader: BellReader?
    @ObservationIgnored private weak var signals: SignalListener?
    @ObservationIgnored private var subscription: SignalSubscription?
    /// The rows as the server last answered them (before `readHere` draws some read).
    @ObservationIgnored private var fresh: [Item] = []
    /// The people the answers named (GET /me/bell's `people`), by uid: the rows' faces need no read of their own.
    @ObservationIgnored private(set) var answeredPeople: [String: Person] = [:]
    /// Makes the screen's extras (the session's paths), so a read can fetch the rows' cards and their covers
    /// before the screen shows: 通知 opens on its tiles, not on empty ones filling in (nil: nothing ahead).
    @ObservationIgnored var makeExtras: (() -> BellExtras?)?
    /// Fetches the cards' covers ahead (the image pipeline's prefetch; a test counts them).
    @ObservationIgnored var prefetchCovers: ([URL]) -> Void = { BellThumb.prefetch($0) }
    /// The last ahead-of-time load, awaited by tests.
    @ObservationIgnored private(set) var preloading: Task<Void, Never>?
    @ObservationIgnored private var pulls = PullGate()
    @ObservationIgnored private var uid: String?
    /// Rows read here and not yet read in the server's answer: they stay read (a pull that started before the read
    /// was written would otherwise bring the dot back for a moment).
    @ObservationIgnored private var readHere: [String: Date] = [:]

    /// Whether this run reads the bell through the API.
    var usesAPI: Bool { bell != nil }
    /// Who the rows are from and the cards they are about (round 21), as read while the screen showed;
    /// kept until sign-out.
    @ObservationIgnored private var keptExtras: BellExtras?

    /// The rows' faces and cards, made the first time the screen asks.
    func extras(reading: ReadingAPI, readPeople: (@Sendable (Set<String>) async -> [String: PeopleBook.Read])? = nil) -> BellExtras {
        if let keptExtras { return keptExtras }
        let made = BellExtras.make(reading: reading, readPeople: readPeople)
        made.know(Array(answeredPeople.values))
        keptExtras = made
        return made
    }

    func start(uid: String, bell: InboxAPI? = nil, signals: SignalListener? = nil) {
        stop()
        self.uid = uid
        if let bell {
            self.bell = bell
            self.signals = signals
            reader = BellReader(inbox: bell, limit: 50)
            subscription = signals?.observe([.bell]) { [weak self] _ in self?.pull() }
            pull()
            return
        }
        listeners.add("notifications") { [weak self] in
            let registration = FirebaseBootstrap.db.collection("notifications")
                .whereField("userId", isEqualTo: uid)
                .order(by: "createdAt", descending: true)
                .limit(to: 50)
                .addSnapshotListener { snapshot, _ in
                    let items = snapshot?.documents.map(Self.item)
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        guard let items else {
                            self.listeners.fail("notifications")
                            self.failed = true
                            return
                        }
                        self.items = items
                        self.unreadCount = items.filter(\.isUnread).count
                        self.loaded = true
                        self.failed = false
                    }
                }
            return { registration.remove() }
        }
    }

    /// Back in the foreground (or the retry tapped): a failed listener listens again (the API's bell is asked again).
    func resume() {
        if listeners.resume() { failed = false }
        if bell != nil { pull() }
    }

    /// Asks the server for what changed in the bell (one pull at a time; one asked for meanwhile runs after it):
    /// nothing when the listener is live and `bell` hasn't moved, only the rows changed when it has, the newest
    /// page whole when no one can say (``BellReader``).
    private func pull() {
        guard let reader, let uid else { return }
        pulls.run("bell") { [weak self] in
            do {
                // Taken before the read: a touch heard while it is on its way is compared again by the next pull.
                let answer = try await reader.read(heard: self?.signals?.heard ?? .unknown)
                guard let self, self.uid == uid else { return }
                if !answer.asked, self.loaded {
                    self.failed = false
                    return
                }
                self.remember(answer.people)
                self.show(answer.items.map(Self.item(api:)))
                self.preload()
            } catch {
                guard let self, self.uid == uid else { return }
                self.failed = true
            }
        }
    }

    /// An answer's people, kept (and handed to the screen's extras once they exist).
    private func remember(_ authors: [InboxAPI.Author]) {
        let people = authors.compactMap(Person.init(author:))
        guard !people.isEmpty else { return }
        for person in people { answeredPeople[person.id] = person }
        keptExtras?.know(people)
    }

    /// After a read, in the background: the rows' cards (one request for those not read yet) and their covers'
    /// thumbnails, so the screen draws them at once when it opens.
    private func preload() {
        guard let extras = keptExtras ?? makeExtras?() else { return }
        if keptExtras == nil {
            extras.know(Array(answeredPeople.values))
            keptExtras = extras
        }
        let items = items
        let prefetch = prefetchCovers
        preloading = Task { [weak self] in
            await extras.loadCards(items)
            guard self != nil else { return }
            prefetch(BellThumb.covers(items, cards: extras.cards))
        }
    }

    private func show(_ fresh: [Item]) {
        self.fresh = fresh
        // A row read here keeps its read until the server says so too.
        let shown = fresh.map { item -> Item in
            guard item.isUnread, let at = readHere[item.id] else {
                readHere[item.id] = nil
                return item
            }
            return item.read(at: at)
        }
        if shown != items { items = shown }
        unreadCount = shown.filter(\.isUnread).count
        loaded = true
        failed = false
    }

    func stop() {
        listeners.removeAll()
        subscription?.cancel()
        subscription = nil
        bell = nil
        reader = nil
        signals = nil
        fresh = []
        answeredPeople = [:]
        preloading?.cancel()
        preloading = nil
        pulls = PullGate()
        uid = nil
        readHere = [:]
        keptExtras = nil
        items = []
        unreadCount = 0
        loaded = false
        failed = false
    }

    func markRead(_ item: Item) {
        guard item.isUnread else { return }
        markRead(id: item.id)
    }

    /// A tapped push reads its row (it may not have arrived in the list yet).
    func markRead(id: String) {
        if let item = items.first(where: { $0.id == id }), !item.isUnread { return }
        if let bell {
            // Drawn read at once; the server's answer follows on the bell's signal.
            let now = Date()
            readHere[id] = now
            show(fresh)
            Task { [weak self] in
                do { try await bell.markBellRead([id]) } catch {
                    // Not read after all: the dot comes back (as the server last said), and the bell is asked again.
                    guard let self else { return }
                    self.readHere[id] = nil
                    self.show(self.fresh)
                    self.pull()
                }
            }
            return
        }
        FirebaseBootstrap.db.collection("notifications").document(id)
            .updateData(["readAt": FieldValue.serverTimestamp()])
    }

    /// A row of GET /me/bell, as the list draws it (the payload as the server wrote it, as the document had it).
    nonisolated static func item(api row: InboxAPI.BellItem) -> Item {
        let payload = row.payload
        let tappers = payload.fromUserIds ?? []
        return Item(
            id: row.id,
            type: row._type,
            fromHandle: payload.fromHandle,
            fromUserId: payload.fromUserId ?? tappers.first,
            cardId: payload.cardId,
            preview: payload.preview,
            noteId: payload.noteId,
            count: payload.count.map { Int($0) },
            readAt: row.readAt.flatMap(ISO8601.date),
            createdAt: ISO8601.date(row.createdAt),
            anonymous: payload.anonymous == true,
            fromUserIds: tappers,
            readers: payload.readers.map { Int($0) },
            reread: payload.reread == true
        )
    }

    nonisolated static func item(_ doc: QueryDocumentSnapshot) -> Item {
        item(id: doc.documentID, data: doc.data())
    }

    /// A bell row's fields as the list draws them.
    nonisolated static func item(id: String, data: [String: Any]) -> Item {
        let payload = data["payload"] as? [String: Any] ?? [:]
        let tappers = (payload["fromUserIds"] as? [Any])?.compactMap { $0 as? String } ?? []
        return Item(
            id: id,
            type: data["type"] as? String ?? "",
            fromHandle: payload["fromHandle"] as? String,
            // A tap's row names its newest tapper first (its face, its name in bold).
            fromUserId: payload["fromUserId"] as? String ?? tappers.first,
            cardId: payload["cardId"] as? String,
            preview: payload["preview"] as? String,
            noteId: payload["noteId"] as? String,
            count: (payload["count"] as? NSNumber)?.intValue,
            readAt: (data["readAt"] as? Timestamp)?.dateValue(),
            createdAt: (data["createdAt"] as? Timestamp)?.dateValue(),
            anonymous: payload["anonymous"] as? Bool == true,
            fromUserIds: tappers,
            readers: (payload["readers"] as? NSNumber)?.intValue,
            reread: payload["reread"] as? Bool == true
        )
    }
}

/// The bell's extras (round 21, the web's useBellExtras): the senders' profiles — read as Messages reads
/// them (``ConversationsStore/read(_:)``), people a conversation already knows taken from there — and the
/// cards the rows are about, in one request (``CardSummaries``: the viewer's own cards, anonymous ones
/// too). Each is asked for once; a read that failed is asked again the next time the screen shows.
@MainActor @Observable
final class BellExtras {
    /// Where a sender stands: on its way, found, or answered without a profile (gone, or not read: the
    /// row then draws the initials of the pen name it kept).
    enum Sender: Equatable { case pending, found(Person), settled }

    private(set) var people: [String: Person] = [:]
    /// Senders whose read has come back (whatever it said).
    private(set) var answered: Set<String> = []
    let cards: CardSummaries
    @ObservationIgnored private var book = PeopleBook()
    @ObservationIgnored private var reading: Set<String> = []
    @ObservationIgnored private let readPeople: @Sendable (Set<String>) async -> [String: PeopleBook.Read]

    init(cards: CardSummaries, readPerson: @escaping @Sendable (String) async -> PeopleBook.Read = { await ConversationsStore.read($0) }) {
        self.cards = cards
        readPeople = { await PeopleBook.readEach($0, readPerson) }
    }

    /// People read many at once (the session's path: GET /users with `features.apiSocial`).
    init(cards: CardSummaries, readPeople: @escaping @Sendable (Set<String>) async -> [String: PeopleBook.Read]) {
        self.cards = cards
        self.readPeople = readPeople
    }

    func person(_ uid: String?) -> Sender {
        guard let uid, !uid.isEmpty else { return .settled }
        if let person = people[uid] { return .found(person) }
        return answered.contains(uid) ? .settled : .pending
    }

    /// What the rows ask for: their senders and their cards (a new row asks again).
    nonisolated static func key(_ items: [NotificationsStore.Item]) -> String {
        let from = Set(items.compactMap(\.fromUserId)).sorted().joined(separator: ",")
        let cards = Set(items.compactMap(\.cardId)).sorted().joined(separator: ",")
        return from + "|" + cards
    }

    /// The extras on the session's paths: people read many at once with `readPeople`, else one by one.
    static func make(reading: ReadingAPI, readPeople: (@Sendable (Set<String>) async -> [String: PeopleBook.Read])?) -> BellExtras {
        readPeople.map { BellExtras(cards: CardSummaries(api: reading), readPeople: $0) } ?? BellExtras(cards: CardSummaries(api: reading))
    }

    /// People an answer of the bell already named (GET /me/bell's `people`): found, never read again.
    func know(_ found: [Person]) {
        for person in found where people[person.id] != person {
            people[person.id] = person
            book.record(person.id, .found(person))
            answered.insert(person.id)
        }
    }

    /// The cards of `items` not asked for yet, in one request (what the store reads ahead of the screen).
    func loadCards(_ items: [NotificationsStore.Item]) async {
        await cards.load(Self.cardIds(items))
    }

    nonisolated static func cardIds(_ items: [NotificationsStore.Item]) -> [String] {
        var seen = Set<String>()
        return items.compactMap(\.cardId).filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    /// Reads the senders and cards of `items` not read yet; `known` hands over a person already at hand.
    func load(_ items: [NotificationsStore.Item], known: (String) -> Person?) async {
        let uids = Set(items.compactMap(\.fromUserId).filter { !$0.isEmpty })
        for id in uids where people[id] == nil {
            guard let person = known(id) else { continue }
            people[id] = person
            book.record(id, .found(person))
            answered.insert(id)
        }
        let wanted = book.toRead(uids).subtracting(reading)
        reading.formUnion(wanted)
        let cardIds = Self.cardIds(items)
        let cards = cards
        async let cardsRead: Void = cards.load(cardIds)
        if !wanted.isEmpty {
            let reads = await readPeople(wanted)
            for id in wanted {
                let read = reads[id] ?? .failed
                book.record(id, read)
                if case let .found(person) = read { people[id] = person }
                answered.insert(id)
                reading.remove(id)
            }
        }
        await cardsRead
    }
}
