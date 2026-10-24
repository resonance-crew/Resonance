import CoreText
import DesignSystem
import ResonanceKit
import StoryFormat
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// The card page's reader in the story's type (reading-type §6, §8): each block's face, size,
/// tracking, alignment and colour from `StoryTypography`; justified Chinese spread between its
/// characters as a browser does, never only at its spaces; the rhythm between blocks; the title's
/// clauses kept whole and its lines balanced; and the script read off the title and story together.
@MainActor @Suite struct StoryReaderTests {
    private let zhPhone = StoryTypography(script: .cjk, compact: true)
    private let zhWide = StoryTypography(script: .cjk, compact: false)
    private let enPhone = StoryTypography(script: .latin, compact: true)

    private func attributes(_ text: NSAttributedString, at index: Int = 0) -> [NSAttributedString.Key: Any] {
        text.attributes(at: index, effectiveRange: nil)
    }

    private func family(_ font: Any?) -> String? { (font as? UIFont)?.familyName }

    /// How far a face leans (its matrix's shear: the synthesized oblique).
    private func shear(_ font: Any?) -> CGFloat? {
        guard let font = font as? UIFont else { return nil }
        let descriptor = font.fontDescriptor.object(forKey: .matrix) as? CGAffineTransform
        return descriptor?.c ?? CTFontGetMatrix(font as CTFont).c
    }

    /// The same colour, as the screen shows it.
    private func same(_ a: Any?, _ b: Color) -> Bool {
        guard let a = a as? UIColor else { return false }
        func rgba(_ c: UIColor) -> [CGFloat] {
            var r: CGFloat = 0, g: CGFloat = 0, bl: CGFloat = 0, al: CGFloat = 0
            c.getRed(&r, green: &g, blue: &bl, alpha: &al)
            return [r, g, bl, al]
        }
        return zip(rgba(a), rgba(UIColor(b))).allSatisfy { abs($0 - $1) < 0.002 }
    }

    // MARK: Blocks

    @Test func aCJKParagraphIsNotoSansTrackedJustifiedWithBoldItalicLinksAndCodeInTheStorysWay() {
        let style = ProseStyle.body(zhPhone, language: "zh-TW")
        #expect(style.font.familyName == "Noto Sans TC" && style.font.pointSize == 17)
        #expect(style.lineHeight == 1.8)
        let text = style.attributed([
            InlineRun("雨停了，"), InlineRun("真的", bold: true), InlineRun("慢慢地", italic: true),
            InlineRun("走", link: "https://example.com/walk"), InlineRun("pace", code: true),
        ])
        let plain = attributes(text)
        #expect(abs((plain[.kern] as? CGFloat ?? 0) - 0.03 * 17) < 0.001)
        #expect((plain[.paragraphStyle] as? NSParagraphStyle)?.alignment == .justified)
        #expect((plain[.paragraphStyle] as? NSParagraphStyle)?.lineBreakStrategy.contains(.pushOut) == true)
        #expect((plain[.paragraphStyle] as? NSParagraphStyle)?.minimumLineHeight == 17 * 1.8)
        #expect(same(plain[.foregroundColor], Tokens.text))
        // strong: the story's 600, in the same face.
        let bold = (attributes(text, at: 4)[.font] as? UIFont)
        #expect(bold?.familyName == "Noto Sans TC")
        #expect(bold?.fontName == zhPhone.bodyFont(bold: true).fontName)
        #expect(zhPhone.boldWeight == .semibold)
        // em: the one synthesized oblique (AppFonts' 0.25 shear), never a separate attribute.
        let italic = attributes(text, at: 6)
        #expect(shear(italic[.font]) == 0.25)
        #expect(italic[.obliqueness] == nil)
        // A link's words in the deep terracotta every label on paper wears (its wave stays terracotta).
        let link = attributes(text, at: 9)
        #expect(same(link[.foregroundColor], Tokens.buttonOnTonal))
        #expect(link[.link] as? URL == URL(string: "https://example.com/walk"))
        // Code: the story's 0.88, monospaced, no tracking, on its faint tint.
        let code = attributes(text, at: 10)
        #expect((code[.font] as? UIFont)?.fontDescriptor.symbolicTraits.contains(.traitMonoSpace) == true)
        #expect(abs(((code[.font] as? UIFont)?.pointSize ?? 0) - 17 * 0.88) < 0.01)
        #expect(code[.kern] as? CGFloat == 0)
        #expect(code[.backgroundColor] != nil)
    }

