import DesignSystem
import Foundation
import SwiftUI
import Testing
@testable import Resonance

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
}
