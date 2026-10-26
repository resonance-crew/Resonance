import CoreGraphics
import Foundation
import Markdown

/// A story's Markdown, as the reader lays it out — the blocks the web's
/// StoryMarkdown (react-markdown + remark-gfm) produces, with its paragraph
/// rules: a paragraph holding only a card link is an embedded card, only a
/// photo is an image block, only a web link may be that page's preview card,
/// only the blank marker (U+00A0) is extra space; a GFM table is a table.
public nonisolated indirect enum StoryBlock: Hashable, Sendable {
    case heading(level: Int, [InlineRun])
    case paragraph([InlineRun])
    case blank
    case image(url: String, alt: String)
    case cardEmbed(href: String, title: String)
    /// A paragraph that may be one web link standing alone (src/lib/links/storyLinks.ts):
    /// `[words](https://…)`, `<https://…>` or a reference link with no picture inside (`href` is
    /// its address), or a bare address with nothing round it (`href` nil — CommonMark leaves it
    /// text; `text` is the address as written). Whether it is one, and which page it names, is the
    /// link rules' to say (`StoryLinks.key` in ResonanceKit): the reader draws the page's preview
    /// card when the story has one for it, and otherwise `runs`, the paragraph as it always was
    /// (its bare address a link, `linkingAddresses`).
    case soleLink(href: String?, text: String, runs: [InlineRun])
    case quote([StoryBlock])
    case list(ordered: Bool, start: Int, items: [[StoryBlock]])
    case rule
    case code(String)
    /// A GFM table (round 8 §5.2, remark-gfm's): its header row's cells and each body row's — every
    /// cell's runs, as a paragraph's — and each column's alignment. Every row holds as many cells as
    /// the header (GFM's own rule: a short row ends in empty cells, a long one's extra cells go).
    case table(head: [[InlineRun]], rows: [[[InlineRun]]], alignments: [TableAlignment])
}

/// How a table's column sets its cells (GFM's delimiter row): `:--` left, `:-:` centre, `--:` right,
/// none (`---`) the start of the line, as the table itself is set.
public nonisolated enum TableAlignment: Hashable, Sendable {
    case start, left, center, right
}

/// A run of inline text with its marks.
public nonisolated struct InlineRun: Hashable, Sendable {
    public var text: String
    public var bold = false
    public var italic = false
    public var strikethrough = false
    public var code = false
    /// Where a tap on it goes (nil: nowhere).
    public var link: String?
    /// Its words are a link's — one that opens (`link`), or one the reader can't open (`tel:`, another
    /// app's scheme), which reads as plain words but is still a link's: GFM never links an address
    /// written inside a link on its own (`[https://a.com](tel:1)` stays words). Android's `inLink`.
    public var inLink: Bool

    public init(_ text: String, bold: Bool = false, italic: Bool = false, strikethrough: Bool = false, code: Bool = false,
                link: String? = nil, inLink: Bool? = nil) {
        self.text = text
        self.bold = bold
        self.italic = italic
        self.strikethrough = strikethrough
        self.code = code
        self.link = link
        self.inLink = inLink ?? (link != nil)
    }
}