    @Test func aLatinStoryIsDMSansRaggedUntrackedAndItsHeadingsPlayfair() {
        let style = ProseStyle.body(enPhone)
        let text = style.attributed([InlineRun("Every May my grandmother dried the plums.")])
        #expect(style.font.familyName == "DM Sans" && style.font.pointSize == 18 && style.lineHeight == 1.6)
        #expect(attributes(text)[.kern] as? CGFloat == 0)
        #expect((attributes(text)[.paragraphStyle] as? NSParagraphStyle)?.alignment == .natural)
        let h2 = style.heading(level: 2)
        #expect(h2.font.familyName == "Playfair Display" && abs(h2.font.pointSize - 18 * 1.3) < 0.01 && h2.lineHeight == 1.4)
        #expect(attributes(h2.attributed([InlineRun("What 2,400 meters taught me")]))[.kern] as? CGFloat == 0)
    }

    @Test func headingsAreNotoSerifAtTheirRatiosStartAlignedAndAQuotesAreMutedAndUpright() {
        let body = ProseStyle.body(zhWide)
        for (level, ratio) in [(1, 1.3), (2, 1.3), (3, 1.12), (4, 1.12), (6, 1.12)] as [(Int, CGFloat)] {
            let h = body.heading(level: level)
            #expect(h.font.familyName == "Noto Serif TC", "h\(level)")
            #expect(abs(h.font.pointSize - 18 * ratio) < 0.01, "h\(level)")
            let text = h.attributed([InlineRun("0 公尺：出發之前")])
            #expect((attributes(text)[.paragraphStyle] as? NSParagraphStyle)?.alignment == .natural)
            #expect(abs((attributes(text)[.kern] as? CGFloat ?? 0) - 0.02 * 18 * ratio) < 0.001)
        }
        // A quote: muted, at the body's size, upright; its headings muted too.
        let quoted = body.quoted
        let text = quoted.attributed([InlineRun("慢下來，不是放棄")])
        #expect(same(attributes(text)[.foregroundColor], Tokens.textMuted))
        #expect(shear(attributes(text)[.font]) == 0)
        #expect(quoted.font.pointSize == body.font.pointSize && quoted.inQuote)
        #expect(same(quoted.heading(level: 3).color, Tokens.textMuted))
    }

    @Test func anApostropheInsideALatinWordTakesTheLatinFaceInACJKStoryOnly() {
        let text = ProseStyle.body(zhPhone).attributed([InlineRun("教練說：don’t rush，他’s")])
        let mark = ("教練說：don’t rush，他’s" as NSString).range(of: "’").location
        #expect(family(attributes(text, at: mark)[.font]) == "DM Sans")
        // Beside a Han character the mark keeps the CJK face's full-width form.
        let other = ("教練說：don’t rush，他’s" as NSString).range(of: "’", options: .backwards).location
        #expect(family(attributes(text, at: other)[.font]) == "Noto Sans TC")
        let heading = ProseStyle.body(zhPhone).heading(level: 2).attributed([InlineRun("rock’n’roll")])
        #expect(family(attributes(heading, at: 4)[.font]) == "Playfair Display")
    }

    // MARK: Justified Chinese

    /// `text` laid out `width` wide in TextKit, as the reader's text view does.
    private func laidOut(_ text: NSAttributedString, width: CGFloat) -> (NSTextStorage, NSLayoutManager, NSTextContainer) {
        let storage = NSTextStorage(attributedString: StoryJustification.prepared(text))
        let layout = NSLayoutManager()
        let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        layout.ensureLayout(for: container)
        return (storage, layout, container)
    }

    private func lineWidths(_ layout: NSLayoutManager, _ container: NSTextContainer, _ storage: NSTextStorage) -> [CGFloat] {
        var out: [CGFloat] = []
        let text = storage.string as NSString
        layout.enumerateLineFragments(forGlyphRange: layout.glyphRange(for: container)) { _, _, _, glyphs, _ in
            var chars = layout.characterRange(forGlyphRange: glyphs, actualGlyphRange: nil)
            while chars.length > 0, text.character(at: NSMaxRange(chars) - 1) == 0x20 { chars.length -= 1 }
            let visible = layout.glyphRange(forCharacterRange: chars, actualCharacterRange: nil)
            out.append(layout.boundingRect(forGlyphRange: visible, in: container).maxX)
        }
        return out
    }

