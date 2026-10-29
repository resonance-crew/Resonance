import FirebaseFirestore
import Foundation
import Observation
import ResonanceKit

/// The signed-in person's notifications, live (a Firestore snapshot listener
/// on the same query the web's bell reads). Drives the tab badge too.
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
        var isUnread: Bool { readAt == nil }
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
    /// Who the rows are from and the cards they are about (round 21), as read while the screen showed;
    /// kept until sign-out.
    @ObservationIgnored private var keptExtras: BellExtras?

    /// The rows' faces and cards, made the first time the screen asks.
    func extras(reading: ReadingAPI) -> BellExtras {
        if let keptExtras { return keptExtras }
        let made = BellExtras(cards: CardSummaries(api: reading))
        keptExtras = made
        return made
    }

    func start(uid: String) {
        stop()
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

    /// Back in the foreground (or the retry tapped): a failed listener listens again.
    func resume() {
        if listeners.resume() { failed = false }
    }

    func stop() {
        listeners.removeAll()
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
        FirebaseBootstrap.db.collection("notifications").document(id)
            .updateData(["readAt": FieldValue.serverTimestamp()])
    }

    nonisolated static func item(_ doc: QueryDocumentSnapshot) -> Item {
        item(id: doc.documentID, data: doc.data())
    }

    /// A bell row's fields as the list draws them.
    nonisolated static func item(id: String, data: [String: Any]) -> Item {
        let payload = data["payload"] as? [String: Any] ?? [:]
        return Item(
            id: id,
            type: data["type"] as? String ?? "",
            fromHandle: payload["fromHandle"] as? String,
            fromUserId: payload["fromUserId"] as? String,
            cardId: payload["cardId"] as? String,
            preview: payload["preview"] as? String,
            noteId: payload["noteId"] as? String,
            count: (payload["count"] as? NSNumber)?.intValue,
            readAt: (data["readAt"] as? Timestamp)?.dateValue(),
            createdAt: (data["createdAt"] as? Timestamp)?.dateValue(),
            anonymous: payload["anonymous"] as? Bool == true
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
    @ObservationIgnored private let readPerson: @Sendable (String) async -> PeopleBook.Read

    init(cards: CardSummaries, readPerson: @escaping @Sendable (String) async -> PeopleBook.Read = { await ConversationsStore.read($0) }) {
        self.cards = cards
        self.readPerson = readPerson
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
        var seen = Set<String>()
        let cardIds = items.compactMap(\.cardId).filter { !$0.isEmpty && seen.insert($0).inserted }
        let cards = cards
        async let cardsRead: Void = cards.load(cardIds)
        let readPerson = readPerson
        await withTaskGroup(of: (String, PeopleBook.Read).self) { group in
            for id in wanted {
                group.addTask { (id, await readPerson(id)) }
            }
            for await (id, read) in group {
                book.record(id, read)
                if case let .found(person) = read { people[id] = person }
                answered.insert(id)
                reading.remove(id)
            }
        }
        await cardsRead
    }
}
