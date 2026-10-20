import Foundation
import ResonanceKit
import StoryFormat
import Testing

/// How a story is set by its script — the rule the reader, the writer, a share card and the
/// publish panel's mirror share with the web and Android (src/lib/text/script.ts), case by case
/// from native/fixtures/story-script.json, the file script.test.ts reads.
@Suite struct StoryScriptTests {
    struct Fixture: Decodable {
        struct Case: Decodable {
            let id: String
            let title: String
            let story: String
            let fallback: String?
            let script: String
            let lang: String?
        }
        struct Locale: Decodable {
            let locale: String
            let script: String
        }
        struct Writer: Decodable {
            let id: String
            let current: String
            let title: String
            let story: String
            let script: String
        }
        struct Marks: Decodable {
            let text: String
            let indices: [Int]
        }
        let cases: [Case]
        let emptyByLocale: [Locale]
        let writer: [Writer]
        let latinMarks: [Marks]
    }

    static let fixture: Fixture = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../../../../native/fixtures/story-script.json").standardized
        return try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }()

    private static func script(_ name: String) -> StoryScript { StoryScript(rawValue: name)! }

    @Test(arguments: StoryScriptTests.fixture.cases.map(\.id))
    func everyCaseIsSetAsOnTheWeb(_ id: String) throws {
        let c = try #require(Self.fixture.cases.first { $0.id == id })
        let fallback = c.fallback.map(Self.script) ?? .cjk
        #expect(ScriptRule.storyType(title: c.title, story: c.story, fallback: fallback)
            == StoryType(script: Self.script(c.script), lang: c.lang), "case \(id)")
        #expect(ScriptRule.storyScript(title: c.title, story: c.story, fallback: fallback) == Self.script(c.script))
        #expect(ScriptRule.storyLang(title: c.title, story: c.story) == c.lang)
    }

    /// One rule for the mirror and the page: the mirror never answers in one language while the
    /// page sets the draft in the other's type.
    @Test func theMirrorReadsEveryCaseWithLettersAsThePageSetsIt() {
        for c in Self.fixture.cases where c.lang != nil {
            let mirror = ScriptRule.draftScript(title: c.title, story: c.story)
            #expect(([.han, .kana, .hangul].contains(mirror) ? StoryScript.cjk : .latin) == Self.script(c.script), "case \(c.id)")
        }
    }

    @Test func anEmptyDraftStartsInItsWritersOwnLanguagesTypeUntilThereAreLetters() {
        for l in Self.fixture.emptyByLocale {
            let start = ScriptRule.localeScript(l.locale)
            #expect(start == Self.script(l.script), "locale \(l.locale)")
            #expect(ScriptRule.storyScript(title: "", story: "", fallback: start) == start)
            // Digits and marks alone are no script either.
            #expect(ScriptRule.storyScript(title: "2400", story: "……", fallback: start) == start)
            #expect(ScriptRule.writerScript(current: start, title: "", story: "") == start)
            #expect(ScriptRule.writerScript(current: start, title: "2400", story: "……") == start)
        }
        // The app's own names for its languages read the same way.
        #expect(ScriptRule.localeScript("zh-Hant") == .cjk)
        #expect(ScriptRule.localeScript("ja-JP") == .cjk)
        #expect(ScriptRule.localeScript("EN") == .latin)
        // The first words decide, whoever is writing.
        #expect(ScriptRule.storyScript(title: "", story: "The first morning", fallback: .cjk) == .latin)
        #expect(ScriptRule.storyScript(title: "", story: "第一個早晨", fallback: .latin) == .cjk)
    }

    /// The writer re-reads a draft on its autosave tick: an English writer's first Chinese words (or
    /// a Chinese writer's first English ones) don't re-set the column under the caret, and a draft
    /// written in both about evenly keeps the type it has.
    @Test(arguments: StoryScriptTests.fixture.writer.map(\.id))
    func theWriterChangesTypeOnlyOnceTheDraftLeansClearly(_ id: String) throws {
        let c = try #require(Self.fixture.writer.first { $0.id == id })
        #expect(ScriptRule.writerScript(current: Self.script(c.current), title: c.title, story: c.story) == Self.script(c.script))
    }

    @Test func anApostropheInsideALatinWordIsFoundByItsUTF16Offset() {
        for m in Self.fixture.latinMarks {
            #expect(StoryScript.latinMarks(m.text) == m.indices, "\(m.text)")
        }
        // Offsets are UTF-16 units, as NSAttributedString counts them: an emoji before counts two.
        #expect(StoryScript.latinMarks("😀don’t") == [5])
    }

    @Test func onlyTheStorysStartIsReadAndQuicklyWhateverFollows() {
        let zh = "水溫太高，粉也磨得太細，但那是第一次覺得早晨是屬於自己的。"
        let en = "The water was too hot and the grind too fine, but it was the first morning that felt like mine. "
        let story = String(repeating: zh, count: ScriptRule.readChars / zh.count + 2) + String(repeating: en, count: 500)
        #expect(ScriptRule.storyScript(title: "", story: story) == .cjk)
        let started = Date()
        #expect(ScriptRule.storyScript(title: "", story: String(repeating: "[a](", count: 250_000)) == .latin)
        #expect(Date().timeIntervalSince(started) < 2)
    }
}
