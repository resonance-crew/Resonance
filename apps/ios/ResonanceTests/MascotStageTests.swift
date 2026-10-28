import CoreGraphics
import DesignSystem
import Foundation
import Testing
@testable import Resonance

/// The paper puppets (round 19): off until turned on, kept on this device, and told where a reading page's
/// views are as the web's ReadingScene (src/lib/mascots/reading/scene.ts).
@MainActor @Suite struct MascotStageTests {
    private func defaults() -> UserDefaults {
        let name = "MascotStageTests-\(UUID().uuidString)"
        return UserDefaults(suiteName: name)!
    }

    @Test func theSwitchIsOffUntilTurnedOnAndKept() {
        let kept = defaults()
        let store = AppearanceStore(defaults: kept, scenes: { [] })
        #expect(!store.mascots)
        store.setMascots(true)
        #expect(store.mascots)
        #expect(AppearanceStore(defaults: kept, scenes: { [] }).mascots)
        store.setMascots(false)
        #expect(!AppearanceStore(defaults: kept, scenes: { [] }).mascots)
    }

    /// A feed: each card with the author row and title inside it, top to bottom, and 顯示更多.
    @Test func aFeedsCardsCarryTheirOwnAuthorRowAndTitle() throws {
        let marks = [
            ReadingMark(.card(radius: 0), CGRect(x: 0, y: 500, width: 402, height: 480)),
            ReadingMark(.cardWords, CGRect(x: 38, y: 820, width: 300, height: 24)),
            ReadingMark(.cardFoot, CGRect(x: 38, y: 900, width: 326, height: 34)),
            ReadingMark(.card(radius: 0), CGRect(x: 0, y: 0, width: 402, height: 500)),
            ReadingMark(.cardFoot, CGRect(x: 38, y: 420, width: 326, height: 34)),
            ReadingMark(.more, CGRect(x: 145, y: 1030, width: 112, height: 44)),
            // Not laid out yet: nothing.
            ReadingMark(.card(radius: 0), .zero),
        ]
        let scene = ReadingSceneBuilder.scene(marks, width: 402, height: 874)
        let cards = try #require(scene.cards)
        #expect(cards.map(\.box.y) == [0, 500])
        #expect(cards[0].foot?.map(\.y) == [420])
        #expect(cards[0].words == nil)
        #expect(cards[1].words?.map(\.y) == [820])
        #expect(cards[1].foot?.map(\.y) == [900])
        #expect(scene.more == SceneRect(CGRect(x: 145, y: 1030, width: 112, height: 44)))
        #expect(scene.column == nil && scene.paragraphs == nil && scene.respond == nil)
        // As the island reads it: the scene.ts field names, and nothing for what the page hasn't.
        let json = String(decoding: try JSONEncoder().encode(scene), as: UTF8.self)
        #expect(json.contains(#""more":{"#))
        #expect(!json.contains("column"))
    }

    /// A card's page: its column, the title's first line (the pieces on its top line), the cover, the
    /// story's blocks in order, the response bar and the foot of the tags over it.
    @Test func aCardsPageGivesItsStoryAndItsEnd() throws {
        let marks = [
            ReadingMark(.titleClause(lineBox: 40), CGRect(x: 20, y: 300, width: 180, height: 40)),
            ReadingMark(.titleClause(lineBox: 40), CGRect(x: 200, y: 300, width: 120, height: 40)),
            ReadingMark(.titleClause(lineBox: 40), CGRect(x: 20, y: 340, width: 150, height: 40)),
            ReadingMark(.cover, CGRect(x: 20, y: 100, width: 362, height: 188)),
            ReadingMark(.column, CGRect(x: 20, y: 440, width: 362, height: 900)),
            ReadingMark(.block, CGRect(x: 20, y: 700, width: 362, height: 80)),
            ReadingMark(.block, CGRect(x: 20, y: 440, width: 362, height: 120)),
            ReadingMark(.ceiling, CGRect(x: 20, y: 1360, width: 200, height: 30)),
            ReadingMark(.respond, CGRect(x: 20, y: 1430, width: 362, height: 48)),
        ]
        let scene = ReadingSceneBuilder.scene(marks, width: 402, height: 874, dx: -0)
        #expect(scene.title?.firstLine == SceneRect(CGRect(x: 20, y: 300, width: 300, height: 40)))
        #expect(scene.paragraphs?.map(\.y) == [440, 700])
        #expect(scene.cover?.y == 100)
        #expect(scene.respond?.y == 1430)
        #expect(scene.respondCeiling == 1390)
        // No tags: the story's foot is the ceiling.
        let bare = ReadingSceneBuilder.scene(marks.filter { $0.role != .ceiling }, width: 402, height: 874)
        #expect(bare.respondCeiling == 1340)
        // A rail beside the story: said, so its margin has no places.
        let railed = ReadingSceneBuilder.scene(marks, width: 1180, height: 820, rail: CGRect(x: 900, y: 0, width: 220, height: 1))
        #expect(railed.rail != nil)
    }

    /// The overlay's points: content measured from its left edge moved by the overlay's own place.
    @Test func marksMoveIntoTheOverlaysPoints() {
        let scene = ReadingSceneBuilder.scene([ReadingMark(.more, CGRect(x: 145, y: 1030, width: 112, height: 44))],
                                              width: 400, height: 800, dx: -10)
        #expect(scene.more?.x == 135)
    }
}
