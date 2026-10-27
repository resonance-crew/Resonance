import DesignSystem
import Foundation
import Testing
@testable import Resonance

/// Round 17, the owner's two asks from the devices: a tap on the publish step's paper puts the keyboard away
/// (「點擊畫面空白處，應該可以把鍵盤收起來」), and a reaction sticker grows under the finger, Instagram's way
/// (「被點擊的時候變大」).
@MainActor @Suite struct RoundSeventeenTapAwayTests {
    /// The tag field's capsule as the step lays it out on a phone: 20 in, 48 tall.
    let field = CGRect(x: 20, y: 640, width: 362, height: 48)

    @Test func aTapBesideTheFieldPutsTheKeyboardAway() {
        // Between the sections, on the preview's words, on a label, below the foot: all beside the field.
        for point in [CGPoint(x: 200, y: 600), CGPoint(x: 120, y: 300), CGPoint(x: 30, y: 620),
                      CGPoint(x: 200, y: 700), CGPoint(x: 200, y: 1400), CGPoint(x: 5, y: 660)] {
            #expect(PublishStep.tapPutsKeyboardAway(at: point, field: field))
        }
    }

    @Test func aTapOnTheFieldIsTheFieldsOwn() {
        // Its text (the caret moves) and its end segment (新增 adds the word, the keyboard stays: round 17 §4).
        for point in [CGPoint(x: 60, y: 664), CGPoint(x: 340, y: 664), CGPoint(x: 21, y: 641), CGPoint(x: 381, y: 687)] {
            #expect(!PublishStep.tapPutsKeyboardAway(at: point, field: field))
        }
    }

    @Test func beforeTheFieldIsPlacedEveryTapIsBesideIt() {
        #expect(PublishStep.tapPutsKeyboardAway(at: CGPoint(x: 60, y: 664), field: .null))
    }
}

@MainActor @Suite struct RoundSeventeenStickerPressTests {
    @Test func aPressedStickerGrowsAndRisesOnASpring() {
        #expect(PressMetrics.stickerPressScale == 1.45)
        #expect(PressMetrics.stickerPressRise == 6)
        #expect(PressMetrics.stickerPressResponse == 0.25 && PressMetrics.stickerPressDamping == 0.6)
        // Under Reduce Motion it doesn't grow: a light fade.
        #expect(PressMetrics.stickerPressFade == 0.7)
        // Grown, the 32 sticker still reaches no further than 8 over its 44 cell (the tray stands 8 over the message).
        let reach = PressMetrics.traySticker * PressMetrics.stickerPressScale / 2 + PressMetrics.stickerPressRise
            - PressMetrics.trayCell / 2
        #expect(reach <= PressMetrics.trayGap)
    }

    @Test func theFingerPressesTheStickerWhoseColumnItIsIn() {
        let middle = PressMetrics.trayHeight / 2
        for i in 0..<5 {
            let x = (CGFloat(i) + 0.5) * PressMetrics.trayCell
            #expect(PressMetrics.trayIndex(at: CGPoint(x: x, y: middle)) == i)
        }
        // The cells' edges: each cell is its own from its leading edge.
        #expect(PressMetrics.trayIndex(at: CGPoint(x: 0, y: middle)) == 0)
        #expect(PressMetrics.trayIndex(at: CGPoint(x: 44, y: middle)) == 1)
        #expect(PressMetrics.trayIndex(at: CGPoint(x: 219.5, y: middle)) == 4)
    }

    @Test func aFingerSlidOffTheTrayPressesNone() {
        let slop = PressMetrics.trayPressSlop
        // A little above or below (over the grown sticker, say) still presses its column's.
        #expect(PressMetrics.trayIndex(at: CGPoint(x: 66, y: -slop)) == 1)
        #expect(PressMetrics.trayIndex(at: CGPoint(x: 66, y: PressMetrics.trayHeight + slop)) == 1)
        // Further off, or past either end: none, and lifting there chooses none.
        #expect(PressMetrics.trayIndex(at: CGPoint(x: 66, y: -slop - 1)) == nil)
        #expect(PressMetrics.trayIndex(at: CGPoint(x: 66, y: PressMetrics.trayHeight + slop + 1)) == nil)
        #expect(PressMetrics.trayIndex(at: CGPoint(x: -1, y: 22)) == nil)
        #expect(PressMetrics.trayIndex(at: CGPoint(x: PressMetrics.trayWidth, y: 22)) == nil)
    }
}
