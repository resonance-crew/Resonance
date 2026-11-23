import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit
import StoryFormat
import SwiftUI
import Testing
@testable import Resonance

/// Round 29 §S4 (the owner: 「點選這個highlight的字都可以開啟這個誰共振了這一句。那作者的話他可能就可以多看一下那一個人回覆的
/// 小紙條」, 「只列這一段的人」): pressing a picked sentence — its faces or its wash — opens a centred dialog of the people who
/// picked that sentence, newest first, each row as the author's list draws it but without the quote (the sentence is
/// the head), leading where that person's row in the author's list leads. Since Wave 2 #3b a reader's page washes too.
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

    /// Wave 2 #3b (the owner: 「讓讀者也能夠看到自己與別人按的共振高亮與人頭，像按讚一樣大家都可以看到誰按」): a reader's page
    /// washes what the server sends in `picked`, as the author's does — never a draft, a private card, one in the trash,
    /// nor a translation.
    @Test func everyReadersPageInItsOwnWordsWashesWhatTheServerSent() {
        let card = Fixture.card("rich-story", by: "alice")
        var tap = Fixture.tap(mine: true, faces: ["dora", "gus"])
        tap.picked = [picked("14fecaaf", "我坐在地上，第一次覺得安靜是屬於自己的。", people: ["dora", "gus"])]
        let author = Fixture.detail(card, tap: tap, isOwner: true)
        let reader = Fixture.detail(card, tap: tap, isOwner: false)
        #expect(PickedPeople.washes(author, trashed: false, translated: false))
        #expect(PickedPeople.washes(reader, trashed: false, translated: false))
        let readerTap = reader.tap?.value1
        let readerPassages = PickedPeople.passages(readerTap)
        #expect(readerPassages.map(\.id) == ["14fecaaf"])
        #expect(readerPassages.first.map { $0.faces.map(\.id) } == ["dora", "gus"])
        // A reader's answer with no `picked`: nothing washed.
        let bare = Fixture.detail(card, tap: Fixture.tap(faces: ["gus"]), isOwner: false)
        let bareTap = bare.tap?.value1
        let barePassages = PickedPeople.passages(bareTap)
        #expect(barePassages.isEmpty)
        // The gates kept.
        #expect(!PickedPeople.washes(reader, trashed: true, translated: false))
        #expect(!PickedPeople.washes(reader, trashed: false, translated: true))
        #expect(!PickedPeople.washes(Fixture.detail(card, tap: nil, isOwner: false), trashed: false, translated: false))
        #expect(!PickedPeople.washes(Fixture.detail(Fixture.card("p", by: "alice", visibility: "private"), tap: tap, isOwner: true),
                                     trashed: false, translated: false))
        var draft = card
        draft.publishedAt = nil
        #expect(!PickedPeople.washes(Fixture.detail(draft, tap: tap, isOwner: true), trashed: false, translated: false))
        var binned = card
        binned.trashedAt = "2026-11-20T08:00:00.000Z"
        #expect(!PickedPeople.washes(Fixture.detail(binned, tap: tap, isOwner: false), trashed: false, translated: false))
    }

    /// The press on a reader's wash opens the same who-picked-this-sentence dialog as the author's: the page's marks
    /// open it with no owner's gate, and each reader row (no note) leads to that person's profile.
    @Test func aReadersPressOpensWhoPickedThatSentence() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Resonance/Features/Card/CardScreen.swift").standardized
        let source = try String(contentsOf: url, encoding: .utf8)
        let marks = try #require(source.range(of: "private func passageMarks(")).upperBound
        let body = String(source[marks...].prefix(900))
        #expect(body.contains("openPicked(PickedPeople.passage("))
        #expect(!body.contains("isOwner"))
        let gate = try String(contentsOf: url.deletingLastPathComponent().appendingPathComponent("PickedPeople.swift"), encoding: .utf8)
        let washes = try #require(gate.range(of: "static func washes(")).upperBound
        #expect(!String(gate[washes...].prefix(300)).contains("isOwner"))
        // Their own face and wash come in without leaving the page: the card is read again after the tap and the pick.
        let row = try String(contentsOf: url.deletingLastPathComponent().appendingPathComponent("CardEndRow.swift"), encoding: .utf8)
        let pick = try #require(row.range(of: "_ = try await api.setTapPassage(id, passage: choice)")).upperBound
        #expect(String(row[pick...].prefix(200)).contains("reload()"))
        #expect(row.contains("} else if !opens {"))
        #expect(row.contains("rereadAfterDialog()"))
        // A reader's row has no note: to the profile.
        #expect(PickedPeople.route(for: TapPerson(author: Fixture.author("gus"), note: nil, passage: nil)) == .author("gus"))
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

    // MARK: Round 32 §P3 (the owner: 「先跳出一个很高的弹窗，再根据内容缩回实际高度」)

    /// The cause, on iOS: while the people were read the list drew two loading rows whatever the sentence's count, so a
    /// sentence one person picked opened a row (60) too tall and shrank when the list came, one three picked grew. The
    /// loading rows are now as many as the marks say picked it — and laid out, they are exactly the loaded rows' height.
    @Test func theLoadingRowsTakeTheLoadedRowsHeight() {
        for n in 1...3 {
            let passage = PickedPeople.Passage(id: "p", text: "t", people: n, more: false)
            #expect(PickedPeople.loadingRows(passage, cap: 420) == n)
            let loading = dialogSize(TapListState(people: nil, loadingRows: n), width: 400)
            let names = ["gus", "bob", "hana"].prefix(n).map { person($0) }
            let loaded = dialogSize(TapRows(people: Array(names), line: PickedPeople.line(for:)) { _ in }, width: 400)
            #expect(loading.height == loaded.height, "\(n): \(loading.height) vs \(loaded.height)")
        }
        // More than the marks show: enough rows to fill the list's cap, which the page read fills too.
        #expect(PickedPeople.loadingRows(.init(id: "p", text: "t", people: 3, more: true), cap: 420) == 7)
        // Never none (a sentence opened before its marks knew anyone).
        #expect(PickedPeople.loadingRows(.init(id: "p", text: "t"), cap: 420) == 1)
        #expect(PickedPeople.listCap(window: 2000) == 420 && PickedPeople.listCap(window: 600) == 300)
    }

    /// The marks hand the dialog the count: the page opens it with what the author's answer says about the sentence.
    @Test func theDialogIsOpenedWithWhatTheMarksKnow() throws {
        var tap = Fixture.tap(faces: ["gus", "bob", "hana"])
        tap.picked = [picked("p1", "一", people: ["gus"]), picked("p2", "二", people: ["gus", "bob", "hana"], more: true)]
        #expect(PickedPeople.passage(tap, id: "p1", text: "一") == .init(id: "p1", text: "一", people: 1, more: false))
        #expect(PickedPeople.passage(tap, id: "p2", text: "二") == .init(id: "p2", text: "二", people: 3, more: true))
        #expect(PickedPeople.passage(nil, id: "p3", text: "三").people == 0)
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Resonance/Features/Card/PickedPeople.swift").standardized
        let source = try String(contentsOf: url, encoding: .utf8)
        // The list stands from the first frame — not only once the read has begun.
        #expect(source.contains("TapListState(people: people, loadingRows: Self.loadingRows(passage, cap: cap))"))
        #expect(!source.contains("            if let people {\n                ScrollView {"))
    }
}