    @Test func justifiedChineseMeetsBothEdgesSharedBetweenItsCharactersNotOnlyAtItsSpaces() {
        let story = "那年我用 iPhone 記下每一次配速……教練只說：don’t rush. 他說得很輕，像是怕吵醒什麼。我一直以為跑步是跟時間比賽，後來才知道是跟自己的呼吸說話。"
        let text = ProseStyle.body(zhPhone).attributed([InlineRun(story)])
        let width: CGFloat = 335
        let (storage, layout, container) = laidOut(text, width: width)
        let ragged = lineWidths(layout, container, storage)
        let lines = StoryJustification.lines(layout, container)
        #expect(ragged.count >= 3)
        #expect(StoryJustification.apply(storage: storage, layoutManager: layout, container: container))
        // The same line breaks, every line but the last now at the column's edge; the last as it fell.
        #expect(StoryJustification.lines(layout, container) == lines)
        let justified = lineWidths(layout, container, storage)
        for w in justified.dropLast() { #expect(abs(w - width) < 0.6, "a full line ends at the edge: \(w)") }
        #expect(abs(justified.last! - ragged.last!) < 0.01)
        // The room went between characters, not into the two spaces round 「iPhone」 alone: the space
        // after 「用」 grew by no more than the gap after any Han character on that line did.
        let s = storage.string as NSString
        let kern = { (i: Int) in storage.attribute(.kern, at: i, effectiveRange: nil) as? CGFloat ?? 0 }
        let space = s.range(of: " ").location
        let han = s.range(of: "年").location
        #expect(kern(space) > 0.03 * 17 && abs(kern(space) - kern(han)) < 0.01)
        // Never inside a Latin word: 「iPhone」's letters keep the body's tracking.
        let i = s.range(of: "iPhone").location
        for k in i..<(i + 5) { #expect(abs(kern(k) - 0.03 * 17) < 0.001) }
    }

    @Test func aRaggedOrLatinParagraphIsLeftAsItIs() {
        let latin = ProseStyle.body(enPhone).attributed([InlineRun(String(repeating: "Every May my grandmother dried the plums. ", count: 4))])
        #expect(!StoryJustification.wanted(latin))
        let (storage, layout, container) = laidOut(latin, width: 335)
        #expect(!StoryJustification.apply(storage: storage, layoutManager: layout, container: container))
        // Where the room may go: a space takes it, a Latin pair doesn't, a CJK character on either side does.
        #expect(StoryJustification.opportunity(0x20, 0x61) && !StoryJustification.opportunity(0x61, 0x62))
        #expect(StoryJustification.opportunity(0x96E8, 0x61) && StoryJustification.opportunity(0x61, 0x96E8))
        #expect(!StoryJustification.opportunity(0x96E8, 0x20))
    }

    // MARK: Rhythm

    @Test func theRhythmIsTheStorysAtThePersonsTextSize() {
        let phone = zhPhone.rhythm()
        #expect(phone.body == 17 && phone.paragraphGap == 1.3)
        #expect(abs(phone.h2 - 22.1) < 0.01 && abs(phone.h3 - 19.04) < 0.01)
        #expect(phone.headingAbove == 2 && phone.h2Below == 0.6 && phone.h3Below == 0.5)
        #expect(phone.blockGap == 24 && phone.ruleGap == 32 && phone.blankLine == 1.6)
        let wide = StoryTypography(script: .latin, compact: false).rhythm()
        #expect(wide.body == 20 && wide.blockGap == 32 && wide.ruleGap == 40)
        // Above an h2 after a paragraph: its own 2em, not the paragraph's 1.3em.
        let gaps = ProseMetrics.gaps([.paragraph([]), .heading(level: 2, []), .paragraph([])], phone)
        #expect(abs(gaps[1] - 44.2) < 0.01 && abs(gaps[2] - 13.26) < 0.01)
    }

    // MARK: The title

    @Test func aCJKTitleBreaksAfterItsPunctuationAndALatinOneIsWhole() {
        #expect(StoryTitle.clauses("湖中央，我看見了知行合一", script: .cjk) == ["湖中央，", "我看見了知行合一"])
        #expect(StoryTitle.clauses("Rain, then quiet", script: .latin) == ["Rain, then quiet"])
        // Clauses as inline blocks: one that doesn't fit where the last ended starts the next line.
        let flow = BalancedClauses.flow(width: 300, natural: [120, 230], lineBox: 39) { _, _ in 39 }
        #expect(flow.places.map(\.origin) == [CGPoint(x: 0, y: 0), CGPoint(x: 0, y: 39)])
        #expect(flow.height == 78)
        // Both fit: one line.
        #expect(BalancedClauses.flow(width: 400, natural: [120, 230], lineBox: 39) { _, _ in 39 }.height == 39)
        // Wider than the line: a line (or more) of its own, then the next clause under it.
        let long = BalancedClauses.flow(width: 200, natural: [80, 450, 60], lineBox: 39) { i, _ in i == 1 ? 117 : 39 }
        #expect(long.places.map(\.origin.y) == [0, 39, 156])
        #expect(long.places[1].width == 200)
    }

    @Test func aTitlesLinesAreBalanced() {
        // Two lines of 260 + 120 on a 300 line: evened out, the narrowest width keeping two lines.
        let natural: [CGFloat] = [100, 100, 100, 80]
        let height = { (w: CGFloat) in BalancedClauses.flow(width: w, natural: natural, lineBox: 40) { _, _ in 40 }.height }
        #expect(height(300) == 80)
        let even = BalancedClauses.balanced(300, natural: natural, height: height)
        #expect(even < 300 && height(even) == 80)
        #expect(abs(even - 200) < 1)
        // One line already: kept as it is.
        #expect(BalancedClauses.balanced(500, natural: natural, height: height) == 500)
    }

    @MainActor @Test func theTitleIsOneHeadingInTheStorysLanguage() throws {
        let title = StoryTitle("跑完 2400 公尺那天，我才懂得慢下來", typography: zhPhone, lang: "zh-TW")
        let host = UIHostingController(rootView: title.frame(width: 335))
        let size = host.sizeThatFits(in: CGSize(width: 335, height: 2000))
        // Two lines of the title's 28 × 1.4 box.
        #expect(abs(size.height - 2 * 28 * 1.4) < 1.5)
        let font = zhPhone.titleFont()
        #expect(font.familyName == "Noto Serif TC" && font.pointSize == 28)
        let text = zhPhone.titleText("2400 don’t", font: font)
        #expect(abs((attributes(text)[.kern] as? CGFloat ?? 0) - 0.56) < 0.001)
        #expect(family(attributes(text, at: 8)[.font]) == "Playfair Display")
    }

    // MARK: Tables (round 8 §5.2)

    /// A table's cell: the body's face at 0.94 em on 1.6 lines, set as its column says (never
    /// justified, even in a CJK story), figures tabular; the header row in the story's bold.
    @Test func aTablesCellIsTheBodysFaceSmallerSetAsItsColumnSaysWithTabularFigures() {
        let body = ProseStyle.body(zhPhone, language: "zh-TW")
        let cell = body.tableCell(header: false, alignment: .right)
        #expect(cell.font.familyName == "Noto Sans TC")
        #expect(abs(cell.font.pointSize - 17 * 0.94) < 0.01)
        #expect(cell.lineHeight == 1.6)
        let text = cell.attributed([InlineRun("2400")])
        let paragraph = attributes(text)[.paragraphStyle] as? NSParagraphStyle
        #expect(paragraph?.alignment == .right)
        #expect(abs((paragraph?.minimumLineHeight ?? 0) - 17 * 0.94 * 1.6) < 0.01)
        // Tabular figures: every digit as wide as every other.
        func width(_ digits: String) -> CGFloat { (digits as NSString).size(withAttributes: [.font: cell.font]).width }
        #expect(abs(width("1111") - width("8888")) < 0.01, "\(width("1111")) vs \(width("8888"))")
        let header = body.tableCell(header: true, alignment: .natural)
        #expect(header.font.fontName == AppFonts.uiFont(.bodyCJK, size: header.font.pointSize, weight: zhPhone.boldWeight).fontName)
        #expect((attributes(header.attributed([InlineRun("名稱")]))[.paragraphStyle] as? NSParagraphStyle)?.alignment == .natural)
        // A quote's table keeps the quote's ink.
        #expect(same(attributes(body.quoted.tableCell(header: false, alignment: .natural).attributed([InlineRun("年")]))[.foregroundColor],
                     Tokens.textMuted))
    }

