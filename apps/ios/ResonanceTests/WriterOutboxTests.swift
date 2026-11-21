import Foundation
import ResonanceAPI
import ResonanceKit
import Testing
@testable import Resonance

/// What the fake server was sent, and how it answers (`features.apiDrafts` / `apiThoughtMap`, Phase 2 of the
/// middleware decouple).
private actor DraftServer {
    enum Call: Equatable {
        case create(String, title: String)
        case save(String, rev: Int, title: String?, clear: [String])
        case edit(String, rev: Int, title: String)
    }

    private(set) var calls: [Call] = []
    /// What the next saves answer (applied at the count sent when empty); an error is thrown.
    var answers: [Result<(applied: Bool, rev: Int), Error>] = []
    /// Holds each request until the test opens it (nil: answered at once).
    var gate: Gate<Void>?

    func script(_ answers: [Result<(applied: Bool, rev: Int), Error>]) { self.answers = answers }
    func hold(_ gate: Gate<Void>?) { self.gate = gate }

    func create(_ body: DraftsAPI.Create) async throws -> DraftsAPI.Created {
        calls.append(.create(body.id, title: body.thoughtCore))
        if let gate { await gate.wait() }
        return DraftsAPI.Created(id: body.id, created: true, rev: 0)
    }

    func save(_ id: String, _ patch: DraftsAPI.Patch) async throws -> DraftsAPI.Saved {
        calls.append(.save(id, rev: patch.rev, title: patch.thoughtCore, clear: (patch.clear ?? []).map(\.rawValue)))
        if let gate { await gate.wait() }
        return try answer(patch.rev)
    }

    func edit(_ id: String, _ edit: DraftsAPI.Edit) async throws -> DraftsAPI.Saved {
        calls.append(.edit(id, rev: edit.rev, title: edit.thoughtCore))
        if let gate { await gate.wait() }
        return try answer(edit.rev)
    }

    private func answer(_ rev: Int) throws -> DraftsAPI.Saved {
        guard !answers.isEmpty else { return DraftsAPI.Saved(applied: true, rev: rev, updatedAt: nil) }
        let (applied, stored) = try answers.removeFirst().get()
        return DraftsAPI.Saved(applied: applied, rev: stored, updatedAt: nil)
    }

    var send: DraftOutbox.Send {
        DraftOutbox.Send(create: { try await self.create($0) }, save: { try await self.save($0, $1) },
                         edit: { try await self.edit($0, $1) })
    }
}

private let offline = URLError(.notConnectedToInternet)
private let refused = APIFailure(code: "invalid_request", message: "No.", status: 400)

private func tempFile() -> URL {
    FileManager.default.temporaryDirectory.appending(path: "outbox-\(UUID().uuidString).json")
}

private func words(_ title: String, cover: Bool = false) -> DraftValues {
    DraftValues(title: title, story: "Out in the rain.", tags: ["rain"],
                imageURL: cover ? URL(string: "https://img.resonance.channel/a.webp") : nil, imageLabel: cover ? "a" : nil)
}

/// A pause that never ends by itself (a retry waits for `sendNow`).
private let forever: @Sendable (Duration) async -> Void = { _ in try? await Task.sleep(for: .seconds(3600)) }

@MainActor private func outbox(_ server: DraftServer, file: URL? = nil,
                               pause: @escaping @Sendable (Duration) async -> Void = { _ in }) async -> DraftOutbox {
    let box = DraftOutbox(send: await server.send, file: file, pause: pause)
    box.start(uid: "u1")
    return box
}

@MainActor private func service(_ box: DraftOutbox) -> DraftService {
    let configuration = APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil })
    let client = ResonanceClient.make(configuration)
    return DraftService(uid: "u1", outbox: box, api: DraftsAPI(client: client), reading: ReadingAPI(client: client),
                        writing: WritingAPI(client: client, configuration: configuration))
}

/// The writer's outbox: in order, one request per card at a time, the newest state replacing an older one still
/// waiting, `rev` counted and sent again above a stale answer, kept through the network failing and a relaunch.
@MainActor @Suite struct DraftOutboxTests {
    @Test func aDraftIsMadeThenItsSavesFollowMergedWhileOneIsOnItsWay() async throws {
        let server = DraftServer()
        let gate = Gate<Void>()
        await server.hold(gate)
        let box = await outbox(server)
        let drafts = service(box)
        let made = drafts.create(words("A"), id: "c1", locale: "zh-TW", referenceCardId: nil)
        let first = drafts.update("c1", words("A walk"))
        let second = drafts.update("c1", words("A walk in the rain"))
        // The create on its way; the two saves wait as one.
        #expect(box.writes.map(\.kind) == [.create, .draft])
        #expect(box.writes.last?.patch?.thoughtCore == "A walk in the rain")
        await gate.open(())
        try await made.acknowledged()
        try await first.acknowledged()
        try await second.acknowledged()
        #expect(await server.calls == [.create("c1", title: "A"), .save("c1", rev: 1, title: "A walk in the rain", clear: ["media", "accentHue"])])
        #expect(box.knownRev(.draft, "c1") == 1)
        #expect(!box.busy("c1"))
    }

