import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import ResonanceKit
import Testing
@testable import Resonance

/// Phase 2 of the middleware decouple on iOS: client-config (the paths, the update screen's decision, kept on disk),
/// the signal channel driving the stores that read through `/api/v1`, and each converged service on both values of
/// its flag — the API path asked through a stubbed transport, the older Firestore path left as it was (chosen, never
/// asking the API).
@MainActor
struct MiddlewareDecoupleTests {
    // MARK: client-config

    private func store(file: ClientSettingsFile? = nil, build: Int? = 16,
                       answer: @escaping @Sendable () async throws -> ClientSettings) -> ClientConfigStore {
        let file = file ?? ClientSettingsFile(url: FileManager.default.temporaryDirectory
            .appending(path: "cc-\(UUID().uuidString)/client-config.json"))
        let defaults = UserDefaults(suiteName: "cc-\(UUID().uuidString)")!
        return ClientConfigStore(file: file, defaults: defaults, build: build, fetch: answer)
    }

    /// The release screenshots' `-visualUpdate required` (`update-required`): the page whatever the server answered,
    /// and nothing else read as it.
    @Test func theScreenshotsSwitchShowsTheUpdatePageWhateverTheServerSays() {
        #expect(ClientConfigStore.visualNeed("required", build: 16) == .required)
        #expect(ClientConfigStore.visualNeed("recommended", build: 16) == .recommended(17))
        #expect(ClientConfigStore.visualNeed(nil, build: 16) == nil)
        #expect(ClientConfigStore.visualNeed("YES", build: 16) == nil)

        let file = ClientSettingsFile(url: FileManager.default.temporaryDirectory.appending(path: "cc-\(UUID().uuidString)/c.json"))
        let defaults = UserDefaults(suiteName: "cc-\(UUID().uuidString)")!
        let config = ClientConfigStore(file: file, defaults: defaults, build: 16) { ClientSettings() }
        #expect(!config.updateRequired)
        defaults.set("required", forKey: "visualUpdate")
        #expect(config.updateRequired)
    }

    @Test func neverFetchedTakesTheOldPaths() {
        let config = store { throw URLError(.notConnectedToInternet) }
        #expect(config.features == .oldPaths)
        #expect(LivePaths(config.features) == LivePaths(.oldPaths))
        #expect(!LivePaths(config.features).bell && !LivePaths(config.features).conversations && !LivePaths(config.features).social)
        #expect(!config.updateRequired && !config.recommendsUpdate)
    }

    @Test func anAnswerIsTakenKeptAndToldOnce() async {
        let file = ClientSettingsFile(url: FileManager.default.temporaryDirectory.appending(path: "cc-\(UUID().uuidString)/c.json"))
        let on = ClientSettings(features: ClientFeatures(signals: true, apiSocial: true, apiInbox: true, apiBell: true))
        let config = store(file: file) { on }
        var told: [ClientFeatures] = []
        config.onFeaturesChange = { told.append($0) }
        await config.refresh()
        #expect(config.fetched)
        #expect(config.features == on.features)
        #expect(told == [on.features])
        // The next launch starts from the kept answer, before the network says anything.
        let next = store(file: file) { throw URLError(.timedOut) }
        #expect(next.features == on.features)
        #expect(!next.fetched)
    }

    @Test func comingBackAsksAgainOnlyAfterTheThrottle() async {
        let asked = Counter()
        let config = store { asked.add(); return .unfetched }
        let start = Date()
        await config.refresh(now: start)
        await config.refresh(now: start.addingTimeInterval(60))
        #expect(asked.value == 1)
        await config.refresh(now: start.addingTimeInterval(ClientConfigStore.throttle + 1))
        #expect(asked.value == 2)
        await config.refresh(now: start.addingTimeInterval(ClientConfigStore.throttle + 2), force: true)
        #expect(asked.value == 3)
    }

