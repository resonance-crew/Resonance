import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
@testable import Resonance

/// A card as the restore answers it: back as `visibility`, published or never, named or anonymous.
@MainActor private func restored(_ id: String = "c1", published: Bool = true, visibility: String = "public",
                                 anonymous: Bool = false) -> RestoredCard {
    let author = anonymous ? "null" : #"{"id":"alice","handle":"alice","initials":"AL","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,"avatarSeed":"42","verified":false,"region":"TW"}"#
    let json = """
    {"card":{"id":"\(id)","slug":null,"title":"Card \(id)","excerpt":"…","tags":[],
     "publishedAt":\(published ? "\"2026-09-01T08:00:00.000Z\"" : "null"),"author":\(author),"anonymous":\(anonymous),
     "visibility":"\(visibility)","imageUrl":null,"imageLabel":null,"accentHue":140,"readMinutes":2,"referenceCardId":null,
     "reason":null},"changed":true,"droppedResonance":false}
    """
    return try! JSONDecoder().decode(RestoredCard.self, from: Data(json.utf8))
}

/// Round 11 (2026-10-25, late): a picture opened from a thread leaves the thread where it was, the
/// foot's paper fades in over a short 12 from the top edge of what it shows first, the writer and its
/// publish step take the reading page's air, the save state is the title's second line, a tablet's back
/// bar sits a little lower, the trash's cards lose their line and a restore says who reads the card now,
/// and a picture put in a story shows.
@MainActor @Suite struct RoundElevenTests {
    // MARK: §1 — closing a picture leaves the thread where it was

    @Test func aPictureOpenedOverTheKeyboardHoldsTheThreadsFootUntilTheKeyboardIsBack() {
        var hold = KeyboardHold()
        // The keyboard up (336 over a screen whose own foot is the home indicator's 34): its 302 held.
        hold.pictureOpened(bottom: 336, screenFoot: 34, composing: true, searching: false)
        #expect(hold.padding == 302)
        #expect(hold.wasComposing && !hold.wasSearching)
        // The keyboard steps away under the picture: nothing lets go while it is open.
        #expect(hold.release(bottom: 34) == nil)
        #expect(hold.release(bottom: 336) == nil)
        hold.pictureClosed()
        // Away still, then back in steps (its candidate bar after it): held until it is as high as it was.
        #expect(hold.release(bottom: 34) == nil)
        #expect(hold.release(bottom: 308) == nil)
        let released = hold.release(bottom: 336)
        #expect(released?.padding == nil)
        #expect(released?.wasComposing == false)
    }

    @Test func aPictureOpenedWithTheKeyboardDownHoldsNothing() {
        var hold = KeyboardHold()
        hold.pictureOpened(bottom: 34, screenFoot: 34, composing: false, searching: false)
        #expect(hold.padding == nil)
        hold.pictureClosed()
        #expect(hold.release(bottom: 336) == nil)
        // A window without a home indicator (an iPad's 20, or none) measures the keyboard over its own foot.
        #expect(KeyboardHold.keyboard(bottom: 20, screenFoot: 20) == nil)
        #expect(KeyboardHold.keyboard(bottom: 418, screenFoot: 20) == 398)
    }

    @Test func aSecondPictureBeforeTheKeyboardIsBackKeepsWhatTheFirstHeld() {
        var hold = KeyboardHold()
        hold.pictureOpened(bottom: 336, screenFoot: 34, composing: true, searching: false)
        hold.pictureClosed()
        // Opened again while the keyboard is still away: the thread's foot is the first picture's still.
        hold.pictureOpened(bottom: 34, screenFoot: 34, composing: false, searching: false)
        #expect(hold.padding == 302)
        #expect(hold.opened == 2)
        #expect(hold.wasComposing)
        // The search's keyboard is held as the composer's is.
        var searching = KeyboardHold()
        searching.pictureOpened(bottom: 336, screenFoot: 34, composing: false, searching: true)
        #expect(searching.padding == 302 && searching.wasSearching)
        searching.letGo()
        #expect(searching.padding == nil && !searching.wasSearching)
    }

    // MARK: §3 — the foot's paper: a short fade from the top edge of what the foot shows first

