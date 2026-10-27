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
    /// Cells all of a story's tables may come to: rows are padded to the header's columns, every line
    /// after the header is a row, and the web's parser resolves a story's tables in one pass quadratic
    /// in the cells written across them. Each blank-line block holding a line that could be a
    /// delimiter row (only `-`, `:`, `|`, `>` and spaces, at least one `-`; a table needs no `|`)
    /// counts (most `|` on a line + 1) × its lines.
    public static let tableCells = 5_000

    /// Whether the story is too costly to read as Markdown at all: `tooDeep`, or a paragraph holding
    /// more than `paragraphDelimiters` inline delimiters, or more than `delimiterBudget` over the story,
    /// or tables of more than `tableCells` cells. A line ends at LF, CR or CRLF, as the parser reads it.
    public static func tooComplex(_ story: String) -> Bool {
        tooDeep(story) || tooManyDelimiters(story)
    }

    /// Counts each paragraph's inline delimiters after its lines' quote and list markers, skipping
    /// fenced code (opened as CommonMark opens one, and closed early when its container ends), and
    /// every line's table cells, fenced or not (one pass over the bytes).
    public static func tooManyDelimiters(_ story: String) -> Bool {
        let bytes = Array(story.utf8)
        let n = bytes.count
        func isSpace(_ c: UInt8) -> Bool { c == 0x20 || c == 0x09 }
        func isLineEnd(_ c: UInt8) -> Bool { c == 0x0A || c == 0x0D }
        func isDigit(_ c: UInt8) -> Bool { c >= 0x30 && c <= 0x39 }
        func isDelimiter(_ c: UInt8) -> Bool { c == 0x2A || c == 0x5F || c == 0x7E || c == 0x60 || c == 0x5B || c == 0x5D }
        // | : - > space tab
        func isDelimiterRowChar(_ c: UInt8) -> Bool { c == 0x7C || c == 0x3A || c == 0x2D || c == 0x3E || c == 0x20 || c == 0x09 }
        func run(_ from: Int, _ to: Int, _ c: UInt8) -> Int {
            var k = from
            while k < to, bytes[k] == c { k += 1 }
            return k - from
        }
        func holds(_ from: Int, _ to: Int, _ c: UInt8) -> Bool { from < to && bytes[from..<to].contains(c) }
        func onlySpace(_ from: Int, _ to: Int) -> Bool { from >= to || bytes[from..<to].allSatisfy(isSpace) }
        var paragraph = 0
        var load = 0
        var columns = 0
        var rows = 0
        var table = false
        var cells = 0
        // While inside a fenced code block: its byte, run length, quotes and column.
        var fence: UInt8 = 0
        var fenceLength = 0
        var fenceQuotes = 0
        var fenceColumn = 0
        func endParagraph() -> Bool {
            load += paragraph * paragraph
            if table { cells += (columns + 1) * rows }
            paragraph = 0
            columns = 0
            rows = 0
            table = false
            return load > delimiterBudget || cells > tableCells
        }
        var i = 0
        while i < n {
            var depth = 0
            var quotes = 0
            var lead = 0
            var column = 0
            prefix: while true {
                lead = 0
                while i < n, isSpace(bytes[i]) {
                    let w = bytes[i] == 0x09 ? 4 : 1
                    lead += w
                    column += w
                    i += 1
                }
                guard i < n else { break }
                switch bytes[i] {
                case UInt8(ascii: ">"):
                    i += 1
                    column += 1
                    quotes += 1
                case UInt8(ascii: "-"), UInt8(ascii: "*"), UInt8(ascii: "+"):
                    guard i + 1 < n, isSpace(bytes[i + 1]) else { break prefix }
                    i += 2
                    column += 2
                case UInt8(ascii: "0")...UInt8(ascii: "9"):
                    var j = i
                    while j < n, j - i < 9, isDigit(bytes[j]) { j += 1 }
                    guard j + 1 < n, bytes[j] == UInt8(ascii: ".") || bytes[j] == UInt8(ascii: ")"), isSpace(bytes[j + 1]) else { break prefix }
                    column += j + 2 - i
                    i = j + 2
                default:
                    break prefix
                }
                depth += 1
            }
            let start = i
            while i < n, !isLineEnd(bytes[i]) { i += 1 }
            let end = i
            i += i + 1 < n && bytes[i] == 0x0D && bytes[i + 1] == 0x0A ? 2 : 1
            if start == end, depth == 0 {
                // A blank line ends the paragraph.
                if endParagraph() { return true }
                continue
            }
            // Tables are counted on every line, inside what looks like a code fence too: a fence
            // misread must never hide one.
            var pipes = 0
            var delimiterRow = true
            var dash = false
            for k in start..<end {
                let c = bytes[k]
                if c == UInt8(ascii: "|") { pipes += 1 }
                if c == UInt8(ascii: "-") { dash = true } else if !isDelimiterRowChar(c) { delimiterRow = false }
            }
            columns = max(columns, pipes)
            rows += 1
            if delimiterRow, dash { table = true }
            if table, cells + (columns + 1) * rows > tableCells { return true }
            if fence != 0 {
                // A fence ends with its container: closing early only counts more.
                if quotes < fenceQuotes || column < fenceColumn {
                    fence = 0
                } else {
                    let r = run(start, end, fence)
                    if lead <= 3, r >= fenceLength, onlySpace(start + r, end) {
                        fence = 0
                        if endParagraph() { return true }
                    }
                    continue // what is inside is never read inline
                }
            }
            // A fence opens as CommonMark reads one: three or more ` or ~, indented at most three
            // columns, and a backtick fence's info string holds no backtick.
            let first: UInt8 = start < end ? bytes[start] : 0x20
            let r = first == UInt8(ascii: "`") || first == UInt8(ascii: "~") ? run(start, end, first) : 0
            if r >= 3, lead <= 3, first == UInt8(ascii: "~") || !holds(start + r, end, UInt8(ascii: "`")) {
                fence = first
                fenceLength = r
                fenceQuotes = quotes
                fenceColumn = column
                if endParagraph() { return true }
                continue
            }
            for k in start..<end where isDelimiter(bytes[k]) { paragraph += 1 }
            if paragraph > paragraphDelimiters { return true }
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
            scan: while i < bytes.count, bytes[i] != 0x0A, bytes[i] != 0x0D {
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
            // On to the next line (LF, CR or CRLF).
            while i < bytes.count, bytes[i] != 0x0A, bytes[i] != 0x0D { i += 1 }
            i += i + 1 < bytes.count && bytes[i] == 0x0D && bytes[i + 1] == 0x0A ? 2 : 1
        }
        return false
    }
}
