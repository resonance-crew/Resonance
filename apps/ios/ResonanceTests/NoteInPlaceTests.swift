import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// The note, in place (round 26 SETTLED; the owner: 「這個寄小紙條的界面應該不要做成 pop ups，因為它會擋住這個畫面上其他東西」):
/// only 寄小紙條 opens the field, 12 under the capsule (round 30), never a dialog; 共振 opens nothing. Tapping 寄小紙條 again closes an
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

    /// One line at a time under the field, and none at all with nothing to say: the privacy line (「這段話只有作者看得到」,
    /// the first three times) is gone — the owner, 2026-11-19: 「把这段话只有作者会看到这句把它移除掉」.
    @Test func theLineSaysOneThingAtATime() {
        // Why it failed, first.
        #expect(NoteInPlace.line(error: "沒送出去", count: 500) == .error("沒送出去"))
        // Then, past 200, the offer to make it a card.
        #expect(NoteInPlace.line(error: nil, count: 201) == .upgrade)
        // Else nothing, the field's first time or not: no line under it (it said who reads the note).
        #expect(NoteInPlace.line(error: nil, count: 200) == nil)
        #expect(NoteInPlace.line(error: nil, count: 0) == nil)
        // The count only near the limit.
        #expect(!NoteInPlace.showsCount(1799))
        #expect(NoteInPlace.showsCount(1800))
        #expect(NoteInPlace.count("  一二三  ") == 3)
    }

    /// The field has one placeholder in every state (「悄悄告訴作者，哪一段打動你」), the reader's tap on or not: it turned
    /// to 「哪一段讓你有共鳴？」 (card.tap.ask) while the tap was on.
    @Test func theFieldHasOnePlaceholderWhateverTheTap() {
        #expect(NoteInPlace.placeholder == L10n.Card.Note.placeholder)
        #expect(!NoteInPlace.placeholder.isEmpty && NoteInPlace.placeholder != "card.note.placeholder")
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
    }

    /// The field is the composer's input capsule: one line exactly 48 tall, its send segment 52 at the end.
    @Test func theFieldIsTheComposersCapsuleOneLineIn48() {
        let type = ComposerText.current()
        let capsule = NoteFieldCapsule(focused: false, canSend: false, sendLabel: L10n.Card.Tap.send, onSend: {}) {
            TextField("", text: .constant(""), prompt: Text(NoteInPlace.placeholder), axis: .vertical)
                .font(Font(type.font))
                .lineLimit(1...3)
                .padding(.vertical, type.padding)
        }
        let size = UIHostingController(rootView: capsule.frame(width: 362)).sizeThatFits(in: CGSize(width: 362, height: 400))
        #expect(abs(size.height - ComposerMetrics.height) < 1, "\(size.height)")
    }

    /// Round 30 §S3, §S4 (the owner: 「可能它这个讯息框也没有对齐左右的宽度」, 「这个输入框左边要不要显示这个 envelope 的 icon
    /// 呢」, then 「照 C 做」): no envelope — the words start 16 from the capsule's start (they stood 44 in, after its column)
    /// — and the field spans what it is given at every width, its send ending on the edge: no 680 cap on an iPad's or the
    /// Mac's column. The wait line starts where the words do.
    @Test func theFieldHasNoEnvelopeAndSpansTheColumn() throws {
        #expect(NoteInPlace.wordsStart == 16 && NoteFieldCapsule<EmptyView>.wordsStart == 16)
        let column: CGFloat = 900
        let capsule = NoteFieldCapsule(focused: false, canSend: false, sendLabel: L10n.Card.Tap.send, onSend: {}) {
            Color(red: 1, green: 0, blue: 0).frame(width: 40, height: 20)
        }
        let drawn = try DrawnPixels(capsule.frame(width: column).padding(20).background(Tokens.cream))
        let red = (0 ..< drawn.width).filter { x in (0 ..< drawn.height).contains { y in
            let c = drawn.rgb(x, y); return c[0] > 200 && c[1] < 60 && c[2] < 60 } }
        let wordsAt = CGFloat(try #require(red.first)) / 2 - 20
        #expect(abs(wordsAt - 16) < 0.5, "the words start \(wordsAt) in")
        // Nothing drawn before the words but the capsule's own line: across its middle, no envelope's ink (it stood 13
        // to 31 in) between the line's start and the words.
        let paper = try DrawnPixels.paper()
        let ink = try #require(drawn.inkBounds(paper: paper))
        var lead = 0
        for y in (20 + 16) * 2 ..< (20 + 32) * 2 {
            for x in (20 + 6) * 2 ..< (20 + 15) * 2 where zip(drawn.rgb(x, y), paper).reduce(0, { $0 + abs($1.0 - $1.1) }) > 30 {
                lead += 1
            }
        }
        #expect(lead == 0, "\(lead) pixels of ink before the words")
        // The capsule's line reaches the column's end (its send segment's corner), not 680.
        let inkEnd = CGFloat(ink.maxX + 1) / 2 - 20
        #expect(inkEnd > column - 4 && inkEnd < column + 4, "ink ends at \(inkEnd) of \(column)")
        // The wait line, 16 in too.
        let wait = try DrawnPixels(NoteWaitLine().frame(width: 300).background(Tokens.cream))
        let words = try #require(wait.inkBounds(paper: paper))
        #expect(CGFloat(words.minX) / 2 >= 15.5 && CGFloat(words.minX) / 2 <= 18, "\(CGFloat(words.minX) / 2)")
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
