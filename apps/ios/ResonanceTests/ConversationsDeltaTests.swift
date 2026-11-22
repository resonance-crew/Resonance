import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import ResonanceKit
import Testing
@testable import Resonance

/// The conversations list on iOS and the Mac reads only what moved (traffic phase 3, as the web's
/// conversationsReader): the signal listener says what it heard, a change heard is one `?pairs=` request merged into
/// the list, and a safety pull (or a return to the app) with nothing moved asks the server nothing.
@MainActor
struct ConversationsDeltaTests {
    @Test func theListenerSaysWhatItHeard() {
        let source = FakeSignals()
        let signals = SignalListener(source: source, interval: .seconds(3600))
        #expect(signals.heard == .unknown)
        signals.start(uid: "alice", listens: true)
        #expect(signals.heard == .waiting)
        source.send(SignalCounters(inbox: 1))
        #expect(signals.heard == .live(now: SignalCounters(inbox: 1), first: SignalCounters(inbox: 1)))
        source.send(SignalCounters(inbox: 2))
        #expect(signals.heard == .live(now: SignalCounters(inbox: 2), first: SignalCounters(inbox: 1)))
        // Failed: unknown — and still unknown once listening again, until it hears.
        source.fail()
        #expect(signals.heard == .unknown)
        signals.setForeground(false)
        signals.setForeground(true)
        #expect(signals.heard == .unknown)
        source.send(SignalCounters(inbox: 3))
        #expect(signals.heard == .live(now: SignalCounters(inbox: 3), first: SignalCounters(inbox: 1)))
        signals.stop()
        #expect(signals.heard == .unknown)
        // The flag off: nothing is heard, the list is read whole each time.
        signals.start(uid: "alice", listens: false)
        #expect(signals.heard == .unknown)
    }

    @Test func aMessageHeardIsOnePairsRequestAndASafetyPullWithNothingMovedAsksNothing() async throws {
        let server = PairsServer()
        let source = FakeSignals()
        let signals = SignalListener(source: source, interval: .seconds(3600))
        signals.start(uid: "alice", listens: true)
        let store = ConversationsStore()
        store.readPeople = { ids in Dictionary(uniqueKeysWithValues: ids.map { ($0, PeopleBook.Read.failed) }) }
        store.start(uid: "alice", inbox: InboxAPI(client: server.client), social: SocialAPI(client: server.client), signals: signals)
        #expect(await eventually { store.conversations.map(\.id) == ["alice_bob", "alice_carol"] })
        #expect(server.asked == [nil])
        // The listener's first answer stands for that read.
        source.send(SignalCounters(inbox: 3, threads: ["alice_bob": 1, "alice_carol": 1]))
        // The safety pull and a return to the app, nothing moved: no request.
        signals.pullAll()
        store.resume()
        try await Task.sleep(for: .milliseconds(100))
        #expect(server.asked == [nil])
        // Carol wrote: inbox and her thread move in one touch — one delta, for her alone, merged on top.
        server.rows = [PairsServer.row("alice_carol", "carol", "2026-11-22T10:09:00.000000Z", "new"),
                       PairsServer.row("alice_bob", "bob", "2026-11-22T10:02:00.000000Z", "hi")]
        source.send(SignalCounters(inbox: 4, threads: ["alice_bob": 1, "alice_carol": 2]))
        #expect(await eventually { store.conversations.first?.lastText == "new" })
        #expect(server.asked == [nil, "alice_carol"])
        #expect(store.conversations.map(\.id) == ["alice_carol", "alice_bob"])
        // Bob's conversation deleted (on another device): asked for, left out — gone from the list.
        server.rows = [PairsServer.row("alice_carol", "carol", "2026-11-22T10:09:00.000000Z", "new")]
        source.send(SignalCounters(inbox: 5, threads: ["alice_bob": 2, "alice_carol": 2]))
        #expect(await eventually { store.conversations.map(\.id) == ["alice_carol"] })
        #expect(server.asked == [nil, "alice_carol", "alice_bob"])
        // A touch of the list alone (no thread's counter): read whole.
        source.send(SignalCounters(inbox: 6, threads: ["alice_bob": 2, "alice_carol": 2]))
        #expect(await eventually { server.asked.count == 4 })
        #expect(server.asked.last == .some(nil))
        store.stop()
    }

    @Test func withTheListenerFailedEveryPullReadsTheListWhole() async throws {
        let server = PairsServer()
        let source = FakeSignals()
        let signals = SignalListener(source: source, interval: .seconds(3600))
        signals.start(uid: "alice", listens: true)
        let store = ConversationsStore()
        store.readPeople = { ids in Dictionary(uniqueKeysWithValues: ids.map { ($0, PeopleBook.Read.failed) }) }
        store.start(uid: "alice", inbox: InboxAPI(client: server.client), social: SocialAPI(client: server.client), signals: signals)
        #expect(await eventually { store.loaded })
        source.send(SignalCounters(inbox: 1))
        source.fail()
        signals.pullAll()
        #expect(await eventually { server.asked == [nil, nil] })
        store.stop()
    }
}

/// GET /conversations as the contract answers it: the whole list, or `?pairs=` the ones asked for that it has.
final class PairsServer: ClientTransport, @unchecked Sendable {
    static func row(_ id: String, _ other: String, _ at: String, _ text: String) -> String {
        """
        {"id":"\(id)","participants":["alice","\(other)"],"otherId":"\(other)","other":\(DecoupleServer.author(other)),"unread":0,
         "lastMessage":{"text":"\(text)","senderId":"\(other)","sentAt":"\(at)","image":false,"sticker":false,"albumCount":null,"unsent":false},
         "request":null,"createdAt":null,"updatedAt":"\(at)","originCardId":null}
        """
    }

    private let lock = NSLock()
    private var _rows = [row("alice_bob", "bob", "2026-11-22T10:02:00.000000Z", "hi"),
                         row("alice_carol", "carol", "2026-11-22T10:01:00.000000Z", "yo")]
    private var _asked: [String?] = []
    var rows: [String] {
        get { lock.withLock { _rows } }
        set { lock.withLock { _rows = newValue } }
    }

    /// Each list request's `pairs` (nil: the whole list).
    var asked: [String?] { lock.withLock { _asked } }

    var client: Client {
        Client(serverURL: URL(string: "https://example.test/api/v1")!, configuration: .init(dateTranscoder: .iso8601WithFractionalSeconds),
               transport: self)
    }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        switch operationID {
        case "getConnections": return answer(.ok, #"{"connections":[]}"#)
        case "getBlocks": return answer(.ok, #"{"blocks":[]}"#)
        case "listConversations": break
        default: return answer(.notFound, #"{"error":{"code":"not_found","message":"No."}}"#)
        }
        let pairs = URLComponents(string: request.path ?? "")?.queryItems?.first { $0.name == "pairs" }?.value
        let rows = lock.withLock {
            _asked.append(pairs)
            return _rows
        }
        let some = pairs.map { p in
            let wanted = p.split(separator: ",").map { "\"id\":\"\($0)\"" }
            return rows.filter { row in wanted.contains { row.contains($0) } }
        } ?? rows
        return answer(.ok, #"{"conversations":[\#(some.joined(separator: ","))],"nextPageToken":null}"#)
    }

    private func answer(_ status: HTTPResponse.Status, _ json: String) -> (HTTPResponse, HTTPBody?) {
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = "application/json"
        return (response, HTTPBody(json))
    }
}
