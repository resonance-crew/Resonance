import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// The note, in place (round 26 SETTLED; the owner: 「這個寄小紙條的界面應該不要做成 pop ups，因為它會擋住這個畫面上其他東西」):
/// only 寄小紙條 opens the field, under the faces' row, never a dialog; 共振 opens nothing. Tapping 寄小紙條 again closes an
/// empty field and only focuses a written one; a draft opens the field with the page; one line under the field says one
/// thing at a time; a failure while the page is there brings the field back on the words, saying why.
@MainActor @Suite(.serialized) struct NoteInPlaceTests {
    @Test func theSegmentOpensClosesAnEmptyFieldAndOnlyFocusesAWrittenOne() {
        #expect(NoteInPlace.segmentTap(open: false, text: "") == .open)
        #expect(NoteInPlace.segmentTap(open: false, text: "寫了一半") == .open)
        #expect(NoteInPlace.segmentTap(open: true, text: "  \n") == .close)
        // Words are never hidden behind the segment.
        #expect(NoteInPlace.segmentTap(open: true, text: "寫了一半") == .focus)
    }

    @Test func theLineSaysOneThingAtATime() {
        // Why it failed, first.
        #expect(NoteInPlace.line(error: "沒送出去", count: 500, privacy: true) == .error("沒送出去"))
        // Then, past 200, the offer to make it a card.
        #expect(NoteInPlace.line(error: nil, count: 201, privacy: true) == .upgrade)
        #expect(NoteInPlace.line(error: nil, count: 200, privacy: true) == .privacy)
        // Then that only the author sees it (the first three times); else nothing.
        #expect(NoteInPlace.line(error: nil, count: 10, privacy: false) == nil)
        // The count only near the limit.
        #expect(!NoteInPlace.showsCount(1799))
        #expect(NoteInPlace.showsCount(1800))
        #expect(NoteInPlace.count("  一二三  ") == 3)
    }

    @Test func theFieldAsksWhichPartOnceTheReaderResonated() {
        #expect(NoteInPlace.placeholder(tapOn: true) == L10n.Card.Tap.ask)
        #expect(NoteInPlace.placeholder(tapOn: false) == L10n.Card.Note.placeholder)
    }

    @Test func aDraftOpensTheFieldWithThePage() {
        #expect(NoteInPlace.opensOnArrival(draft: "還沒寄出的話"))
        #expect(!NoteInPlace.opensOnArrival(draft: nil))
        #expect(!NoteInPlace.opensOnArrival(draft: " \n "))
    }

    @Test func itGrowsToThreeLinesOnAPhoneFiveWider() {
        #expect(NoteInPlace.maxLines(compact: true, shortWindow: false) == 3)
        #expect(NoteInPlace.maxLines(compact: true, shortWindow: true) == 2)
        #expect(NoteInPlace.maxLines(compact: false, shortWindow: false) == 5)
        // A phone's column; wider, the story's column up to 680.
        #expect(NoteInPlace.width(compact: true, column: 402) == nil)
        #expect(NoteInPlace.width(compact: false, column: 900) == 680)
        #expect(NoteInPlace.width(compact: false, column: 600) == 600)
    }

    /// The field is the composer's input capsule: one line exactly 48 tall, its send segment 52 at the end.
    @Test func theFieldIsTheComposersCapsuleOneLineIn48() {
        let type = ComposerText.current()
        let capsule = NoteFieldCapsule(focused: false, canSend: false, sendLabel: L10n.Card.Tap.send, onSend: {}) {
            TextField("", text: .constant(""), prompt: Text(L10n.Card.Tap.ask), axis: .vertical)
                .font(Font(type.font))
                .lineLimit(1...3)
                .padding(.vertical, type.padding)
        }
        let size = UIHostingController(rootView: capsule.frame(width: 362)).sizeThatFits(in: CGSize(width: 362, height: 400))
        #expect(abs(size.height - ComposerMetrics.height) < 1, "\(size.height)")
    }

    /// The envelope in the field's lead column is the web's (round 26, the screens' review): 18, the muted text ink, with
    /// the icon's own pen (INK_STRONG) — it wore the lighter INK here. Android's NoteLeadGlyph is the same.
    @Test func theEnvelopeWearsTheIconsOwnPenInTheMutedInk() throws {
        #expect(NoteLeadGlyph.size == 18)
        #expect(NoteFieldCapsule<EmptyView>.leadGlyph == 18)
        let drawn = try DrawnPixels(NoteLeadGlyph().background(Tokens.cream))
        let web = try DrawnPixels(OrganicIcon(.note, size: 18, color: Tokens.textMuted).background(Tokens.cream))
        let difference = try #require(drawn.difference(web), "drawn \(drawn.width) × \(drawn.height)")
        #expect(difference <= 8, "\(difference)")
        // The lighter pen it wore is told apart.
        let before = try DrawnPixels(OrganicIcon(.note, size: 18, color: Tokens.textMuted, strokeWidth: Tokens.ink).background(Tokens.cream))
        #expect((drawn.difference(before) ?? .max) > 8)
    }

    @Test func aFailureWhileThePageIsThereOpensTheFieldAgainSayingWhy() {
        let sends = NoteSends()
        sends.host("c1", true)
        #expect(sends.isHosted("c1"))
        sends.reopen("c1", why: L10n.Messages.sendError)
        let request = sends.reopening
        #expect(request?.cardId == "c1")
        #expect(request?.why == L10n.Messages.sendError)
        if let request { sends.take(request) }
        #expect(sends.reopening == nil)
        // The toast's 再寄一次 (the page gone by then) says nothing more in the field: the toast said it.
        sends.reopen("c1")
        #expect(sends.reopening?.why == nil)
    }

    @Test func theWordsStayOnTheDeviceUntilTheyGo() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: "note-in-place-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let drafts = NoteDrafts(root: root)
        drafts.keep("哪一段：雨停的那段", uid: "alice", cardId: "c1")
        #expect(NoteInPlace.opensOnArrival(draft: drafts.text(uid: "alice", cardId: "c1")))
        // Emptied, it goes, and the field no longer opens with the page.
        drafts.keep("  ", uid: "alice", cardId: "c1")
        #expect(!NoteInPlace.opensOnArrival(draft: drafts.text(uid: "alice", cardId: "c1")))
    }

    @Test func aRefusalIsSaidInTheAppsWords() {
        #expect(NoteFailure(APIFailure(code: "conflict", message: "Wait.", status: 409)).message == L10n.Card.Note.waitForReply)
        #expect(NoteFailure(APIFailure(code: "conflict", message: "Wait.", status: 409)).refused)
        #expect(!NoteFailure(URLError(.notConnectedToInternet)).refused)
    }
}
