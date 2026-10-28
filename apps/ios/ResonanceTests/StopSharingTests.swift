import DesignSystem
import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// Stopping a shared 私人卡 (停止分享) and the warning before one goes anonymous: the held message's list
/// offers 停止分享 on the sender's own message still sharing one; the recipient's thread no longer draws a
/// card whose pass is gone; and the publish step says, under 匿名公開, that a card once shared privately
/// is known to be its author's.
@MainActor @Suite struct StopSharingTests {
    private let at = Date(timeIntervalSince1970: 1_000_000)

    /// A card as GET /cards?keys= answers it, by `author`.
    private func card(_ id: String, by author: String = "alice", published: Bool = true, visibility: String = "public",
                      anonymous: Bool = false) -> FeedCard {
        let authorJSON = anonymous ? "null" : """
        {"id":"\(author)","handle":"\(author)","initials":"AL","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,
         "avatarSeed":"42","verified":false,"region":"TW"}
        """
        let json = """
        {"id":"\(id)","slug":null,"title":"Card \(id)","excerpt":"…","tags":[],
         "publishedAt":\(published ? "\"2026-09-01T08:00:00.000Z\"" : "null"),"author":\(authorJSON),
         "anonymous":\(anonymous),"visibility":"\(visibility)",
         "imageUrl":null,"imageLabel":null,"accentHue":null,"readMinutes":3,"referenceCardId":null,"reason":null}
        """
        return try! JSONDecoder().decode(FeedCard.self, from: Data(json.utf8))
    }

    private func message(from sender: String = "alice", card: String? = "kept", privateShare: Bool = false,
                         delivery: Delivery = .delivered, unsent: Bool = false) -> ChatMessage {
        ChatMessage(id: "m1", senderId: sender, text: "", sentAt: at, cardRef: card, isUnsent: unsent,
                    privateShare: privateShare, delivery: delivery)
    }

    // MARK: The held message's list