    @Test func aFailedAskKeepsWhatWasKnown() async {
        let fail = Flag()
        let on = ClientSettings(features: ClientFeatures(apiBell: true))
        let config = store { if fail.on { throw URLError(.timedOut) }; return on }
        await config.refresh()
        fail.on = true
        await config.refresh(force: true)
        #expect(config.features == on.features)
    }

    @Test func belowMinBuildIsTheUpdateScreen() async {
        let config = store(build: 15) { ClientSettings(minBuild: 16, recommendedBuild: 18) }
        await config.refresh()
        #expect(config.updateRequired)
        // The note never shows over the update screen.
        #expect(!config.recommendsUpdate)
    }

    @Test func belowRecommendedIsANotePutOffPerBuild() async {
        let recommended = Shared(18)
        let config = store(build: 16) { ClientSettings(minBuild: 10, recommendedBuild: recommended.withLock { $0 }) }
        await config.refresh()
        #expect(!config.updateRequired)
        #expect(config.recommendsUpdate)
        config.later()
        #expect(!config.recommendsUpdate)
        // A later build is recommended: asked again.
        recommended.withLock { $0 = 19 }
        await config.refresh(force: true)
        #expect(config.recommendsUpdate)
    }

    // MARK: signals

    @Test func aMovedCounterTellsOnlyItsSubscribers() {
        let source = FakeSignals()
        let signals = SignalListener(source: source, interval: .seconds(3600))
        signals.start(uid: "alice", listens: true)
        #expect(source.listening == ["alice"])
        var bell: [Set<SignalTopic>] = []
        var thread: [Set<SignalTopic>] = []
        let a = signals.observe([.bell]) { bell.append($0) }
        let b = signals.observe([.thread("alice_bob")]) { thread.append($0) }
        source.send(SignalCounters(bell: 1))
        // The first read names nothing.
        #expect(bell.isEmpty && thread.isEmpty)
        source.send(SignalCounters(inbox: 1, bell: 2))
        #expect(bell == [[.bell]])
        #expect(thread.isEmpty)
        source.send(SignalCounters(inbox: 1, bell: 2, threads: ["alice_bob": 1]))
        #expect(thread == [[.thread("alice_bob")]])
        #expect(signals.counters?.threads["alice_bob"] == 1)
        // The safety pull tells everyone, about everything.
        signals.pullAll()
        #expect(bell.last == [] && thread.last == [])
        a.cancel()
        source.send(SignalCounters(inbox: 1, bell: 3, threads: ["alice_bob": 1]))
        #expect(bell.count == 2)
        _ = b
    }

    @Test func withTheFlagOffNothingIsListenedTo() {
        let source = FakeSignals()
        let signals = SignalListener(source: source, interval: .seconds(3600))
        signals.start(uid: "alice", listens: false)
        #expect(source.listening.isEmpty)
        signals.stop()
    }

    @Test func aFailedListenerListensAgainInTheForeground() {
        let source = FakeSignals()
        let signals = SignalListener(source: source, interval: .seconds(3600))
        signals.start(uid: "alice", listens: true)
        var pulled = 0
        let subscription = signals.observe([.inbox]) { _ in pulled += 1 }
        source.fail()
        #expect(signals.failed)
        signals.setForeground(false)
        signals.setForeground(true)
        #expect(!signals.failed)
        #expect(source.listening == ["alice", "alice"])
        // Back in front: everyone pulls at once.
        #expect(pulled == 1)
        _ = subscription
    }

    @Test func theSafetyPullRunsEveryInterval() async {
        let signals = SignalListener(source: FakeSignals(), interval: .milliseconds(20))
        signals.start(uid: "alice", listens: true)
        var pulled = 0
        let subscription = signals.observe([.bell]) { _ in pulled += 1 }
        #expect(await eventually { pulled >= 2 })
        signals.stop()
        _ = subscription
    }

    // MARK: the bell

