import Foundation
import Markdown
import StoryFormat

/// What a share card quotes from a story — src/lib/markdown/sharePassages.ts, the one rule the
/// apps' 9:16 share image and the web's link-preview image (/api/og/card) share, pinned case by
/// case by native/fixtures/share-passages.json.
///
/// The story's first `readChars` characters are read as CommonMark, block by block in reading
/// order: every paragraph — at the top level, and inside quotes and list items (each item on its
/// own). Headings, code, thematic breaks and HTML are not prose to quote, nor is a paragraph that
/// is only pictures, a standalone link (one that gets a link card: `StoryLinks.key`) or an
/// embedded card (`[title](/card/…)` alone in its paragraph). A block's text is
/// `StoryProse.plainText` of the paragraph as it is written — Markdown out, a link's words kept,
/// a bare address left out, character references and escapes read as what they stand for.
///
/// Where Apple's parser reads GitHub's extensions (a table, a task list's box), the web reads a
/// paragraph; stories never hold them (the editor can't write either), so the two only part there.
public nonisolated enum SharePassages {
    /// How much of a story is read, from its start, in UTF-16 units: far more than an opening needs,
    /// so a 200 000-character story is read in a moment.
    public static let readChars = 20_000
    /// A block shorter than this, in graphemes, is left out (a line like 「嗯。」 is no passage).
    public static let minGraphemes = 6
    /// At most this many blocks are read.
    public static let max = 40
    /// A passage, and the opening, is cut at this many graphemes, with "…".
    public static let maxGraphemes = 600
    /// The deepest a line may open quotes and lists (`> > - …`) for the story to be read at all
    /// (`StoryNesting.limit`: deeper, Apple's recursive parser runs out of stack). No story worth
    /// quoting nests this deep: one that does is quoted not at all.
    public static let maxNesting = StoryNesting.limit

    /// The story's opening, what a share card quotes: its quotable blocks joined by line breaks, cut
    /// at `maxGraphemes`. The card then truncates it by its own lines. Empty when the story holds
    /// nothing to quote.
    public static func opening(_ story: String) -> String {
        cut(blocks(story).joined(separator: "\n"))
    }

    /// The story's quotable blocks, in reading order, as plain text: at most `max` of them, each of
    /// at least `minGraphemes`, whole (not yet cut).
    public static func blocks(_ whole: String) -> [String] {
        let story = head(whole)
        guard !story.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !nestsTooDeep(story) else { return [] }
        let source = Source(story)
        let document = Document(parsing: story, options: [.disableSmartOpts])
        var blocks: [String] = []
        func walk(_ node: Markup) {
            guard blocks.count < max else { return }
            switch node {
            case let p as Paragraph:
                guard !standaloneLink(p), !picturesOnly(p), !embedsCard(p) else { return }
                quote(p.range)
            case let table as Markdown.Table:
                // A table is GitHub's: CommonMark, as the web reads the story, sees the paragraph it is written as.
                quote(table.range)
            case is Document, is BlockQuote, is UnorderedList, is OrderedList, is ListItem:
                // Quotes and lists hold paragraphs; headings, code, rules and HTML hold no prose to quote.
                node.children.forEach(walk)
            default:
                return
            }
        }
        func quote(_ range: SourceRange?) {
            guard let range, let written = source.text(range) else { return }
            let text = StoryProse.plainText(written)
            if text.count >= minGraphemes { blocks.append(text) }
        }
        walk(document)
        return blocks
    }

    /// The text cut at `max` graphemes, with "…" when anything was cut.
    static func cut(_ text: String, max: Int = maxGraphemes) -> String {
        text.count > max ? String(text.prefix(max)) + "…" : text
    }

    /// The story's first `readChars` UTF-16 units, one less when the last would split a surrogate pair.
    static func head(_ story: String) -> String {
        let units = story.utf16
        guard units.count > readChars else { return story }
        var kept = Array(units.prefix(readChars))
        if let last = kept.last, UTF16.isLeadSurrogate(last) { kept.removeLast() }
        return String(decoding: kept, as: UTF16.self)
    }

    /// Whether a line of the story opens more than `maxNesting` quotes and list items at its start, or
    /// a paragraph holds too many inline delimiters (StoryFormat's `StoryNesting`, which the reader's
    /// parser asks too).
    static func nestsTooDeep(_ story: String) -> Bool {
        StoryNesting.tooDeep(story, limit: maxNesting) || StoryNesting.tooManyDelimiters(story)
    }

    /// The paragraph's children that say something: neither blank words nor a soft line break (the
    /// web's tree keeps those inside its text, as blank text).
    private static func meaningful(_ node: Markup) -> [Markup] {
        node.children.filter {
            if $0 is SoftBreak { return false }
            if let text = $0 as? Text { return !text.string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            return true
        }
    }

    /// A paragraph of pictures alone (a linked picture counts as one).
    private static func picturesOnly(_ p: Paragraph) -> Bool {
        func picture(_ node: Markup) -> Bool {
            if node is Markdown.Image { return true }
            guard node is Link else { return false }
            let inside = meaningful(node)
            return !inside.isEmpty && inside.allSatisfy(picture)
        }
        let kids = meaningful(p)
        return !kids.isEmpty && kids.allSatisfy(picture)
    }

    /// A card link alone in its paragraph: the story embeds that card.
    private static func embedsCard(_ p: Paragraph) -> Bool {
        let kids = meaningful(p)
        guard kids.count == 1, let link = kids[0] as? Link, let href = link.destination, let key = CardKey.of(href: href) else {
            return false
        }
        return CardKey.isValid(key)
    }

    /// A paragraph standing alone as one web link the link rules take — the reader draws its page's
    /// card there (src/lib/links/storyLinks.ts `soleLinkParagraphs`): a link, an autolink or a
    /// reference link to an http(s) address with no picture inside, or words that are, trimmed,
    /// exactly one address.
    private static func standaloneLink(_ p: Paragraph) -> Bool {
        let kids = meaningful(p)
        if kids.count == 1, let link = kids[0] as? Link {
            guard let href = link.destination, isWeb(href), !holdsImage(link) else { return false }
            return StoryLinks.key(href: href, text: link.plainText) != nil
        }
        // Words alone (Apple's parser may hand one run over in pieces, and keeps its soft breaks apart).
        var words = ""
        for child in p.children {
            switch child {
            case let text as Text: words += text.string
            case is SoftBreak: words += "\n"
            default: return false
            }
        }
        let trimmed = words.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && StoryLinks.key(href: nil, text: trimmed) != nil
    }

    private static func isWeb(_ href: String) -> Bool {
        let lower = href.lowercased()
        return lower.hasPrefix("http://") || lower.hasPrefix("https://")
    }

    /// `[![picture](…)](url)` is a linked picture, not a link.
    private static func holdsImage(_ node: Markup) -> Bool {
        node.children.contains { $0 is Markdown.Image || holdsImage($0) }
    }

    /// The story's text by the parser's ranges: lines from 1, columns in UTF-8 bytes from 1, the end
    /// just past the range.
    private struct Source {
        let bytes: [UInt8]
        let lineStarts: [Int]

        init(_ text: String) {
            bytes = Array(text.utf8)
            var starts = [0]
            for (i, byte) in bytes.enumerated() where byte == 0x0A { starts.append(i + 1) }
            lineStarts = starts
        }

        func offset(_ location: SourceLocation) -> Int? {
            guard location.line >= 1, location.line <= lineStarts.count, location.column >= 1 else { return nil }
            return Swift.min(lineStarts[location.line - 1] + location.column - 1, bytes.count)
        }

        func text(_ range: SourceRange) -> String? {
            guard let start = offset(range.lowerBound), let end = offset(range.upperBound), start <= end else { return nil }
            return String(decoding: bytes[start..<end], as: UTF8.self)
        }
    }
}
