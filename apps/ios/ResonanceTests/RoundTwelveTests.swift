import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

private func writingAPI() -> WritingAPI {
    let configuration = APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil })
    return WritingAPI(client: ResonanceClient.make(configuration), configuration: configuration)
}

/// One of the viewer's 私人卡 as the writer opens it: never published, or published and kept private.
@MainActor private func privateCard(published: Bool, title: String = "A walk", anonymous: Bool = false,
                                    visibility: String = "private") -> DraftService.OpenedCard {
    var opened = DraftService.OpenedCard(
        id: "card-1", values: DraftValues(title: title, story: "Out in the rain.", visibility: visibility, anonymous: anonymous),
        isPublished: published, slug: published ? "a-walk" : nil, referenceCardId: nil, hasPendingEdit: false)
    opened.liveVisibility = visibility
    opened.liveAnonymous = anonymous
    return opened
}

/// Round 12 (2026-10-26): the picture viewer's ✕ stands on a disc of the viewer's own dark, so it reads on a
/// light picture that fills the screen; a 私人卡's ⋯ on its own page leads with 公開發表 — its pen beside it is
/// 編輯 already — which opens the writer at its publish step with 公開 chosen.
@MainActor @Suite struct RoundTwelveTests {
    // MARK: §1–2 — the viewer's ✕

    @Test func theViewersCloseIsACreamGlyphOnAWobblyDiscOfTheViewersInk() {
        #expect(ViewerClose.glyph == 20)
        #expect(ViewerClose.disc == 40)
        #expect(ViewerClose.tapArea == 44)
        // The tap area 16 in from the safe area's top and end: the disc's centre 16 + 22 from them.
        #expect(ViewerClose.inset + ViewerClose.tapArea / 2 == 38)
        // Half strength at rest, deeper pressed — always shown.
        #expect(ViewerClose.alpha(pressed: false) == 0.5)
        #expect(ViewerClose.alpha(pressed: true) == 0.72)
        // The web's BareIconButton disc (wobCircle(50, 50, 46, seed 5, {8, 2.2, 0.4})), at the disc's own radius.
        #expect(ViewerClose.seed == 5)
        #expect(ViewerClose.shape.segments == 8)
        #expect(abs((ViewerClose.shape.mag ?? 0) - 20 * 2.2 / 46) < 1e-9)
        #expect(ViewerClose.shape.cpJitter == 0.4)
        // The same seed draws the same disc every time (no wash re-seeded per press).
        let a = WobCircleShape(seed: ViewerClose.seed, options: ViewerClose.shape).path(in: CGRect(x: 0, y: 0, width: 40, height: 40))
        let b = WobCircleShape(seed: ViewerClose.seed, options: ViewerClose.shape).path(in: CGRect(x: 0, y: 0, width: 40, height: 40))
        #expect(a.description == b.description)
        // About 40 across, its wobble well inside the 44 it is pressed in.
        #expect(a.boundingRect.width > 38 && a.boundingRect.width < ViewerClose.tapArea)
        #expect(a.boundingRect.height > 38 && a.boundingRect.height < ViewerClose.tapArea)
    }

    @Test func theViewersInkIsTheWebsViewerDark() {
        // oklch(12% 0.01 60): a warm near-black, darker than the modal backdrop's ink.
        let ink = UIColor(Tokens.viewerInk)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, alpha: CGFloat = 0
        #expect(ink.getRed(&r, green: &g, blue: &b, alpha: &alpha))
        #expect(alpha == 1)
        #expect(max(r, g, b) < 0.06)
        // Warm: red over blue.
        #expect(r >= b)
    }

    // MARK: §3 — a 私人卡's ⋯ on its own page