    @Test func theBellIsPulledOnItsSignalAndReadAtOnce() async throws {
        let server = DecoupleServer()
        let source = FakeSignals()
        let signals = SignalListener(source: source, interval: .seconds(3600))
        signals.start(uid: "alice", listens: true)
        let store = NotificationsStore()
        store.start(uid: "alice", bell: InboxAPI(client: server.client), signals: signals)
        #expect(store.usesAPI)
        #expect(await eventually { store.loaded })
        #expect(store.items.map(\.id) == ["n1"])
        #expect(store.unreadCount == 1)
        #expect(store.items.first?.fromUserId == "bob")
        source.send(SignalCounters(bell: 1))
        source.send(SignalCounters(bell: 2))
        #expect(await eventually { server.calls.filter { $0 == "getBell" }.count == 2 })
        // Read: drawn read at once, the server told by id.
        store.markRead(id: "n1")
        #expect(store.unreadCount == 0)
        #expect(await eventually { server.calls.contains("markNotificationsRead") })
        #expect(server.readIds == ["n1"])
        // The server's next answer still says unread (sent before the read was written): it stays read here.
        signals.pullAll()
        #expect(await eventually { server.calls.filter { $0 == "getBell" }.count == 3 })
        #expect(store.unreadCount == 0)
        store.stop()
    }

    @Test func theBellWithTheFlagOffAsksTheAPINothing() {
        let store = NotificationsStore()
        #expect(!store.usesAPI)
    }

    // MARK: the conversations

    @Test func theConversationsAreListedFromTheAPIAndFollowTheirSignals() async throws {
        let server = DecoupleServer()
        let source = FakeSignals()
        let signals = SignalListener(source: source, interval: .seconds(3600))
        signals.start(uid: "alice", listens: true)
        let store = ConversationsStore()
        store.readPeople = { ids in Dictionary(uniqueKeysWithValues: ids.map { ($0, PeopleBook.Read.failed) }) }
        store.start(uid: "alice", inbox: InboxAPI(client: server.client), social: SocialAPI(client: server.client), signals: signals)
        #expect(store.paths == (true, true))
        #expect(await eventually { store.loaded })
        #expect(store.conversations.map(\.id) == ["alice_bob"])
        #expect(store.conversations.first?.other.handle == "bob")
        #expect(store.conversations.first?.lastText == "hi")
        #expect(store.unreadTotal == 2)
        // Carol is connected, no conversation yet; dave is blocked.
        #expect(store.starters.map(\.id) == ["carol"])
        #expect(store.blockedIds == ["dave", "gone"])
        #expect(store.connectedIds == ["bob", "carol"])
        source.send(SignalCounters())
        source.send(SignalCounters(inbox: 1))
        #expect(await eventually { server.calls.filter { $0 == "listConversations" }.count == 2 })
        #expect(server.calls.filter { $0 == "getConnections" }.count == 1)
        source.send(SignalCounters(inbox: 1, graph: 1))
        #expect(await eventually { server.calls.filter { $0 == "getConnections" }.count == 2 })
        // A block asked for here: the list drops them at once.
        store.blockChanged("bob", blocked: true)
        #expect(store.blockedIds == ["dave", "gone", "bob"])
        // …and asks the server for its list again (a block alone moves no signal of the blocker's).
        #expect(await eventually { server.calls.filter { $0 == "getBlocks" }.count == 3 })
        store.stop()
    }

    // MARK: services

    @Test func aBlockIsOneCallAndTheListFollowsAtOnce() async throws {
        let server = DecoupleServer()
        var changes: [(String, Bool)] = []
        let safety = SafetyService(uid: "alice", api: SafetyAPI(client: server.client), social: SocialAPI(client: server.client),
                                   onBlockChange: { changes.append(($0, $1)) })
        try await safety.block("bob")
        #expect(server.calls == ["blockUser"])
        #expect(changes.map(\.0) == ["bob"] && changes.map(\.1) == [true])
        try await safety.unblock("bob")
        #expect(server.calls == ["blockUser", "unblockUser"])
        let blocked = try await safety.blocked()
        #expect(blocked.map(\.id) == ["dave", "gone"])
        #expect(blocked.first?.handle == "dave")
        // A deleted account has no pen name.
        #expect(blocked.last?.handle == nil)
    }

