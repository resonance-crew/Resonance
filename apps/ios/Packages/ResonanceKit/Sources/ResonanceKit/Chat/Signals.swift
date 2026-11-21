import Foundation

/// What a change of `signals/{uid}` says to pull again (Phase 2 of the middleware decouple). The document holds
/// counters only — `{ v: 1, inbox, bell, graph, map, drafts, threads: { [pairId]: n }, at }` — that only rise; a
/// counter that moved names the GET to ask again (with `If-None-Match`), never what changed.
public enum SignalTopic: Hashable, Sendable {
    /// The conversations list (GET /conversations).
    case inbox
    /// The bell (GET /me/bell).
    case bell
    /// Connections and blocks (GET /me/connections, /me/blocks).
    case graph
    case map
    case drafts
    /// One thread (`threads[pair]`): its newest window and its conversation.
    case thread(String)
}

/// The counters of one read of `signals/{uid}`; an absent field is 0.
public struct SignalCounters: Equatable, Sendable {
    public var inbox = 0
    public var bell = 0
    public var graph = 0
    public var map = 0
    public var drafts = 0
    public var threads: [String: Int] = [:]

    public init(inbox: Int = 0, bell: Int = 0, graph: Int = 0, map: Int = 0, drafts: Int = 0, threads: [String: Int] = [:]) {
        self.inbox = inbox
        self.bell = bell
        self.graph = graph
        self.map = map
        self.drafts = drafts
        self.threads = threads
    }

    /// The document's fields as Firestore hands them over (numbers as NSNumber); anything else reads as 0.
    public init(fields: [String: Any]?) {
        func count(_ value: Any?) -> Int { (value as? NSNumber)?.intValue ?? 0 }
        let fields = fields ?? [:]
        inbox = count(fields["inbox"])
        bell = count(fields["bell"])
        graph = count(fields["graph"])
        map = count(fields["map"])
        drafts = count(fields["drafts"])
        var threads: [String: Int] = [:]
        for (pair, value) in fields["threads"] as? [String: Any] ?? [:] where !pair.isEmpty {
            threads[pair] = count(value)
        }
        self.threads = threads
    }

    /// The topics whose counter differs from `before` (nil: the first read, which names nothing — the stores read
    /// as they start).
    public func changes(since before: SignalCounters?) -> Set<SignalTopic> {
        guard let before else { return [] }
        var out = Set<SignalTopic>()
        if inbox != before.inbox { out.insert(.inbox) }
        if bell != before.bell { out.insert(.bell) }
        if graph != before.graph { out.insert(.graph) }
        if map != before.map { out.insert(.map) }
        if drafts != before.drafts { out.insert(.drafts) }
        for pair in Set(threads.keys).union(before.threads.keys) where threads[pair] != before.threads[pair] {
            out.insert(.thread(pair))
        }
        return out
    }
}
