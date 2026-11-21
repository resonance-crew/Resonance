import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// Phase 2 of the middleware decouple, the app's side of the contract: client-config (the paths and the update
/// screen's decision, kept on disk), the signal counters, the converged social and inbox calls, and the ETag the
/// new GETs answer with, revalidated through the account's HTTP cache.
struct DecoupleAPITests {
    static let config = """
    {"minBuild":{"ios":12,"android":3},"recommendedBuild":{"ios":20,"android":4},
     "features":{"signals":true,"apiSocial":true,"apiInbox":false,"apiBell":true,"apiThoughtMap":true,"apiDrafts":false}}
    """

    func client(_ transport: StubTransport) -> Client {
        ResonanceClient.make(APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in "t" }),
                             transport: transport, middlewares: [])
    }

    // MARK: client-config

    @Test func clientConfigTakesTheIOSNumbersAndTheFlags() async throws {
        let transport = StubTransport(body: Self.config)
        let settings = try await ClientConfigAPI(client: client(transport)).fetch()
        #expect(settings.minBuild == 12)
        #expect(settings.recommendedBuild == 20)
        #expect(settings.features == ClientFeatures(signals: true, apiSocial: true, apiInbox: false, apiBell: true,
                                                   apiThoughtMap: true, apiDrafts: false))
        #expect(transport.requests.first?.bare.hasSuffix("/client-config") == true)
    }

    @Test func neverFetchedTakesEveryOldPath() {
        let never = ClientSettings.unfetched
        #expect(never.features == .oldPaths)
        #expect(!never.features.signals && !never.features.apiSocial && !never.features.apiInbox && !never.features.apiBell)
        #expect(!never.features.pullsFromAPI)
        #expect(never.update(forBuild: 1) == .none)
    }

    @Test func belowMinBuildIsTheUpdateScreenAndBelowRecommendedANote() {
        let settings = ClientSettings(minBuild: 12, recommendedBuild: 20)
        #expect(settings.update(forBuild: 11) == .required)
        #expect(settings.update(forBuild: 12) == .recommended(20))
        #expect(settings.update(forBuild: 19) == .recommended(20))
        #expect(settings.update(forBuild: 20) == .none)
        #expect(settings.update(forBuild: 31) == .none)
        // A build that can't be read is never locked out.
        #expect(settings.update(forBuild: nil) == .none)
        #expect(UpdateNeed.build("16") == 16)
        #expect(UpdateNeed.build("16.2") == 16)
        #expect(UpdateNeed.build("abc") == nil)
        #expect(UpdateNeed.build(nil) == nil)
    }

    @Test func theLastAnswerIsKeptOnDisk() throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "client-config-\(UUID().uuidString)/c.json")
        let file = ClientSettingsFile(url: url)
        #expect(file.load() == nil)
        let settings = ClientSettings(minBuild: 3, recommendedBuild: 5, features: ClientFeatures(signals: true, apiInbox: true))
        file.save(settings)
        #expect(ClientSettingsFile(url: url).load() == settings)
        try Data("garbage".utf8).write(to: url)
        #expect(file.load() == nil)
    }

    // MARK: signals

    @Test func aCounterThatMovedNamesItsPull() {
        let first = SignalCounters(fields: ["v": 1, "inbox": 2, "bell": 1, "threads": ["a_b": 3]])
        // The first read names nothing: the stores read as they start.
        #expect(first.changes(since: nil).isEmpty)
        let next = SignalCounters(fields: ["v": 1, "inbox": 3, "bell": 1, "graph": 1, "threads": ["a_b": 3, "a_c": 1]])
        #expect(next.changes(since: first) == [.inbox, .graph, .thread("a_c")])
        let unchanged = SignalCounters(fields: ["inbox": 3, "bell": 1, "graph": 1, "threads": ["a_b": 3, "a_c": 1], "at": "x"])
        #expect(unchanged.changes(since: next).isEmpty)
        // Junk reads as 0.
        #expect(SignalCounters(fields: ["inbox": "x", "threads": "y"]) == SignalCounters())
    }

    // MARK: social

    @Test func peopleAreAskedThirtyAtATimeInOrder() async throws {
        let transport = StubTransport(body: #"{"users":[]}"#)
        let ids = (0..<45).map { "u\($0)" } + ["u0", ""]
        _ = try await SocialAPI(client: client(transport)).users(ids)
        #expect(transport.requests.count == 2)
        #expect(transport.requests[0].query("ids")?.split(separator: ",").count == 30)
        #expect(transport.requests[1].query("ids") == (30..<45).map { "u\($0)" }.joined(separator: ","))
    }

    @Test func aBlockIsOneCall() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await SocialAPI(client: client(transport)).block("bob")
        #expect(transport.requests.map(\.method) == [.put])
        #expect(transport.requests.first?.bare.hasSuffix("/me/blocks/bob") == true)
        try await SocialAPI(client: client(transport)).unblock("bob")
        #expect(transport.requests.last?.method == .delete)
    }

    @Test func avatarAndHintsGoThroughPatchMe() async throws {
        let transport = StubTransport(body: ProfileAPITests.me)
        try await SocialAPI(client: client(transport)).updateMe(avatarUrl: "https://img.resonance.channel/a.jpg")
        try await SocialAPI(client: client(transport)).updateMe(hintsSeen: ["map": 2])
        #expect(transport.requests.allSatisfy { $0.method == .patch })
        #expect(transport.sentJSON[0]?["avatarUrl"] as? String == "https://img.resonance.channel/a.jpg")
        #expect(transport.sentJSON[0]?["hintsSeen"] == nil)
        #expect((transport.sentJSON[1]?["hintsSeen"] as? [String: Any])?["map"] as? Int == 2)
    }

    // MARK: inbox

    @Test func aMessageReadsAsItsDocumentDid() throws {
        let json = """
        {"id":"m1","cursor":"c1.x","senderId":"bob","text":"hi","sentAt":"2026-11-20T03:04:05.123456Z","kind":"note",
         "cardRef":"card1","reactions":{"alice":"heart"},"privateShare":true,
         "replyTo":{"id":"m0","senderId":"alice","text":"earlier"},"image":{"id":"img","width":10,"height":20}}
        """
        let message = try JSONDecoder().decode(Components.Schemas.ThreadMessage.self, from: Data(json.utf8))
        let chat = ChatMessage.from(api: message, origin: URL(string: "https://resonance.channel")!)
        #expect(chat.id == "m1")
        #expect(chat.senderId == "bob")
        #expect(chat.isNote && chat.cardRef == "card1")
        #expect(chat.reactions == ["alice": "heart"])
        #expect(chat.privateShare)
        #expect(chat.replyTo?.id == "m0")
        #expect(chat.image?.width == 10)
        #expect(abs(chat.sentAt.timeIntervalSince1970 - 1_795_143_845.123) < 0.01)
        let unsent = try JSONDecoder().decode(Components.Schemas.ThreadMessage.self, from: Data("""
        {"id":"m2","cursor":"c1.y","senderId":"bob","text":"","sentAt":"2026-11-20T03:04:05.000001Z","unsentAt":"2026-11-20T04:00:00.000000Z"}
        """.utf8))
        #expect(ChatMessage.from(api: unsent, origin: URL(string: "https://resonance.channel")!).isUnsent)
    }

    @Test func noConversationIsNilNotAnError() async throws {
        let transport = StubTransport(status: .notFound, body: #"{"error":{"code":"not_found","message":"No such conversation."}}"#)
        let inbox = InboxAPI(client: client(transport))
        #expect(try await inbox.conversation("a_b") == nil)
        #expect(try await inbox.messages("a_b", limit: 50) == nil)
    }

    @Test func messagesPageByNeutralCursors() async throws {
        let transport = StubTransport(body: #"{"messages":[],"olderCursor":null,"newerCursor":"c1.n","hasNewer":true}"#)
        let page = try await InboxAPI(client: client(transport)).messages("a_b", after: "c1.z", limit: 50)
        #expect(page?.hasNewer == true && page?.newerCursor == "c1.n")
        #expect(transport.requests.first?.query("after") == "c1.z")
        #expect(transport.requests.first?.query("before") == nil)
    }

    @Test func theConversationsListFollowsItsPages() async throws {
        let transport = StubTransport(body: "")
        transport.reply = { request in
            request.query("pageToken") == nil
                ? #"{"conversations":[],"nextPageToken":"p2"}"#
                : #"{"conversations":[],"nextPageToken":null}"#
        }
        _ = try await InboxAPI(client: client(transport)).conversations()
        #expect(transport.requests.count == 2)
        #expect(transport.requests.last?.query("pageToken") == "p2")
    }

    @Test func bellRowsAreReadByIdFiftyAtATime() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await InboxAPI(client: client(transport)).markBellRead((0..<60).map { "n\($0)" })
        #expect(transport.requests.count == 2)
        #expect((transport.sentJSON[0]?["ids"] as? [String])?.count == 50)
        #expect(transport.sentJSON[0]?["before"] == nil)
    }

    // MARK: the thread's catch-up

    @Test func aCatchUpPastTheWindowKeepsWhatWasHeld() {
        func entry(_ id: String, _ second: Double) -> MessageHistory<String>.Entry {
            .init(ChatMessage(id: id, senderId: "bob", text: id, sentAt: Date(timeIntervalSince1970: second)), cursor: "c1.\(id)")
        }
        var history = MessageHistory<String>(liveLimit: 2)
        history.mergeWindow([entry("m2", 2), entry("m1", 1)])
        #expect(history.hasOlder)
        // The thread moved on by more than a window: the newest two share nothing with what is held.
        let window = [entry("m9", 9), entry("m8", 8)]
        #expect(!history.overlaps(window))
        // What came after the newest held is read first (`after=`), so the window then overlaps and nothing restarts.
        history.mergeNewer([entry("m3", 3), entry("m4", 4), entry("m5", 5), entry("m6", 6), entry("m7", 7), entry("m8", 8)])
        #expect(history.overlaps(window))
        #expect(history.mergeWindow(window) == .changed)
        #expect(history.messages.map(\.id) == ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"])
        #expect(history.oldestCursor == "c1.m1")
        // Whether there is anything older stays as the first window said.
        #expect(history.hasOlder)
    }
}

