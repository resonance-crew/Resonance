import Foundation

/// The bell's read, the web's `bellReader` (client/notifications): the newest page once with `changes=1`, its
/// `updatedCursor` kept; then — when the listener heard the `bell` counter move — only the rows changed since
/// (`updatedAfter`: a row made, read, rung again; GET /me/bell `delta: true`), merged by id into the rows held,
/// newest first, cut to ``limit``: not the page and its people again. The server answers the page whole when it can't
/// say only what changed (a row went, too many changed, a cursor ten minutes old), and so does this every
/// ``fullReadInterval``, and whenever no one can say what moved (``SignalsHeard/unknown``, no cursor, no read yet to
/// compare with). A pull with nothing moved while the listener is live asks nothing.
@MainActor
public final class BellReader {
    /// How long the bell goes on reading only what changed before it reads its newest page whole again (the web's
    /// `BELL_FULL_READ_MS`; the server's early 304 trusts a list as long).
    public static let fullReadInterval: TimeInterval = 10 * 60

    /// What one read hands on: the rows now, the people that answer named (none when nothing was asked), and
    /// whether the server was asked at all.
    public struct Answer: Sendable {
        public let items: [InboxAPI.BellItem]
        public let people: [InboxAPI.Author]
        public let asked: Bool
    }

    /// The rows held at most (the page asked for).
    public let limit: Int
    private let page: (_ updatedAfter: String?) async throws -> InboxAPI.BellPage

    /// The rows as last handed on (nil before the first read).
    public private(set) var held: [InboxAPI.BellItem]?
    private var cursor: String?
    /// The counters as they stood when `held` was last read (nil: unknown).
    private var heardAt: SignalCounters?
    /// `held` was read whole before the listener's first answer, which then stands for its counters.
    private var beforeFirst = false
    private var fullAt: Date?

    /// `page(nil)` reads the newest page with `changes=1`; `page(cursor)` what changed since that cursor.
    public init(limit: Int = 50, page: @escaping (_ updatedAfter: String?) async throws -> InboxAPI.BellPage) {
        self.limit = min(max(1, limit), 50)
        self.page = page
    }

    /// Reads through `inbox`'s GET /me/bell.
    public convenience init(inbox: InboxAPI, limit: Int = 50) {
        let limit = min(max(1, limit), 50)
        self.init(limit: limit) { try await inbox.bell(limit: limit, changes: true, updatedAfter: $0) }
    }

    /// The rows now. `heard` is taken before the read (a touch heard while it is on its way is compared again by
    /// the next pull).
    public func read(heard: SignalsHeard, now: Date = Date()) async throws -> Answer {
        guard let held, let cursor, case let .live(counters, first) = heard,
              let was = heardAt ?? (beforeFirst ? first : nil),
              let fullAt, now.timeIntervalSince(fullAt) < Self.fullReadInterval
        else { return try await readWhole(heard: heard, now: now) }
        beforeFirst = false
        if counters.bell <= was.bell {
            heardAt = counters
            return Answer(items: held, people: [], asked: false)
        }
        let body = try await page(cursor)
        if body.delta == true {
            let came = Set(body.items.map(\.id))
            self.held = Array((held.filter { !came.contains($0.id) } + body.items).sorted(by: Self.newestFirst).prefix(limit))
        } else {
            self.held = Array(body.items.prefix(limit))
            self.fullAt = now
        }
        self.cursor = body.updatedCursor
        heardAt = counters
        return Answer(items: self.held ?? [], people: body.people, asked: true)
    }

    private func readWhole(heard: SignalsHeard, now: Date) async throws -> Answer {
        let body = try await page(nil)
        let items = Array(body.items.prefix(limit))
        held = items
        cursor = body.updatedCursor
        if case let .live(counters, _) = heard { heardAt = counters } else { heardAt = nil }
        beforeFirst = heard == .waiting
        fullAt = now
        return Answer(items: items, people: body.people, asked: true)
    }

    /// Newest first, as the server orders the bell: made (ISO 8601 to the microsecond, so its text sorts as its
    /// time), then id.
    nonisolated static func newestFirst(_ a: InboxAPI.BellItem, _ b: InboxAPI.BellItem) -> Bool {
        a.createdAt == b.createdAt ? a.id > b.id : a.createdAt > b.createdAt
    }
}