    @Test func eachCardHasItsOwnTurnAndCountsItsOwnSaves() async throws {
        let server = DraftServer()
        let box = await outbox(server)
        let drafts = service(box)
        try await drafts.update("c1", words("one")).acknowledged()
        try await drafts.update("c2", words("two")).acknowledged()
        try await drafts.update("c1", words("one again", cover: true)).acknowledged()
        #expect(await server.calls == [.save("c1", rev: 1, title: "one", clear: ["media", "accentHue"]),
                                       .save("c2", rev: 1, title: "two", clear: ["media", "accentHue"]),
                                       .save("c1", rev: 2, title: "one again", clear: ["accentHue"])])
    }

    @Test func aStaleAnswerSendsTheWordsOnScreenAgainAboveTheServersCount() async throws {
        let server = DraftServer()
        await server.script([.success((false, 7))])
        let box = await outbox(server)
        try await service(box).update("c1", words("mine")).acknowledged()
        #expect(await server.calls == [.save("c1", rev: 1, title: "mine", clear: ["media", "accentHue"]),
                                       .save("c1", rev: 8, title: "mine", clear: ["media", "accentHue"])])
        #expect(box.knownRev(.draft, "c1") == 8)
    }

    @Test func offlineTheSaveIsKeptAndGoesWhenTheNetworkComesBack() async throws {
        let server = DraftServer()
        await server.script([.failure(offline), .failure(offline)])
        let box = await outbox(server)
        let write = service(box).update("c1", words("kept"))
        // Answered only once it went (never an error for the network), as Firestore's queue answered.
        try await write.acknowledged()
        #expect(await server.calls.count == 3)
        #expect(!box.busy("c1"))
    }

    @Test func aRefusalDropsTheSaveAndTellsTheWriter() async throws {
        let server = DraftServer()
        await server.script([.failure(refused)])
        let box = await outbox(server)
        await #expect(throws: APIFailure.self) { try await service(box).update("c1", words("no")).acknowledged() }
        #expect(box.writes.isEmpty)
    }

    @Test func whatWasNotSentIsKeptThroughARelaunchAndSentAtTheNextSignIn() async throws {
        let file = tempFile()
        defer { try? FileManager.default.removeItem(at: file) }
        let down = DraftServer()
        await down.script([.failure(offline), .failure(offline)])
        let before = await outbox(down, file: file, pause: forever)
        _ = service(before).update("c1", words("written offline"))
        _ = service(before).saveEdit("c2", words("a revision"))
        try await Task.sleep(for: .milliseconds(50))
        #expect(before.writes.count == 2)

        // The next launch: the same file, the network back.
        let up = DraftServer()
        let after = DraftOutbox(send: await up.send, file: file)
        #expect(after.writes.map(\.cardId) == ["c1", "c2"])
        #expect(after.knownRev(.draft, "c1") == 1)
        after.start(uid: "u1")
        #expect(DraftService.values(try #require(after.newest("c1")))?.title == "written offline")
        for _ in 0..<50 where !after.writes.isEmpty { try await Task.sleep(for: .milliseconds(20)) }
        #expect(after.writes.isEmpty)
        let calls = await up.calls
        #expect(calls.contains(.save("c1", rev: 2, title: "written offline", clear: ["media", "accentHue"])))
        #expect(calls.contains(.edit("c2", rev: 2, title: "a revision")))
    }

    @Test func anotherAccountsWritesAreNeitherSentNorKept() async throws {
        let file = tempFile()
        defer { try? FileManager.default.removeItem(at: file) }
        let server = DraftServer()
        await server.script([.failure(offline)])
        let before = await outbox(server, file: file, pause: forever)
        _ = service(before).update("c1", words("theirs"))
        try await Task.sleep(for: .milliseconds(20))
        let after = DraftOutbox(send: await DraftServer().send, file: file)
        after.start(uid: "someone-else")
        #expect(after.writes.isEmpty)
    }

    @Test func publishingWaitsForTheOutboxAndSendsPastItsPause() async throws {
        let server = DraftServer()
        await server.script([.failure(offline)])
        let box = await outbox(server, pause: forever)
        let calls = ServerCalls()
        var busyAtPublish: Bool?
        var writerCalls = calls.calls
        writerCalls.publish = { id in
            busyAtPublish = box.busy(id)
            return "a-walk"
        }
        let opened = DraftService.OpenedCard(id: "c1", values: words("A"), isPublished: false, slug: nil,
                                             referenceCardId: nil, hasPendingEdit: false)
        let model = WriteModel(drafts: service(box), writing: service(box).writing!, calls: writerCalls, opened: opened)
        model.values = words("A walk")
        model.store()
        // The first send failed and waits out a pause that never ends on its own: publishing sends it now.
        try await Task.sleep(for: .milliseconds(30))
        #expect(box.busy("c1"))
        let key = await model.publish()
        #expect(key == "a-walk")
        #expect(busyAtPublish == false)
    }

    @Test func discardingDropsTheRevisionWaitingSoNothingRemakesTheBuffer() async throws {
        let server = DraftServer()
        let gate = Gate<Void>()
        await server.hold(gate)
        let box = await outbox(server)
        let drafts = service(box)
        let first = drafts.saveEdit("c1", words("r1"))
        _ = drafts.saveEdit("c1", words("r2"))
        let dropping = Task { await box.drop("c1", kinds: [.edit]) }
        try await Task.sleep(for: .milliseconds(20))
        await gate.open(())
        await dropping.value
        try await first.acknowledged()
        #expect(await server.calls == [.edit("c1", rev: 1, title: "r1")])
        #expect(box.writes.isEmpty)
    }

    @Test func aWaitingSaveIsWhatTheWriterOpens() throws {
        let detail = try JSONDecoder().decode(CardDetail.self, from: Data(ReadingAPITestsFixture.detail.utf8))
        let waiting = OutboxWrite(uid: "u1", cardId: "c1", kind: .draft, patch: DraftService.patchBody(words("newer")))
        let opened = try #require(DraftService.opened(id: "c1", detail: detail, buffered: nil, waiting: waiting))
        #expect(opened.values.title == "newer")
        let plain = try #require(DraftService.opened(id: "c1", detail: detail, buffered: nil, waiting: nil))
        #expect(plain.values.title == "Draft title")
        #expect(plain.values.story == "Its story.")
        #expect(!plain.isPublished)
    }
}

