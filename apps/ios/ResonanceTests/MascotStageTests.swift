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
            ReadingMark(.card(key: "b", outline: .band(seed: 90)), CGRect(x: 0, y: 500, width: 402, height: 480)),
            ReadingMark(.cardWords, CGRect(x: 38, y: 820, width: 300, height: 24)),
            ReadingMark(.cardFoot, CGRect(x: 38, y: 900, width: 326, height: 34)),
            ReadingMark(.card(key: "a", outline: .band(seed: 13)), CGRect(x: 0, y: 0, width: 402, height: 500)),
            ReadingMark(.cardFoot, CGRect(x: 38, y: 420, width: 326, height: 34)),
            ReadingMark(.more, CGRect(x: 145, y: 1030, width: 112, height: 44)),
            // Not laid out yet: nothing.
            ReadingMark(.card(key: "c", outline: .band(seed: 167)), .zero),
        ]
        let scene = ReadingSceneBuilder.scene(marks, width: 402, height: 874)
        let cards = try #require(scene.cards)
        #expect(cards.map(\.box.y) == [0, 500])
        #expect(cards.map(\.key) == ["a", "b"])
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

    /// Round 20 (the owner: the card's line in front of the puppet): a card is handed as its line is drawn —
    /// a bordered card's wobbly outline, its extent across, its top sampled off it every 6 (corners' arcs
    /// and all), and its pen; a band's wavy rule along its top, in the light pen.
    @Test func aCardIsHandedAsItsLineIsDrawn() throws {
        let frame = CGRect(x: 24, y: 300, width: 360, height: 520)
        let outline = StoryCardView.readingOutline(position: 2, bordered: true)
        let card = ReadingSceneBuilder.card(key: "card-id", frame: frame, outline: outline)
        #expect(card.key == "card-id")
        #expect(card.pen == Double(Tokens.ink))
        #expect(card.radius == 22)
        // The drawn line's own extent: the wobble swings off the frame (never by more than its magnitude).
        let drawn = outline.drawn(in: frame.size).map { $0.x + frame.minX }
        #expect(card.box.x == SceneRect(CGRect(x: drawn.min()!, y: 0, width: 1, height: 1)).x)
        #expect(abs(card.box.x - 24) <= 360 * 0.025 + 1 && abs(card.box.x + card.box.w - 384) <= 360 * 0.025 + 1)
        #expect(card.box.x != 24 || card.box.w != 360)
        #expect(card.box.y == 300 && card.box.h == 520)
        let top = try #require(card.top)
        // From the extent's left + 1 to its right − 1, every 6, x ascending.
        #expect(abs(top.first![0] - (card.box.x + 1)) <= 1)
        #expect(zip(top, top.dropFirst()).allSatisfy { $1[0] - $0[0] == 6 })
        #expect(top.last![0] <= card.box.x + card.box.w - 1)
        // Along the top edge it wobbles about the frame's top; at the ends it is down the corners' arcs.
        // Its whole drawn outline too (round 20: a peek past its side is cut along the line), a point every few.
        let sides = try #require(card.outline)
        #expect(sides.count == drawn.count)
        #expect(zip(sides, sides.dropFirst()).allSatisfy { hypot($1[0] - $0[0], $1[1] - $0[1]) <= 4.5 })
        #expect(abs(sides.map { $0[0] }.min()! - card.box.x) <= 0.5 && sides.map { $0[1] }.max()! > 300 + 520 - 12)
        let middle = top[top.count / 2][1]
        #expect(abs(middle - 300) <= 10)
        #expect(top.first![1] > middle + 3 && top.last![1] > middle + 3)

        // A phone's band: its seven-turn rule about its top, edge to edge, in the light pen.
        let band = ReadingSceneBuilder.card(key: "b", frame: CGRect(x: 0, y: 900, width: 402, height: 480),
                                            outline: StoryCardView.readingOutline(position: 0, bordered: false))
        #expect(band.pen == Double(Tokens.inkLight))
        #expect(band.outline == nil)
        #expect(band.box.x == 0 && band.box.w == 402)
        let rule = try #require(band.top)
        #expect(rule.allSatisfy { abs($0[1] - 900) <= 1.5 })
        #expect(Set(rule.map { $0[1] }).count > 3)
        // As the island reads it: its key, `top` as [x, y] pairs, its pen.
        let json = String(decoding: try JSONEncoder().encode(band), as: UTF8.self)
        #expect(json.contains(#""key":"b""#) && json.contains(#""top":[["#) && json.contains(#""pen":1.2"#))
    }

    /// measure.ts `topContour`: the topmost point within 3 of each column, or the nearest's when none is.
    @Test func theTopContourTakesTheTopmostPointOfEachColumn() {
        let points = [CGPoint(x: 10, y: 104), CGPoint(x: 11, y: 101), CGPoint(x: 16, y: 99), CGPoint(x: 30, y: 103),
                      CGPoint(x: 18, y: 160)] // far below the edge: not its
        let top = ReadingSceneBuilder.topContour(points, from: 10, to: 28, near: 100)
        #expect(top == [CGPoint(x: 10, y: 101), CGPoint(x: 16, y: 99), CGPoint(x: 22, y: 99), CGPoint(x: 28, y: 103)])
        #expect(ReadingSceneBuilder.topContour([], from: 0, to: 100, near: 0).isEmpty)
    }

    /// The overlay's points: content measured from its left edge moved by the overlay's own place.
    @Test func marksMoveIntoTheOverlaysPoints() {
        let scene = ReadingSceneBuilder.scene([ReadingMark(.more, CGRect(x: 145, y: 1030, width: 112, height: 44))],
                                              width: 400, height: 800, dx: -10)
        #expect(scene.more?.x == 135)
    }

    /// A tap reaches a puppet only inside where the island said one is: anywhere else the page takes it.
    @Test func aTapIsThePuppetsOnlyInsideItsPlace() {
        let rects = MascotIsland.rects([[100, 200, 40, 60], [10.5, 20, 30, 30], ["x"], [1, 2, 3]])
        #expect(rects == [CGRect(x: 100, y: 200, width: 40, height: 60), CGRect(x: 10.5, y: 20, width: 30, height: 30)])
        #expect(MascotHitShape.reaches(CGPoint(x: 120, y: 230), rects))
        #expect(!MascotHitShape.reaches(CGPoint(x: 99, y: 230), rects))
        #expect(!MascotHitShape.reaches(CGPoint(x: 300, y: 600), rects))
        #expect(!MascotHitShape.reaches(CGPoint(x: 120, y: 230), MascotIsland.rects([])))
        // The shape the tap layer is cut to holds exactly those.
        let shape = MascotHitShape(rects: rects).path(in: CGRect(x: 0, y: 0, width: 400, height: 1024))
        #expect(shape.contains(CGPoint(x: 120, y: 230)) && !shape.contains(CGPoint(x: 60, y: 120)))
        #expect(MascotHitShape(rects: []).path(in: CGRect(x: 0, y: 0, width: 400, height: 1024)).isEmpty)
    }

    /// The island lies over the content as tall as it, in steps (a lazy list's height settling resizes it seldom).
    @Test func theLayerIsAsTallAsTheContentInSteps() {
        #expect(MascotIsland.layerHeight(content: 0) == 1024)
        #expect(MascotIsland.layerHeight(content: 1024) == 1024)
        #expect(MascotIsland.layerHeight(content: 1025) == 2048)
        #expect(MascotIsland.layerHeight(content: 18_300) == 18_432)
    }

    #if DEBUG
    /// Round 20's iPad bug: `-mascotsVisit margin-1` on the feed (no such place) asked 20 times, again on every
    /// scene, and each failed ask let the stage send someone. Now it asks while the cast loads only, and once.
    @Test func theDebugVisitGivesUpOnAPlaceThePageHasNot() {
        // The island has places and the asked one isn't among them: given up at once.
        #expect(MascotDebugVisit.givesUp(ledges: ["card-a-top", "more"], tries: 0))
        // No places yet (the scene not in): asked again, but not for ever.
        #expect(!MascotDebugVisit.givesUp(ledges: [], tries: 0))
        #expect(MascotDebugVisit.givesUp(ledges: [], tries: MascotDebugVisit.maxTries - 1))
        // The place is there and the stage refused it (each refusal clears the stage and sends someone else):
        // a named character comes ready or not, so the place itself can't take anyone — given up at once;
        // anyone, a few more tries while the cast loads.
        #expect(MascotDebugVisit.givesUpRefused(named: true, tries: 0))
        #expect(!MascotDebugVisit.givesUpRefused(named: false, tries: 0))
        #expect(MascotDebugVisit.givesUpRefused(named: false, tries: MascotDebugVisit.loadingTries - 1))
        var hook = MascotDebugVisit()
        let first = hook.begin()
        let again = hook.begin() // a new scene while it runs
        hook.end()
        let after = hook.begin() // nor after it has gone or given up
        #expect(first && !again && !after)
        // `*-top#2`: the second place whose name ends so; a plain name only itself.
        let ledges = ["card-a-top", "card-a-stand", "card-b-top", "card-b-walk"]
        #expect(MascotDebugVisit.Ask("*-top#2").ledge(in: ledges) == "card-b-top")
        #expect(MascotDebugVisit.Ask("*-walk:dot").ledge(in: ledges) == "card-b-walk")
        #expect(MascotDebugVisit.Ask("*-walk:dot").slug == "dot")
        #expect(MascotDebugVisit.Ask("*-top#3").ledge(in: ledges) == nil)
        #expect(MascotDebugVisit.Ask("margin-1").ledge(in: ledges) == nil)
    }
    #endif

    /// Settings' strip: its floor `headroom` down in its island, the switch over it in the island's points
    /// (above the strip: a smaller y), asleep while the switch is off.
    @Test func theSettingsStripsSceneFollowsTheSwitch() throws {
        let strip = CGRect(x: 0, y: 120, width: 362, height: 104)
        let toggle = CGRect(x: 312, y: 70, width: 50, height: 28)
        let off = try #require(MascotStrip.scene(strip: strip, height: 104, control: toggle, awake: false))
        #expect(off.width == 362 && off.height == 128)
        #expect(off.settings?.floor == SceneRect(CGRect(x: 0, y: 24, width: 362, height: 104)))
        #expect(off.settings?.control == SceneRect(CGRect(x: 312, y: -26, width: 50, height: 28)))
        #expect(off.settings?.asleep == true)
        let on = try #require(MascotStrip.scene(strip: strip, height: 104, control: toggle, awake: true))
        #expect(on.settings?.asleep == false)
        #expect(on.cards == nil && on.column == nil)
        let json = String(decoding: try JSONEncoder().encode(on), as: UTF8.self)
        #expect(json.contains(#""settings":{"#) && json.contains(#""asleep":false"#))
        // Not laid out yet: nothing to send.
        #expect(MascotStrip.scene(strip: .zero, height: 104, control: nil, awake: true) == nil)
        #expect(MascotStrip.height(window: 402) == 104 && MascotStrip.height(window: 834) == 116)
    }
}
