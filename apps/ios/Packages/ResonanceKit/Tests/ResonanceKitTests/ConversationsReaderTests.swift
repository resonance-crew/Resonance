import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// The conversations list reads only what moved (traffic phase 3, the web's client/conversationsDelta.test.ts):
/// one change heard is one `?pairs=` request for that conversation, merged into the list held; the list is read
/// whole only when no one can say what moved, and a pull with nothing moved asks nothing.
@MainActor
struct ConversationsReaderTests {
    /// The server: the whole list is `rows` (the most recently active first), `?pairs=` the ones asked for that it has.
    final class Server: @unchecked Sendable {
        private let lock = NSLock()
        private var _rows: [(id: String, at: String, text: String)]
        private var _asked: [String?] = []
        /// More conversations than the reader's pages hold: the last page still has a next one.
        var more = false

        init(_ rows: [(id: String, at: String, text: String)]) { _rows = rows }

        var rows: [(id: String, at: String, text: String)] {
            get { lock.withLock { _rows } }
            set { lock.withLock { _rows = newValue } }
        }

        /// Each request's `pairs` (nil: a whole read's page).
        var asked: [String?] { lock.withLock { _asked } }
        var wholeReads: Int { asked.filter { $0 == nil }.count }
        var deltas: [String] { asked.compactMap { $0 } }

        static func row(_ id: String, _ at: String, _ text: String) -> String {
            let other = String(id.split(separator: "_").last ?? "")
            let author = #"{"id":"\#(other)","handle":"\#(other)","initials":"XX","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,"avatarSeed":"1","verified":false,"region":"TW"}"#
            return #"{"id":"\#(id)","participants":["me","\#(other)"],"otherId":"\#(other)","other":\#(author),"unread":0,"lastMessage":{"text":"\#(text)","senderId":"\#(other)","sentAt":"\#(at)","image":false,"sticker":false,"albumCount":null,"unsent":false},"request":null,"createdAt":null,"updatedAt":"\#(at)","originCardId":null}"#
        }

        func answer(_ request: HTTPRequest) -> String {
            let pairs = request.query("pairs")
            lock.withLock { _asked.append(pairs) }
            let rows = self.rows
            if let pairs {
                let wanted = Set(pairs.split(separator: ",").map(String.init))
                let some = rows.filter { wanted.contains($0.id) }.map { Self.row($0.id, $0.at, $0.text) }
                return #"{"conversations":[\#(some.joined(separator: ","))],"nextPageToken":null}"#
            }
            let all = rows.map { Self.row($0.id, $0.at, $0.text) }
            let token = more ? #""next""# : "null"
            // One page is enough for these tests: with `more` it is cut short (the reader stops at its pages).
            return #"{"conversations":[\#(all.joined(separator: ","))],"nextPageToken":\#(request.query("pageToken") == nil ? token : "null")}"#
        }
    }