/// An owner's unpublished card as GET /cards/{id} answers it.
private enum ReadingAPITestsFixture {
    static let detail = """
    {"card":{"id":"c1","slug":null,"title":"Draft title","excerpt":"Its story.","tags":["rain"],"publishedAt":null,
     "author":null,"anonymous":false,"visibility":"private","imageUrl":null,"imageThumbUrl":null,"imageLabel":null,
     "accentHue":null,"readMinutes":1,"referenceCardId":null,"reason":null},
     "story":"Its story.","visibility":"private","anonymous":false,"resonanceCount":0,"coreInsight":null,"isOwner":true,
     "referenceCard":null}
    """
}

/// What `client-config` says chooses the path: the old Firestore one with the flag off, `/api/v1` with it on.
@MainActor @Suite struct WriterPathTests {
    @Test func theFlagsChooseTheDraftAndMapPaths() {
        for on in [false, true] {
            let paths = LivePaths(ClientFeatures(apiThoughtMap: on, apiDrafts: on))
            #expect(paths.drafts == on)
            #expect(paths.thoughtMap == on)
            let configuration = APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil })
            let store = ThoughtMapStore(api: ReadingAPI(client: ResonanceClient.make(configuration)))
            store.use(on ? ThoughtMapAPI(client: ResonanceClient.make(configuration)) : nil, signals: nil)
            #expect(store.makeService(uid: "u1").usesAPI == on)
        }
        #expect(!DraftService(uid: "u1").usesAPI)
    }

    @Test func aNewIdIsTheContractsShape() {
        let id = DraftService.newId()
        #expect(id.count == 20)
        #expect(id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) })
        #expect(id != DraftService.newId())
    }
}

/// What the fake map server was sent.
private actor MapServer {
    private(set) var batches: [[ThoughtMapAPI.Op]] = []
    var failures: [Error] = []
    var gate: Gate<Void>?

    func hold(_ gate: Gate<Void>?) { self.gate = gate }
    func fail(_ errors: [Error]) { failures = errors }

    func apply(_ ops: [ThoughtMapAPI.Op]) async throws {
        batches.append(ops)
        if let gate { await gate.wait() }
        if !failures.isEmpty { throw failures.removeFirst() }
    }
}

