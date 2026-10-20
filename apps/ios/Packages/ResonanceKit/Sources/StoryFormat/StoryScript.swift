import Foundation

/// How a story is set: CJK (a Ming title over a Hei body, justified) or Latin (Playfair over DM
/// Sans, ragged) — the web's `data-script` (src/styles/story.css). Which one a story is, is the
/// script rule's to say (`ScriptRule` in ResonanceKit, the twin of src/lib/text/script.ts); the
/// reader, the writer and a share card take their type from it (DesignSystem's `StoryTypography`).
public nonisolated enum StoryScript: String, Sendable, Hashable, CaseIterable {
    case cjk, latin

    /// ‘ or ’ with a Latin letter immediately before and after it (ICU reads the web's pattern alike).
    private static let latinMark = try! NSRegularExpression(pattern: "(?<=\\p{sc=Latn})[‘’](?=\\p{sc=Latn})")

    /// Where an apostrophe stands inside a Latin word (don’t, it’s, rock’n’roll): the UTF-16
    /// offsets of each U+2018 / U+2019 with a Latin letter on both sides — lib/text/script.ts
    /// `latinMarks`, pinned by native/fixtures/story-script.json. A CJK face draws these marks
    /// full-width, which would open a half-em hole inside the word, so a CJK story sets them in its
    /// Latin face (`StoryTypography.latinMarkFamily`). A mark beside anything else — 他’s, James’
    /// book, ‘OK’ — keeps the CJK form, as CJK typesetting wants.
    public static func latinMarks(_ text: String) -> [Int] {
        latinMark.matches(in: text, range: NSRange(location: 0, length: (text as NSString).length)).map(\.range.location)
    }

    /// The full-width stops and pauses a title's clause ends on (CardDetail/LatinMarkText's `CLAUSE_END`).
    public static let clauseEnds: Set<Unicode.Scalar> = ["，", "、", "；", "：", "。", "！", "？", "…", "—", "）", "」", "』", "》"]

    /// A title cut into its clauses, each ending just after one of its full-width stops or pauses
    /// (`clauseEnds`) — the web's LatinMarkText, which draws each as its own `.story-clause`, so a
    /// title too long for one line breaks after its punctuation (「湖中央，／我看見了知行合一」), not
    /// mid-phrase (Chinese may break between any two characters: 「湖中央，我看／見了知行合一」).
    /// The clauses joined are the title; one with no such mark is one clause. Cut where the web
    /// cuts — after every mark, code point by code point — so 「……」 is two.
    public static func titleClauses(_ title: String) -> [String] {
        var clauses: [String] = []
        var clause = String.UnicodeScalarView()
        for scalar in title.unicodeScalars {
            clause.append(scalar)
            if clauseEnds.contains(scalar) {
                clauses.append(String(clause))
                clause = String.UnicodeScalarView()
            }
        }
        if !clause.isEmpty { clauses.append(String(clause)) }
        return clauses
    }
}
