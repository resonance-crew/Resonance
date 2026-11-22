import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit
import StoryFormat
import Testing
@testable import Resonance

/// Round 29 §S4 (the owner: 「點選這個highlight的字都可以開啟這個誰共振了這一句。那作者的話他可能就可以多看一下那一個人回覆的
/// 小紙條」, 「只列這一段的人」): pressing a picked sentence — its faces or its wash — opens a centred dialog of the people who
/// picked that sentence, newest first, each row as the author's list draws it but without the quote (the sentence is
/// the head), leading where that person's row in the author's list leads. Only the author's own page washes anything.
@MainActor @Suite struct PickedPeopleTests {
    private func person(_ id: String, note: String? = nil) -> TapPerson {
        TapPerson(author: Fixture.author(id), note: note.map { .init(value1: .init(excerpt: $0)) }, passage: .init(value1: .init(text: "不該出現的引文")))
    }

    private func picked(_ id: String, _ text: String, people: [String], more: Bool = false) -> TapPicked {
        TapPicked(id: id, text: text, people: people.map { Fixture.author($0) }, more: more)
    }

    /// §S12 (the owner, 2026-11-22: one set of measures on the three platforms): the pop-up's sentence is the story's
    /// face at 16 × the reading text scale (it followed no text size before) on the story's compact leading — 1.8 for a
    /// CJK story, 1.6 for a Latin one (≈ 1.91 before, a fixed 8 of line spacing) — as the passages dialog sets its rows.
    @Test func theSentenceIsSetAsTheStorysLinesAtTheReadingSize() throws {
        let reading = TextScale.readingFactor(relativeTo: .body)
        for script in [StoryScript.cjk, .latin] {
            let font = PickedPeople.sentenceFont(script: script)
            let story = StoryTypography(script: script, compact: true)
            #expect(abs(font.pointSize - 16 * reading) < 0.01, "\(script): \(font.pointSize)")
            #expect(font.fontName == AppFonts.storyUIFont(story.bodyFamily, size: 16, relativeTo: .body).fontName)
        }
        #expect(PickedPeople.sentenceLeading(script: .cjk) == 1.8)
        #expect(PickedPeople.sentenceLeading(script: .latin) == 1.6)
        // The dialog sets it so: in CSS line boxes of that leading, never SwiftUI's fixed-size line spacing.
        let source = try String(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Resonance/Features/Card/PickedPeople.swift").standardized, encoding: .utf8)
        #expect(source.contains("lineHeight: Self.sentenceLeading(script: script)"))
        #expect(!source.contains(".lineSpacing("))
        #expect(source.contains("accessibilityIdentifier(\"tap-picked-passage\")"))
    }

    @Test func theAuthorsAnswerBecomesTheStorysPassages() {
        var tap = Fixture.tap(faces: ["gus", "bob", "carol"])
        tap.picked = [
            picked("14fecaaf", "我坐在地上，第一次覺得安靜是屬於自己的。", people: ["gus", "bob"]),
            picked("8b3a1c4d", "窗外有人在慢慢地收衣服。", people: ["carol", "dora", "eli", "fay"], more: true),
            picked("00000000", "沒有人留下。", people: []),
        ]
        let passages = PickedPeople.passages(tap, language: .zhTW)
        #expect(passages.map(\.id) == ["14fecaaf", "8b3a1c4d"])
        // Newest first, at most three, and the names heard — 等人 when there are more, never a count.
        #expect(passages[0].faces.map(\.id) == ["gus", "bob"])
        #expect(passages[0].spoken == L10n.Card.Tap.pickedBy(names: "gus、bob"))
        #expect(passages[1].faces.map(\.id) == ["carol", "dora", "eli"])
        #expect(passages[1].spoken == L10n.Card.Tap.pickedByMore(names: "carol、dora、eli"))
        #expect(!passages[1].spoken.contains { $0.isASCII && $0.isNumber })
        #expect(PickedPeople.spoken([Fixture.author("gus"), Fixture.author("bob")], more: false, language: .en)
            == L10n.Card.Tap.pickedBy(names: "gus, bob"))
        // A reader's answer (no `picked`) and no answer: nothing.
        #expect(PickedPeople.passages(Fixture.tap(faces: ["gus"])).isEmpty)
        #expect(PickedPeople.passages(nil).isEmpty)
    }

    @Test func onlyTheAuthorsOwnPageInItsOwnWordsWashes() {
        let card = Fixture.card("rich-story", by: "alice")
        let author = Fixture.detail(card, tap: Fixture.tap(faces: ["gus"]), isOwner: true)
        let reader = Fixture.detail(card, tap: Fixture.tap(faces: ["gus"]), isOwner: false)
        #expect(PickedPeople.washes(author, trashed: false, translated: false))
        #expect(!PickedPeople.washes(reader, trashed: false, translated: false))
        #expect(!PickedPeople.washes(author, trashed: true, translated: false))
        #expect(!PickedPeople.washes(author, trashed: false, translated: true))
        #expect(!PickedPeople.washes(Fixture.detail(card, tap: nil, isOwner: true), trashed: false, translated: false))
    }

    @Test func aRowHasNoQuoteAndLeadsWhereTheAuthorsListLeads() {
        let carol = person("carol", note: "讀到搬家那段，好像看見自己。")
        #expect(PickedPeople.line(for: carol) == nil)
        #expect(PickedPeople.route(for: carol) == TapPersonRow.route(for: carol))
        #expect(PickedPeople.route(for: carol) == .thread(handle: "carol", uid: "carol", note: nil))
        #expect(PickedPeople.route(for: person("gus")) == .author("gus"))
    }

    @Test func itIsTheWhoResonatedDialogsShellAndWidths() {
        #expect(PickedPeople.width(compact: true) == 400)
        #expect(PickedPeople.width(compact: false) == 480)
    }

    /// The people are read a page at a time (顯示更多 the next), each person once.
    @Test func itReadsThatSentencesPeopleAPageAtATime() async {
        let pages: [String?: TapList] = [
            nil: TapList(people: [person("gus"), person("bob")], nextPageToken: "two"),
            "two": TapList(people: [person("bob"), person("hana")], nextPageToken: nil),
        ]
        let people = TapPeople { token in pages[token]! }
        await people.load()
        #expect(people.people.map(\.author.id) == ["gus", "bob"])
        await people.more()
        #expect(people.people.map(\.author.id) == ["gus", "bob", "hana"])
        #expect(people.next == nil)
    }

    /// The Mac's `card-picked-people` opened an empty paper: the dialog's content read `picked` only inside the cover's
    /// closure, so the page's body depended on neither it nor the open flag, and the cover's first build still saw nil.
    /// The page reads the passage in its body and the dialog draws that value.
    @Test func theDialogDrawsThePassageThePageRead() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Resonance/Features/Card/CardScreen.swift").standardized
        let source = try String(contentsOf: url, encoding: .utf8)
        #expect(source.contains("let pickedPassage = picked"))
        #expect(source.contains("if let pickedPassage {"))
        #expect(!source.contains("if let picked {"))
    }
}
