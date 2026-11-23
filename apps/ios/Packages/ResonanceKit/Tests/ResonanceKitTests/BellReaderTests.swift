import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// The bell reads only what changed (traffic phase 3, the web's bellReader): the newest page once with `changes=1`,
/// then — when `bell` moved — `updatedAfter` its cursor, a `delta` merged by id into the rows held; read whole when
/// no one can say what moved, when the server answers whole, and every ten minutes; nothing asked when nothing moved.
@MainActor
struct BellReaderTests {
    /// GET /me/bell as the contract answers it: `rows` newest first; with `updatedAfter`, `changed` as a delta
    /// (or the page whole when `whole` is set).
    final class Server: @unchecked Sendable {
        private let lock = NSLock()
        private var _rows: [(id: String, at: String, read: Bool)]
        private var _changed: [(id: String, at: String, read: Bool)] = []
        private var _whole = false
        private var _asked: [(updatedAfter: String?, changes: String?)] = []
        private var cursorCount = 0

        init(_ rows: [(id: String, at: String, read: Bool)]) { _rows = rows }

        var rows: [(id: String, at: String, read: Bool)] {
            get { lock.withLock { _rows } }
            set { lock.withLock { _rows = newValue } }
        }
        var changed: [(id: String, at: String, read: Bool)] {
            get { lock.withLock { _changed } }
            set { lock.withLock { _changed = newValue } }
        }
        var whole: Bool {
            get { lock.withLock { _whole } }
            set { lock.withLock { _whole = newValue } }
        }
        var asked: [(updatedAfter: String?, changes: String?)] { lock.withLock { _asked } }
        var wholeReads: Int { asked.filter { $0.updatedAfter == nil }.count }
        var deltas: [String] { asked.compactMap(\.updatedAfter) }

        static func row(_ r: (id: String, at: String, read: Bool)) -> String {
            #"{"id":"\#(r.id)","type":"note","payload":{"fromUserId":"u_\#(r.id)","fromHandle":"h","cardId":"c_\#(r.id)","preview":"p"},"readAt":\#(r.read ? #""2026-11-22T11:00:00.000000Z""# : "null"),"createdAt":"\#(r.at)"}"#
        }

        static func person(_ id: String) -> String {
            #"{"id":"\#(id)","handle":"\#(id)","initials":"XX","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,"avatarSeed":"1","verified":false,"region":"TW"}"#
        }

        func answer(_ request: HTTPRequest) -> String {
            let after = request.query("updatedAfter")
            let (rows, changed, whole, cursor): ([(id: String, at: String, read: Bool)], [(id: String, at: String, read: Bool)], Bool, String) = lock.withLock {
                _asked.append((after, request.query("changes")))
                cursorCount += 1
                return (_rows, _changed, _whole, "k\(cursorCount)")
            }
            if after != nil, !whole {
                let people = changed.map { Self.person("u_\($0.id)") }
                return #"{"items":[\#(changed.map(Self.row).joined(separator: ","))],"people":[\#(people.joined(separator: ","))],"nextPageToken":null,"delta":true,"updatedCursor":"\#(cursor)"}"#
            }
            let people = rows.map { Self.person("u_\($0.id)") }
            return #"{"items":[\#(rows.map(Self.row).joined(separator: ","))],"people":[\#(people.joined(separator: ","))],"nextPageToken":null,"updatedCursor":"\#(cursor)"}"#
        }
    }

