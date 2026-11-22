import Foundation

/// What the signal listener can say about `signals/{uid}` as a pull starts — the web's `heardCounters`
/// (client/signals): what a pull compares with the counters at its last read to read only what moved.
public enum SignalsHeard: Equatable, Sendable {
    /// Live: the counters as last heard, and as the listener first heard them (its first answer, which fires
    /// nothing — it stands for the reads made before it).
    case live(now: SignalCounters, first: SignalCounters)
    /// A listener that never failed hasn't answered yet: its first answer will stand for a read made now.
    case waiting
    /// No one can say what moved: no listener (the flag off, signed out), or it failed and hasn't heard since.
    case unknown
}

/// The conversations list's read, the web's `conversationsReader` (client/messages): each change that moves the
/// list's `inbox` counter — a message, a note, an unsend, a read, a deletion — moves that conversation's own
/// `threads[pair]` counter in the same touch (server domain/realtime), so a pull asks only for the conversations
/// whose counters moved since its last read (`GET /conversations?pairs=`, about two reads each, where a whole
/// page is about a hundred) and merges them into the list it holds; one asked for that the answer leaves out is
/// gone. The list is read whole instead when no one can say what moved (``SignalsHeard/unknown``, or no read yet
/// to compare with), when `inbox` moved with no conversation's counter (a touch of the list alone), when more
/// moved than one delta asks for (``pairsMax``), when a list cut short at its last page lost a conversation (the
/// next one in is only the server's to say), and every ``fullReadInterval`` besides — for what no signal tells
/// of (a renamed person, a touch that failed). A pull with nothing moved while the listener is live asks nothing.
@MainActor
public final class ConversationsReader {
    /// How long the list goes on reading only what moved before it reads it whole again (the web's
    /// `LIST_FULL_READ_MS`; the server's early 304 trusts a list as long).
    public static let fullReadInterval: TimeInterval = 10 * 60
    /// The most conversations one delta asks for (the API's `pairs` cap); more moved, the list is read whole.
    public static let pairsMax = 20

    private let whole: () async throws -> (conversations: [InboxAPI.Conversation], complete: Bool)
    private let pairs: ([String]) async throws -> [InboxAPI.Conversation]

    /// The list as last handed on (nil before the first read).
    public private(set) var held: [InboxAPI.Conversation]?
    /// The last whole read reached the end of the account's conversations (else it stopped at its last page).
    private var complete = true
    /// How many rows a list cut short holds: a conversation that moved up from beyond it pushes the last one out.
    private var cap = 0
    /// The counters as they stood when `held` was last read (nil: unknown).
    private var heardAt: SignalCounters?
    /// `held` was read whole before the listener's first answer, which then stands for its counters.
    private var beforeFirst = false
    private var fullAt: Date?

    public init(whole: @escaping () async throws -> (conversations: [InboxAPI.Conversation], complete: Bool),
                pairs: @escaping ([String]) async throws -> [InboxAPI.Conversation]) {
        self.whole = whole
        self.pairs = pairs
    }

    /// Reads through `inbox`: its pages for a whole read, `?pairs=` for a delta.
    public convenience init(inbox: InboxAPI) {
        self.init(whole: { try await inbox.conversationPages() }, pairs: { try await inbox.conversations(pairs: $0) })
    }

    /// The list now. `heard` is taken before the read (a touch heard while it is on its way is compared again by
    /// the next pull).
    public func read(heard: SignalsHeard, now: Date = Date()) async throws -> [InboxAPI.Conversation] {
        guard let held, case let .live(counters, first) = heard,
              let was = heardAt ?? (beforeFirst ? first : nil),
              let fullAt, now.timeIntervalSince(fullAt) < Self.fullReadInterval
        else { return try await readWhole(heard: heard, now: now) }
        beforeFirst = false
        if counters.inbox <= was.inbox {
            heardAt = counters
            return held
        }
        let moved = counters.threads.filter { $0.value > (was.threads[$0.key] ?? 0) }.map(\.key).sorted()
        if moved.isEmpty || moved.count > Self.pairsMax { return try await readWhole(heard: heard, now: now) }
        let came = try await pairs(moved)
        let asked = Set(moved)
        let cameIds = Set(came.map(\.id))
        // A list cut short that lost a conversation: the one that comes in at its end is only the server's to say.
        if !complete, held.contains(where: { asked.contains($0.id) && !cameIds.contains($0.id) }) {
            return try await readWhole(heard: heard, now: now)
        }
        var merged = (held.filter { !asked.contains($0.id) } + came.filter { asked.contains($0.id) }).sorted(by: Self.activeFirst)
        // A list cut short stays as long: one that moved behind its last is a later page's.
        if !complete, merged.count > cap { merged = Array(merged.prefix(cap)) }
        self.held = merged
        heardAt = counters
        return merged
    }

    private func readWhole(heard: SignalsHeard, now: Date) async throws -> [InboxAPI.Conversation] {
        let (list, complete) = try await whole()
        held = list
        self.complete = complete
        cap = list.count
        if case let .live(counters, _) = heard { heardAt = counters } else { heardAt = nil }
        beforeFirst = heard == .waiting
        fullAt = now
        return list
    }

    /// Most recently active first, as the API pages them: `updatedAt` (ISO 8601 to the microsecond, so its text
    /// sorts as its time), then id.
    nonisolated static func activeFirst(_ a: InboxAPI.Conversation, _ b: InboxAPI.Conversation) -> Bool {
        let x = a.updatedAt ?? "", y = b.updatedAt ?? ""
        return x == y ? a.id > b.id : x > y
    }
}