    @Test func aPrivateCardsOwnPageLeadsItsMenuWithPublishPublicly() {
        // Its pen is beside the ⋯ (the card page): 公開發表 in 編輯's place, the rest as before.
        #expect(CardActionsMenu.rows(readersSee: false, answering: false, editShown: true) == [.publish, .delete])
        #expect(CardActionsMenu.rows(readersSee: false, answering: true, editShown: true) == [.publish, .unresonate, .delete])
        // The card box's ⋯ has no pen beside it: 編輯 stays.
        #expect(CardActionsMenu.rows(readersSee: false, answering: false) == [.edit, .delete])
        #expect(CardActionsMenu.rows(readersSee: false, answering: true, editShown: false) == [.edit, .unresonate, .delete])
        // A card readers have is unchanged wherever its ⋯ is.
        #expect(CardActionsMenu.rows(readersSee: true, answering: false, editShown: true) == [.edit, .visibility, .delete])
        #expect(CardActionsMenu.rows(readersSee: true, answering: true, editShown: true) == [.edit, .visibility, .unresonate, .delete])
        #expect(L10n.Me.Actions.publishPublicly == "公開發表" || L10n.Me.Actions.publishPublicly == "Publish")
    }

    @Test func publishPubliclyOpensTheWriterAtItsStepOverTheCardsOwnPage() {
        let request = WriteLauncher.publishPubliclyRequest("card-1")
        #expect(request.cardId == "card-1")
        #expect(request.publishPublicly)
        // The card's page is underneath: done, the writer goes back to it rather than opening it again.
        #expect(!request.showsCard)
        #expect(request.referenceCardId == nil && request.story == nil)
        let writer = WriteLauncher()
        writer.publishPublicly("card-1")
        #expect(writer.requested == request)
        // 編輯 opens the writing page, as ever.
        writer.edit("card-1", showsCard: false)
        #expect(writer.requested?.publishPublicly == false)
        #expect(WriteLauncher.Request().publishPublicly == false)
    }

    @Test func theStepStartsAtPublicOrAnonymousPublicForACardMarkedAnonymous() {
        #expect(WriteModel.publicAudience(anonymous: false) == .public)
        #expect(WriteModel.publicAudience(anonymous: true) == .anonymous)
    }

    @Test func aNeverPublishedPrivateCardOpensAtTheStepWithPublicChosen() async {
        let store = RecordingDraftStore()
        let model = WriteModel(drafts: store, writing: writingAPI(), calls: ServerCalls().calls, opened: privateCard(published: false))
        #expect(model.audience == .private)
        #expect(await model.openPublishing())
        #expect(model.step == .publish)
        #expect(model.audience == .public)
        #expect(model.values.visibility == "public" && !model.values.anonymous)
        // The step is 發布這張卡片 with 發布 as its verb; the choice is kept with the draft, as any choice there.
        #expect(model.stepTitle == L10n.Write.PublishPanel.title)
        #expect(model.verbTitle == L10n.Write.PublishPanel.publish)
        #expect(store.writes.map(\.kind) == [.update])
        #expect(store.writes.last?.values.visibility == "public")
        // Still the writer's to change.
        model.choose(.private)
        #expect(model.keepsDraft)
    }

    @Test func aPublishedPrivateCardMarkedAnonymousOpensAtAnonymousPublic() async {
        let store = RecordingDraftStore()
        let model = WriteModel(drafts: store, writing: writingAPI(), calls: ServerCalls().calls,
                               opened: privateCard(published: true, anonymous: true))
        #expect(!model.readersSee)
        #expect(await model.openPublishing())
        #expect(model.step == .publish)
        #expect(model.audience == .anonymous)
        #expect(model.values.visibility == "public" && model.values.anonymous)
        #expect(model.stepTitle == L10n.Write.PublishPanel.title)
        #expect(model.verbTitle == L10n.Write.PublishPanel.publishAnonymously)
        // A live card's choice waits in its buffer until the step's button applies it.
        #expect(store.writes.map(\.kind) == [.edit])
    }

    @Test func aPrivateCardWithoutATitleStaysWritingAndIsAskedForOne() async {
        let model = WriteModel(drafts: RecordingDraftStore(), writing: writingAPI(), calls: ServerCalls().calls,
                               opened: privateCard(published: false, title: ""))
        #expect(await model.openPublishing() == false)
        #expect(model.step == .write)
        #expect(model.titleError)
        // 公開 is chosen all the same: the step shows it once there is a title.
        #expect(model.audience == .public)
    }
}