    private func reader(_ server: Server, limit: Int = 50) -> BellReader {
        let transport = StubTransport(body: "")
        transport.reply = { server.answer($0) }
        let inbox = InboxAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!,
                                            configuration: .init(dateTranscoder: .iso8601WithFractionalSeconds), transport: transport))
        return BellReader(inbox: inbox, limit: limit)
    }

    private static func at(_ minute: Int) -> String { String(format: "2026-11-22T10:%02d:00.000000Z", minute) }
    private func live(_ now: SignalCounters, first: SignalCounters = SignalCounters()) -> SignalsHeard { .live(now: now, first: first) }
    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func aRowMadeIsOneDeltaMergedOnTop() async throws {
        let server = Server([("n2", Self.at(2), false), ("n1", Self.at(1), false)])
        let reader = reader(server)
        var heard = SignalCounters(bell: 3)
        let first = try await reader.read(heard: live(heard), now: start)
        #expect(first.items.map(\.id) == ["n2", "n1"])
        #expect(first.people.map(\.id) == ["u_n2", "u_n1"])
        #expect(server.asked.first?.changes == "1")
        // A note came: only it, and its person.
        server.changed = [("n3", Self.at(5), false)]
        heard.bell = 4
        let next = try await reader.read(heard: live(heard), now: start.addingTimeInterval(30))
        #expect(server.deltas == ["k1"])
        #expect(server.wholeReads == 1)
        #expect(next.items.map(\.id) == ["n3", "n2", "n1"])
        #expect(next.people.map(\.id) == ["u_n3"])
        // Read on another device: the row changed comes alone and replaces the one held, in its place.
        server.changed = [("n1", Self.at(1), true)]
        heard.bell = 5
        let read = try await reader.read(heard: live(heard), now: start.addingTimeInterval(40))
        #expect(server.deltas == ["k1", "k2"])
        #expect(read.items.map(\.id) == ["n3", "n2", "n1"])
        #expect(read.items.last?.readAt != nil)
    }

    @Test func aPullWithNothingMovedAsksNothing() async throws {
        let server = Server([("n1", Self.at(1), false)])
        let reader = reader(server)
        let heard = SignalCounters(inbox: 1, bell: 2)
        _ = try await reader.read(heard: live(heard), now: start)
        var other = heard
        other.inbox = 9
        let answer = try await reader.read(heard: live(other), now: start.addingTimeInterval(5))
        #expect(!answer.asked)
        #expect(answer.items.map(\.id) == ["n1"])
        #expect(server.asked.count == 1)
    }

    @Test func theServerAnsweringWholeReplacesTheRows() async throws {
        let server = Server([("n2", Self.at(2), false), ("n1", Self.at(1), false)])
        let reader = reader(server)
        var heard = SignalCounters(bell: 1)
        _ = try await reader.read(heard: live(heard), now: start)
        // A row went: the server can't tell it, so the page comes whole.
        server.rows = [("n2", Self.at(2), false)]
        server.whole = true
        heard.bell = 2
        let answer = try await reader.read(heard: live(heard), now: start.addingTimeInterval(5))
        #expect(answer.items.map(\.id) == ["n2"])
        #expect(server.deltas == ["k1"])
    }

    @Test func aDeltaIsCutToTheLimitNewestFirst() async throws {
        let server = Server([("b", Self.at(2), false), ("a", Self.at(2), false)])
        let reader = reader(server, limit: 2)
        var heard = SignalCounters(bell: 1)
        _ = try await reader.read(heard: live(heard), now: start)
        server.changed = [("c", Self.at(3), false)]
        heard.bell = 2
        let answer = try await reader.read(heard: live(heard), now: start.addingTimeInterval(5))
        // Same time: id descending, then the oldest drops off.
        #expect(answer.items.map(\.id) == ["c", "b"])
    }

    @Test func unknownWaitingAndTenMinutesReadWhole() async throws {
        let server = Server([("n1", Self.at(1), false)])
        let reader = reader(server)
        _ = try await reader.read(heard: .waiting, now: start)
        _ = try await reader.read(heard: .unknown, now: start.addingTimeInterval(1))
        #expect(server.wholeReads == 2)
        _ = try await reader.read(heard: .waiting, now: start.addingTimeInterval(2))
        // The listener's first answer stands for the read made while it waited: a move since is a delta.
        let first = SignalCounters(bell: 4)
        _ = try await reader.read(heard: live(SignalCounters(bell: 5), first: first), now: start.addingTimeInterval(3))
        #expect(server.wholeReads == 3)
        #expect(server.deltas.count == 1)
        // Ten minutes after the last whole read: whole, whatever moved.
        _ = try await reader.read(heard: live(SignalCounters(bell: 6), first: first), now: start.addingTimeInterval(2 + 10 * 60))
        #expect(server.wholeReads == 4)
    }

    @Test func noCursorReadsWhole() async throws {
        // An older server (or one with no mark yet): no `updatedCursor`, so each move reads the page whole.
        let transport = StubTransport(body: #"{"items":[\#(Server.row(("n1", Self.at(1), false)))],"people":[],"nextPageToken":null}"#)
        let inbox = InboxAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!,
                                            configuration: .init(dateTranscoder: .iso8601WithFractionalSeconds), transport: transport))
        let reader = BellReader(inbox: inbox)
        _ = try await reader.read(heard: live(SignalCounters(bell: 1)), now: start)
        _ = try await reader.read(heard: live(SignalCounters(bell: 2)), now: start.addingTimeInterval(5))
        #expect(transport.requests.count == 2)
        #expect(transport.requests.allSatisfy { $0.query("updatedAfter") == nil })
    }
}