    /// Each column as wide as its widest cell's words on one line, between 4 and 18 em; the side of a
    /// table wider than its column that has more to see fades; GFM's alignments become the cells'.
    @Test func aTablesColumnsTakeTheirWordsBetweenFourAndEighteenEm() {
        let em: CGFloat = 16
        #expect(StoryTable.columnWidths([[10, 400], [120, 30]], em: em) == [120, 18 * 16])
        #expect(StoryTable.columnWidths([[10, 20]], em: em) == [64, 64])
        // A short row (none here) still has its column.
        #expect(StoryTable.columnWidths([[100, 100, 100], [90]], em: em).count == 3)
        #expect(StoryTable.width([100, 120, 80]) == 300 + 4 * StoryTable.cellPadH)
        #expect(StoryTable.more(offset: 0, content: 300, container: 320) == .none)
        #expect(StoryTable.more(offset: 0, content: 600, container: 320) == .end)
        #expect(StoryTable.more(offset: 140, content: 600, container: 320) == .both)
        #expect(StoryTable.more(offset: 280, content: 600, container: 320) == .start)
        #expect(StoryTable.alignment(.start) == .natural && StoryTable.alignment(.left) == .left)
        #expect(StoryTable.alignment(.center) == .center && StoryTable.alignment(.right) == .right)
    }

