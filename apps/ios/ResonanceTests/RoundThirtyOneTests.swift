import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit
import StoryFormat
import Testing
@testable import Resonance

/// Round 31 §R (the owner, 2026-11-23: 「如果我讀翻譯的文章，譬如說中文翻成英文，那我這邊顯示的清單三句應該也要都翻成英文
/// 才對哦……它這個句子還要可以對應回去原本的那個標在畫面上」): while a card's story is on screen in translation, the dialog
/// after 共振 offers the card's passages in the translation's words (the card's order and ids, those the translation lacks
/// left out; a press still sends the id), and each picked sentence is marked on the translated story at the
/// translation's piece, with the same people. A translation that says none behaves as before: no dialog, no marks.
@MainActor @Suite struct RoundThirtyOneTests {
    // rich-story and its English translation as the seed keeps them (scripts/seed/pinned.ts).
    static let original: [TapPassage] = [
        TapPassage(id: "569526aa", text: "箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。窗外有人在慢慢地收衣服。"),
        TapPassage(id: "85007cbf", text: "你不是失去了一個家，你是多了一個可以回去的地方。"),
        TapPassage(id: "8684820a", text: "The quiet after moving out felt like mine — finally."),
    ]
    static let english: [TapPassage] = [
        TapPassage(id: "569526aa", text: "Boxes filled the living room. I sat on the floor and felt, for the first time, that the quiet was mine. Outside, someone was slowly taking in their washing."),
        TapPassage(id: "85007cbf", text: "You did not lose a home; you gained a place to go back to."),
        TapPassage(id: "8684820a", text: "The quiet after moving out felt like mine — finally."),
    ]
    static let englishTitle = "The first quiet night after moving"
    static let englishStory = [
        "Boxes filled the living room. I sat on the floor and felt, for the first time, that **the quiet was mine**. Outside, someone was *slowly* taking in their washing.",
        "## The things that couldn’t come along",
        "Some things were left behind the moment I started packing: the old sofa, a cracked mirror, and [an essay I had read many times](https://example.com/essay).",
        "> You did not lose a home;\n> you gained a place to go back to.",
        "### A list",
        "- Shelve the books by colour\n- Put a pot of mint on the windowsill\n- Write to myself ten years ago",
        "---",
        "The quiet after moving out felt like mine — *finally*.",
    ].joined(separator: "\n\n")

    private func picked(_ id: String, _ text: String, people: [String]) -> TapPicked {
        TapPicked(id: id, text: text, people: people.map { Fixture.author($0) }, more: false)
    }

    // MARK: §R1 — the dialog after 共振

    @Test func theRowsAreTheTranslationsWordsInTheCardsOrderAndIds() {
        // The translation answers its pieces in any order: the rows keep the card's.
        let words = TranslatedPassages.words(translated: true, translation: Self.english.reversed())
        let rows = TranslatedPassages.rows(Self.original, words: words)
        #expect(rows.map(\.id) == Self.original.map(\.id))
        #expect(rows.map(\.text) == Self.english.map(\.text))
        #expect(TranslatedPassages.offers(Self.original, words: words))
        // A press sends the id, as ever: the pick stays the original's, and the reader's earlier pick shows chosen.
        #expect(TapPassageRules.choice(pressing: rows[1].id, current: nil) == "85007cbf")
        #expect(TapPassageRules.choice(pressing: rows[1].id, current: "85007cbf") == nil)
    }

    @Test func aPassageTheTranslationLacksIsNotOffered() {
        let words = TranslatedPassages.words(translated: true, translation: [Self.english[2], Self.english[0]])
        let rows = TranslatedPassages.rows(Self.original, words: words)
        #expect(rows.map(\.id) == ["569526aa", "8684820a"])
        #expect(rows.first?.text == Self.english[0].text)
        // An id the card no longer offers is never a row.
        let stale = TranslatedPassages.rows(Self.original, words: [TapPassage(id: "ffffffff", text: "Gone.")] + [Self.english[1]])
        #expect(stale.map(\.id) == ["85007cbf"])
        // Two said offer the dialog; one alone does not (the original's rule, the web's PASSAGES_MIN) — as before.
        #expect(TranslatedPassages.offers(Self.original, words: words))
        #expect(!TranslatedPassages.offers(Self.original, words: [Self.english[1]]))
        #expect(TranslatedPassages.saysTooFew(Self.original, words: [Self.english[1]]))
    }

