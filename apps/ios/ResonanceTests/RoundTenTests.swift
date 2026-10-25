import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Round 10 (2026-10-25): the thought map opens every card of mine in the writer, the thread no longer
/// freezes after a picture is sent, a tap on the thread puts the keyboard away, and the composer's foot.
@MainActor @Suite struct RoundTenTests {
    // MARK: §5 — the thread no longer freezes after a picture is sent

    @Test func aThreadSetAsideGoesBackToItsEdgeInUIKitKeepingItsPlace() {
        let scroll = UIScrollView(frame: CGRect(x: 0, y: 0, width: 402, height: 800))
        scroll.contentSize = CGSize(width: 402, height: 3000)
        let lock = SidewaysLockView()
        scroll.addSubview(lock)
        lock.hold(scroll)
        // Set 16 aside (what the owner saw): straight back to the edge, the vertical place untouched.
        scroll.contentOffset = CGPoint(x: 16, y: 240)
        #expect(scroll.contentOffset == CGPoint(x: 0, y: 240))
        scroll.contentOffset = CGPoint(x: -9, y: 300)
        #expect(scroll.contentOffset == CGPoint(x: 0, y: 300))
        // Scrolling up and down is left alone, and a rounding's worth is no drift.
        scroll.contentOffset = CGPoint(x: 0, y: 1200)
        #expect(scroll.contentOffset == CGPoint(x: 0, y: 1200))
        #expect(!ReplySwipeMath.drifted(offsetX: 0.3) && ReplySwipeMath.drifted(offsetX: 0.6))
        // The edge is where the leading inset puts it.
        scroll.contentInset = UIEdgeInsets(top: 0, left: 10, bottom: 0, right: 0)
        scroll.contentOffset = CGPoint(x: 6, y: 80)
        #expect(scroll.contentOffset == CGPoint(x: -10, y: 80))
        #expect(!scroll.alwaysBounceHorizontal)
    }
}
