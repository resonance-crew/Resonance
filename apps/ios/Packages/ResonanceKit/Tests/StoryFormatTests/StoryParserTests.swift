import Foundation
import ResonanceKit
import Testing
@testable import StoryFormat

/// The reader's block rules against the shared Markdown corpus
/// (native/fixtures/markdown-corpus.json — the storage format the web editor
/// and the apps' editor island are pinned to).
@Suite struct StoryParserTests {
    struct Case: Decodable { let id: String; let canonical: String }
    static let corpus: [String: String] = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../../../../native/fixtures/markdown-corpus.json").standardized
        struct File: Decodable { let cases: [Case] }
        let file = try! JSONDecoder().decode(File.self, from: Data(contentsOf: url))
        return Dictionary(uniqueKeysWithValues: file.cases.map { ($0.id, $0.canonical) })
    }()

    func blocks(_ id: String) -> [StoryBlock] { StoryParser.parse(Self.corpus[id]!) }

    func text(_ block: StoryBlock) -> String? {
        if case let .paragraph(runs) = block { return runs.map(\.text).joined() }
        return nil
    }

    @Test func aLoneCardLinkIsAnEmbeddedCard() {
        let b = blocks("card-embed")
        #expect(b.count == 3)
        #expect(b[1] == .cardEmbed(href: "/card/a-walk-after-the-rain", title: "一場雨後的散步"))
    }

    @Test func aCardLinkInsideASentenceStaysALink() {
        guard case let .paragraph(runs) = blocks("card-link-mid-sentence").first else { return #expect(Bool(false)) }
        #expect(runs.map(\.text).joined() == "見 一場雨後的散步 這張卡片。")
        #expect(runs.contains { $0.link == "/card/a-walk-after-the-rain" && $0.text == "一場雨後的散步" })
    }

    @Test func aLonePhotoIsAnImageBlock() {
        #expect(blocks("image-block")[1] == .image(url: "https://cdn.example.com/image/u1/rain.avif", alt: "巷口的積水"))
        #expect(blocks("image-then-text-no-gap").first == .image(url: "https://cdn.example.com/x.avif", alt: "alt"))
    }

    @Test func theBlankMarkerIsExtraSpace() {
        #expect(blocks("blank-paragraph").map { $0 == .blank } == [false, true, false])
    }

    @Test func headingsQuotesListsRulesAndCode() {
        let h = blocks("headings")
        #expect(h[0].headingText == "那年夏天")
        guard case .heading(3, _) = h[2] else { return #expect(Bool(false)) }
        guard case let .quote(inner) = blocks("blockquote").first else { return #expect(Bool(false)) }
        #expect(inner.count == 2)
        let lists = blocks("lists")
        guard case let .list(false, _, items) = lists[0], case let .list(true, 1, ordered) = lists[1] else { return #expect(Bool(false)) }
        #expect(items.count == 2 && ordered.count == 2)
        #expect(blocks("rule")[1] == .rule)
        #expect(blocks("code-block") == [.code("const a = 1;")])
    }

    @Test func inlineMarksAndBreaks() {
        guard case let .paragraph(runs) = blocks("inline-marks").first else { return #expect(Bool(false)) }
        #expect(runs.contains { $0.text == "粗體" && $0.bold })
        #expect(runs.contains { $0.text == "斜體" && $0.italic })
        #expect(runs.contains { $0.text == "刪除線" && $0.strikethrough })
        #expect(runs.contains { $0.text == "code" && $0.code })
        #expect(text(blocks("hard-break")[0]) == "第一行\n第二行")
    }

    @Test func punctuationStaysAsItIsWritten() {
        // No "smart" quotes, dashes or ellipses: the web and the server read the story as written.
        let written = #"她說 "晚安" 而且 it's -- fine... 'ok'"#
        guard case let .paragraph(runs) = StoryParser.parse(written).first else { return #expect(Bool(false)) }
        #expect(runs.map(\.text).joined() == written)
    }

    @Test func escapedSyntaxAndHTMLStayText() {
        #expect(text(blocks("escapes")[0]) == "*不是粗體*，1. 不是清單，# 不是標題，a_b_c。")
        #expect(text(blocks("html-is-text")[0]) == "<b>不是 HTML</b> 與 <script>x</script>")
    }

    // MARK: Standalone links (native/fixtures/story-link-cards.json)

    struct LinkCase: Decodable, CustomTestStringConvertible {
        let id: String
        let markdown: String
        let soleLinks: [String]
        let links: [String]
        let inline: [String]?
        var testDescription: String { id }
    }

    static let linkCases: [LinkCase] = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../../../../native/fixtures/story-link-cards.json").standardized
        struct File: Decodable { let cases: [LinkCase] }
        return try! JSONDecoder().decode(File.self, from: Data(contentsOf: url)).cases
    }()

    /// An address in disguise (`https://127.1/x`, which a browser reads as 127.0.0.1) is no link
    /// to these rules (ChatLinks, as in a chat message), so its paragraph stays a paragraph. The
    /// server never unfurls an IP address at all, so no card can be missing for it.
    static let refusedHere: Set<String> = ["https://127.0.0.1/x"]

    /// The keys of the paragraphs that stand alone as links, in reading order (quotes and lists too).
    func soleLinkKeys(_ blocks: [StoryBlock]) -> [String] {
        blocks.flatMap { block -> [String] in
            switch block {
            case let .soleLink(href, text, _): StoryLinks.key(href: href, text: text).map { [$0] } ?? []
            case let .quote(children): soleLinkKeys(children)
            case let .list(_, _, items): items.flatMap(soleLinkKeys)
            default: []
            }
        }
    }

    @Test(arguments: linkCases)
    func everyStandaloneLinkOfTheSharedFixture(_ c: LinkCase) {
        let keys = soleLinkKeys(StoryParser.parse(c.markdown))
        #expect(keys == c.soleLinks.filter { !Self.refusedHere.contains($0) })
        // What the server would draw a card for is never one of those left out here.
        #expect(c.links.allSatisfy { !Self.refusedHere.contains($0) })
        for link in c.inline ?? [] { #expect(!keys.contains(link)) }
    }

    @Test func aLinkStandingAloneKeepsItsParagraphForWhenThereIsNoPreview() {
        let blocks = StoryParser.parse("前一段。\n\n[一篇好文章](https://blog.example.com/post/42)")
        guard case let .soleLink(href, text, runs) = blocks[1] else { return #expect(Bool(false)) }
        #expect(href == "https://blog.example.com/post/42" && text == "一篇好文章")
        #expect(runs == [InlineRun("一篇好文章", link: "https://blog.example.com/post/42")])
        // A bare address is words to CommonMark (the reader makes it a link: `StoryBlock.linkingAddresses`).
        guard case let .soleLink(nil, bare, bareRuns) = StoryParser.parse("https://example.com/rain").first else { return #expect(Bool(false)) }
        #expect(bare == "https://example.com/rain" && bareRuns.allSatisfy { $0.link == nil })
        // Words round a link, or marks on it, keep it in its sentence.
        #expect(StoryParser.parse("我讀了 [這篇](https://example.com/inline) 之後").first.map { if case .paragraph = $0 { true } else { false } } == true)
        #expect(StoryParser.parse("**https://example.com/bold**").first.map { if case .paragraph = $0 { true } else { false } } == true)
        // Spaced like a paragraph — or, drawn as its page's card, like a picture.
        let rhythm = Self.cjkDesktop
        #expect(ProseMetrics.margins(blocks[1], rhythm).bottom == ProseMetrics.margins(.paragraph([]), rhythm).bottom)
        #expect(ProseMetrics.margins(blocks[1], rhythm).top == 0)
        #expect(ProseMetrics.margins(blocks[1], rhythm, asCard: true) == (rhythm.blockGap, rhythm.blockGap))
    }

    /// A CJK story on a wide window at the default text size (reading-type §6's computed values):
    /// 18pt body, 1.3em between paragraphs, h2 1.3 and h3 1.12 of the body, 2em above a heading and
    /// 0.6 / 0.5 below it, 32 round a picture or a card, 40 round the rule.
    static let cjkDesktop = ProseRhythm(body: 18, paragraphGap: 1.3, h2: 18 * 1.3, h3: 18 * 1.12, headingAbove: 2, h2Below: 0.6,
                                        h3Below: 0.5, blockGap: 32, ruleGap: 40)

    @Test func proseMarginsCollapseLikeCSS() {
        let tenth = { (v: CGFloat) in (v * 10).rounded() / 10 }
        let gaps = ProseMetrics.gaps([.paragraph([]), .heading(level: 2, []), .paragraph([]), .blank, .paragraph([]),
                                      .heading(level: 3, []), .paragraph([]), .image(url: "a", alt: ""), .rule, .heading(level: 4, [])],
                                     Self.cjkDesktop)
        // Above an h2 its 2em (46.8) outweighs the paragraph's 23.4; under it 0.6em (14.0) gives way to nothing.
        // A blank line keeps the paragraph's gap above it and none below; a picture and the rule their own.
        #expect(gaps.map(tenth) == [0, 46.8, 14.0, 23.4, 0, 40.3, 10.1, 32, 40, 40.3])
        // A heading opening the story (a quote, a list item) has nothing above it.
        #expect(ProseMetrics.gaps([.heading(level: 2, []), .paragraph([])], Self.cjkDesktop).map(tenth) == [0, 14.0])
        // # is drawn as an h2.
        #expect(ProseMetrics.margins(.heading(level: 1, []), Self.cjkDesktop) == ProseMetrics.margins(.heading(level: 2, []), Self.cjkDesktop))
        // A standalone link drawn as its card is a block like a picture.
        let link = StoryBlock.soleLink(href: "https://a.example/x", text: "x", runs: [])
        #expect(ProseMetrics.gaps([.paragraph([]), link, .paragraph([])], Self.cjkDesktop, asCard: { $0 == 1 }) == [0, 32, 32])
        #expect(ProseMetrics.gaps([.paragraph([]), link, .paragraph([])], Self.cjkDesktop).map(tenth) == [0, 23.4, 23.4])
    }

    @Test func aStoryNestedPastTheParsersDepthIsReadAsItsWords() {
        // Apple's parser recurses per level: thousands of quotes would crash it. Past the limit the
        // story is its paragraphs of words, as written; at the limit it is parsed as ever.
        let deep = String(repeating: "> ", count: 5_000) + "雨停了\n\n第二段"
        #expect(StoryNesting.tooDeep(deep))
        #expect(StoryParser.parse(deep) == [.paragraph([InlineRun(String(repeating: "> ", count: 5_000) + "雨停了")]),
                                            .paragraph([InlineRun("第二段")])])
        let atLimit = String(repeating: "> ", count: StoryNesting.limit) + "雨停了"
        #expect(!StoryNesting.tooDeep(atLimit))
        guard case .quote = StoryParser.parse(atLimit).first else { return #expect(Bool(false)) }
        // Lists nest by indenting too: a line per level, each further in.
        let indented = (0..<200).map { String(repeating: "  ", count: $0) + "- a" }.joined(separator: "\n")
        #expect(StoryNesting.tooDeep(indented))
        #expect(!StoryNesting.tooDeep("- a\n  - b\n    - c"))
    }

    @Test func onlyTheSitesPicturesAreDrawnAnyOtherIsALink() {
        StoryPictures.$scopedSite.withValue("resonance.channel") {
        #expect(StoryParser.parse("![ours](https://img.resonance.channel/a.webp)") == [.image(url: "https://img.resonance.channel/a.webp", alt: "ours")])
        #expect(StoryParser.parse("![](/api/emulator-storage/x.webp)") == [.image(url: "/api/emulator-storage/x.webp", alt: "")])
        for elsewhere in ["https://pictures.example.invalid/p.png", "https://img.resonance.channel.example.invalid/p.png", "https://img.resonance.channel@pictures.example.invalid/p.png"] {
            #expect(StoryParser.parse("![那裡](\(elsewhere))") == [.paragraph([InlineRun("那裡", link: elsewhere)])])
        }
        }
    }

    @Test func aParagraphOfDelimitersThatNeverPairIsReadAsItsWords() {
        // `**` opened hundreds deep nests the parser as deep (a background thread's stack ran out at
        // 250 levels): past the paragraph's delimiter limit the story is its words, unparsed.
        let deep = String(repeating: "**", count: 5_000) + "雨" + String(repeating: "**", count: 5_000)
        #expect(StoryNesting.tooComplex(deep))
        #expect(StoryParser.parse(deep) == [.paragraph([InlineRun(deep)])])
        for flood in [String(repeating: "*_", count: 2_000) + "x", String(repeating: "~~a ", count: 2_000), String(repeating: "*[", count: 2_000) + "x"] {
            #expect(StoryNesting.tooComplex(flood))
        }
        // At the limit it is parsed as ever, nesting included.
        let half = StoryNesting.paragraphDelimiters / 4
        let atLimit = String(repeating: "*_", count: half) + "雨" + String(repeating: "_*", count: half)
        #expect(!StoryNesting.tooComplex(atLimit))
        #expect(StoryParser.parse(atLimit).count == 1)
        // Ordinary emphasis, and code fences full of underscores, stay Markdown.
        let ordinary = (0..<40).map { "這段有 **重點** 和 *強調*，第\($0)段。" }.joined(separator: "\n\n")
        #expect(!StoryNesting.tooComplex(ordinary))
        let code = "```\n" + String(repeating: "snake_case_name = other_value * __dunder__\n", count: 300) + "```"
        #expect(!StoryNesting.tooComplex(code))
        // A wide header over many short lines is millions of padded cells; an ordinary table is not.
        let wide = "|" + String(repeating: "a|", count: 1_000) + "\n|" + String(repeating: "-|", count: 1_000) + "\n" + String(repeating: "a\n", count: 80_000)
        #expect(StoryNesting.tooComplex(wide))
        let table = "| a | b | c |\n| --- | --- | --- |\n" + String(repeating: "| x | y | z |\n", count: 400)
        #expect(!StoryNesting.tooComplex(table))
        // The cells are the story's, not a table's; a table needs no pipe; a CR ends a line as LF does.
        #expect(StoryNesting.tooComplex("a\n:-\n" + String(repeating: "a\n", count: 90_000)))
        let small = "|" + String(repeating: "a|", count: 100) + "\n|" + String(repeating: "-|", count: 100) + "\n" + String(repeating: "a\n", count: 48)
        #expect(StoryNesting.tooComplex(Array(repeating: small, count: 200).joined(separator: "\n")))
        #expect(StoryNesting.tooComplex("|" + String(repeating: "a|", count: 1_000) + "\r|" + String(repeating: "-|", count: 1_000) + "\r" + String(repeating: "a\r", count: 80_000)))
        #expect(StoryNesting.tooComplex("x\r" + String(repeating: "> ", count: 5_000) + "x"))
        let few = "| a | b | c |\n| --- | --- | --- |\n" + String(repeating: "| x | y | z |\n", count: 40)
        #expect(!StoryNesting.tooComplex(Array(repeating: few, count: 6).joined(separator: "\n")))
        #expect(!StoryNesting.tooComplex(String(repeating: "> 一\r\n> > 二\r\n\r\n**粗體** 與 *斜體*\r\n\r\n", count: 2_000)))
        #expect(!StoryNesting.tooComplex(String(repeating: String(repeating: "一行詩\n", count: 400) + "---\n", count: 6)))
        // Only what CommonMark reads as a fence hides its inside, and a fence ends with its container.
        let big = "|" + String(repeating: "a|", count: 1_000) + "\n|" + String(repeating: "-|", count: 1_000) + "\n" + String(repeating: "a\n", count: 1_000)
        for before in ["    ```\n\n", "```a`\n\n", "> ```\n\n", "- ```\n  code\nx\n\n"] { #expect(StoryNesting.tooComplex(before + big)) }
        #expect(StoryNesting.tooComplex("    ```\n\n" + Array(repeating: String(repeating: "*a ", count: 2_000), count: 30).joined(separator: "\n\n")))
        #expect(!StoryNesting.tooComplex("- 步驟\n\n  ```js\n" + String(repeating: "  const snake_case = a_b * c_d;\n", count: 200) + "  ```\n\n- 下一步"))
        #expect(!StoryNesting.tooComplex("> ```\n" + String(repeating: "> snake_case_name = __dunder__\n", count: 200) + "> ```"))
        #expect(!StoryNesting.tooComplex("~~~\n" + String(repeating: "a_b_c * d\n", count: 200) + "~~~\n\n````md\n```\n" + String(repeating: "x_y * z\n", count: 200) + "````"))
        // Many paragraphs near the limit add up.
        let many = Array(repeating: String(repeating: "*a ", count: StoryNesting.paragraphDelimiters - 10), count: 40).joined(separator: "\n\n")
        #expect(StoryNesting.tooComplex(many))
    }

    // MARK: Tables (round 8 §5.2; the corpus's table-* cases)

    /// A table's cells as plain words, row by row (the header first).
    func cells(_ block: StoryBlock?) -> [[String]]? {
        guard case let .table(head, rows, _)? = block else { return nil }
        return ([head] + rows).map { $0.map { $0.map(\.text).joined() } }
    }

    @Test func aTableIsATableWithItsHeadItsRowsAndItsAlignments() throws {
        let b = blocks("table-basic")
        #expect(b.count == 3)
        #expect(text(b[0]) == "前言")
        #expect(cells(b[1]) == [["名稱", "數量"], ["蘋果", "3"], ["香蕉", "12"]])
        guard case let .table(_, _, alignments) = b[1] else { return #expect(Bool(false)) }
        // `---` is the start of the line, `---:` the right.
        #expect(alignments == [.start, .right])
        #expect(text(b[2]) == "結尾")
        // A table is a block with its own air, as a picture is.
        #expect(ProseMetrics.margins(b[1], Self.cjkDesktop) == (top: 32, bottom: 32))
    }

    @Test func aTablesCellsKeepTheirMarksAndAlignmentsAndItsEscapedPipe() throws {
        let marked = blocks("table-padded-and-marked")
        #expect(marked.count == 1)
        #expect(cells(marked[0]) == [["地點", "時間", "心情"], ["台北", "早上", "好"], ["高雄", "晚上", "普通"]])
        guard case let .table(_, rows, alignments) = marked[0] else { return #expect(Bool(false)) }
        #expect(alignments == [.left, .center, .right])
        #expect(rows[0][0] == [InlineRun("台北", bold: true)])
        #expect(rows[1][0] == [InlineRun("高雄", link: "https://example.com")])
        #expect(rows[1][2] == [InlineRun("普通", code: true)])
        // `\|` is a cell's own pipe.
        #expect(cells(blocks("table-escaped-pipe").first) == [["符號", "意思"], ["a | b", "或"]])
    }

    @Test func aTableAfterALineInAQuoteAndBeforeAParagraph() {
        let after = blocks("table-after-a-line")
        #expect(text(after[0]) == "下面是清單：")
        #expect(cells(after[1]) == [["項目", "說明"], ["一", "第一項"]])
        guard case let .quote(inner) = blocks("table-in-quote").first else { return #expect(Bool(false)) }
        #expect(cells(inner.first) == [["年", "事"], ["2024", "搬家"]])
        let then = blocks("table-then-text")
        #expect(cells(then[0]) == [["a", "b"], ["1", "2"]])
        #expect(text(then[1]) == "表格之後的一段話。")
    }

    @Test func aRowIsAsLongAsTheHeaderAndACellsBareAddressIsALink() {
        // A short row ends in an empty cell; a long one's extra cell goes (GFM's rule).
        let ragged = StoryParser.parse("| a | b |\n| - | - |\n| 1 |\n| 1 | 2 | 3 |")
        #expect(cells(ragged.first) == [["a", "b"], ["1", ""], ["1", "2"]])
        // A bare address in a cell is made a link, as in a paragraph.
        let linked = StoryBlock.linkingAddresses(StoryParser.parse("| 網站 |\n| --- |\n| 見 https://example.com/rain |")) { words in
            ChatLinks.links(in: words).map { (range: $0.range, url: $0.url.absoluteString) }
        }
        guard case let .table(_, rows, _)? = linked.first else { return #expect(Bool(false)) }
        #expect(rows[0][0].contains { $0.link == "https://example.com/rain" && $0.text == "https://example.com/rain" })
    }
}