public nonisolated enum StoryParser {
    /// The story as CommonMark reads it, without "smart" punctuation — as the web's reader and the
    /// server read it: `'` and `"` stay as written (a link's `?q=what's` stays one link), `--` and
    /// `...` too.
    ///
    /// A story opening quotes and lists deeper than `StoryNesting.limit` on a line, or a paragraph of
    /// more inline delimiters than `StoryNesting.paragraphDelimiters`, would run Apple's recursive
    /// parser out of stack: it is drawn as its words instead, a paragraph per blank-line gap, nothing
    /// parsed.
    public static func parse(_ markdown: String) -> [StoryBlock] {
        guard !StoryNesting.tooComplex(markdown) else { return unparsed(markdown) }
        let document = Document(parsing: markdown, options: [.disableSmartOpts])
        return document.children.compactMap(block)
    }

    /// The story as written, a paragraph of words per run of lines between blank ones.
    static func unparsed(_ markdown: String) -> [StoryBlock] {
        var blocks: [StoryBlock] = []
        var lines: [Substring] = []
        func close() {
            let text = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty { blocks.append(.paragraph([InlineRun(text)])) }
            lines = []
        }
        for line in markdown.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.allSatisfy(\.isWhitespace) { close() } else { lines.append(line) }
        }
        close()
        return blocks
    }

    static func block(_ node: Markup) -> StoryBlock? {
        switch node {
        case let p as Paragraph:
            return paragraph(p)
        case let h as Heading:
            return .heading(level: h.level, inlines(h))
        case let q as BlockQuote:
            return .quote(q.children.compactMap(block))
        case let l as UnorderedList:
            return .list(ordered: false, start: 1, items: l.listItems.map { $0.children.compactMap(block) })
        case let l as OrderedList:
            return .list(ordered: true, start: Int(l.startIndex), items: l.listItems.map { $0.children.compactMap(block) })
        case is ThematicBreak:
            return .rule
        case let c as CodeBlock:
            return .code(c.code.hasSuffix("\n") ? String(c.code.dropLast()) : c.code)
        case let h as HTMLBlock:
            // The site renders stories without raw HTML: it shows as text.
            return .paragraph([InlineRun(h.rawHTML.trimmingCharacters(in: .newlines))])
        case let t as Markdown.Table:
            return table(t)
        default:
            return nil
        }
    }

    /// A table as the reader draws it: its cells' runs (marks, links and code as a paragraph's), the
    /// header deciding how many columns there are, and the delimiter row's alignments.
    static func table(_ t: Markdown.Table) -> StoryBlock {
        let columns = max(t.head.childCount, 1)
        func row(_ cells: [Markdown.Table.Cell]) -> [[InlineRun]] {
            var runs = cells.prefix(columns).map { inlines($0) }
            while runs.count < columns { runs.append([]) }
            return runs
        }
        let alignments = (0..<columns).map { i -> TableAlignment in
            switch i < t.columnAlignments.count ? t.columnAlignments[i] : nil {
            case .left?: .left
            case .center?: .center
            case .right?: .right
            case nil: .start
            }
        }
        return .table(head: row(Array(t.head.cells)), rows: t.body.rows.map { row(Array($0.cells)) }, alignments: alignments)
    }

    /// The web's `p` override (StoryMarkdown.tsx).
    static func paragraph(_ p: Paragraph) -> StoryBlock {
        let meaningful = p.children.filter { !(($0 as? Text)?.string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? false) }
        if meaningful.count == 1 {
            if let link = meaningful[0] as? Link, let href = link.destination, href.hasPrefix("/card/") {
                return .cardEmbed(href: href, title: link.plainText)
            }
            if let image = meaningful[0] as? Markdown.Image, let src = image.source {
                return .image(url: src, alt: image.plainText)
            }
            if let link = meaningful[0] as? Link, let href = link.destination, isWeb(href), !holdsImage(link) {
                return .soleLink(href: href, text: link.plainText, runs: inlines(p))
            }
        }
        if let bare = bareAddress(p) {
            return .soleLink(href: nil, text: bare, runs: inlines(p))
        }
        let runs = inlines(p)
        let text = runs.map(\.text).joined()
        if !text.isEmpty, text.unicodeScalars.allSatisfy({ $0 == "\u{00A0}" || CharacterSet.whitespacesAndNewlines.contains($0) }) {
            return .blank
        }
        return .paragraph(runs)
    }

    /// An http(s) address (any case): the only links a paragraph of its own can be a page's card for.
    static func isWeb(_ href: String) -> Bool {
        let lower = href.lowercased()
        return lower.hasPrefix("http://") || lower.hasPrefix("https://")
    }

    /// `[![picture](…)](url)` is a linked picture, not a link.
    static func holdsImage(_ node: Markup) -> Bool {
        node.children.contains { $0 is Markdown.Image || holdsImage($0) }
    }

    /// The paragraph's words when they are plain text alone (no marks, links or breaks of their own;
    /// CommonMark may hand one run over in pieces) and, trimmed, one unbroken word that starts like
    /// a web address — a candidate for a bare link (the link rules decide).
    static func bareAddress(_ p: Paragraph) -> String? {
        var words = ""
        for child in p.children {
            switch child {
            case let t as Text: words += t.string
            case is SoftBreak: words += "\n"
            default: return nil
            }
        }
        let trimmed = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) }) else { return nil }
        let lower = trimmed.lowercased()
        return lower.hasPrefix("http://") || lower.hasPrefix("https://") || lower.hasPrefix("www.") ? trimmed : nil
    }

    /// The runs of `node`'s children. `link` is where a tap on them goes (nil: nowhere); `inLink`
    /// says they are a link's words even when that link can't be opened, so no address in them is
    /// made a link of its own (``StoryBlock/linkingAddresses(_:find:)``).
    static func inlines(_ node: Markup, bold: Bool = false, italic: Bool = false, strike: Bool = false, link: String? = nil,
                        inLink: Bool = false) -> [InlineRun] {
        var runs: [InlineRun] = []
        func run(_ text: String, code: Bool = false) -> InlineRun {
            InlineRun(text, bold: bold, italic: italic, strikethrough: strike, code: code, link: link, inLink: inLink || link != nil)
        }
        for child in node.children {
            switch child {
            case let t as Text:
                runs.append(run(t.string))
            case is SoftBreak:
                runs.append(run(" "))
            case is LineBreak:
                runs.append(run("\n"))
            case let c as InlineCode:
                runs.append(run(c.code, code: true))
            case is Strong:
                runs += inlines(child, bold: true, italic: italic, strike: strike, link: link, inLink: inLink)
            case is Emphasis:
                runs += inlines(child, bold: bold, italic: true, strike: strike, link: link, inLink: inLink)
            case is Strikethrough:
                runs += inlines(child, bold: bold, italic: italic, strike: true, link: link, inLink: inLink)
            case let l as Link:
                // A link the reader can't open (tel:, another app's scheme…) is plain text (StoryLink) — still a link's words.
                runs += inlines(child, bold: bold, italic: italic, strike: strike,
                                link: l.destination.flatMap { StoryLink.isTappable($0) ? $0 : nil }, inLink: true)
            case let i as Markdown.Image:
                // An image inside running text keeps its alt text in the line.
                runs.append(run(i.plainText))
            case let h as InlineHTML:
                runs.append(run(h.rawHTML))
            default:
                runs += inlines(child, bold: bold, italic: italic, strike: strike, link: link, inLink: inLink)
            }
        }
        return runs
    }
}

