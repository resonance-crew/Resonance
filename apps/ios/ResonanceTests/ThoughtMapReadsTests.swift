import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// The thought map's reads (2026-10-27). The map once sat on its loader for more than 15 s, opened right
/// after a card went to the trash and came back: its first read waits on Firestore, which never answers a
/// read on a stream that has stalled (reproduced by pausing the emulator: the loader until it answered),
/// and nothing offered a way on. And each card the trash and its restore change is read again for each,
/// the answers landing in any order: the trash's, landing last, hid the restored card.
@MainActor @Suite struct ThoughtMapReadsTests {
    /// Which call a stubbed read is answering.
    final class Count {
        var calls = 0
    }

    static func card(_ id: String) -> MapCard {
        MapCard(id: id, authorId: "me", slug: nil, title: "Card \(id)", story: "A story.", tags: [], visibility: "public",
                publishedAt: nil, mediaURL: nil, accentHue: nil)
    }

    /// My cards `ids`, each on the map.
    static func board(_ ids: [String]) -> ThoughtMapStore.Board {
        ThoughtMapStore.Board(
            map: ThoughtMapService.Loaded(
                nodes: ids.enumerated().map { MapNode(cardId: $1, x: Double($0) * 300, y: 0, groupId: nil) }, edges: [], groups: []),
            cards: Dictionary(uniqueKeysWithValues: ids.map { ($0, card($0)) }), resonated: [])
    }

    /// The map shown with my cards `ids`.
    static func loaded(_ ids: [String]) async -> ThoughtMapStore {
        let store = RoundThirteenTests.store()
        store.readBoard = { _ in board(ids) }
        await store.load(uid: "me")
        return store
    }

    @Test func aFirstReadWithNoAnswerOffersAnotherAndItsLateAnswerPutsNothingBack() async {
        let store = RoundThirteenTests.store()
        store.firstReadPatience = .milliseconds(300)
        let stalled = Gate<ThoughtMapStore.Board>(), retried = Gate<ThoughtMapStore.Board>()
        let asked = Count()
        store.readBoard = { _ in
            asked.calls += 1
            return await (asked.calls == 1 ? stalled : retried).wait()
        }
        let first = Task { await store.load(uid: "me") }
        #expect(await eventually { asked.calls == 1 })
        // The loader while the read is on its way…
        #expect(!store.loaded && !store.failed)
        // …and past the patience 再試一次, never a loader with no end.
        #expect(await eventually { store.failed })
        #expect(!store.loaded)
        // 再試一次: the loader again, and the new read's answer is the map.
        let retry = Task { await store.load(uid: "me") }
        #expect(await eventually { asked.calls == 2 })
        #expect(!store.failed)
        await retried.open(Self.board(["a", "b"]))
        await retry.value
        #expect(store.loaded && !store.failed)
        #expect(store.nodeOrder == ["a", "b"])
        // The stalled read answering at last puts nothing back.
        await stalled.open(Self.board(["a"]))
        await first.value
        #expect(store.nodeOrder == ["a", "b"])
        #expect(store.cards.keys.sorted() == ["a", "b"])
    }

    @Test func aFirstReadThatAnswersLateStillShowsTheMap() async {
        let store = RoundThirteenTests.store()
        store.firstReadPatience = .milliseconds(50)
        let slow = Gate<ThoughtMapStore.Board>()
        store.readBoard = { _ in await slow.wait() }
        let read = Task { await store.load(uid: "me") }
        #expect(await eventually { store.failed })
        // No 再試一次 asked for: the read's own answer, when it comes, is the map.
        await slow.open(Self.board(["a"]))
        await read.value
        #expect(store.loaded && !store.failed)
        #expect(store.nodeOrder == ["a"])
    }

    @Test func theTrashsReadLandingAfterTheRestoresLeavesTheCardOnTheMap() async {
        let store = await Self.loaded(["a", "x"])
        #expect(store.nodeOrder == ["a", "x"])
        let afterTrash = Gate<MapCard?>(), afterRestore = Gate<MapCard?>()
        let asked = Count()
        store.readCard = { _, _ in
            asked.calls += 1
            return await (asked.calls == 1 ? afterTrash : afterRestore).wait()
        }
        // 刪除, then 復原 a moment later: the map reads the card again for each.
        let trashRead = Task { await store.refreshCards(["x"]) }
        #expect(await eventually { asked.calls == 1 })
        let restoreRead = Task { await store.refreshCards(["x"]) }
        #expect(await eventually { asked.calls == 2 })
        // The restore's read answers first: the card is where it was.
        await afterRestore.open(Self.card("x"))
        await restoreRead.value
        #expect(store.nodeOrder == ["a", "x"])
        // The trash's read answers last — the card in the trash, nil — and changes nothing.
        await afterTrash.open(nil)
        await trashRead.value
        #expect(store.nodeOrder == ["a", "x"])
        #expect(store.card("x") != nil)
        #expect(store.parked["x"] == nil)
    }

    @Test func inOrderTheTrashTakesTheCardOffAndTheRestorePutsItBack() async {
        let store = await Self.loaded(["a", "x"])
        let answers: [MapCard?] = [nil, Self.card("x")]
        let asked = Count()
        store.readCard = { _, _ in
            asked.calls += 1
            return answers[asked.calls - 1]
        }
        await store.refreshCards(["x"])
        #expect(store.nodeOrder == ["a"])
        #expect(store.parked["x"] != nil)
        await store.refreshCards(["x"])
        #expect(store.nodeOrder == ["a", "x"])
    }

    @Test func aReadThatFailsLeavesAnEarlierOneToAnswer() async {
        let store = await Self.loaded(["a", "x"])
        let earlier = Gate<MapCard?>()
        let asked = Count()
        struct Offline: Error {}
        store.readCard = { _, _ in
            asked.calls += 1
            if asked.calls == 1 { return await earlier.wait() }
            throw Offline()
        }
        let first = Task { await store.refreshCards(["x"]) }
        #expect(await eventually { asked.calls == 1 })
        // A second read of the card couldn't be read for now: the card stays as it was…
        await store.refreshCards(["x"])
        #expect(store.nodeOrder == ["a", "x"])
        // …and the first one's answer (in the trash) still counts.
        await earlier.open(nil)
        await first.value
        #expect(store.nodeOrder == ["a"])
    }
}