    @Test func theFootsPaperFadesInOver12AndGains6OverRidingRows() {
        #expect(ComposerMetrics.fade == 12)
        // Nothing riding: the fade lies over the capsule's top 12, solid from there down.
        #expect(ComposerMetrics.fadeRoom(riding: false) == 0)
        // Riding: 6 over the topmost row, whose ink starts about 6 into it (a 40 picture or tile centred
        // in a 52 row): the fade ends where the rows' ink begins.
        #expect(ComposerMetrics.fadeRoom(riding: true) == 6)
        let inkStart = (ComposerMetrics.rowMinHeight - ComposerMetrics.rowThumb) / 2
        #expect(ComposerMetrics.fadeRoom(riding: true) + inkStart == ComposerMetrics.fade)
    }

    // MARK: §7 — the trash: a restore from the shelf says who reads the card now

    @Test func theRestoreSaysWhoReadsTheCardFromTheAnswersCard() {
        #expect(RestoredAs.of(restored(visibility: "private").card) == .private)
        // Never published: a 私人卡 whatever its visibility says.
        #expect(RestoredAs.of(restored(published: false, visibility: "public").card) == .private)
        #expect(RestoredAs.of(restored(visibility: "public").card) == .public)
        #expect(RestoredAs.of(restored(visibility: "public", anonymous: true).card) == .anonymous)
        #expect(RestoredAs.of(restored(visibility: "connections").card) == .connections)
        #expect(RestoredAs.private.message == L10n.Me.Actions.restoredPrivate)
        #expect(RestoredAs.public.message == L10n.Me.Actions.restoredPublic)
        #expect(RestoredAs.anonymous.message == L10n.Me.Actions.restoredAnonymous)
        #expect(RestoredAs.connections.message == L10n.Me.Actions.restoredConnections)
    }

    @Test func theShelfsRestoreSaysTheAudienceAndEveryOtherRestoreSaysRestored() async {
        func toasts() -> ToastCenter {
            ToastCenter(sleep: { _ in try await Task.sleep(for: .seconds(60)) }, assistive: { false }, announce: { _ in })
        }
        let writer = WriteLauncher()
        let shelf = toasts()
        let came = await TrashMoves.restore("c1", answering: nil, says: .audience,
                                            host: .init(restoreCard: { _ in restored(visibility: "public", anonymous: true) },
                                                        deleteCard: { _ in }, toasts: shelf), writer: writer)
        #expect(came)
        #expect(shelf.current?.message == L10n.Me.Actions.restoredAnonymous)
        // The undo of a move just made, the card page's banner: 「已還原」 as before.
        let undo = toasts()
        await TrashMoves.restore("c1", answering: nil, host: .init(restoreCard: { _ in restored() }, deleteCard: { _ in }, toasts: undo),
                                 writer: writer)
        #expect(undo.current?.message == L10n.Me.Actions.restored)
    }

    // MARK: §8 — a picture put in a story shows on iOS

    @Test func theIslandShowsTheEmulatorsPicturesAndProductionStaysHttpsOnly() throws {
        let html = try String(contentsOf: try #require(Bundle.main.url(forResource: "editor", withExtension: "html")), encoding: .utf8)
        // Production: https, data and blob pictures, and nothing over plain http.
        #expect(EditorPage.imageSources(for: .production).isEmpty)
        let production = EditorPage.contentSecurityPolicy(for: html, imageSources: EditorPage.imageSources(for: .production))
        #expect(production.contains("img-src https: data: blob:;"))
        #expect(!production.contains("http://"))
        // Against the emulators: the dev server's own pictures, under the name they are stored by
        // (localhost) and the one the app asks (127.0.0.1) — that port only.
        let emulator = AppConfig(backend: .emulator, origin: URL(string: "http://127.0.0.1:3201")!)
        #expect(EditorPage.imageSources(for: emulator) == ["http://localhost:3201", "http://127.0.0.1:3201"])
        let local = EditorPage.contentSecurityPolicy(for: html, imageSources: EditorPage.imageSources(for: emulator))
        #expect(local.contains("img-src https: data: blob: http://localhost:3201 http://127.0.0.1:3201;"))
        // Nothing else of the page's policy moves with it.
        #expect(local.replacingOccurrences(of: " http://localhost:3201 http://127.0.0.1:3201", with: "") == production)
        // The handler serves the page under the policy it was given.
        let handler = EditorPageHandler(imageSources: EditorPage.imageSources(for: emulator))
        let served = try #require(handler.resource(for: EditorPage.url(placeholder: "Write")))
        #expect(served.headers["Content-Security-Policy"] == local)
    }
}
