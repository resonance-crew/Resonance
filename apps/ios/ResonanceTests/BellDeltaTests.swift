import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import ResonanceKit
import Testing
@testable import Resonance

/// The bell on iOS and the Mac reads only what changed (traffic phase 3, as the web's bellReader): one whole page with
/// `changes=1`, then `updatedAfter` its cursor when `bell` moves, merged into the rows; a safety pull or a return to
/// the app with nothing moved asks nothing. The answers' people are the rows' faces (no read of their own), and each
/// read fetches the rows' cards and covers ahead, so 通知 opens on them rather than on tiles filling in.
@MainActor
struct BellDeltaTests {
    private func extras(cardsAsked: Calls<[String]>, peopleAsked: Calls<Set<String>>) -> BellExtras {
        BellExtras(cards: CardSummaries { keys in
            await cardsAsked.record(keys)
            return keys.map { key in
                var card = Fixture.card(key)
                card.imageUrl = "https://img.example.test/\(key).webp"
                return card
            }
        }, readPeople: { ids in
            await peopleAsked.record(ids)
            return Dictionary(uniqueKeysWithValues: ids.map { ($0, PeopleBook.Read.failed) })
        })
    }

    @Test func aRowHeardIsOneDeltaAndNothingMovedAsksNothing() async throws {
        let server = BellServer()
        let source = FakeSignals()
        let signals = SignalListener(source: source, interval: .seconds(3600))
        signals.start(uid: "alice", listens: true)
        let store = NotificationsStore()
        let cardsAsked = Calls<[String]>(), peopleAsked = Calls<Set<String>>()
        let made = extras(cardsAsked: cardsAsked, peopleAsked: peopleAsked)
        store.makeExtras = { made }
        var prefetched: [[URL]] = []
        store.prefetchCovers = { prefetched.append($0) }
        store.start(uid: "alice", bell: InboxAPI(client: server.client), signals: signals)
        #expect(await eventually { store.loaded })
        #expect(store.items.map(\.id) == ["n2", "n1"])
        #expect(server.asked.count == 1 && server.asked.first?.changes == "1" && server.asked.first?.after == nil)
        // The answer's people are the faces: found, never read again.
        #expect(store.answeredPeople.keys.sorted() == ["bob", "carol"])
        #expect(made.person("bob") == .found(store.answeredPeople["bob"]!))
        // The rows' cards were read ahead, in one request, and their covers fetched.
        await store.preloading?.value
        #expect(await cardsAsked.all == [["c2", "c1"]])
        #expect(prefetched.last?.map(\.lastPathComponent) == ["c2.webp", "c1.webp"])

        // The listener's first answer stands for that read; a safety pull and a return to the app ask nothing.
        source.send(SignalCounters(bell: 3))
        signals.pullAll()
        store.resume()
        try await Task.sleep(for: .milliseconds(100))
        #expect(server.asked.count == 1)

        // A note came: `updatedAfter` the cursor, its one row on top, its person and its card.
        server.delta = [BellServer.row("n3", from: "dave", card: "c3", at: "2026-11-22T10:09:00.000000Z")]
        source.send(SignalCounters(bell: 4))
        #expect(await eventually { store.items.map(\.id) == ["n3", "n2", "n1"] })
        #expect(server.asked.last?.after == "cur1")
        #expect(store.answeredPeople["dave"] != nil)
        await store.preloading?.value
        #expect(await cardsAsked.all == [["c2", "c1"], ["c3"]])
        // The screen's extras are the store's: what was read ahead is drawn at once.
        let reading = ReadingAPI(client: server.client)
        #expect(store.extras(reading: reading) === made)
        await made.load(store.items) { _ in nil }
        #expect(await peopleAsked.all.isEmpty)
        #expect(made.cards.card("c3") != nil)
        store.stop()
        #expect(store.answeredPeople.isEmpty)
    }

    @Test func withTheListenerFailedEveryPullReadsTheBellWhole() async throws {
        let server = BellServer()
        let source = FakeSignals()
        let signals = SignalListener(source: source, interval: .seconds(3600))
        signals.start(uid: "alice", listens: true)
        let store = NotificationsStore()
        store.start(uid: "alice", bell: InboxAPI(client: server.client), signals: signals)
        #expect(await eventually { store.loaded })
        source.send(SignalCounters(bell: 1))
        source.fail()
        signals.pullAll()
        #expect(await eventually { server.asked.count == 2 })
        #expect(server.asked.allSatisfy { $0.after == nil })
        store.stop()
    }
}

/// GET /me/bell as the contract answers it: the newest page with a cursor, or with `updatedAfter` the rows in `delta`.
final class BellServer: ClientTransport, @unchecked Sendable {
    static func row(_ id: String, from: String, card: String, at: String) -> String {
        #"{"id":"\#(id)","type":"note","payload":{"fromUserId":"\#(from)","fromHandle":"\#(from)","cardId":"\#(card)","preview":"hi"},"readAt":null,"createdAt":"\#(at)"}"#
    }

    private let lock = NSLock()
    private var _rows = [row("n2", from: "carol", card: "c2", at: "2026-11-22T10:02:00.000000Z"),
                         row("n1", from: "bob", card: "c1", at: "2026-11-22T10:01:00.000000Z")]
    private var _delta: [String] = []
    private var _asked: [(after: String?, changes: String?)] = []

    var delta: [String] {
        get { lock.withLock { _delta } }
        set { lock.withLock { _delta = newValue } }
    }
    var asked: [(after: String?, changes: String?)] { lock.withLock { _asked } }

    var client: Client {
        Client(serverURL: URL(string: "https://example.test/api/v1")!, configuration: .init(dateTranscoder: .iso8601WithFractionalSeconds),
               transport: self)
    }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        guard operationID == "getBell" else {
            return answer(.notFound, #"{"error":{"code":"not_found","message":"No."}}"#)
        }
        let query = URLComponents(string: request.path ?? "")?.queryItems ?? []
        let after = query.first { $0.name == "updatedAfter" }?.value
        let changes = query.first { $0.name == "changes" }?.value
        let (rows, delta, n) = lock.withLock {
            _asked.append((after, changes))
            return (_rows, _delta, _asked.count)
        }
        let people = { (ids: [String]) in ids.map { DecoupleServer.author($0) }.joined(separator: ",") }
        if after != nil {
            let ids = delta.compactMap { row -> String? in
                guard let r = row.range(of: #""fromUserId":""#) else { return nil }
                return String(row[r.upperBound...].prefix { $0 != "\"" })
            }
            return answer(.ok, #"{"items":[\#(delta.joined(separator: ","))],"people":[\#(people(ids))],"nextPageToken":null,"delta":true,"updatedCursor":"cur\#(n)"}"#)
        }
        return answer(.ok, #"{"items":[\#(rows.joined(separator: ","))],"people":[\#(people(["carol", "bob"]))],"nextPageToken":null,"updatedCursor":"cur\#(n)"}"#)
    }

    private func answer(_ status: HTTPResponse.Status, _ json: String) -> (HTTPResponse, HTTPBody?) {
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = "application/json"
        return (response, HTTPBody(json))
    }
}