    @Test func noPassagesInTheTranslationBehavesAsBefore() {
        for none in [nil, [], [TapPassage(id: "ffffffff", text: "Gone.")], [Self.english[0]]] as [[TapPassage]?] {
            let words = TranslatedPassages.words(translated: true, translation: none)
            #expect(words != nil)
            #expect(TranslatedPassages.rows(Self.original, words: words).count < 2)
            #expect(TranslatedPassages.saysTooFew(Self.original, words: words))
            #expect(!TranslatedPassages.offers(Self.original, words: words))
            // The press that turned 共振 on opens nothing, as before this round.
            #expect(!TapPassageRules.opens(turningOn: true, passages: Self.original,
                                           translated: TranslatedPassages.saysTooFew(Self.original, words: words)))
        }
        // The original: its own passages, as ever.
        let original = TranslatedPassages.words(translated: false, translation: Self.english)
        #expect(original == nil)
        #expect(TranslatedPassages.rows(Self.original, words: original) == Self.original)
        #expect(TranslatedPassages.offers(Self.original, words: original))
        #expect(!TranslatedPassages.offers(Array(Self.original.prefix(1)), words: original))
        #expect(TapPassageRules.opens(turningOn: true, passages: Self.original,
                                      translated: TranslatedPassages.saysTooFew(Self.original, words: original)))
    }

    @Test func theTranslatorKeepsThePassagesItsAnswerSays() async {
        let answer = CardTranslation(to: "en", title: Self.englishTitle, story: Self.englishStory, passages: Self.english)
        let t = StoryTranslator(key: "rich-story", language: .en) { _, _ in answer }
        await t.request()
        #expect(t.showing && t.passages == Self.english)
        // Rows and marks take the translation's script: a Chinese story in English is Latin type.
        #expect(t.story?.type.script == .latin)
        // An older translation (no `passages`): none.
        let older = CardTranslation(to: "en", title: Self.englishTitle, story: Self.englishStory)
        let old = StoryTranslator(key: "rich-story", language: .en) { _, _ in older }
        await old.request()
        #expect(old.showing && old.passages == nil)
    }

    @Test func theEndRowOffersTheTranslationsRows() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Resonance/Features/Card/CardEndRow.swift").standardized
        let row = try String(contentsOf: url, encoding: .utf8)
        #expect(row.contains("TapPassages(passages: passageRows, picked: tap.passage"))
        #expect(row.contains("TapPassageRules.opens(turningOn: turningOn, passages: tap.passages, translated: saysTooFew)"))
        #expect(!row.contains("&& !translated }"))
        let screen = try String(contentsOf: url.deletingLastPathComponent().appendingPathComponent("CardScreen.swift"), encoding: .utf8)
        #expect(screen.contains("translationWords: translator?.passages"))
    }

    // MARK: §R2 — the marks

    @Test func thePickedSentencesTakeTheTranslationsWordsAndPeople() {
        var tap = Fixture.tap(faces: ["gus", "bob", "carol"])
        tap.picked = [
            picked("569526aa", Self.original[0].text, people: ["gus", "bob"]),
            picked("85007cbf", Self.original[1].text, people: ["carol"]),
            // An older pick no longer offered: not in the translation's pieces, not marked in it.
            picked("0a0a0a0a", "舊的一句。", people: ["eli"]),
        ]
        let words = TranslatedPassages.words(translated: true, translation: Self.english)
        let marks = PickedPeople.passages(tap, words: words, language: .en)
        #expect(marks.map(\.id) == ["569526aa", "85007cbf"])
        #expect(marks.map(\.text) == [Self.english[0].text, Self.english[1].text])
        #expect(marks[0].faces.map(\.id) == ["gus", "bob"])
        #expect(marks[1].faces.map(\.id) == ["carol"])
        // The original draws the original's marks, as today; a translation saying none draws none.
        #expect(PickedPeople.passages(tap, language: .en).map(\.text) == [Self.original[0].text, Self.original[1].text, "舊的一句。"])
        #expect(PickedPeople.passages(tap, words: TranslatedPassages.words(translated: true, translation: nil)).isEmpty)
        // The marks draw every picked id the translation says, even one alone (the dialog would not be offered).
        let one = PickedPeople.passages(tap, words: TranslatedPassages.words(translated: true, translation: [Self.english[1]]))
        #expect(one.map(\.id) == ["85007cbf"] && one.first?.text == Self.english[1].text)
        // A translation that says none is not washed; one that says them is, as the original.
        let reader = Fixture.detail(Fixture.card("rich-story", by: "alice"), tap: tap, isOwner: false)
        #expect(PickedPeople.washes(reader, trashed: false, translated: false))
        #expect(!PickedPeople.washes(reader, trashed: false, translated: true))
    }

    @Test func eachPieceIsFoundInTheTranslatedStory() {
        let read = CardModel.read(title: Self.englishTitle, story: Self.englishStory)
        let sentences = Self.english.map { (id: $0.id, text: $0.text) }
        let marks = PassageLeaves.marks(read.blocks, sentences: sentences).values.flatMap { $0 }.sorted { $0.order < $1.order }
        // The first paragraph's (its bold and italics only type), the quote's (a soft break read as a space), the last.
        #expect(marks.map(\.id) == ["569526aa", "85007cbf", "8684820a"])
        let leaves = PassageLeaves.leaves(read.blocks)
        for mark in marks {
            let leaf = leaves.first { leaf in PassageLeaves.marks(read.blocks, sentences: sentences)[leaf.path]?.contains(mark) == true }
            #expect(leaf != nil, "\(mark.id)")
        }
    }

    @Test func theCardPageMarksTheTranslationAtItsPieces() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Resonance/Features/Card/CardScreen.swift").standardized
        let source = try String(contentsOf: url, encoding: .utf8)
        let marks = try #require(source.range(of: "private func passageMarks(")).upperBound
        let body = String(source[marks...].prefix(900))
        #expect(body.contains("words: [TapPassage]?"))
        #expect(body.contains("PickedPeople.passages(detail.tap?.value1, words: words)"))
        #expect(source.contains("translation: translator?.passages)))"))
    }
}
