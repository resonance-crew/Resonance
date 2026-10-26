import DesignSystem
import Foundation
import ResonanceKit
import StoryFormat
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// What spares the app work on every update, without changing what it draws: the route action every
/// page reads counts as the same for the same tab, a thread's row is told only its own marks, and
/// formatters, faces, colours, the editor's page and a card's story are made once — each the very
/// thing that was made every time before.
@MainActor @Suite struct RedrawCostTests {
    @Test func aTabsRouteActionIsTheSameWhateverClosuresItWasMadeWith() {
        let feed = OpenRouteAction(tab: .feed, push: { _ in })
        #expect(feed == OpenRouteAction(tab: .feed, push: { _ in }, popToRoot: {}, replaceTop: { _ in }))
        #expect(feed != OpenRouteAction(tab: .messages, push: { _ in }))
        #expect(OpenRouteAction(push: { _ in }) == OpenRouteAction(push: { _ in }))
    }
}