/// The new GETs answer `Cache-Control: private, no-cache` with an ETag: through the account's cache each is asked
/// again every time with `If-None-Match`, and a 304 comes back as the kept answer.
@Suite struct DecoupleETagTests {
    let root = FileManager.default.temporaryDirectory.appending(path: "DecoupleETagTests-\(UUID().uuidString)")

    @Test func aSignalPullCostsA304WhenNothingChanged() async throws {
        let server = try LocalHTTPServer { request in
            let etag = "W/\"bell-1\""
            let headers = ["Cache-Control": "private, no-cache", "ETag": etag]
            if request.headers["if-none-match"] == etag { return .init(status: 304, headers: headers) }
            return .init(headers: headers, body: #"{"items":[],"people":[],"nextPageToken":null}"#)
        }
        let cache = APIHTTPCache(root: root)
        cache.use(account: "alice")
        let client = ResonanceClient.make(APIConfiguration(origin: server.origin, idToken: { _ in "alice" }), cache: cache)
        _ = try await InboxAPI(client: client).bell()
        let again = try await InboxAPI(client: client).bell()
        let asked = server.requests(to: "/api/v1/me/bell?limit=50")
        #expect(asked.count == 2)
        #expect(asked.last?.headers["if-none-match"] == "W/\"bell-1\"")
        #expect(again.items.isEmpty)
    }
}
