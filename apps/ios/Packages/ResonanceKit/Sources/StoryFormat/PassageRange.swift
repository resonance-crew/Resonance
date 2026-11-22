import Foundation

/// Where a picked sentence lies in one drawn text of the story (round 29 §P3): the web's
/// `src/lib/markdown/passageRange.ts` read line by line, run on the same cases
/// (`test/vectors/passageMarks.json`, ResonanceTests/PassageMarksTests).
///
/// A **leaf** is one text the story view draws as one run — a paragraph, a heading, a list item's
/// paragraph, a quote's paragraph, a table cell — its own characters as drawn (`InlineRun.text`
/// joined). The sentence is what the server keeps of a pick: the story's plain text.
///
/// 1. Both are read with runs of whitespace as one space and trimmed, and a space with a CJK
///    character on either side of it dropped.
/// 2. The first occurrence in the leaf that holds it; where the sentence starts (ends) with a letter
///    or a digit that is not CJK, the character before (after) the match must not be one.
/// 3. The answer is a range of the leaf's own text in UTF-16 code units (as NSString counts),
///    `start` the first character, `end` one past the last.
/// 4. Not there is nil: no wash, never a guess.
public nonisolated enum PassageRange {
    /// The code points read as CJK (inclusive), the web's `CJK_RANGES`.
    public static let cjkRanges: [ClosedRange<UInt32>] = [
        0x1100...0x11ff, // Hangul Jamo
        0x2e80...0x2fdf, // CJK and Kangxi radicals
        0x2ff0...0x303f, // ideographic description, CJK symbols and punctuation
        0x3040...0x31ff, // kana, Bopomofo, Hangul compatibility jamo, kanbun, strokes, katakana extensions
        0x3200...0x4dbf, // enclosed CJK, compatibility, extension A
        0x4e00...0x9fff, // unified ideographs
        0xa960...0xa97f, // Hangul Jamo extended A
        0xac00...0xd7ff, // Hangul syllables, Jamo extended B
        0xf900...0xfaff, // compatibility ideographs
        0xfe30...0xfe4f, // CJK compatibility forms
        0xff00...0xffef, // half-width and full-width forms
        0x20000...0x3ffff, // extensions B onward
    ]

    public static func isCjk(_ cp: UInt32) -> Bool {
        cjkRanges.contains { $0.contains(cp) }
    }

    /// JavaScript's `\s` (WhiteSpace and LineTerminator), not Swift's own idea of whitespace.
    static func isWhitespace(_ cp: UInt32) -> Bool {
        switch cp {
        case 0x09...0x0d, 0x20, 0xa0, 0x1680, 0x2000...0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff: return true
        default: return false
        }
    }

    /// `\p{L}` or `\p{N}`.
    static func isLetterOrDigit(_ cp: UInt32) -> Bool {
        guard let scalar = Unicode.Scalar(cp) else { return false }
        switch scalar.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
             .decimalNumber, .letterNumber, .otherNumber: return true
        default: return false
        }
    }

    /// A letter or a digit that is not CJK: a word's character in a Latin-script match.
    static func wordChar(_ cp: UInt32) -> Bool { !isCjk(cp) && isLetterOrDigit(cp) }

    struct Point { let cp: UInt32; let at: Int; let len: Int }

    /// A text read as rule 1 reads it: its code points, each with where it starts in the original and how long it is there.
    static func normalized(_ text: String) -> [Point] {
        var raw: [Point] = []
        var i = 0
        for scalar in text.unicodeScalars {
            let cp = scalar.value
            let len = scalar.utf16.count
            if isWhitespace(cp) {
                // A run of whitespace as one space, at its first character.
                if let last = raw.last, last.cp != 0x20 { raw.append(Point(cp: 0x20, at: i, len: len)) }
            } else {
                raw.append(Point(cp: cp, at: i, len: len))
            }
            i += len
        }
        while raw.last?.cp == 0x20 { raw.removeLast() }
        // A space with a CJK character on either side of it dropped.
        return raw.enumerated().filter { k, c in
            let before = k > 0 ? raw[k - 1].cp : 0
            let after = k + 1 < raw.count ? raw[k + 1].cp : 0
            return c.cp != 0x20 || !(isCjk(before) || isCjk(after))
        }.map(\.element)
    }

    /// The sentence's range in the leaf's own text (UTF-16, `end` exclusive), or nil when the leaf doesn't hold it.
    public static func find(_ leaf: String, _ sentence: String) -> (start: Int, end: Int)? {
        let hay = normalized(leaf)
        let needle = normalized(sentence).map(\.cp)
        guard !needle.isEmpty, needle.count <= hay.count else { return nil }
        let edgeStart = wordChar(needle[0])
        let edgeEnd = wordChar(needle[needle.count - 1])
        var s = 0
        while s + needle.count <= hay.count {
            defer { s += 1 }
            var k = 0
            while k < needle.count, hay[s + k].cp == needle[k] { k += 1 }
            if k < needle.count { continue }
            if edgeStart, s > 0, wordChar(hay[s - 1].cp) { continue }
            if edgeEnd, s + needle.count < hay.count, wordChar(hay[s + needle.count].cp) { continue }
            let last = hay[s + needle.count - 1]
            return (hay[s].at, last.at + last.len)
        }
        return nil
    }

    /// The first leaf, in the story's order, that holds the sentence, and its range there.
    public static func find(in leaves: [String], _ sentence: String) -> (leaf: Int, start: Int, end: Int)? {
        for (leaf, text) in leaves.enumerated() {
            if let r = find(text, sentence) { return (leaf, r.start, r.end) }
        }
        return nil
    }
}
