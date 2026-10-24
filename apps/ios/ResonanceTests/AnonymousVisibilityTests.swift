import ResonanceKit
import Testing
@testable import Resonance

/// An anonymous card is public or its author's alone: never for connections, who would learn who
/// wrote it (the publish panel, and what publishing or saving sends).
@Suite struct AnonymousVisibilityTests {
    @Test func aConnectionsCardMadeAnonymousGoesPublic() {
        #expect(WriteModel.visibility("connections", anonymous: true) == "public")
    }

    @Test func publicAndPrivateStayAsChosen() {
        #expect(WriteModel.visibility("public", anonymous: true) == "public")
        #expect(WriteModel.visibility("private", anonymous: true) == "private")
    }

    @Test func aNamedCardKeepsAnyAudience() {
        for visibility in ["public", "connections", "private"] {
            #expect(WriteModel.visibility(visibility, anonymous: false) == visibility)
        }
    }

    /// The card's ⋯ says what turning a private card public does: an anonymous one comes back
    /// anonymous (轉為匿名公開), a named one public (轉為公開); a public one goes private either way.
    @MainActor @Test func theMenuSaysAnAnonymousCardComesBackAnonymous() {
        #expect(CardActionsMenu.visibilityLabel(private: true, anonymous: true) == L10n.Me.Actions.makePublicAnonymous)
        #expect(CardActionsMenu.visibilityLabel(private: true, anonymous: false) == L10n.Me.Actions.makePublic)
        #expect(CardActionsMenu.visibilityLabel(private: false, anonymous: true) == L10n.Me.Actions.makePrivate)
        #expect(CardActionsMenu.visibilityLabel(private: false, anonymous: false) == L10n.Me.Actions.makePrivate)
    }
}
