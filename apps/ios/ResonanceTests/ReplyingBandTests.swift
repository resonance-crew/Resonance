import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Writing a card that answers another (round 26 §U6): the writer says which one, over the title — a 44 row with the
/// original's cover at 36 and 「回應〈一場雨後的散步〉」 — and a tap reads it again in a centred dialog.
@MainActor @Suite struct ReplyingBandTests {
    @Test func itNamesTheCardBeingAnswered() {
        #expect(ReplyingBand.label(title: "一場雨後的散步") == L10n.Card.replying(title: "一場雨後的散步"))
        #expect(ReplyingBand.label(title: "一場雨後的散步").contains("一場雨後的散步"))
    }

    @Test func itIsA44RowWithA36Cover() {
        #expect(ReplyingBand.height == 44)
        #expect(ReplyingBand.cover == 36)
        let label = ReplyingBandLabel(title: "一場雨後的散步", cover: nil, hue: 140, seed: 3)
        let size = UIHostingController(rootView: label.frame(width: 362)).sizeThatFits(in: CGSize(width: 362, height: 400))
        #expect(abs(size.height - 44) < 0.5, "\(size.height)")
    }

    @Test func aLongTitleStaysOneLine() {
        let long = String(repeating: "很長的標題", count: 20)
        let label = ReplyingBandLabel(title: long, cover: nil, hue: nil, seed: 3)
        let size = UIHostingController(rootView: label.frame(width: 362)).sizeThatFits(in: CGSize(width: 362, height: 400))
        #expect(abs(size.height - 44) < 0.5)
    }
}
