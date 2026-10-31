import DesignSystem
import SwiftUI
import Testing

/// The bordered card's outline: a story card is drawn exactly as before; a card far wider than one
/// (the feed's wide invite) turns along its long edges as often per point as a story card does.
@MainActor @Suite struct CardOutlineTests {
    /// The story card's recipe, as it always was.
    func storyPath(_ w: Double, _ h: Double, seed: Double) -> Path {
        wobRect(w, h, min(22, min(w, h) / 2), seed: seed, mag: min(w, h) * 0.025, options: WobRectOptions(
            curve: 0.55, cornerJitter: 0.7, cornerOffset: 4, segmentsH: .range(3, 4), segmentsV: .range(5, 6)))
            .path(offsetX: 0, offsetY: 0)
    }

    @Test func storyCardsAreDrawnAsBefore() {
        for (w, h) in [(460.0, 640.0), (540, 720), (362, 480), (1352, 108)] {
            for seed in [1.0, 17, 211] {
                let drawn = CardOutlineShape(seed: seed).path(in: CGRect(x: 0, y: 0, width: w, height: h))
                #expect(drawn.description == storyPath(w, h, seed: seed).description, "\(w)×\(h) seed \(seed)")
            }
        }
    }

    /// The commands along a path (each turn a curve).
    func curves(_ path: Path) -> Int {
        var n = 0
        path.forEach { if case .curve = $0 { n += 1 } }
        return n
    }

    @Test func aWideCardTurnsAlongItsLength() {
        #expect(CardOutlineShape.turns(460) == .range(4, 5) || CardOutlineShape.turns(460) == .range(3, 4))
        #expect(CardOutlineShape.turns(1352) == .range(10, 11))
        #expect(CardOutlineShape.turns(200) == .range(3, 4))
        let rect = CGRect(x: 0, y: 0, width: 1352, height: 108)
        let wide = curves(CardOutlineShape(seed: 17, alongLength: true).path(in: rect))
        // Four corners, two long edges of 10–11 turns each, two short sides of 2–3 (at the same spacing).
        #expect((4 + 2 * 10 + 2 * 2)...(4 + 2 * 11 + 2 * 3) ~= wide)
        #expect(CardOutlineShape.sideTurns(108) == .range(2, 3))
        #expect(CardOutlineShape.sideTurns(640) == .range(5, 6))
    }
}