    @Test func aRefusedBlockBringsThePersonBack() async {
        let server = DecoupleServer()
        server.refuse.on = true
        var changes: [Bool] = []
        let safety = SafetyService(uid: "alice", api: SafetyAPI(client: server.client), social: SocialAPI(client: server.client),
                                   onBlockChange: { changes.append($1) })
        await #expect(throws: (any Error).self) { try await safety.block("bob") }
        #expect(changes == [true, false])
    }

    @Test func bookmarksAndHintsTakeThePathTheirFlagNames() async throws {
        let server = DecoupleServer()
        let api = BookmarkService(uid: "alice", social: SocialAPI(client: server.client), reading: ReadingAPI(client: server.client))
        #expect(api.usesAPI)
        #expect(try await api.set("c1", saved: true))
        #expect(try await !api.set("c1", saved: false))
        #expect(server.calls == ["putBookmark", "deleteBookmark"])
        // The older path: Firestore, never the API.
        let firestore = BookmarkService(uid: "alice")
        #expect(!firestore.usesAPI)

        UserDefaults.standard.removeObject(forKey: "hint:decouple-test")
        let hints = HintService(uid: "alice", social: SocialAPI(client: server.client), profile: ProfileAPI(client: server.client))
        #expect(await hints.claim("decouple-test"))
        #expect(server.calls.suffix(2) == ["getMe", "updateProfile"])
        #expect((server.lastPatch?["hintsSeen"] as? [String: Any])?["decouple-test"] as? Int == 1)
        UserDefaults.standard.removeObject(forKey: "hint:decouple-test")
    }

    @Test func peopleByIdComeBackAsTheBookRecordsThem() throws {
        let people = try JSONDecoder().decode(Components.Schemas.PersonList.self, from: Data(DecoupleServer.users.utf8)).users
        let reads = PeopleBook.reads(people)
        guard case let .found(bob) = reads["bob"] else { Issue.record("bob not found"); return }
        #expect(bob.handle == "bob")
        guard case .gone = reads["gone"] else { Issue.record("a deleted account reads as gone"); return }
    }
}

/// A stand-in for `signals/{uid}`'s listener.
@MainActor
final class FakeSignals: SignalSource {
    private(set) var listening: [String] = []
    private var onChange: (@MainActor (SignalCounters) -> Void)?
    private var onFailure: (@MainActor () -> Void)?

    func listen(uid: String, onChange: @escaping @MainActor (SignalCounters) -> Void,
                onFailure: @escaping @MainActor () -> Void) -> () -> Void {
        listening.append(uid)
        self.onChange = onChange
        self.onFailure = onFailure
        return { [weak self] in
            self?.onChange = nil
            self?.onFailure = nil
        }
    }

    func send(_ counters: SignalCounters) { onChange?(counters) }
    func fail() { onFailure?() }
}

final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    var value: Int { lock.withLock { count } }
    func add() { lock.withLock { count += 1 } }
}

final class Shared<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Value
    init(_ value: Value) { self.value = value }
    func withLock<T>(_ body: (inout Value) -> T) -> T { lock.withLock { body(&value) } }
}

/// The converged endpoints, answering as the contract does.
final class DecoupleServer: ClientTransport, @unchecked Sendable {
    static func author(_ id: String) -> String {
        #"{"id":"\#(id)","handle":"\#(id)","initials":"\#(id.prefix(2).uppercased())","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,"avatarSeed":"42","verified":false,"region":"TW"}"#
    }
    static let users = #"{"users":[{"id":"bob","gone":false,"author":\#(author("bob")),"bio":null,"joinedAt":null},{"id":"gone","gone":true,"author":null,"bio":null,"joinedAt":null}]}"#