nonisolated extension StoryBlock {
    /// The blocks with each web address written bare in their words made a link, as the web's
    /// reader (GFM) makes one — which words are an address is the link rules' to say (`find`: each
    /// link's UTF-16 range in a run's text and the address it opens; the reader's are ChatLinks,
    /// the server's own). Words already in a link, and code, stay as they are; a paragraph standing
    /// alone as a link (`soleLink`) keeps what keys its page's card and gets the link in its words,
    /// for when there is no card.
    public static func linkingAddresses(_ blocks: [StoryBlock], find: (String) -> [(range: NSRange, url: String)]) -> [StoryBlock] {
        blocks.map { $0.linkingAddresses(find) }
    }

    private func linkingAddresses(_ find: (String) -> [(range: NSRange, url: String)]) -> StoryBlock {
        func link(_ runs: [InlineRun]) -> [InlineRun] {
            // CommonMark may hand one run of words over in pieces (at a `_` or `*` that marks nothing): an
            // address is looked for in the words as they read, never in half of it.
            var joined: [InlineRun] = []
            for run in runs {
                if var last = joined.last, last.bold == run.bold, last.italic == run.italic, last.strikethrough == run.strikethrough,
                   last.code == run.code, last.link == run.link, last.inLink == run.inLink {
                    last.text += run.text
                    joined[joined.count - 1] = last
                } else {
                    joined.append(run)
                }
            }
            return joined.flatMap { run -> [InlineRun] in
                // A link's words (one that opens or not) and code stay as they are.
                guard !run.inLink, !run.code else { return [run] }
                let found = find(run.text)
                guard !found.isEmpty else { return [run] }
                let text = run.text as NSString
                var pieces: [InlineRun] = []
                var at = 0
                func piece(_ range: NSRange, link: String?) {
                    guard range.length > 0 else { return }
                    var part = run
                    part.text = text.substring(with: range)
                    part.link = link
                    part.inLink = link != nil
                    pieces.append(part)
                }
                for (range, url) in found where range.location >= at && NSMaxRange(range) <= text.length {
                    piece(NSRange(location: at, length: range.location - at), link: nil)
                    piece(range, link: url)
                    at = NSMaxRange(range)
                }
                piece(NSRange(location: at, length: text.length - at), link: nil)
                return pieces
            }
        }
        switch self {
        case let .paragraph(runs): return .paragraph(link(runs))
        case let .heading(level, runs): return .heading(level: level, link(runs))
        case let .soleLink(href, text, runs): return .soleLink(href: href, text: text, runs: link(runs))
        case let .quote(children): return .quote(Self.linkingAddresses(children, find: find))
        case let .list(ordered, start, items): return .list(ordered: ordered, start: start, items: items.map { Self.linkingAddresses($0, find: find) })
        case let .table(head, rows, alignments):
            // A cell's bare address is a link, as GFM makes one there too.
            return .table(head: head.map(link), rows: rows.map { $0.map(link) }, alignments: alignments)
        case .blank, .image, .cardEmbed, .rule, .code: return self
        }
    }

    /// Plain text of a heading, for the table of contents.
    public var headingText: String? {
        if case let .heading(_, runs) = self { return runs.map(\.text).joined() }
        return nil
    }
}