    @Test func stopSharingFollowsUnsendInTheList() {
        #expect(MessageMenu.rows(link: false, onLink: false, reply: true, copy: false, unsend: true, stopSharing: true,
                                 report: false, failed: false) == [.reply, .unsend, .stopSharing])
        // Past unsend's day it is still there, alone.
        #expect(MessageMenu.rows(link: false, onLink: false, reply: true, copy: false, unsend: false, stopSharing: true,
                                 report: false, failed: false) == [.reply, .stopSharing])
        // Not asked for: as before.
        #expect(MessageMenu.rows(link: false, onLink: false, reply: true, copy: false, unsend: true, report: false, failed: false)
                == [.reply, .unsend])
        #expect(MessageMenu.Row.stopSharing.icon == .lock)
        #expect(MessageMenu.Row.stopSharing.rawValue == "stop-sharing")
    }

    @Test func onlyTheSendersMessageStillSharingAPrivateCardOffersIt() {
        // The sender's own, delivered, still a pass: at any age.
        #expect(message(privateShare: true).canStopSharing(viewer: "alice"))
        // The recipient's view of it offers nothing to stop; nor a card that is no pass (public, or stopped
        // already), one on its way, or an unsent message.
        #expect(!message(privateShare: true).canStopSharing(viewer: "bob"))
        #expect(!message(privateShare: false).canStopSharing(viewer: "alice"))
        #expect(!message(privateShare: true, delivery: .failed).canStopSharing(viewer: "alice"))
        #expect(!message(privateShare: true, unsent: true).canStopSharing(viewer: "alice"))
        #expect(!message(card: nil, privateShare: true).canStopSharing(viewer: "alice"))
    }

    // MARK: The recipient's thread

    @Test func aPrivateCardWhosePassIsGoneIsNoLongerDrawn() {
        let kept = card("kept", visibility: "private")
        let draft = card("kept", published: false)
        // Bob reads Alice's 私人卡 while her message is his pass to it.
        #expect(ThreadModel.readable(.found(kept), in: message(privateShare: true), viewer: "bob") == .found(kept))
        // Once she stops sharing it (or the message is from before passes), what was read is not drawn: never
        // published or kept private alike.
        #expect(ThreadModel.readable(.found(kept), in: message(privateShare: false), viewer: "bob") == .hidden)
        #expect(ThreadModel.readable(.found(draft), in: message(privateShare: false), viewer: "bob") == .hidden)
        // The bubble then falls back as for any card the viewer can't see (sent alone: nothing to draw).
        let gone = message(privateShare: false)
        let carried = Carried.of(gone, share: gone.cardShare()) { _ in ThreadModel.readable(.found(kept), in: gone, viewer: "bob") }
        #expect(carried == .nothing)
    }

    @Test func everyOtherCardIsAsLookedUp() {
        let kept = card("kept", visibility: "private")
        // The author's own bubbles are untouched.
        #expect(ThreadModel.readable(.found(kept), in: message(privateShare: false), viewer: "alice") == .found(kept))
        // A card readers have: public, or for connections.
        let open = card("open")
        #expect(ThreadModel.readable(.found(open), in: message(card: "open"), viewer: "bob") == .found(open))
        let friends = card("friends", visibility: "connections")
        #expect(ThreadModel.readable(.found(friends), in: message(card: "friends"), viewer: "bob") == .found(friends))
        // Someone else's card than the sender's (the server would never have shared it): as looked up.
        let carols = card("carol-card", by: "carol", visibility: "private")
        #expect(ThreadModel.readable(.found(carols), in: message(card: "carol-card"), viewer: "bob") == .found(carols))
        // A card linked to in words (no cardRef) is the link's to decide.
        let linked = ChatMessage(id: "m2", senderId: "alice", text: "https://resonance.channel/card/kept", sentAt: at)
        #expect(ThreadModel.readable(.found(kept), in: linked, viewer: "bob") == .found(kept))
        // Not read yet, or hidden already: unchanged.
        #expect(ThreadModel.readable(.loading, in: message(), viewer: "bob") == .loading)
        #expect(ThreadModel.readable(.hidden, in: message(), viewer: "bob") == .hidden)
    }

    // MARK: The publish step

    @Test func theWarningShowsOnlyUnderAnonymousPublicForACardOnceShared() {
        #expect(WriteModel.sharedWarning(audience: .anonymous, sharedPrivately: true) == L10n.Write.Visibility.sharedWarning)
        #expect(WriteModel.sharedWarning(audience: .anonymous, sharedPrivately: false) == nil)
        #expect(WriteModel.sharedWarning(audience: .public, sharedPrivately: true) == nil)
        #expect(WriteModel.sharedWarning(audience: .private, sharedPrivately: true) == nil)
        #expect(WriteModel.sharedWarning(audience: nil, sharedPrivately: true) == nil)
    }

    @Test func theStepAsksOnceAndWarnsWithoutHoldingThePublishBack() async {
        let asked = Calls<String>()
        let model = writer(asked: asked) { _ in true }
        #expect(model.sharedWarning == nil)
        model.step = .publish
        #expect(await eventually { model.sharedPrivately })
        // 公開 is chosen: nothing said yet; 匿名公開: the line, and the verb stays.
        #expect(model.sharedWarning == nil)
        model.choose(.anonymous)
        #expect(model.sharedWarning == L10n.Write.Visibility.sharedWarning)
        #expect(PublishStep.verbEnabled(model))
        #expect(model.verbTitle == L10n.Write.PublishPanel.publishAnonymously)
        // Back to writing and on again: asked once for the visit.
        model.step = .write
        model.step = .publish
        #expect(await asked.all == ["card-1"])
    }

    @Test func aFailedQuestionIsNoWarning() async {
        let asked = Calls<String>()
        let model = writer(asked: asked) { _ in throw APIFailure(code: "not_found", message: "No.", status: 404) }
        model.step = .publish
        #expect(await eventually { await asked.all == ["card-1"] })
        model.choose(.anonymous)
        #expect(!model.sharedPrivately && model.sharedWarning == nil)
        #expect(PublishStep.verbEnabled(model))
    }

    /// The writer on one of the viewer's 私人卡, its `privateShares` answered by `answer`.
    private func writer(asked: Calls<String>, answer: @escaping (String) async throws -> Bool) -> WriteModel {
        let server = ServerCalls()
        var calls = server.calls
        calls.privateShares = { id in
            await asked.record(id)
            return try await answer(id)
        }
        var opened = DraftService.OpenedCard(
            id: "card-1", values: DraftValues(title: "A walk", story: "Out in the rain.", visibility: "public", anonymous: false),
            isPublished: false, slug: nil, referenceCardId: nil, hasPendingEdit: false)
        opened.liveVisibility = "private"
        opened.liveAnonymous = false
        let configuration = APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil })
        let writing = WritingAPI(client: ResonanceClient.make(configuration), configuration: configuration)
        return WriteModel(drafts: RecordingDraftStore(), writing: writing, calls: calls, opened: opened)
    }
}
