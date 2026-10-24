import ResonanceKit
import Testing
@testable import Resonance

/// The owner's ⋯ on a card (the web's CardActionsMenu, round 8 §1.2): a 草稿 — never published, or
/// published and kept private — publishes nothing from here (its type is chosen in the writer's
/// step), so every 草稿's ⋯ is 編輯 · (取消共振) · 刪除; only a card readers can see has 轉為草稿.
@MainActor @Suite struct CardActionsMenuTests {
    @Test func aDraftHasNoVisibilityRow() {
        #expect(CardActionsMenu.rows(readersSee: false, answering: false) == [.edit, .delete])
        #expect(CardActionsMenu.rows(readersSee: false, answering: true) == [.edit, .unresonate, .delete])
    }

    @Test func aCardReadersCanSeeMovesToTheDrafts() {
        #expect(CardActionsMenu.rows(readersSee: true, answering: false) == [.edit, .visibility, .delete])
        #expect(CardActionsMenu.rows(readersSee: true, answering: true) == [.edit, .visibility, .unresonate, .delete])
        #expect(L10n.Me.Actions.makePrivate == "轉為草稿" || L10n.Me.Actions.makePrivate == "Move to drafts")
    }

    @Test func aPublishedPrivateCardIsADraftToo() {
        #expect(CardActionsMenu.readersSee(published: true, visibility: "public"))
        #expect(CardActionsMenu.readersSee(published: true, visibility: "connections"))
        #expect(!CardActionsMenu.readersSee(published: true, visibility: "private"))
        #expect(!CardActionsMenu.readersSee(published: false, visibility: "public"))
    }
}
