import DesignSystem
import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// Round 13 (2026-10-26): a thought map opens doing what its 👁 顯示全部 does — every card and region framed in
/// the map's visible area — on the map page and beside the writer on an iPad alike, and keeps everything framed
/// as its visible size changes (the pane easing open, a divider let go, the iPad turned, the board's read landing
/// late) until the reader pans, pinches or zooms it themself; 顯示全部 hands the camera back (the web's 50d7cf4a).
@MainActor @Suite struct RoundThirteenTests {
    /// A finger on the map (the store keys touches by identity, as UIKit's are).
    final class Finger {}

    static let board = ThoughtMapService.Loaded(
        nodes: [MapNode(cardId: "a", x: 0, y: 0, groupId: "g"), MapNode(cardId: "b", x: 420, y: 320, groupId: nil),
                MapNode(cardId: "c", x: 1500, y: 900, groupId: nil)],
        edges: [],
        groups: [MapGroup(id: "g", title: "Walks", hue: 88, x: -40, y: -60, w: 560, h: 400)])

    static func card(_ id: String) -> MapCard {
        MapCard(id: id, authorId: "bob", slug: nil, title: "Card \(id)", story: "A story.", tags: [], visibility: "public",
                publishedAt: nil, mediaURL: nil, accentHue: nil)
    }

