import Foundation

/// How deep a story's quotes and lists may open on one line, and how many inline delimiters a
/// paragraph may hold (`tooComplex`), for its Markdown to be parsed at all.
/// Apple's parser builds its tree recursively, and a few thousand levels (a story of `> > > …`,
/// which the rules let run to 200 000 characters) run it out of stack — a crash, not a slow read;
/// the web's reader has no such floor. No story worth reading nests this deep: the reader draws one
/// that does as its words (`StoryParser.parse`), and a share card quotes none of it.
public nonisolated enum StoryNesting {
    public static let limit = 32
    /// Inline delimiters (`*`, `_`, `~`, a backtick, `[`, `]`) one paragraph may hold outside code
    /// fences. The parser nests a level for each that opens and never closes (`**…`, `*_…`, `*[…`),
    /// and runs out of a background thread's stack a few hundred levels in; the web's spends time
    /// quadratic in them besides. The web keeps the same numbers (src/lib/markdown/storyLimits.ts).
    public static let paragraphDelimiters = 200
    /// The paragraphs' delimiter counts, squared and summed.
    public static let delimiterBudget = 1_000_000
    /// Cells one table may come to: rows are padded to the header's columns, and every line after
    /// the header is a row — read per blank-line block as (most `|` on a line + 1) × lines.
    public static let tableCells = 20_000

    /// Whether the story is too costly to read as Markdown at all: `tooDeep`, or a paragraph holding
    /// more than `paragraphDelimiters` inline delimiters, or more than `delimiterBudget` over the story,
    /// or a table of more than `tableCells` cells.
    public static func tooComplex(_ story: String) -> Bool {
        tooDeep(story) || tooManyDelimiters(story)
    }

    /// Counts each paragraph's inline delimiters after its lines' quote and list markers, skipping
    /// fenced code (one pass over the bytes).
    public static func tooManyDelimiters(_ story: String) -> Bool {
        let bytes = Array(story.utf8)
        let n = bytes.count
        func isSpace(_ c: UInt8) -> Bool { c == 0x20 || c == 0x09 || c == 0x0D }
        func isDigit(_ c: UInt8) -> Bool { c >= 0x30 && c <= 0x39 }
        func isDelimiter(_ c: UInt8) -> Bool { c == 0x2A || c == 0x5F || c == 0x7E || c == 0x60 || c == 0x5B || c == 0x5D }
        var paragraph = 0
        var load = 0
        var columns = 0
        var rows = 0
        var fence: UInt8 = 0
        func endParagraph() -> Bool {
            load += paragraph * paragraph
            paragraph = 0
            columns = 0
            rows = 0
            return load > delimiterBudget
        }
        var i = 0
        while i < n {
            var depth = 0
            prefix: while true {
                while i < n, isSpace(bytes[i]) { i += 1 }
                guard i < n else { break }
                switch bytes[i] {
                case UInt8(ascii: ">"):
                    i += 1
                case UInt8(ascii: "-"), UInt8(ascii: "*"), UInt8(ascii: "+"):
                    guard i + 1 < n, isSpace(bytes[i + 1]) else { break prefix }
                    i += 2
                case UInt8(ascii: "0")...UInt8(ascii: "9"):
                    var j = i
                    while j < n, j - i < 9, isDigit(bytes[j]) { j += 1 }
                    guard j + 1 < n, bytes[j] == UInt8(ascii: ".") || bytes[j] == UInt8(ascii: ")"), isSpace(bytes[j + 1]) else { break prefix }
                    i = j + 2
                default:
                    break prefix
                }
                depth += 1
            }
            let start = i
            while i < n, bytes[i] != 0x0A { i += 1 }
            let end = i
            i += 1
            if start == end {
                // A blank line ends the paragraph.
                if depth == 0, endParagraph() { return true }
                continue
            }
            let first = bytes[start]
            if first == UInt8(ascii: "`") || first == UInt8(ascii: "~"), start + 2 < n, bytes[start + 1] == first, bytes[start + 2] == first {
                // A code fence opens or closes: what is inside is never read inline.
                if fence == 0 { fence = first } else if fence == first { fence = 0 }
                if endParagraph() { return true }
                continue
            }
            if fence != 0 { continue }
            var pipes = 0
            for k in start..<end {
                if isDelimiter(bytes[k]) { paragraph += 1 } else if bytes[k] == UInt8(ascii: "|") { pipes += 1 }
            }
            if paragraph > paragraphDelimiters { return true }
            columns = max(columns, pipes)
            rows += 1
            if columns > 0, (columns + 1) * rows > tableCells { return true }
        }
        return endParagraph()
    }

    /// Whether a line of the story opens more than `limit` quotes and list items at its start (a
    /// `>`, a bullet or a number followed by a space each count; a guess on the deep side, read in
    /// one pass over the bytes), or starts that many levels of indentation in (lists nest by
    /// indenting too: a line per level, each two spaces further in).
    public static func tooDeep(_ story: String, limit: Int = limit) -> Bool {
        let bytes = Array(story.utf8)
        let space: Set<UInt8> = [0x20, 0x09]
        var i = 0
        while i < bytes.count {
            var depth = 0
            var indent = 0
            var lineStart = true
            scan: while i < bytes.count, bytes[i] != 0x0A {
                while i < bytes.count, space.contains(bytes[i]) {
                    if lineStart { indent += bytes[i] == 0x09 ? 4 : 1 }
                    i += 1
                }
                lineStart = false
                if indent > limit * 4 { return true }
                guard i < bytes.count else { break }
                switch bytes[i] {
                case UInt8(ascii: ">"):
                    i += 1
                case UInt8(ascii: "-"), UInt8(ascii: "*"), UInt8(ascii: "+"):
                    guard i + 1 < bytes.count, space.contains(bytes[i + 1]) else { break scan }
                    i += 2
                case UInt8(ascii: "0")...UInt8(ascii: "9"):
                    var j = i
                    while j < bytes.count, j - i < 9, (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(bytes[j]) { j += 1 }
                    guard j + 1 < bytes.count, bytes[j] == UInt8(ascii: ".") || bytes[j] == UInt8(ascii: ")"),
                          space.contains(bytes[j + 1]) else { break scan }
                    i = j + 2
                default:
                    break scan
                }
                depth += 1
                if depth > limit { return true }
            }
            // On to the next line.
            while i < bytes.count, bytes[i] != 0x0A { i += 1 }
            i += 1
        }
        return false
    }
}
