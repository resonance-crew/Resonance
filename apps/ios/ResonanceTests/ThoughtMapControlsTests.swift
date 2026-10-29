import DesignSystem
import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// The thought map's controls, 2026-10-29 (the owner): a region's title and trash well in from its edges;
/// a selected card's 開啟 alone on its tab and 移除 inside its opposite corner, so one is never tapped for
/// the other; and an arrow drawn out of any of the card's four sides — each placed where the web places it
/// (ThoughtMapNode.tsx / ThoughtMap.module.css), and found where it is drawn.
@MainActor @Suite struct ThoughtMapControlsTests {
    /// A finger on the map (the store keys touches by identity, as UIKit's are).
    final class Finger {}

    /// One free card at the origin, and an empty region off to its right.
    static let board = ThoughtMapService.Loaded(
        nodes: [MapNode(cardId: "a", x: 0, y: 0, groupId: nil)],
        edges: [],
        groups: [MapGroup(id: "g", title: "Walks", hue: 88, x: 600, y: 0, w: 460, h: 340)])

    static func store(selecting selection: ThoughtMapStore.Selection? = .node("a"), zoom s: Double = 1) -> ThoughtMapStore {
        let configuration = APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil })
        let store = ThoughtMapStore(api: ReadingAPI(client: ResonanceClient.make(configuration)))
        let card = MapCard(id: "a", authorId: "bob", slug: nil, title: "Card a", story: "A story.", tags: ["日常"],
                           visibility: "public", publishedAt: nil, mediaURL: nil, accentHue: nil)
        store.show(board, cards: ["a": card], resonated: [])
        store.camera = MapCamera(x: 0, y: 0, s: s)
        store.selection = selection
        return store
    }

    /// What a finger at world point (x, y) lands on, at the store's zoom.
    func hit(_ store: ThoughtMapStore, _ x: Double, _ y: Double) -> ThoughtMapStore.Hit {
        store.hitTest(CGPoint(x: x * store.camera.s + store.camera.x, y: y * store.camera.s + store.camera.y))
    }

    func tap(_ store: ThoughtMapStore, _ x: Double, _ y: Double) {
        let finger = Finger()
        let p = CGPoint(x: x * store.camera.s + store.camera.x, y: y * store.camera.s + store.camera.y)
        store.touchDown(ObjectIdentifier(finger), at: p)
        store.touchUp(ObjectIdentifier(finger), at: p)
    }

    // MARK: 開啟 and 移除, diagonally across the card

    @Test func theTabHoldsOpenAloneAndTheTrashSitsInTheOppositeCorner() {
        #expect(ThoughtMapStore.tabX == 24 && ThoughtMapStore.tabW == 64 && ThoughtMapStore.tabH == 30)
        #expect(ThoughtMapStore.removeX == mapNodeW - 23 && ThoughtMapStore.removeY == mapNodeH - 21)
        // Close (a finger's reach at 1:1 is 22), the whole tab is 開啟 — its far end too, where the trash was.
        let near = Self.store(zoom: 2)
        #expect(hit(near, 24 + 2, -15) == .tabOpen("a"))
        #expect(hit(near, 24 + 32, -28) == .tabOpen("a"))
        #expect(hit(near, 24 + 63, -2) == .tabOpen("a"))
        // Past the tab's end is the paper above the card, not a button.
        #expect(hit(near, 24 + 66, -20) == .empty)
        // 移除 inside the bottom-right corner, its 28 box round (W − 23, H − 21).
        #expect(hit(near, mapNodeW - 23, mapNodeH - 21) == .nodeRemove("a"))
        #expect(hit(near, mapNodeW - 23 - 13, mapNodeH - 21 + 13) == .nodeRemove("a"))
        // Just outside its box is the card again (a drag there still moves it).
        #expect(hit(near, mapNodeW - 23 - 16, mapNodeH - 21) == .node("a"))
        // ~200 apart: the two never share a finger's reach, even at 1:1.
        let open = CGPoint(x: 24 + 32, y: -15), remove = CGPoint(x: mapNodeW - 23, y: mapNodeH - 21)
        #expect(hypot(remove.x - open.x, remove.y - open.y) > 200)
        let store = Self.store()
        #expect(hit(store, 24 + 32, -15) == .tabOpen("a"))
        #expect(hit(store, mapNodeW - 23, mapNodeH - 21) == .nodeRemove("a"))
        // Zoomed out, 移除 doesn't grow with the finger's reach: a press 30 from it is still the card.
        let far = Self.store(zoom: 0.5)
        #expect(hit(far, mapNodeW - 23, mapNodeH - 21) == .nodeRemove("a"))
        #expect(hit(far, mapNodeW - 23 - 17, mapNodeH - 21) == .nodeRemove("a"))
        #expect(hit(far, mapNodeW - 23 - 30, mapNodeH - 21) == .node("a"))
        #expect(hit(far, mapNodeW - 23, mapNodeH - 21 - 30) == .node("a"))
    }

    @Test func tappingTheTabOpensTheCardAndTappingTheTrashTakesItOffTheMap() {
        let store = Self.store()
        var opened: [String] = []
        store.onOpen = { opened.append($0.id) }
        tap(store, 24 + 60, -15)
        #expect(opened == ["a"])
        #expect(store.nodes["a"] != nil)
        tap(store, mapNodeW - 23, mapNodeH - 21)
        #expect(store.nodes["a"] == nil)
        #expect(store.selection == nil)
        #expect(opened == ["a"])
    }

    @Test func aFiledCardsControlsTakeNoPressOutsideItsRegion() {
        // A card filed against its region's left edge: its left handle hangs outside the region's clip, unseen.
        let configuration = APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil })
        let store = ThoughtMapStore(api: ReadingAPI(client: ResonanceClient.make(configuration)))
        let card = MapCard(id: "a", authorId: "bob", slug: nil, title: "Card a", story: "A story.", tags: [],
                           visibility: "public", publishedAt: nil, mediaURL: nil, accentHue: nil)
        store.show(ThoughtMapService.Loaded(
            nodes: [MapNode(cardId: "a", x: 0, y: 60, groupId: "g")], edges: [],
            groups: [MapGroup(id: "g", title: "Walks", hue: 88, x: 4, y: 0, w: 460, h: 340)]),
                   cards: ["a": card], resonated: [])
        store.camera = MapCamera(x: 0, y: 0, s: 1)
        store.selection = .node("a")
        // Outside the region (x < 4) the left handle is clipped away: the press falls through to what's there.
        #expect(hit(store, -6, 60 + mapNodeH / 2) == .empty)
        // Inside it, the same handle still takes the press.
        #expect(hit(store, 8, 60 + mapNodeH / 2) == .linkHandle("a", .left))
        // The right handle, inside the region, is untouched.
        #expect(hit(store, mapNodeW + 1, 60 + mapNodeH / 2) == .linkHandle("a", .right))
    }

    @Test func anUnselectedCardHasNoButtons() {
        let store = Self.store(selecting: nil)
        #expect(hit(store, mapNodeW - 23, mapNodeH - 21) == .node("a"))
        #expect(hit(store, 24 + 32, -15) == .empty)
        #expect(hit(store, mapNodeW + 1, mapNodeH / 2) == .empty)
    }

    // MARK: Arrows from all four sides

    @Test func eachSideHasAHandleCentredOnItsMiddle() {
        #expect(ThoughtMapStore.handleCentre(.right) == CGPoint(x: mapNodeW + 1, y: mapNodeH / 2))
        #expect(ThoughtMapStore.handleCentre(.left) == CGPoint(x: -1, y: mapNodeH / 2))
        #expect(ThoughtMapStore.handleCentre(.top) == CGPoint(x: mapNodeW / 2, y: -1))
        #expect(ThoughtMapStore.handleCentre(.bottom) == CGPoint(x: mapNodeW / 2, y: mapNodeH + 1))
        let store = Self.store()
        for side in ThoughtMapStore.NodeSide.allCases {
            let c = ThoughtMapStore.handleCentre(side)
            #expect(hit(store, c.x, c.y) == .linkHandle("a", side))
        }
        // The top's handle stands clear of the narrow tab: between them is neither.
        #expect(ThoughtMapStore.tabX + ThoughtMapStore.tabW < mapNodeW / 2 - 14)
    }

    @Test func aHandlesReachGrowsOutwardButNeverEatsTheCardsBody() {
        // Zoomed out, a finger's 22 points are 44 of the world.
        let store = Self.store(zoom: 0.5)
        // 30 inside the left edge is the card (well within 44 of the handle, but deeper than 14).
        #expect(hit(store, 30, mapNodeH / 2) == .node("a"))
        #expect(hit(store, mapNodeW - 30, mapNodeH / 2) == .node("a"))
        #expect(hit(store, mapNodeW / 2, 30) == .node("a"))
        #expect(hit(store, mapNodeW / 2, mapNodeH - 30) == .node("a"))
        // 10 inside, or 40 outside, is the handle.
        #expect(hit(store, 10, mapNodeH / 2) == .linkHandle("a", .left))
        #expect(hit(store, -40, mapNodeH / 2) == .linkHandle("a", .left))
        #expect(hit(store, mapNodeW + 40, mapNodeH / 2) == .linkHandle("a", .right))
        #expect(hit(store, mapNodeW / 2 + 30, -20) == .linkHandle("a", .top))
        #expect(hit(store, mapNodeW / 2, mapNodeH + 40) == .linkHandle("a", .bottom))
    }

    @Test func aDragFromAnySideDrawsAnArrowAndTheBodyStillMovesTheCard() {
        for side in ThoughtMapStore.NodeSide.allCases {
            let store = Self.store()
            let c = ThoughtMapStore.handleCentre(side)
            let finger = Finger()
            store.touchDown(ObjectIdentifier(finger), at: CGPoint(x: c.x, y: c.y))
            #expect(store.linkDraft?.sourceId == "a")
            store.touchMove(ObjectIdentifier(finger), to: CGPoint(x: c.x + 80, y: c.y + 80))
            // The arrow's loose end follows the finger (in world units, 1:1 here).
            #expect(abs((store.linkDraft?.wx ?? .nan) - (Double(c.x) + 80)) < 1e-9)
            store.touchUp(ObjectIdentifier(finger), at: CGPoint(x: c.x + 80, y: c.y + 80))
            #expect(store.linkDraft == nil)
            #expect(store.nodes["a"]?.x == 0)
        }
        // A press 30 inside the left edge drags the selected card itself.
        let store = Self.store(zoom: 0.5)
        let finger = Finger()
        store.touchDown(ObjectIdentifier(finger), at: CGPoint(x: 30 * 0.5, y: mapNodeH / 2 * 0.5))
        #expect(store.linkDraft == nil)
        #expect(store.dragNodeId == "a")
        store.touchUp(ObjectIdentifier(finger), at: CGPoint(x: 30 * 0.5, y: mapNodeH / 2 * 0.5))
    }

    // MARK: A region's title and trash, well in from its edges

    @Test func aRegionsTrashSitsTwentyInFromItsCorner() {
        let g = Self.board.groups[0]
        #expect(ThoughtMapStore.regionTrashInset + ThoughtMapStore.regionTrashBox / 2 == 34)
        // Close up (reach under 14), its 28 box round (w − 34, 34).
        let store = Self.store(selecting: nil, zoom: 2)
        #expect(hit(store, g.x + g.w - 34, g.y + 34) == .groupDelete("g"))
        #expect(hit(store, g.x + g.w - 34 + 13, g.y + 34 - 13) == .groupDelete("g"))
        // The corner itself, where it used to crowd, is the region.
        #expect(hit(store, g.x + g.w - 5, g.y + 5) == .group("g"))
        #expect(hit(store, g.x + g.w - 34, g.y + 34 + 16) == .group("g"))
    }

    @Test func aRegionsTitleRowIsItsTopFiftySixClearOfTheTrash() {
        let g = Self.board.groups[0]
        #expect(ThoughtMapStore.regionTitleX == 28 && ThoughtMapStore.regionTitleY == 23 && ThoughtMapStore.regionTitleRight == 60)
        let store = Self.store(selecting: nil, zoom: 2)
        #expect(hit(store, g.x + 38, g.y + 34) == .groupTitle("g"))
        #expect(hit(store, g.x + 200, g.y + 55) == .groupTitle("g"))
        #expect(hit(store, g.x + g.w - 61, g.y + 30) == .groupTitle("g"))
        // Below the row, or between the title and the trash, is the region.
        #expect(hit(store, g.x + 200, g.y + 58) == .group("g"))
        #expect(hit(store, g.x + g.w - 55, g.y + 34) == .group("g"))
        // A tap on the selected region's title still renames it.
        store.selection = .group("g")
        tap(store, g.x + 38, g.y + 34)
        #expect(store.editingGroupId == "g")
    }
}