    static func store() -> ThoughtMapStore {
        let configuration = APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil })
        return ThoughtMapStore(api: ReadingAPI(client: ResonanceClient.make(configuration)))
    }

    static func showBoard(on store: ThoughtMapStore) {
        store.show(board, cards: Dictionary(uniqueKeysWithValues: ["a", "b", "c"].map { ($0, card($0)) }), resonated: [])
    }

    /// What 顯示全部 makes of the board in a map `size` across.
    static func framed(_ size: CGSize) -> MapCamera {
        let rects = board.nodes.map { mapNodeRect($0.x, $0.y) } + board.groups.map { Rect(x: $0.x, y: $0.y, w: $0.w, h: $0.h) }
        return fitCamera(rects, Double(size.width), Double(size.height))
    }

    /// Every card and region inside the map's visible area.
    static func showsEverything(_ camera: MapCamera, in size: CGSize) -> Bool {
        let rects = board.nodes.map { mapNodeRect($0.x, $0.y) } + board.groups.map { Rect(x: $0.x, y: $0.y, w: $0.w, h: $0.h) }
        return rects.allSatisfy { r in
            r.x * camera.s + camera.x >= 0 && r.y * camera.s + camera.y >= 0
                && (r.x + r.w) * camera.s + camera.x <= Double(size.width)
                && (r.y + r.h) * camera.s + camera.y <= Double(size.height)
        }
    }

    // The iPad Pro 13" in landscape, the map beside the writer's pane at half of it, and the iPad upright.
    let full = CGSize(width: 1376, height: 1032)
    let beside = CGSize(width: 688, height: 1032)
    let upright = CGSize(width: 1032, height: 1376)

    /// Drags one finger across empty paper (the top-left corner, outside the framed board's 70 of margin).
    func pan(_ store: ThoughtMapStore, by dx: CGFloat, _ dy: CGFloat) {
        let finger = Finger()
        store.touchDown(ObjectIdentifier(finger), at: CGPoint(x: 10, y: 10))
        store.touchMove(ObjectIdentifier(finger), to: CGPoint(x: 10 + dx, y: 10 + dy))
        store.touchUp(ObjectIdentifier(finger), at: CGPoint(x: 10 + dx, y: 10 + dy))
    }

    // MARK: Rule 1 — a map shown opens framing everything

    @Test func aMapShownOpensWithEverythingFramedAsTheEyeLeavesIt() {
        let store = Self.store()
        store.beginVisit()
        store.setViewport(full)
        Self.showBoard(on: store)
        #expect(store.framing)
        #expect(store.camera == Self.framed(full))
        #expect(Self.showsEverything(store.camera, in: full))
        // 👁 changes nothing: it is where the map already is.
        store.fit()
        #expect(store.camera == Self.framed(full))
    }

    @Test func theWriterBesideItsPaneFramesEverythingRatherThanCentringItsOwnCard() {
        let store = Self.store()
        store.beginVisit()
        store.setViewport(beside)
        Self.showBoard(on: store)
        // The writer's pane open from the start: its card ("c", far out on the board) is not put at the centre.
        store.settle(on: "c", animated: false)
        #expect(store.camera == Self.framed(beside))
        #expect(Self.showsEverything(store.camera, in: beside))
    }

    @Test func eachVisitOpensFramedWhateverTheCameraWasLastTime() {
        // The session keeps the store between visits: last time the reader panned, in another size.
        let store = Self.store()
        store.beginVisit()
        store.setViewport(full)
        Self.showBoard(on: store)
        pan(store, by: 300, 200)
        #expect(!store.framing)
        // The writer beside its pane, on the next visit.
        store.beginVisit()
        store.setViewport(beside)
        #expect(store.framing)
        #expect(store.camera == Self.framed(beside))
        // The same size as last time (a map page visited again): framed all the same.
        pan(store, by: -120, 40)
        store.beginVisit()
        #expect(store.camera == Self.framed(beside))
    }

    // MARK: Rule 2 — kept framed as the map changes size, a card opened in the pane too

    @Test func everyChangeOfTheMapsSizeFramesEverythingAgain() {
        let store = Self.store()
        store.beginVisit()
        store.setViewport(full)
        Self.showBoard(on: store)
        // A card of mine opened from the map: the pane eases open, the map is half as wide.
        store.setViewport(beside)
        store.settle(on: "a", animated: true)
        #expect(store.camera == Self.framed(beside))
        #expect(Self.showsEverything(store.camera, in: beside))
        // The divider let go wider, the pane hidden, the iPad turned upright, a window resized.
        for size in [CGSize(width: 935, height: 1032), full, upright, CGSize(width: 700, height: 900)] {
            store.setViewport(size)
            #expect(store.camera == Self.framed(size))
        }
    }

    @Test func aSmallSlipOfTheFingerUnderTheFourPixelRuleLeavesItFraming() {
        let store = Self.store()
        store.beginVisit()
        store.setViewport(full)
        Self.showBoard(on: store)
        pan(store, by: 2, 1)
        #expect(store.framing)
        store.setViewport(beside)
        #expect(store.camera == Self.framed(beside))
    }

    // MARK: Rule 3 — once the reader moves the camera, today's behaviour

    @Test func aPanTakesTheCameraAndThePanesCardGlidesToTheCentreAsBefore() {
        let store = Self.store()
        store.beginVisit()
        store.setViewport(full)
        Self.showBoard(on: store)
        pan(store, by: 120, -60)
        #expect(!store.framing)
        let panned = store.camera
        #expect(panned != Self.framed(full))
        // The map narrows beside the pane: the camera stays where the reader left it…
        store.setViewport(beside)
        #expect(store.camera == panned)
        // …and once the width settles, the pane's card comes to the centre at the reader's zoom.
        store.settle(on: "b", animated: false)
        #expect(store.camera == ThoughtMapStore.centred(panned, on: mapNodeRect(420, 320), in: beside))
        #expect(store.camera.s == panned.s)
    }

    @Test func aPinchTakesTheCamera() {
        let store = Self.store()
        store.beginVisit()
        store.setViewport(full)
        Self.showBoard(on: store)
        let one = Finger(), two = Finger()
        store.touchDown(ObjectIdentifier(one), at: CGPoint(x: 10, y: 10))
        store.touchDown(ObjectIdentifier(two), at: CGPoint(x: 60, y: 60))
        // Two fingers down and still: nothing taken yet.
        #expect(store.framing)
        store.touchMove(ObjectIdentifier(two), to: CGPoint(x: 120, y: 120))
        store.touchUp(ObjectIdentifier(two), at: CGPoint(x: 120, y: 120))
        store.touchUp(ObjectIdentifier(one), at: CGPoint(x: 10, y: 10))
        #expect(!store.framing)
        let pinched = store.camera
        store.setViewport(upright)
        #expect(store.camera == pinched)
    }

    @Test func theZoomButtonsTakeTheCameraAndTheEyeHandsItBack() {
        let store = Self.store()
        store.beginVisit()
        store.setViewport(full)
        Self.showBoard(on: store)
        store.zoom(by: 1.2)
        #expect(!store.framing)
        let zoomed = store.camera
        store.setViewport(beside)
        #expect(store.camera == zoomed)
        // 顯示全部: everything framed, and kept framed as the map changes size again.
        store.fit()
        #expect(store.framing)
        #expect(store.camera == Self.framed(beside))
        store.setViewport(upright)
        #expect(store.camera == Self.framed(upright))
        store.settle(on: "c", animated: true)
        #expect(store.camera == Self.framed(upright))
    }

    // MARK: Rule 4 — a board read after the map has its size is framed when it lands

    @Test func aBoardThatLandsAfterTheMapHasItsSizeIsFramedWhenItArrives() {
        let store = Self.store()
        store.beginVisit()
        store.setViewport(beside)
        // Nothing read yet: nothing to frame, and nothing decided for later.
        #expect(!store.loaded)
        Self.showBoard(on: store)
        #expect(store.camera == Self.framed(beside))
        // A later read (a stale visit reading everything again) is framed too, while the camera frames everything.
        store.setViewport(full)
        let wider = ThoughtMapService.Loaded(nodes: Self.board.nodes + [MapNode(cardId: "d", x: -900, y: 1400, groupId: nil)],
                                             edges: [], groups: Self.board.groups)
        store.show(wider, cards: Dictionary(uniqueKeysWithValues: ["a", "b", "c", "d"].map { ($0, Self.card($0)) }), resonated: [])
        let rects = wider.nodes.map { mapNodeRect($0.x, $0.y) } + wider.groups.map { Rect(x: $0.x, y: $0.y, w: $0.w, h: $0.h) }
        #expect(store.camera == fitCamera(rects, Double(full.width), Double(full.height)))
    }

    @Test func aBoardThatLandsBeforeTheMapHasItsSizeIsFramedOnceItHasOne() {
        let store = Self.store()
        store.beginVisit()
        Self.showBoard(on: store)
        store.setViewport(upright)
        #expect(store.camera == Self.framed(upright))
    }
}
