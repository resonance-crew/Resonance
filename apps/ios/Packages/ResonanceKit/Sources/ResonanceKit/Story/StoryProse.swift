import Foundation

/// A story's prose as lists and previews show it — src/lib/markdown/plainText.ts (and
/// lib/text/entities.ts), line for line: the one rule the server (a list's stored excerpt), the
/// web's story cards and thought-map nodes, the script a story is set in (`StoryType`) and what a
/// share card quotes (`SharePassages`) share. The Markdown stripped (a link keeps its words),
/// every bare address the link rules find left out (`withoutLinks`), character references and
/// escapes read as the text they stand for; `excerpt` cuts it between code points.
/// Android's twin is core/kit/story/PlainText.kt.
public nonisolated enum StoryProse {
    /// What the writer wrote as text must not read as syntax: a backslash-escaped ASCII punctuation
    /// mark (`\*`, `1\.`, `\#` — the editor writes them) and a character reference (`&gt;` — the
    /// editor stores `->` as `-&gt;`). Each stands in as a private-use character, U+E000 plus its
    /// ASCII code — one UTF-16 unit for one, so offsets agree with the restored text — until the
    /// syntax is gone (`restore`). Such characters are never in a story's prose otherwise:
    /// plainText drops any it is given.
    private static let literalBase: UInt32 = 0xE000
    private static let literalsPattern = "[\u{E021}-\u{E07E}]"

    private static func isASCIIPunctuation(_ c: UInt32) -> Bool {
        (0x21...0x2F).contains(c) || (0x3A...0x40).contains(c) || (0x5B...0x60).contains(c) || (0x7B...0x7E).contains(c)
    }

    private static func literal(_ text: String) -> String {
        let scalars = Array(text.unicodeScalars)
        guard scalars.count == 1, isASCIIPunctuation(scalars[0].value),
              let mark = Unicode.Scalar(literalBase + scalars[0].value) else { return text }
        return String(Character(mark))
    }

    /// The references pages and the editor actually use (entities.ts's NAMED).
    private static let named: [String: String] = [
        "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ", "copy": "©", "reg": "®", "trade": "™",
        "hellip": "…", "mdash": "—", "ndash": "–", "lsquo": "‘", "rsquo": "’", "ldquo": "“", "rdquo": "”", "laquo": "«",
        "raquo": "»", "middot": "·", "bull": "•", "times": "×", "deg": "°", "euro": "€", "pound": "£", "yen": "¥", "cent": "¢",
        "sect": "§", "para": "¶", "iexcl": "¡", "iquest": "¿", "eacute": "é", "egrave": "è", "ecirc": "ê", "agrave": "à",
        "aacute": "á", "acirc": "â", "ccedil": "ç", "uuml": "ü", "ouml": "ö", "auml": "ä", "szlig": "ß", "ntilde": "ñ",
        "oacute": "ó", "iacute": "í", "uacute": "ú",
    ]

    /// What one reference's body (`amp`, `#62`, `#x3E`) stands for; nil for a name it doesn't know.
    public static func entityValue(_ body: String) -> String? {
        if body.hasPrefix("#") {
            let digits = body.dropFirst()
            let hex = digits.first.map { $0 == "x" || $0 == "X" } ?? false
            let code = hex ? UInt32(digits.dropFirst(), radix: 16) : UInt32(digits, radix: 10)
            guard let code, code != 0, code <= 0x10FFFF, !(0xD800...0xDFFF).contains(code), let scalar = Unicode.Scalar(code) else {
                return "\u{FFFD}"
            }
            return String(Character(scalar))
        }
        return named[body.lowercased()]
    }

    /// Escapes and references set aside as literals (a backslash at a line's end — a hard break — is a space).
    private static func literals(_ markdown: String) -> String {
        let re = try! NSRegularExpression(
            pattern: "\\\\([!-/:-@\\[-`{-~])|\\\\\\r?\\n|&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});",
            options: [.caseInsensitive])
        let ns = markdown as NSString
        var out = ""
        var at = 0
        for m in re.matches(in: markdown, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: at, length: m.range.location - at))
            let whole = ns.substring(with: m.range)
            if m.range(at: 1).location != NSNotFound {
                out += literal(ns.substring(with: m.range(at: 1)))
            } else if m.range(at: 2).location == NSNotFound {
                out += " "
            } else if let value = entityValue(ns.substring(with: m.range(at: 2))) {
                out += literal(value)
            } else {
                out += whole
            }
            at = NSMaxRange(m.range)
        }
        return out + ns.substring(from: at)
    }

    /// The marks `literals` set aside, back as the characters they are.
    private static func restore(_ text: String) -> String {
        var scalars = String.UnicodeScalarView()
        for s in text.unicodeScalars {
            if (0xE021...0xE07E).contains(s.value), let plain = Unicode.Scalar(s.value - literalBase) {
                scalars.append(plain)
            } else {
                scalars.append(s)
            }
        }
        return String(scalars)
    }

    /// The text without its bare addresses: exactly the links the link rules find (ChatLinks, the
    /// server's findLinks), each with the `<…>` of an autolink round it. Everything else stays: the
    /// words either side, the punctuation after the address (with no space left hanging before it),
    /// an address the rules don't read as a link (`foo@www.…`, `localhost`). Marks set aside by
    /// `literals` count as what they stand for.
    public static func withoutLinks(_ text: String) -> String {
        let ns = text as NSString
        let plain = restore(text) as NSString
        var out = ""
        var at = 0
        for link in ChatLinks.links(in: plain as String) {
            var start = link.range.location, end = NSMaxRange(link.range)
            if start > 0, end < plain.length, plain.character(at: start - 1) == 0x3C, plain.character(at: end) == 0x3E {
                start -= 1
                end += 1
            }
            let before = ns.substring(with: NSRange(location: at, length: start - at))
            // "see https://…, then" reads "see, then"; "see https://… then" keeps its space.
            let next = plain.substring(with: NSRange(location: end, length: min(2, plain.length - end)))
            out += closes(next) ? trimmingTrailingSpace(before) : before
            at = end
        }
        return out + ns.substring(from: at)
    }

    /// A closing mark — sentence punctuation, a closing bracket or quote, CJK ones too — leads `text`
    /// (the sentence's, never the link's).
    private static func closes(_ text: String) -> Bool {
        guard let first = text.unicodeScalars.first else { return false }
        switch first.properties.generalCategory {
        case .otherPunctuation, .closePunctuation, .finalPunctuation: return true
        default: return false
        }
    }

    private static func trimmingTrailingSpace(_ text: String) -> String {
        var scalars = Array(text.unicodeScalars)
        while let last = scalars.last, last.properties.isWhitespace { scalars.removeLast() }
        return String(String.UnicodeScalarView(scalars))
    }

    /// A picture, `![alt](src)`, and a link, `[text](destination)` (its words are group 1), on one
    /// line (plainText.ts's PICTURE and LINK). Every run is bounded — a link's words by
    /// `linkTextMax`, its destination by the longest address the link rules take — so no attempt
    /// reads on to the story's end: unbounded, a story of 200 000 unclosed `[` took seconds. A link
    /// whose words run longer shows its brackets in an excerpt, which is harmless. Each run is
    /// possessive (`{…}+`, which JavaScript lacks): its class holds no `]` / `)`, so giving a
    /// character back could never let the mark after it match — the same matches, without ICU
    /// trying every shorter run (4–5 times quicker on a flood of brackets).
    public static let linkTextMax = 500
    private static let picturePattern = "!\\[[^\\]\\n]{0,\(linkTextMax)}+\\]\\([^)\\n]{0,\(ChatLinks.maxLength)}+\\)"
    private static let linkPattern = "\\[([^\\]\\n]{0,\(linkTextMax)}+)\\]\\([^)\\n]{0,\(ChatLinks.maxLength)}+\\)"
    /// A picture with a web address (group 1), bounded as `picturePattern` is.
    private static let webPicture = try! NSRegularExpression(
        pattern: "!\\[[^\\]\\n]{0,\(linkTextMax)}+\\]\\((https?://[^\\s)]{1,\(ChatLinks.maxLength)}+)\\)")

    /// A GFM table's delimiter row (`| --- | :-: |`): one line, each cell one dash run (plainText.ts's
    /// TABLE_DELIMITER), so no line is read twice.
    private static let tableDelimiter = try! NSRegularExpression(
        pattern: #"^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$"#)

    /// A table row's cells, their words joined by 「 · 」 (the pipes at its ends are the row's, not a cell's).
    private static func rowWords(_ line: String) -> String {
        var row = Substring(line.trimmingCharacters(in: .whitespacesAndNewlines))
        if row.hasPrefix("|") { row = row.dropFirst() }
        if row.hasSuffix("|") { row = row.dropLast() }
        return row.split(separator: "|", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    /// A GFM table read as its cells' words (round 8 §5.2, plainText.ts's tableWords): its delimiter
    /// row gone, each row's cells joined by 「 · 」 — never the pipes and dashes. A table is a header
    /// row with a pipe, the delimiter row (with a pipe: `a` over `---` is a heading) and the rows with
    /// a pipe after it, up to a blank line; an escaped pipe (`\|`) is a cell's own (`literals` set it
    /// aside). One pass over the lines.
    static func tableWords(_ text: String) -> String {
        guard text.contains("|") else { return text }
        var lines = text.components(separatedBy: "\n")
        var i = 1
        while i < lines.count {
            let line = lines[i]
            let ns = line as NSString
            guard line.contains("|"), lines[i - 1].contains("|"),
                  tableDelimiter.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) != nil else {
                i += 1
                continue
            }
            lines[i - 1] = rowWords(lines[i - 1])
            lines[i] = ""
            var next = i + 1
            while next < lines.count, lines[next].contains("|"), !lines[next].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                lines[next] = rowWords(lines[next])
                next += 1
            }
            i = next
        }
        return lines.joined(separator: "\n")
    }

    /// The address of the story's first picture on the web — a node's little visual — or nil (plainText.ts's firstPicture).
    public static func firstPicture(_ markdown: String) -> String? {
        let ns = markdown as NSString
        guard let m = webPicture.firstMatch(in: markdown, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return ns.substring(with: m.range(at: 1))
    }

    /// A story's prose without Markdown syntax (links keep their words), as a reader sees it:
    /// character references decoded (`-&gt;` reads `->`) and backslash escapes gone (`\*` reads `*`),
    /// without either ever making syntax; its bare addresses left out.
    /// A line break after a sentence's CJK punctuation reads as nothing when CJK text follows (the web's
    /// CJK_BREAK): Chinese and Japanese set no space after 。！？」, so a paragraph break there must not leave
    /// one. A break after a word (a heading, a table row) stays a space; so does one beside Latin or Hangul text.
    private static let cjkBreakPattern: String = {
        let stop = "\\u3001-\\u303F\\uFF01-\\uFF0F\\uFF1A-\\uFF20\\uFF3B-\\uFF40\\uFF5B-\\uFF65\\u2019\\u201D\\u2014\\u2026"
        let text = "\\p{Han}\\p{Hiragana}\\p{Katakana}\\p{Bopomofo}\\u3001-\\u303F\\uFF01-\\uFF65"
        return "(?<=[\(stop)])\\s*[\\n\\r\\u2028\\u2029]\\s*(?=[\(text)])"
    }()

    public static func plainText(_ markdown: String) -> String {
        func replace(_ text: String, _ pattern: String, _ template: String, lines: Bool = false) -> String {
            let re = try! NSRegularExpression(pattern: pattern, options: lines ? [.anchorsMatchLines] : [])
            return re.stringByReplacingMatches(in: text, range: NSRange(location: 0, length: (text as NSString).length),
                                               withTemplate: template)
        }
        var t = literals(replace(replace(markdown, literalsPattern, ""), "```[\\s\\S]*?```", " "))
        t = replace(t, picturePattern, " ")
        t = replace(t, linkPattern, "$1")
        // After the addresses go: an address's `_`, `~` and `*` are not emphasis.
        t = withoutLinks(t)
        t = replace(t, "^#{1,6}\\s+", "", lines: true)
        t = replace(t, "^>\\s?", "", lines: true)
        // A table, a quote's too, as its cells' words.
        t = tableWords(t)
        // A marker's indent is spaces and tabs on its own line: `^\s*` would read on across every blank line after it, at each one (quadratic).
        t = replace(t, "^[ \\t]*(?:[-*+]|[0-9]+\\.)\\s+", "", lines: true)
        t = replace(t, "^[ \\t]*(?:-{3,}|\\*{3,}|_{3,})[ \\t]*$", "", lines: true)
        t = replace(t, "[*~`]+", "")
        // An underscore inside a word is the word's (snake_case, a_b_c): only one at a word's edge can be emphasis.
        t = replace(t, "(?<![\\p{L}\\p{N}])_+|_+(?![\\p{L}\\p{N}])", "")
        // A line break after CJK punctuation, before CJK text, reads as nothing (the web's CJK_BREAK).
        t = replace(t, cjkBreakPattern, "")
        t = replace(t, "\\s+", " ")
        return restore(t.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// The first `max` code points, then "…": cut between code points, never inside an emoji.
    public static func excerpt(_ text: String, max: Int) -> String {
        let scalars = Array(text.unicodeScalars)
        guard scalars.count > max else { return text }
        return String(String.UnicodeScalarView(scalars.prefix(max))) + "…"
    }
}
