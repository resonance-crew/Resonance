import ResonanceKit
import Testing
@testable import Resonance

/// The owner's ⋯ on a card (the web's CardActionsMenu): a draft publishes nothing from here — its
/// audience is chosen in the writer's publish step — so it is offered no 轉為公開·私人.
@MainActor @Suite struct CardActionsMenuTests {
    @Test func aDraftHasNoVisibilityRow() {
        #expect(CardActionsMenu.rows(published: false, answering: false) == [.edit, .delete])
        #expect(CardActionsMenu.rows(published: false, answering: true) == [.edit, .unresonate, .delete])
    }

    @Test func aPublishedCardKeepsIt() {
        #expect(CardActionsMenu.rows(published: true, answering: false) == [.edit, .visibility, .delete])
        #expect(CardActionsMenu.rows(published: true, answering: true) == [.edit, .visibility, .unresonate, .delete])
    }
}
