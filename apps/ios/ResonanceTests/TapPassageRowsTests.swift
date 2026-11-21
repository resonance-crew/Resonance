import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit
import Testing
@testable import Resonance

/// Who learns the pick (round 27 §U2, §U3; gate 1: 只有作者): the author's list quotes each person's passage under their
/// name, before the note's excerpt; a reader's list shows a quote on their own row alone — or 選一段 there when the card
/// offers passages and they picked none — and no other row ever carries one, whatever reached the app.
@MainActor @Suite struct TapPassageRowsTests {
    private func person(_ id: String, passage: String? = nil, note: String? = nil) -> TapPerson {
        TapPerson(author: Fixture.author(id), note: note.map { .init(value1: .init(excerpt: $0)) },
                  passage: passage.map { .init(value1: .init(text: $0)) })
    }

    @Test func theAuthorsListQuotesEveryPick() {
        #expect(TapRowLine.of(person("gus", passage: "第一段"), authorList: true, viewer: "alice", offersPassages: false)
            == .quote("第一段"))
        #expect(TapRowLine.of(person("carol", passage: "第二段", note: "謝謝"), authorList: true, viewer: "alice",
                              offersPassages: false) == .quote("第二段"))
        // hana picked none: her row is as before.
        #expect(TapRowLine.of(person("hana"), authorList: true, viewer: "alice", offersPassages: true) == nil)
    }

    @Test func aReadersListQuotesTheirOwnRowAlone() {
        #expect(TapRowLine.of(person("dora", passage: "第二段"), authorList: false, viewer: "dora", offersPassages: true)
            == .quote("第二段"))
        // Another's row: never a quote, nor 選一段, even if one arrived.
        #expect(TapRowLine.of(person("gus", passage: "第一段"), authorList: false, viewer: "dora", offersPassages: true) == nil)
        #expect(TapRowLine.of(person("gus"), authorList: false, viewer: "dora", offersPassages: true) == nil)
        #expect(TapRowLine.of(person("gus", passage: "第一段"), authorList: false, viewer: nil, offersPassages: true) == nil)
    }

    @Test func theirOwnRowOffersAPickOnlyWhenTheCardHasPassages() {
        #expect(TapRowLine.of(person("dora"), authorList: false, viewer: "dora", offersPassages: true) == .pick)
        #expect(TapRowLine.of(person("dora"), authorList: false, viewer: "dora", offersPassages: false) == nil)
    }

    @Test func theQuoteIsTheRoundsQuoteAndThePickItsWords() {
        #expect(TapRowLine.quote("第一段").words == L10n.Card.Tap.passageQuote(text: "第一段"))
        #expect(TapRowLine.quote("第一段").words.contains("第一段"))
        #expect(TapRowLine.pick.words == L10n.Card.Tap.passagePick)
    }

    /// The quote and the note's excerpt both wrap to two lines at most (S9: iOS's note went from 1 to 2, as Android's);
    /// a row with neither stays 60 with its 8 above and below.
    @Test func bothLinesTakeTwoLinesAtMostAndABareRowStays60() {
        #expect(TapListMetrics.lineLimit == 2)
        #expect(TapListMetrics.dialogRow == 60)
        #expect(TapListMetrics.rowPad * 2 + 20 < TapListMetrics.dialogRow)
    }

    @Test func whereARowLeadsIsUnchanged() {
        #expect(TapPersonRow.route(for: person("carol", passage: "第二段", note: "謝謝")) == .thread(handle: "carol", uid: "carol", note: nil))
        #expect(TapPersonRow.route(for: person("gus", passage: "第一段")) == .author("gus"))
    }
}