    private func reader(_ server: Server, pages: Int = 1) -> ConversationsReader {
        let transport = StubTransport(body: "")
        transport.reply = { server.answer($0) }
        let inbox = InboxAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!,
                                            configuration: .init(dateTranscoder: .iso8601WithFractionalSeconds), transport: transport))
        return ConversationsReader(whole: {
            // `pages` pages at most, as InboxAPI's own read: one here, so `more` leaves the list cut short.
            var all: [InboxAPI.Conversation] = []
            var token: String?
            for _ in 0..<pages {
                switch try await inbox.client.listConversations(query: .init(pageToken: token)) {
                case let .ok(r):
                    let page = try r.body.json
                    all += page.conversations
                    token = page.nextPageToken
                default: throw APIFailure.unexpected(status: 500)
                }
                if token == nil { break }
            }
            return (all, token == nil)
        }, pairs: { try await inbox.conversations(pairs: $0) })
    }

    private static func at(_ minute: Int) -> String { String(format: "2026-11-22T10:%02d:00.000000Z", minute) }

    private func live(_ now: SignalCounters, first: SignalCounters = SignalCounters()) -> SignalsHeard {
        .live(now: now, first: first)
    }

    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func aMessageHeardIsOneDeltaMergedIntoTheList() async throws {
        let server = Server([("me_bob", Self.at(3), "b"), ("me_carol", Self.at(2), "c"), ("me_dave", Self.at(1), "d")])
        let reader = reader(server)
        let heard = SignalCounters(inbox: 5, threads: ["me_bob": 2, "me_carol": 1, "me_dave": 4])
        #expect(try await reader.read(heard: live(heard), now: start).map(\.id) == ["me_bob", "me_carol", "me_dave"])
        // Dave wrote: inbox and his thread's counter move in the same touch.
        server.rows = [("me_dave", Self.at(9), "new"), ("me_bob", Self.at(3), "b"), ("me_carol", Self.at(2), "c")]
        var moved = heard
        moved.inbox = 6
        moved.threads["me_dave"] = 5
        let list = try await reader.read(heard: live(moved), now: start.addingTimeInterval(30))
        #expect(server.wholeReads == 1)
        #expect(server.deltas == ["me_dave"])
        #expect(list.map(\.id) == ["me_dave", "me_bob", "me_carol"])
        #expect(list.first?.lastMessage?.value1.text == "new")
        // Read here (inbox and the thread again): one more delta, for that one alone.
        moved.inbox = 7
        moved.threads["me_carol"] = 2
        _ = try await reader.read(heard: live(moved), now: start.addingTimeInterval(40))
        #expect(server.deltas == ["me_dave", "me_carol"])
        #expect(server.wholeReads == 1)
    }

    @Test func oneAskedForAndLeftOutIsGone() async throws {
        let server = Server([("me_bob", Self.at(3), "b"), ("me_carol", Self.at(2), "c")])
        let reader = reader(server)
        var heard = SignalCounters(inbox: 1, threads: ["me_bob": 1, "me_carol": 1])
        _ = try await reader.read(heard: live(heard), now: start)
        server.rows = [("me_bob", Self.at(3), "b")]
        heard.inbox = 2
        heard.threads["me_carol"] = 2
        let list = try await reader.read(heard: live(heard), now: start.addingTimeInterval(5))
        #expect(server.deltas == ["me_carol"])
        #expect(server.wholeReads == 1)
        #expect(list.map(\.id) == ["me_bob"])
    }

    @Test func aListCutShortThatLostOneIsReadWhole() async throws {
        let server = Server([("me_bob", Self.at(3), "b"), ("me_carol", Self.at(2), "c")])
        server.more = true
        let reader = reader(server)
        var heard = SignalCounters(inbox: 1)
        _ = try await reader.read(heard: live(heard), now: start)
        server.rows = [("me_bob", Self.at(3), "b"), ("me_erin", Self.at(0), "e")]
        heard.inbox = 2
        heard.threads["me_carol"] = 1
        let list = try await reader.read(heard: live(heard), now: start.addingTimeInterval(5))
        #expect(server.deltas == ["me_carol"])
        #expect(server.wholeReads == 2)
        #expect(list.map(\.id) == ["me_bob", "me_erin"])
    }

    @Test func moreThanTwentyMovedIsReadWhole() async throws {
        let server = Server((0..<25).map { ("me_p\($0)", Self.at($0), "x") })
        let reader = reader(server)
        var heard = SignalCounters(inbox: 1)
        _ = try await reader.read(heard: live(heard), now: start)
        heard.inbox = 2
        for i in 0..<21 { heard.threads["me_p\(i)"] = 1 }
        _ = try await reader.read(heard: live(heard), now: start.addingTimeInterval(5))
        #expect(server.deltas.isEmpty)
        #expect(server.wholeReads == 2)
        // Twenty is still one delta.
        heard.inbox = 3
        for i in 0..<20 { heard.threads["me_p\(i)"] = 2 }
        _ = try await reader.read(heard: live(heard), now: start.addingTimeInterval(10))
        #expect(server.deltas.count == 1)
        #expect(server.deltas.first?.split(separator: ",").count == 20)
    }

    @Test func theInboxAloneIsReadWhole() async throws {
        let server = Server([("me_bob", Self.at(3), "b")])
        let reader = reader(server)
        var heard = SignalCounters(inbox: 1, threads: ["me_bob": 1])
        _ = try await reader.read(heard: live(heard), now: start)
        heard.inbox = 2
        _ = try await reader.read(heard: live(heard), now: start.addingTimeInterval(5))
        #expect(server.deltas.isEmpty)
        #expect(server.wholeReads == 2)
    }

    @Test func noListenerHeardYetIsReadWholeAndItsFirstAnswerStandsForThatRead() async throws {
        let server = Server([("me_bob", Self.at(3), "b")])
        let reader = reader(server)
        _ = try await reader.read(heard: .waiting, now: start)
        // Failed (or the flag off): whole each time.
        _ = try await reader.read(heard: .unknown, now: start.addingTimeInterval(1))
        #expect(server.wholeReads == 2)
        _ = try await reader.read(heard: .waiting, now: start.addingTimeInterval(2))
        #expect(server.wholeReads == 3)
        // The listener's first answer stands for the read made while it was waiting: a move since is a delta.
        let first = SignalCounters(inbox: 4, threads: ["me_bob": 3])
        var now = first
        now.inbox = 5
        now.threads["me_bob"] = 4
        _ = try await reader.read(heard: live(now, first: first), now: start.addingTimeInterval(3))
        #expect(server.wholeReads == 3)
        #expect(server.deltas == ["me_bob"])
    }

    @Test func tenMinutesOnTheListIsReadWhole() async throws {
        let server = Server([("me_bob", Self.at(3), "b")])
        let reader = reader(server)
        let heard = SignalCounters(inbox: 1, threads: ["me_bob": 1])
        _ = try await reader.read(heard: live(heard), now: start)
        _ = try await reader.read(heard: live(heard), now: start.addingTimeInterval(9 * 60))
        #expect(server.wholeReads == 1)
        _ = try await reader.read(heard: live(heard), now: start.addingTimeInterval(10 * 60))
        #expect(server.wholeReads == 2)
    }

    @Test func aPullWithNothingMovedAsksNothing() async throws {
        let server = Server([("me_bob", Self.at(3), "b")])
        let reader = reader(server)
        var heard = SignalCounters(inbox: 1, bell: 1, threads: ["me_bob": 1])
        _ = try await reader.read(heard: live(heard), now: start)
        for i in 1...5 {
            // The safety pull, and a thread's own change (a reaction: its counter, not the list's).
            if i == 3 { heard.threads["me_bob"] = 2; heard.bell = 2 }
            let list = try await reader.read(heard: live(heard), now: start.addingTimeInterval(Double(i) * 60))
            #expect(list.map(\.id) == ["me_bob"])
        }
        #expect(server.asked.count == 1)
    }
}
