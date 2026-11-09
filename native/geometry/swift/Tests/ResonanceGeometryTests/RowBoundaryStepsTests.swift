import Testing
@testable import ResonanceGeometry

// rowBoundary's `steps` (round 23): a menu's 4 by default — what the fixtures pin — and more for a list's
// bands, which run a window's width. Kotlin's Lines.kt takes the same parameter.

struct RowBoundaryStepsTests {
    @Test func theDefaultIsAMenusFourTurns() {
        let menu = rowBoundary(y: 40, w: 280, seed: 9, amp: 2, pad: 6)
        let four = rowBoundary(y: 40, w: 280, seed: 9, amp: 2, pad: 6, steps: 4)
        #expect(menu.count == 7)
        #expect(zip(menu, four).allSatisfy { $0.x == $1.x && $0.y == $1.y })
    }

    @Test func moreStepsSpreadTheTurnsEvenlyAndKeepTheEndsFlat() {
        let w = 1180.0, y = 30.0
        let band = rowBoundary(y: y, w: w, seed: 4242, amp: 2, pad: 0, steps: 12)
        // The two pads and steps + 1 points across.
        #expect(band.count == 15)
        for k in 0...12 {
            #expect(abs(band[k + 1].x - jsRound2(Double(k) / 12 * w)) < 1e-9)
        }
        // Flat where it meets the band's ends; never past its swing anywhere between.
        #expect(band[1].y == y && band[13].y == y && band.first?.y == y && band.last?.y == y)
        #expect(band.allSatisfy { abs($0.y - y) <= 2 })
        // Somewhere it does swing (a curve, not a rule).
        #expect(band.contains { abs($0.y - y) > 0.2 })
    }

    @Test func theSameSeedDrawsTheSameCurveAtAnyHeight() {
        // A band's bottom curve and the next band's top one are one curve: the swing doesn't depend on y
        // (within the hundredth both are rounded to).
        let a = rowBoundary(y: 0, w: 402, seed: 77, amp: 2, pad: 0, steps: 4)
        let b = rowBoundary(y: 64, w: 402, seed: 77, amp: 2, pad: 0, steps: 4)
        #expect(zip(a, b).allSatisfy { abs(($1.y - 64) - $0.y) <= 0.0101 && $0.x == $1.x })
    }
}
