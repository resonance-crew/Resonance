import Foundation
import HTTPTypes
import Testing
@testable import ResonanceAPI
@testable import ResonanceKit

/// Serves the web routes the writer calls outside the contract (/api/upload,
/// /api/cards/*): canned replies in order, and a record of what was sent.
final class StubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var replies: [(status: Int, json: String)] = []
    nonisolated(unsafe) static var sent: [(request: URLRequest, body: Data)] = []

    static func reset(_ replies: [(status: Int, json: String)]) {
        self.replies = replies
        sent = []
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        // URLSession hands a protocol the body as a stream.
        var body = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                body.append(buffer, count: n)
            }
            stream.close()
        }
        Self.sent.append((request, body))
        let reply = Self.replies.isEmpty ? (status: 500, json: "{}") : Self.replies.removeFirst()
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil,
                                       headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(reply.json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

/// Which tokens the API asked for: `false` for the cached one, `true` for a refresh.
actor TokenLog {
    private(set) var asks: [Bool] = []
    func ask(_ forceRefresh: Bool) -> String {
        asks.append(forceRefresh)
        return forceRefresh ? "fresh-token" : "stale-token"
    }
}

@Suite(.serialized) struct WritingAPITests {
    let tokens = TokenLog()

    func api(_ transport: StubTransport = StubTransport(body: "{}")) -> WritingAPI {
        let tokens = tokens
        let configuration = APIConfiguration(origin: URL(string: "https://example.test")!) { await tokens.ask($0) }
        let client = Client(serverURL: configuration.apiURL, transport: transport,
                            middlewares: [BearerAuthMiddleware(idToken: configuration.idToken)])
        let session = URLSessionConfiguration.ephemeral
        session.protocolClasses = [StubURLProtocol.self]
        return WritingAPI(client: client, configuration: configuration, session: URLSession(configuration: session))
    }

    @Test func publishesThroughTheContract() async throws {
        let transport = StubTransport(body: #"{"id":"c1","slug":"a-walk","firstPublish":true,"later":1}"#)
        let result = try await api(transport).publish("c1")
        #expect(result.slug == "a-walk")
        #expect(result.firstPublish == true)
        let request = try #require(transport.requests.first)
        #expect(request.method == .post)
        #expect(request.path?.hasSuffix("/cards/c1/publish") == true)
        #expect(request.headerFields[.authorization] == "Bearer stale-token")
    }

    @Test func appliesAPendingEditThroughTheContract() async throws {
        let transport = StubTransport(body: #"{"id":"c1","slug":"a-walk","applied":true}"#)
        let result = try await api(transport).applyEdit("c1")
        #expect(result.applied == true)
        #expect(result.slug == "a-walk")
        let request = try #require(transport.requests.first)
        #expect(request.method == .post)
        #expect(request.path?.hasSuffix("/cards/c1/edits/apply") == true)
    }

    @Test func changesACardsVisibilityThroughTheContract() async throws {
        let transport = StubTransport(body: ReadingAPITests.card.replacingOccurrences(of: #""visibility":"public""#,
                                                                                      with: #""visibility":"private""#))
        let card = try await api(transport).updateCard("c1", visibility: ._private)
        #expect(card.visibility == ._private)
        let request = try #require(transport.requests.first)
        #expect(request.method == .patch)
        #expect(request.path == "/cards/c1")
        // Only what changes is sent: the byline stays as it is.
        let sent = try #require(transport.sentJSON.first ?? nil)
        #expect(sent["visibility"] as? String == "private")
        #expect(sent.keys.sorted() == ["visibility"])

        _ = try await api(transport).updateCard("c1", anonymous: true)
        #expect(transport.sentJSON.last??["anonymous"] as? Bool == true)
        #expect(transport.sentJSON.last??.keys.sorted() == ["anonymous"])
    }

    @Test func deletesACardThroughTheContract() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).deleteCard("c1")
        let request = try #require(transport.requests.first)
        #expect(request.method == .delete)
        #expect(request.path == "/cards/c1")
        #expect(request.headerFields[.authorization] == "Bearer stale-token")
    }

    /// A card in the trash as its owner is told of it (trash shelf, trash and restore answers).
    static let trashed = ReadingAPITests.card.replacingOccurrences(of: #""visibility":"public""#, with: #""visibility":"private""#)
        .replacingOccurrences(of: #""reason":null"#,
                              with: #""reason":null,"trashedAt":"2026-10-01T08:00:00.000Z","purgeAt":"2026-10-31T08:00:00.000Z","restoresTo":"public""#)

    @Test func movesACardToTheTrashThroughTheContract() async throws {
        let transport = StubTransport(body: #"{"card":\#(Self.trashed),"changed":true}"#)
        let result = try await api(transport).trashCard("c1")
        #expect(result.changed)
        #expect(result.card.isTrashed)
        #expect(result.card.visibility == ._private)
        #expect(result.card.restoresTo == ._public)
        #expect(result.card.trashedDate == ISO8601.date("2026-10-01T08:00:00.000Z"))
        #expect(result.card.purgeDate == ISO8601.date("2026-10-31T08:00:00.000Z"))
        let request = try #require(transport.requests.first)
        #expect(request.method == .post)
        #expect(request.path == "/cards/c1/trash")
        #expect(request.headerFields[.authorization] == "Bearer stale-token")
        #expect(transport.sentJSON.first! == nil)
    }

    @Test func restoresACardThroughTheContract() async throws {
        let transport = StubTransport(body: #"{"card":\#(ReadingAPITests.card),"changed":true,"droppedResonance":true}"#)
        let result = try await api(transport).restoreCard("c1")
        #expect(result.changed)
        #expect(result.droppedResonance)
        #expect(!result.card.isTrashed)
        #expect(result.card.purgeDate == nil)
        let request = try #require(transport.requests.first)
        #expect(request.method == .post)
        #expect(request.path == "/cards/c1/restore")
    }

    @Test func theTrashSaysWhyItWasRefused() async throws {
        for (status, code) in [(HTTPResponse.Status.notFound, "not_found"), (.tooManyRequests, "rate_limited"),
                               (.badRequest, "invalid_request"), (.unauthorized, "unauthenticated")] {
            let transport = StubTransport(status: status, body: #"{"error":{"code":"\#(code)","message":"No."}}"#)
            await #expect(throws: APIFailure(code: code, message: "No.", status: status.code)) {
                try await api(transport).trashCard("c1")
            }
            await #expect(throws: APIFailure(code: code, message: "No.", status: status.code)) {
                try await api(transport).restoreCard("c1")
            }
        }
    }

    /// The trash's 永久刪除 deletes only what is still in the trash: one restored on another device
    /// meanwhile is refused (409) and stays. Older calls delete as they always did.
    @Test func deletesForGoodOnlyFromTheTrashWhenAsked() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).deleteCard("c1", onlyIfTrashed: true)
        let request = try #require(transport.requests.first)
        #expect(request.method == .delete)
        #expect(request.bare == "/cards/c1")
        #expect(request.query("onlyIfTrashed") == "true")
        try await api(transport).deleteCard("c1")
        #expect(transport.requests.last?.path == "/cards/c1")

        let restored = StubTransport(status: .conflict, body: #"{"error":{"code":"conflict","message":"This card is not in the trash."}}"#)
        await #expect(throws: APIFailure(code: "conflict", message: "This card is not in the trash.", status: 409)) {
            try await api(restored).deleteCard("c1", onlyIfTrashed: true)
        }
    }

    /// The client the app builds (`ResonanceClient.make`), so the cut-off goes back as the server
    /// wrote it, to the millisecond.
    func appAPI(_ transport: StubTransport) -> WritingAPI {
        let configuration = APIConfiguration(origin: URL(string: "https://example.test")!) { _ in "token" }
        let client = ResonanceClient.make(configuration, transport: transport,
                                          middlewares: [BearerAuthMiddleware(idToken: configuration.idToken)])
        return WritingAPI(client: client, configuration: configuration)
    }

    /// Answers the trash's pages in turn (the last one again once they run out).
    final class Pages: @unchecked Sendable {
        private let lock = NSLock()
        private var answers: [String]
        init(_ answers: [String]) { self.answers = answers }
        func next() -> String { lock.withLock { answers.count > 1 ? answers.removeFirst() : answers[0] } }
    }

    @Test func emptiesTheTrashAPageAtATimeUpToTheFirstCallsCutOff() async throws {
        let transport = StubTransport(body: "")
        let pages = Pages([#"{"deleted":50,"remaining":30,"before":"2026-10-20T10:00:00.123Z"}"#,
                           #"{"deleted":30,"remaining":0,"before":"2026-10-20T10:00:00.123Z"}"#])
        transport.reply = { _ in pages.next() }
        let result = try await appAPI(transport).emptyTrash()
        #expect(result == WritingAPI.EmptiedTrash(deleted: 80, remaining: 0))
        #expect(transport.requests.count == 2)
        #expect(transport.requests.allSatisfy { $0.method == .delete && $0.bare == "/me/trash" })
        // The first call fixes the cut-off (now); the next sends it back as the server wrote it, so a
        // card moved to the trash meanwhile is never taken.
        #expect(transport.requests[0].query("before") == nil)
        #expect(transport.requests[1].query("before") == "2026-10-20T10:00:00.123Z")
    }

    @Test func emptyingStopsOnceACallDeletesNothing() async throws {
        let transport = StubTransport(body: "")
        let pages = Pages([#"{"deleted":50,"remaining":5,"before":"2026-10-20T10:00:00.000Z"}"#,
                           #"{"deleted":0,"remaining":5,"before":"2026-10-20T10:00:00.000Z"}"#])
        transport.reply = { _ in pages.next() }
        // A card that keeps failing must not keep it going: what is left is said.
        #expect(try await appAPI(transport).emptyTrash() == WritingAPI.EmptiedTrash(deleted: 50, remaining: 5))
        #expect(transport.requests.count == 2)
    }

    @Test func emptyingMakesAtMostTwentyCalls() async throws {
        let transport = StubTransport(body: #"{"deleted":1,"remaining":100,"before":"2026-10-20T10:00:00.000Z"}"#)
        let result = try await appAPI(transport).emptyTrash()
        #expect(transport.requests.count == WritingAPI.emptyTrashCalls)
        #expect(result == WritingAPI.EmptiedTrash(deleted: WritingAPI.emptyTrashCalls, remaining: 100))
        let refused = StubTransport(status: .tooManyRequests, body: #"{"error":{"code":"rate_limited","message":"Later."}}"#)
        await #expect(throws: APIFailure(code: "rate_limited", message: "Later.", status: 429)) {
            try await appAPI(refused).emptyTrash()
        }
    }

    @Test func resonatesWithAnExistingCardThroughTheContract() async throws {
        let transport = StubTransport(body: #"{"card":\#(ReadingAPITests.card),"changed":true}"#)
        let result = try await api(transport).resonate(with: "target", cardId: "c1")
        #expect(result.changed)
        #expect(result.card.id == "c1")
        let request = try #require(transport.requests.first)
        #expect(request.method == .post)
        #expect(request.path == "/cards/target/resonances")
        #expect(request.headerFields[.authorization] == "Bearer stale-token")
        let sent = try #require(transport.sentJSON.first ?? nil)
        #expect(sent["cardId"] as? String == "c1")
        #expect(sent.keys.sorted() == ["cardId"])
    }

    @Test func resonatingSaysWhyItWasRefused() async throws {
        for (status, code) in [(HTTPResponse.Status.conflict, "conflict"), (.tooManyRequests, "rate_limited"),
                               (.forbidden, "forbidden"), (.notFound, "not_found"), (.badRequest, "invalid_request")] {
            let transport = StubTransport(status: status, body: #"{"error":{"code":"\#(code)","message":"No."}}"#)
            await #expect(throws: APIFailure(code: code, message: "No.", status: status.code)) {
                try await api(transport).resonate(with: "target", cardId: "c1")
            }
        }
    }

    @Test func stopsResonatingThroughTheContract() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).unresonate(from: "target", cardId: "c1")
        let request = try #require(transport.requests.first)
        #expect(request.method == .delete)
        #expect(request.path == "/cards/target/resonances/c1")
        let refused = StubTransport(status: .notFound, body: #"{"error":{"code":"not_found","message":"No such card."}}"#)
        await #expect(throws: APIFailure(code: "not_found", message: "No such card.", status: 404)) {
            try await api(refused).unresonate(from: "target", cardId: "bobs-card")
        }
    }

    @Test func someoneElsesCardIsNotFound() async throws {
        let transport = StubTransport(status: .notFound, body: #"{"error":{"code":"not_found","message":"No such card."}}"#)
        await #expect(throws: APIFailure(code: "not_found", message: "No such card.", status: 404)) {
            try await api(transport).deleteCard("bobs-card")
        }
        await #expect(throws: APIFailure(code: "not_found", message: "No such card.", status: 404)) {
            try await api(transport).updateCard("bobs-card", visibility: ._private)
        }
    }

    @Test func uploadsThePhotoAsTheFormsFilePart() async throws {
        StubURLProtocol.reset([(200, #"{"publicUrl":"https://img.test/u/alice/cover.avif","key":"u/alice/cover.avif"}"#)])
        let photo = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x01, 0x02])
        let url = try await api().upload(photo, filename: "cover.jpg")
        #expect(url.absoluteString == "https://img.test/u/alice/cover.avif")

        let (request, body) = try #require(StubURLProtocol.sent.first)
        #expect(request.url?.path == "/api/upload")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer stale-token")
        let contentType = try #require(request.value(forHTTPHeaderField: "Content-Type"))
        let boundary = try #require(contentType.split(separator: "boundary=").last.map(String.init))
        #expect(contentType.hasPrefix("multipart/form-data"))
        let head = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"cover.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8)
        #expect(body == head + photo + Data("\r\n--\(boundary)--\r\n".utf8))
    }

    @Test func aProfilePhotoSaysItIsAnAvatar() async throws {
        StubURLProtocol.reset([(200, #"{"publicUrl":"https://img.test/avatar/2026-10/a.webp","key":"avatar/2026-10/a.webp"}"#)])
        let photo = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x03])
        let url = try await api().upload(photo, filename: "avatar.jpg", purpose: "avatar")
        #expect(url.absoluteString == "https://img.test/avatar/2026-10/a.webp")

        let (request, body) = try #require(StubURLProtocol.sent.first)
        let contentType = try #require(request.value(forHTTPHeaderField: "Content-Type"))
        let boundary = try #require(contentType.split(separator: "boundary=").last.map(String.init))
        // The file, then `purpose=avatar` (the route reads form.get('purpose') === 'avatar').
        let head = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"avatar.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8)
        let purpose = Data("\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\navatar".utf8)
        #expect(body == head + photo + purpose + Data("\r\n--\(boundary)--\r\n".utf8))
    }

    @Test func refreshesARejectedTokenOnce() async throws {
        StubURLProtocol.reset([(401, "{}"), (200, #"{"tags":["散步","雨天"]}"#)])
        let tags = try await api().suggestTags(title: "一場雨後的散步", story: "雨停的時候…", tags: ["日常"])
        #expect(tags == ["散步", "雨天"])
        #expect(await tokens.asks == [false, true])
        #expect(StubURLProtocol.sent.map { $0.request.value(forHTTPHeaderField: "Authorization") } == ["Bearer stale-token", "Bearer fresh-token"])
        let sent = try JSONSerialization.jsonObject(with: try #require(StubURLProtocol.sent.last?.body)) as? [String: Any]
        #expect(sent?["thoughtCore"] as? String == "一場雨後的散步")
        #expect(sent?["tags"] as? [String] == ["日常"])
    }

    @Test func streamsTheIllustrationsPreviewsThenItsPicture() async throws {
        let png = Data([0x89, 0x50, 0x4E, 0x47])
        StubURLProtocol.reset([(200, """
        {"type":"partial","index":0,"b64":"\(png.base64EncodedString())"}
        {"type":"done","publicUrl":"https://img.test/u/alice/generated.avif","key":"u/alice/generated.avif"}

        """)])
        var events: [WritingAPI.IllustrationEvent] = []
        for try await event in api().illustrate(story: "雨停的時候…") { events.append(event) }
        #expect(events == [.partial(png), .done(URL(string: "https://img.test/u/alice/generated.avif")!)])
        let (request, body) = try #require(StubURLProtocol.sent.first)
        #expect(request.url?.path == "/api/generate-image")
        #expect((try JSONSerialization.jsonObject(with: body) as? [String: String])?["story"] == "雨停的時候…")
    }

    @Test func aFailureAfterTheStreamBeganIsAnEvent() async throws {
        StubURLProtocol.reset([(200, #"{"type":"error"}"#)])
        var events: [WritingAPI.IllustrationEvent] = []
        for try await event in api().illustrate(story: "s") { events.append(event) }
        #expect(events == [.failed])
    }

    @Test func asksToSignInAgainWhenTheFreshTokenIsRejectedToo() async throws {
        StubURLProtocol.reset([(401, "{}"), (401, "{}")])
        await #expect(throws: APIFailure(code: "unauthenticated", message: "Sign in again.", status: 401)) {
            try await api().insight(title: "t", story: "s")
        }
        #expect(StubURLProtocol.sent.count == 2)
    }
}