    /// The reader draws a parsed table — its cells' words, each in its own line box, under one region
    /// named 表格 — no longer the paragraph of words it was flattened into.
    @Test func theReaderDrawsATableAsANamedRegionOfItsCells() throws {
        let blocks = StoryParser.parse("| 名稱 | 數量 |\n| --- | ---: |\n| 蘋果 | 3 |\n| 香蕉 | 12 |")
        guard case .table = blocks.first else { return #expect(Bool(false)) }
        let story = StoryMarkdownView(blocks: blocks, typography: zhPhone, onOpenURL: { _ in }) { _, _ in EmptyView?.none }
            .environment(\.storyTableLabel, L10n.Card.table)
        let on = AccessibilityOn()
        defer { on.restore() }
        let host = UIHostingController(rootView: story.frame(width: 335))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 335, height: 800))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        // Every cell's words, drawn as the story's text is (one CSS-line-boxed text view a cell), no pipes.
        var texts: [String] = []
        var heights: [CGFloat] = []
        var scrolls: [UIScrollView] = []
        func views(_ view: UIView) {
            if let text = view as? UITextView {
                texts.append(text.text)
                heights.append(text.bounds.height)
            } else if let scroll = view as? UIScrollView {
                scrolls.append(scroll)
            }
            view.subviews.forEach(views)
        }
        views(host.view)
        #expect(heights.allSatisfy { abs($0 - 17 * 0.94 * 1.6) < 1.5 }, "\(heights)")
        #expect(texts.sorted() == ["12", "3", "名稱", "數量", "蘋果", "香蕉"], "\(texts)")
        // VoiceOver names the region from the page's word (表格 / Table), the reader's own default otherwise.
        #expect(EnvironmentValues().storyTableLabel == "Table")
        // Its height: the header row and two rows, each 8 above and below its 1.6 lines, and the rules
        // between (1.2 under the header, 1 between the rows); as wide as its columns (4 em at the least),
        // in a box of its own that scrolls sideways.
        let box = try #require(scrolls.first)
        let line = 17 * 0.94 * 1.6
        #expect(abs(box.frame.height - (3 * (line + 2 * StoryTable.cellPadV) + StoryTable.headRule + StoryTable.rowRule)) < 2,
                "\(box.frame)")
        #expect(abs(box.contentSize.width - (2 * 4 * 17 * 0.94 + 2 * StoryTable.cellPadH)) < 2, "\(box.contentSize)")
    }

    // MARK: The page

    @Test func theCardModelReadsTheScriptOffTheTitleAndStoryTogether() async {
        let en = Fixture.detail(Fixture.card("plums", title: "The summer my grandmother taught me"), story: "Every May she dried the plums.")
        let model = CardModel(key: "plums") { _ in en }
        await model.load()
        #expect(model.storyType == StoryType(script: .latin, lang: "en"))
        let zh = Fixture.detail(Fixture.card("rain", title: "雨後"), story: "雨停的時候，巷口的積水映出整排路燈。")
        let zhModel = CardModel(key: "rain") { _ in zh }
        await zhModel.load()
        #expect(zhModel.storyType == StoryType(script: .cjk, lang: "zh-TW"))
        // Opened from a list: its title and excerpt until the card arrives.
        let early = CardModel(key: "plums", placeholder: Fixture.card("plums", title: "Rain, then quiet")) { _ in en }
        #expect(early.storyType.script == .latin)
    }

    @Test func theMetaLineIsTheReadTimeAndTheDate() {
        let line = StoryMetaLine.text(Fixture.card("rain"))
        #expect(line.hasPrefix(L10n.App.readMinutes(count: 2) + " · "))
        #expect(line.count > (L10n.App.readMinutes(count: 2) + " · ").count)
    }
}
