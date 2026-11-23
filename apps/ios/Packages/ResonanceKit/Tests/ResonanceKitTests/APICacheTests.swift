import Foundation
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// What a cold start draws before the network answers: kept per account,
/// only the signed-in one's, today's picks only today (UTC), nothing past
/// a week, and gone on sign-out.
@Suite struct APICacheTests {
    let root = FileManager.default.temporaryDirectory.appending(path: "APICacheTests-\(UUID().uuidString)")
    let clock = Clock()

    /// The time the cache sees, moved by the test.
    final class Clock: @unchecked Sendable {
        private let lock = NSLock()
        private var _now = ISO8601DateFormatter().date(from: "2026-10-02T10:00:00Z")!
        var now: Date {
            get { lock.withLock { _now } }
            set { lock.withLock { _now = newValue } }
        }
    }

    private func makeCache() -> APICache {
        let clock = clock
        return APICache(root: root, now: { clock.now })
    }

    private func card(_ id: String) throws -> FeedCard {
        try JSONDecoder().decode(FeedCard.self, from: Data("""
        {"id":"\(id)","slug":"s-\(id)","title":"T","excerpt":"…","tags":[],"publishedAt":"2026-09-01T08:00:00.000Z",
         "author":{"id":"bob","handle":"bob","initials":"BO","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,
         "avatarSeed":null,"verified":false,"region":null},"anonymous":false,"visibility":"public","imageUrl":null,
         "imageLabel":null,"accentHue":null,"readMinutes":1,"referenceCardId":null,"reason":"Because"}
        """.utf8))
    }

    private func me(_ uid: String) throws -> Components.Schemas.Me {
        Components.Schemas.Me(id: uid, handle: uid, initials: "AL", accentColor: "oklch(88% 0.08 55)", bio: "Hi",
                              avatarUrl: nil, region: "TW", primaryLocale: .zhTW,
                              handleChangedAt: Date(timeIntervalSince1970: 1_790_000_000.123))
    }

    /// Saves land in order on the cache's own queue; a read waits for them.
    @Test func everyAnswerComesBackAsItWasKeptForItsAccount() throws {
        let cache = makeCache()
        cache.retainOnly("alice")
        let page = FeedPage(cards: [try card("a"), try card("b")], nextCursor: "2026-09-01T08:00:00.000Z")
        cache.save(page, as: .latest, uid: "alice")
        cache.save([try card("x")], as: .recommended, uid: "alice")
        cache.save([try card("p")], as: .published, uid: "alice")
        cache.save(try me("alice"), as: .me, uid: "alice")
        cache.save(["mallory"], as: .blocked, uid: "alice")

        // A cold start: a new cache over the same folder (once the saves are written).
        #expect(cache.value(.blocked, uid: "alice") == ["mallory"])
        let relaunched = makeCache()
        #expect(relaunched.value(.latest, uid: "alice") == page)
        #expect(relaunched.value(.recommended, uid: "alice")?.map(\.id) == ["x"])
        #expect(relaunched.value(.recommended, uid: "alice")?.first?.reason == "Because")
        #expect(relaunched.value(.published, uid: "alice")?.map(\.id) == ["p"])
        #expect(relaunched.value(.me, uid: "alice") == (try me("alice")))
        #expect(relaunched.value(.blocked, uid: "alice") == ["mallory"])
        // Another account on the same phone finds nothing of hers.
        #expect(relaunched.value(.latest, uid: "bob") == nil)
        #expect(relaunched.value(.me, uid: "bob") == nil)
    }

    @Test func theKeptAccountKeepsItsScheduledDeletion() throws {
        // A cold start draws the undo banner from the kept account, before /me answers.
        let cache = makeCache()
        cache.retainOnly("alice")
        var me = try me("alice")
        let purge = Date(timeIntervalSince1970: 1_791_000_000.5)
        me.deletion = .init(value1: .init(requestedAt: purge.addingTimeInterval(-7 * 86_400), purgeAfter: purge))
        cache.save(me, as: .me, uid: "alice")
        #expect(cache.value(.me, uid: "alice")?.deletion?.value1.purgeAfter == purge)
    }

    @Test func todaysPicksNeverOutliveTheirUTCDay() throws {
        let cache = makeCache()
        cache.retainOnly("alice")
        // 23:30 UTC: the picks of 2 October (07:30 the next morning in Taipei).
        clock.now = ISO8601DateFormatter().date(from: "2026-10-02T23:30:00Z")!
        cache.save([try card("x")], as: .recommended, uid: "alice")
        cache.save(FeedPage(cards: [try card("a")], nextCursor: nil), as: .latest, uid: "alice")
        #expect(cache.value(.recommended, uid: "alice")?.map(\.id) == ["x"])

        // Forty minutes on it's 3 October in UTC: yesterday's picks are gone, the latest cards stay.
        clock.now = ISO8601DateFormatter().date(from: "2026-10-03T00:10:00Z")!
        #expect(cache.value(.recommended, uid: "alice") == nil)
        #expect(cache.value(.latest, uid: "alice")?.cards.map(\.id) == ["a"])
        // And they don't come back if the clock does.
        clock.now = ISO8601DateFormatter().date(from: "2026-10-02T23:50:00Z")!
        #expect(cache.value(.recommended, uid: "alice") == nil)
    }

