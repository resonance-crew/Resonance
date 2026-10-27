import DesignSystem
import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// Round 16 (2026-10-27): the phone's tab bar of glyphs alone (the chosen one its solid twin) that the home
/// feed scrolls out of the way.
@MainActor @Suite struct RoundSixteenTabBarTests {
    @Test func theChosenTabIsItsSolidTwinAndThePenHasNone() {
        let items = MainTabView.tabItems(notifications: 0, messages: 0)
        let chosen = items.map { $0.glyph(selected: true) }
        #expect(chosen == [.sparkleFill, .chatFill, .pen, .bellFill, .cardsFill])
        #expect(items.map { $0.glyph(selected: false) } == [.sparkle, .chat, .pen, .bell, .cards])
        // A 52 bar (it was 60), and a toast still 12 over it.
        #expect(OrganicTabBar<AppTab>.height == 52)
        #expect(ToastPlacement.bottom(.compact, tabBar: true) == 52 + HeaderEdge.height + 12)
    }

    /// Steps the list down (or up) by `steps`, from where it is, and answers whether the bar is hidden after.
    private func scroll(_ rule: inout TabBarScroll, from start: CGFloat, by steps: [CGFloat], limit: CGFloat = 5000) -> Bool {
        var y = start
        var hidden = rule.hidden
        for step in steps {
            y += step
            hidden = rule.scrolled(to: y, limit: limit)
        }
        return hidden
    }

    @Test func itHidesOnlyAfter24OfDownwardScrollPastTheFirst80() {
        var rule = TabBarScroll()
        rule.scrolled(to: 0, limit: 5000)
        // 70 of scroll, all of it within the first 80: still shown.
        #expect(!scroll(&rule, from: 0, by: [10, 10, 10, 10, 10, 10, 10]))
        // Past 80, 23 more is not yet 24…
        var past = TabBarScroll()
        past.scrolled(to: 200, limit: 5000)
        #expect(!scroll(&past, from: 200, by: [10, 10, 3]))
        // …one more is.
        #expect(scroll(&past, from: 223, by: [1]))
    }

    @Test func twelveBackUpBringsItBackAndAFlickerDoesNot() {
        var rule = TabBarScroll()
        rule.scrolled(to: 300, limit: 5000)
        #expect(scroll(&rule, from: 300, by: [30]))
        // 11 up: still away; a step down again starts the count afresh.
        #expect(scroll(&rule, from: 330, by: [-5, -6]))
        #expect(scroll(&rule, from: 319, by: [2, -11]))
        #expect(!scroll(&rule, from: 310, by: [-1]))
    }

    @Test func theTopAndTheEndBringItBack() {
        var rule = TabBarScroll()
        rule.scrolled(to: 300, limit: 1000)
        #expect(scroll(&rule, from: 300, by: [40], limit: 1000))
        // The end of the list (nothing more to read): back.
        #expect(!scroll(&rule, from: 340, by: [660], limit: 1000))
        #expect(scroll(&rule, from: 1000, by: [-500, 40], limit: 1000))
        // The top (a status-bar tap's glide ends there): back.
        #expect(!scroll(&rule, from: 540, by: [-540], limit: 1000))
        // A list shorter than its screen never hides it.
        var short = TabBarScroll()
        short.scrolled(to: 0, limit: 0)
        #expect(!short.scrolled(to: 0, limit: 0))
    }

    @Test func showingItAgainForgetsTheRun() {
        let hiding = TabBarHiding()
        hiding.scrolled(to: 200, limit: 5000)
        hiding.scrolled(to: 240, limit: 5000)
        #expect(hiding.hidden)
        hiding.show()
        #expect(!hiding.hidden)
        hiding.scrolled(to: 250, limit: 5000)
        #expect(!hiding.hidden)
    }
}