    let refuse = Flag()
    private let lock = NSLock()
    private var _calls: [String] = []
    private var _readIds: [String] = []
    private var _lastPatch: [String: Any]?
    var calls: [String] { lock.withLock { _calls } }
    var readIds: [String] { lock.withLock { _readIds } }
    var lastPatch: [String: Any]? { lock.withLock { _lastPatch } }

    var client: Client {
        Client(serverURL: URL(string: "https://example.test/api/v1")!, configuration: .init(dateTranscoder: .iso8601WithFractionalSeconds),
               transport: self)
    }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        var sent: [String: Any]?
        if let body { sent = try? JSONSerialization.jsonObject(with: try await Data(collecting: body, upTo: 1 << 20)) as? [String: Any] }
        lock.withLock { _calls.append(operationID) }
        if refuse.on { return answer(.internalServerError, #"{"error":{"code":"internal","message":"No."}}"#) }
        switch operationID {
        case "getBell":
            return answer(.ok, """
            {"items":[{"id":"n1","type":"note","payload":{"fromUserId":"bob","fromHandle":"bob","cardId":"c1","preview":"hi"},
              "readAt":null,"createdAt":"2026-11-20T03:04:05.123456Z"}],"people":[\(Self.author("bob"))],"nextPageToken":null}
            """)
        case "markNotificationsRead":
            lock.withLock { _readIds += (sent?["ids"] as? [String]) ?? [] }
            return answer(.noContent, nil)
        case "listConversations":
            return answer(.ok, """
            {"conversations":[{"id":"alice_bob","participants":["alice","bob"],"otherId":"bob","other":\(Self.author("bob")),"unread":2,
              "lastMessage":{"text":"hi","senderId":"bob","sentAt":"2026-11-20T03:04:05.123456Z","image":false,"sticker":false,
              "albumCount":null,"unsent":false},"request":null,"createdAt":null,"updatedAt":null,"originCardId":null}],"nextPageToken":null}
            """)
        case "getConnections":
            return answer(.ok, """
            {"connections":[{"userId":"bob","establishedAt":null,"person":{"id":"bob","gone":false,"author":\(Self.author("bob")),"bio":null,"joinedAt":null}},
             {"userId":"carol","establishedAt":null,"person":{"id":"carol","gone":false,"author":\(Self.author("carol")),"bio":null,"joinedAt":null}}]}
            """)
        case "getBlocks":
            return answer(.ok, """
            {"blocks":[{"userId":"dave","blockedAt":"2026-11-01T00:00:00.000Z","person":{"id":"dave","gone":false,"author":\(Self.author("dave")),"bio":null,"joinedAt":null}},
             {"userId":"gone","blockedAt":null,"person":{"id":"gone","gone":true,"author":null,"bio":null,"joinedAt":null}}]}
            """)
        case "getUsers":
            return answer(.ok, Self.users)
        case "blockUser", "unblockUser", "putBookmark", "deleteBookmark":
            return answer(.noContent, nil)
        case "getMe", "updateProfile":
            if operationID == "updateProfile" { lock.withLock { _lastPatch = sent } }
            return answer(.ok, """
            {"id":"alice","handle":"alice","initials":"AL","accentColor":"oklch(90% 0.05 60)","bio":null,"avatarUrl":null,
             "region":null,"primaryLocale":null,"handleChangedAt":null}
            """)
        default:
            return answer(.notFound, #"{"error":{"code":"not_found","message":"No."}}"#)
        }
    }

    private func answer(_ status: HTTPResponse.Status, _ json: String?) -> (HTTPResponse, HTTPBody?) {
        var response = HTTPResponse(status: status)
        if json != nil { response.headerFields[.contentType] = "application/json" }
        return (response, json.map { HTTPBody($0) })
    }
}
