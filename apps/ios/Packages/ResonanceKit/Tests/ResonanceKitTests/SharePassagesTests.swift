import Foundation
import ResonanceKit
import Testing

/// What a share card quotes from a story — the rule the apps' share image and the web's
/// link-preview image share (src/lib/markdown/sharePassages.ts), case by case from
/// native/fixtures/share-passages.json, the file sharePassages.test.ts writes.
@Suite struct SharePassagesTests {
    struct Fixture: Decodable {
        struct Limits: Decodable {
            let readChars: Int
            let minGraphemes: Int
            let max: Int
            let maxGraphemes: Int
        }
        struct Case: Decodable {
            let id: String
            let story: String
            let opening: String
        }
        let limits: Limits
        let cases: [Case]
    }

    static let fixture: Fixture = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../../../../native/fixtures/share-passages.json").standardized
        return try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }()

    @Test func theLimitsAreTheWebs() {
        let limits = Self.fixture.limits
        #expect(SharePassages.readChars == limits.readChars)
        #expect(SharePassages.minGraphemes == limits.minGraphemes)
        #expect(SharePassages.max == limits.max)
        #expect(SharePassages.maxGraphemes == limits.maxGraphemes)
    }

    @Test(arguments: SharePassagesTests.fixture.cases.map(\.id))
    func everyCaseOpensAsOnTheWeb(_ id: String) throws {
        let c = try #require(Self.fixture.cases.first { $0.id == id })
        #expect(SharePassages.opening(c.story) == c.opening, "case \(id)")
    }

    @Test func atMostFortyBlocksAreReadEachWhole() {
        let story = (1...60).map { "第 \($0) 段，下雨的時候我們一起走路。" }.joined(separator: "\n\n")
        let blocks = SharePassages.blocks(story)
        #expect(blocks.count == SharePassages.max)
        #expect(blocks.first == "第 1 段，下雨的時候我們一起走路。")
        #expect(blocks.last == "第 40 段，下雨的時候我們一起走路。")
    }

    @Test func aLongStoryIsReadFromItsStartOnlyAndQuickly() {
        // Past the first 20 000 units nothing is read; a cut that would split a pair keeps the pair out.
        let story = String(repeating: "雨", count: SharePassages.readChars - 1) + "😀" + "\n\n不會被讀到的一段。"
        let opening = SharePassages.opening(story)
        #expect(opening == String(repeating: "雨", count: SharePassages.maxGraphemes) + "…")
        #expect(SharePassages.blocks(story).count == 1)
        #expect(!SharePassages.blocks(story)[0].contains("😀"))
        let started = Date()
        _ = SharePassages.opening(String(repeating: "[a](", count: 50_000))
        #expect(Date().timeIntervalSince(started) < 3)
    }

    /// Apple's parser nests recursively: a story of `> > > …` thousands deep (the rules let one run
    /// to 200 000 characters) would run it out of stack. Such a story is quoted not at all; one
    /// nested as people write is quoted as ever.
    @Test func aStoryNestedPastAnyWritersDepthIsNotReadAtAll() {
        for marker in ["> ", "- ", "1. ", ">", "> - "] {
            let deep = String(repeating: marker, count: 50_000) + "雨停了，我出門散步。"
            #expect(SharePassages.opening(deep) == "", "\(marker.debugDescription)")
        }
        let quoted = String(repeating: "> ", count: SharePassages.maxNesting) + "雨停了，我出門散步。"
        #expect(SharePassages.opening(quoted) == "雨停了，我出門散步。")
        #expect(SharePassages.opening("> - 1. > 雨停了，我出門散步。\n\n---\n\n- - - 不是清單的一行") == "雨停了，我出門散步。\n不是清單的一行")
    }
}