@MainActor private func queue(_ server: MapServer) -> MapOpQueue {
    MapOpQueue(send: { try await server.apply($0) }, pause: { _ in })
}

private func move(_ id: String, _ x: Double) -> ThoughtMapAPI.Op { ThoughtMapService.op(.moveNode, cardId: id, x: x, y: 0) }

/// The thought map's op batches: a frame's changes in one batch, one batch at a time, a card moved again while it
/// waits folded into its earlier move, order kept, a lost batch sent again, the map read only after they land.
@MainActor @Suite struct MapOpQueueTests {
    @Test func whatIsHandedOverInOneFrameGoesInOneBatch() async throws {
        let server = MapServer()
        let ops = queue(server)
        async let a: Void = ops.enqueue([move("a", 1)])
        async let b: Void = ops.enqueue([move("b", 2)])
        _ = try await (a, b)
        #expect(await server.batches.map { Set($0.compactMap(\.cardId)) } == [["a", "b"]])
    }

    @Test func aCardMovedAgainWhileABatchIsOnItsWayGoesOnceAtItsLastPlace() async throws {
        let server = MapServer()
        let gate = Gate<Void>()
        await server.hold(gate)
        let ops = queue(server)
        let first = Task { try await ops.enqueue([move("a", 1)]) }
        try await Task.sleep(for: .milliseconds(30))
        // Two more drops while the first is on its way (handed over in the order made).
        let later = Task { try await ops.enqueue([move("a", 2), move("a", 3)]) }
        try await Task.sleep(for: .milliseconds(5))
        #expect(ops.busy)
        await gate.open(())
        try await first.value
        try await later.value
        #expect(await server.batches.map { $0.map(\.x) } == [[1], [3]])
    }

    @Test func aMoveNeverFoldsAcrossAnOpThatChangesWhatIsThere() async throws {
        let server = MapServer()
        let ops = queue(server)
        // In the order the canvas made them (one handover: what waits of it folds as across calls).
        try await ops.enqueue([move("a", 1), ThoughtMapService.op(.removeNode, cardId: "a"),
                               ThoughtMapService.op(.addNode, cardId: "a", x: 5, y: 5), move("a", 9)])
        #expect(await server.batches.first?.map(\.op) == [.moveNode, .removeNode, .addNode, .moveNode])
    }

    @Test func aBatchTheNetworkLostIsSentAgainAndOneRefusedTellsItsCallers() async throws {
        let server = MapServer()
        await server.fail([offline])
        let ops = queue(server)
        try await ops.enqueue([move("a", 1)])
        #expect(await server.batches.count == 2)
        await server.fail([refused])
        await #expect(throws: APIFailure.self) { try await ops.enqueue([move("b", 1)]) }
        #expect(!ops.busy)
    }

    @Test func theMapIsReadOnlyAfterEveryChangeLanded() async throws {
        let server = MapServer()
        let gate = Gate<Void>()
        await server.hold(gate)
        let ops = queue(server)
        let moving = Task { try await ops.enqueue([move("a", 1)]) }
        try await Task.sleep(for: .milliseconds(30))
        var flushed = false
        let flushing = Task { await ops.flush(); flushed = true }
        try await Task.sleep(for: .milliseconds(10))
        #expect(!flushed)
        await gate.open(())
        await flushing.value
        try await moving.value
        #expect(flushed)
    }

    @Test func theServiceWritesTheWebsOpsOnTheAPIPathOnly() async throws {
        let server = MapServer()
        let ops = queue(server)
        let configuration = APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil })
        var map = ThoughtMapService(uid: "u1", summaries: { _ in [] })
        #expect(!map.usesAPI)
        map.ops = ops
        map.api = ThoughtMapAPI(client: ResonanceClient.make(configuration))
        #expect(map.usesAPI)
        try await map.moveNode("a", x: 1, y: 2, groupId: nil)
        try await map.moveGroup("g", x: 3, y: 4, members: [("a", 5, 6)])
        let group = try await map.createGroup(title: "分類", hue: 55, x: 0, y: 0, w: 460, h: 340)
        try await map.removeGroup(group)
        let sent = await server.batches.flatMap { $0 }
        #expect(sent.map(\.op) == [.moveNode, .setNodeGroup, .updateGroup, .moveNode, .addGroup, .removeGroup])
        #expect(sent[1].groupId == nil)
        #expect(sent[4].groupId == group && group.count == 20)
    }
}