    @Test func nothingIsDrawnOnceItIsAWeekOld() throws {
        let cache = makeCache()
        cache.retainOnly("alice")
        cache.save([try card("p")], as: .published, uid: "alice")
        clock.now = clock.now.addingTimeInterval(APICache.maxAge - 60)
        #expect(cache.value(.published, uid: "alice") != nil)
        clock.now = clock.now.addingTimeInterval(120)
        #expect(cache.value(.published, uid: "alice") == nil)
    }

    @Test func signingOutLeavesNothingAndTakesNoLateAnswer() throws {
        let cache = makeCache()
        cache.retainOnly("alice")
        cache.save([try card("p")], as: .published, uid: "alice")
        cache.save(try me("alice"), as: .me, uid: "alice")

        cache.removeAll()
        #expect(cache.value(.published, uid: "alice") == nil)
        #expect(cache.value(.me, uid: "alice") == nil)
        // An answer to a request she made before signing out arrives now: it isn't kept.
        cache.save([try card("q")], as: .published, uid: "alice")
        #expect(cache.value(.published, uid: "alice") == nil)
        #expect(((try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []).isEmpty)
    }

    @Test func switchingAccountKeepsOnlyTheNewOnes() throws {
        let cache = makeCache()
        cache.retainOnly("alice")
        cache.save([try card("a")], as: .published, uid: "alice")

        cache.retainOnly("bob")
        // Alice's late answer is dropped; bob's are kept.
        cache.save([try card("late")], as: .published, uid: "alice")
        cache.save([try card("b")], as: .published, uid: "bob")
        #expect(cache.value(.published, uid: "alice") == nil)
        #expect(cache.value(.published, uid: "bob")?.map(\.id) == ["b"])
        #expect((try? FileManager.default.contentsOfDirectory(atPath: root.path)) == [APICache.folder("bob")])
    }

    /// The card box's shelf is read off the main thread (audit I7): the same answer, the same rules —
    /// another account's, or one past its day, is nothing — and a save asked for before it is read first.
    @Test func aLoadOffTheMainThreadKeepsTheSameRules() async throws {
        let cache = makeCache()
        cache.retainOnly("alice")
        cache.save([try card("p")], as: .published, uid: "alice")
        #expect(await cache.load(.published, uid: "alice")?.map(\.id) == ["p"])
        #expect(await cache.load(.published, uid: "bob") == nil)
        cache.save([try card("q")], as: .published, uid: "alice")
        #expect(await cache.load(.published, uid: "alice")?.map(\.id) == ["q"])
        // A broken file is nothing, and is dropped.
        let file = root.appending(path: APICache.folder("alice")).appending(path: "published.json")
        try Data("{}".utf8).write(to: file)
        #expect(await cache.load(.published, uid: "alice") == nil)
        cache.retainOnly("alice")
        #expect(!FileManager.default.fileExists(atPath: file.path))
    }

    @Test func aFileThatIsNotAKeptAnswerIsIgnored() throws {
        let cache = makeCache()
        cache.retainOnly("alice")
        let folder = root.appending(path: APICache.folder("alice"))
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try Data("{\"not\":\"an envelope\"}".utf8).write(to: folder.appending(path: "latest.json"))
        #expect(cache.value(.latest, uid: "alice") == nil)
        // Nor is one kept for someone else under her folder.
        cache.retainOnly("bob")
        cache.save([try card("b")], as: .published, uid: "bob")
        let bobs = root.appending(path: APICache.folder("bob")).appending(path: "published.json")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        _ = cache.value(.published, uid: "bob")
        try FileManager.default.copyItem(at: bobs, to: folder.appending(path: "published.json"))
        #expect(cache.value(.published, uid: "alice") == nil)
    }

    /// Round 32 §P7: a conversation's newest messages are kept per account and per conversation — what a cold start
    /// opened by a tapped push draws before the network answers — and nobody else's account reads them.
    @Test func aThreadsNewestMessagesAreKeptForItsAccountAndConversation() async throws {
        let cache = makeCache()
        cache.retainOnly("alice")
        let messages = try JSONDecoder().decode([Components.Schemas.ThreadMessage].self, from: Data("""
        [{"id":"m1","cursor":"c1","senderId":"bob","text":"明天一起去散步嗎？","sentAt":"2026-11-20T03:04:05.123456Z"},
         {"id":"m2","cursor":"c2","senderId":"alice","text":"好","sentAt":"2026-11-20T03:05:05.000000Z","unsentAt":"2026-11-20T03:06:00.000000Z"}]
        """.utf8))
        cache.save(messages, as: .thread("alice_bob"), uid: "alice")
        let kept = await cache.load(.thread("alice_bob"), uid: "alice")
        #expect(kept == messages)
        #expect(await cache.load(.thread("alice_carol"), uid: "alice") == nil)
        // The pair never becomes a path: its digest names the file.
        #expect(!APICache.Key<[Components.Schemas.ThreadMessage]>.thread("../x").name.contains("/"))
        // Another account signed in: hers are gone, and nothing is drawn for him.
        cache.retainOnly("bob")
        #expect(await cache.load(.thread("alice_bob"), uid: "bob") == nil)
        #expect(await cache.load(.thread("alice_bob"), uid: "alice") == nil)
    }
}