/// A story's vertical rhythm as the reader sets it (src/styles/story.css): the body's size and every
/// space between its blocks, in points at the size the story is drawn — DesignSystem's
/// `StoryTypography` makes one by the story's script, the window and the person's text size (the
/// tokens live there; this package draws nothing). Ratios are in em of the element's own size, as
/// the CSS writes `calc(var(--x) * 1em)`.
public nonisolated struct ProseRhythm: Hashable, Sendable {
    /// The body's size: a paragraph's, a list's, a quote's em.
    public var body: CGFloat
    /// After a paragraph, a list, a quote or a code block, in em (`--story-para-gap`).
    public var paragraphGap: CGFloat
    /// An h1's and an h2's size, and an h3's to an h6's (a story's `#` is drawn as an h2).
    public var h2: CGFloat
    public var h3: CGFloat
    /// Above a heading, in em of the heading (`--story-heading-above`), and below an h2 or the rest.
    public var headingAbove: CGFloat
    public var h2Below: CGFloat
    public var h3Below: CGFloat
    /// Above and below a picture, a link's card or an embedded card (`--story-block-gap`).
    public var blockGap: CGFloat
    /// Above and below the pen's rule (`--story-rule-gap`).
    public var ruleGap: CGFloat
    /// A line the writer left blank, in em (`--story-blank-line`).
    public var blankLine: CGFloat

    public init(body: CGFloat, paragraphGap: CGFloat, h2: CGFloat, h3: CGFloat, headingAbove: CGFloat, h2Below: CGFloat,
                h3Below: CGFloat, blockGap: CGFloat, ruleGap: CGFloat, blankLine: CGFloat = 1.6) {
        self.body = body
        self.paragraphGap = paragraphGap
        self.h2 = h2
        self.h3 = h3
        self.headingAbove = headingAbove
        self.h2Below = h2Below
        self.h3Below = h3Below
        self.blockGap = blockGap
        self.ruleGap = ruleGap
        self.blankLine = blankLine
    }

    /// A heading's size.
    public func heading(level: Int) -> CGFloat { level <= 2 ? h2 : h3 }
}

/// CSS margins (top, bottom) of each block, and the gap between two blocks: the larger of the
/// facing margins, as CSS collapses them. Nothing above a story's (a quote's, a list item's) first
/// block, nothing below its last.
public nonisolated enum ProseMetrics {
    /// `asCard`: a paragraph standing alone as a link is drawn as its page's card (a block with the
    /// block gap round it), not as the paragraph it is written as.
    public static func margins(_ block: StoryBlock, _ rhythm: ProseRhythm, asCard: Bool = false) -> (top: CGFloat, bottom: CGFloat) {
        let paragraph = (top: CGFloat(0), bottom: rhythm.paragraphGap * rhythm.body)
        switch block {
        case let .heading(level, _):
            let size = rhythm.heading(level: level)
            return (rhythm.headingAbove * size, (level <= 2 ? rhythm.h2Below : rhythm.h3Below) * size)
        case .blank: return (0, 0)
        // A table is a block with its own air, as a picture is (`.story-table`'s `--s-block`).
        case .image, .cardEmbed, .table: return (rhythm.blockGap, rhythm.blockGap)
        case .rule: return (rhythm.ruleGap, rhythm.ruleGap)
        case .soleLink: return asCard ? (rhythm.blockGap, rhythm.blockGap) : paragraph
        case .paragraph, .quote, .list, .code: return paragraph
        }
    }

    /// The space above each block (the first has none). `asCard(i)`: whether block `i`, a
    /// standalone link, is drawn as its page's card.
    public static func gaps(_ blocks: [StoryBlock], _ rhythm: ProseRhythm, asCard: (Int) -> Bool = { _ in false }) -> [CGFloat] {
        blocks.indices.map { i in
            i == 0 ? 0 : max(margins(blocks[i - 1], rhythm, asCard: asCard(i - 1)).bottom, margins(blocks[i], rhythm, asCard: asCard(i)).top)
        }
    }
}
