import Foundation
import StoryFormat

/// What the publish panel's mirror tells apart: the CJK scripts one by one, Latin, and anything
/// else (or nothing).
public nonisolated enum DraftScript: String, Sendable, Hashable {
    case han, kana, hangul, latin, other
}

/// How a story is set, and the language its words are in.
public nonisolated struct StoryType: Hashable, Sendable {
    public var script: StoryScript
    /// The language tag for the title and the prose only (never what is around them, which is in
    /// the reader's own language): zh-TW, ja, ko or en; nil for a text with no letters or one in a
    /// script we can't name (Cyrillic, Greek… — better no tag than a wrong one).
    public var lang: String?

    public init(script: StoryScript, lang: String?) {
        self.script = script
        self.lang = lang
    }
}

/// Which script a text is written in — src/lib/text/script.ts, line for line: one rule for how a
/// story is set (the reader, the writer, a share card) and for the publish panel's mirror, on the
/// web and in both apps, pinned case by case by native/fixtures/story-script.json (its
/// `latinMarks` are StoryFormat's `StoryScript.latinMarks`: they need no prose read).
///
/// A text is read as a reader reads it: a CJK character against a word. Only its prose counts —
/// Markdown, link targets and bare addresses are left out (`StoryProse.plainText`, as the web's
/// `readableProse` does) — and only its start, `readChars` of title and story together, so a
/// 200 000-character story is judged in a moment.
public nonisolated enum ScriptRule {
    /// How much of a text, title and story together, is read from its start (UTF-16 units).
    public static let readChars = 4_000

    /// How much a draft must hold — CJK characters and other words together, as the mirror counts
    /// them (MIN_DRAFT_UNITS) — before the writer re-sets it by what it reads.
    public static let writerFloor = 15

    /// How far past even a draft must lean before the writer changes its type: set as CJK, it turns
    /// Latin once CJK characters are at most this share of what it holds; set as Latin, it turns
    /// CJK once they are at least 1 − this. Between the two it keeps the type it has.
    public static let writerLean = 0.4

    /// What a text holds: its CJK characters by script, and the words of the other scripts.
    public struct Measure: Hashable, Sendable {
        public var han = 0
        public var kana = 0
        public var hangul = 0
        /// han + kana + hangul
        public var cjk: Int { han + kana + hangul }
        /// Words in the scripts that space them, digits alone included.
        public var words = 0
        /// Words with a Latin letter in them.
        public var latinWords = 0
        /// Words with any letter in them (not digits alone).
        public var letterWords = 0
    }

    // The web's patterns, as ICU reads them (the same Unicode properties: Script_Extensions for the
    // CJK scripts and for Latin, so a 。 or a ー counts as the script around it).
    private static let han = regex("\\p{scx=Han}")
    private static let kana = regex("[\\p{scx=Hira}\\p{scx=Kana}]")
    private static let hangul = regex("\\p{scx=Hang}")
    private static let cjkChars = regex("[\\p{scx=Han}\\p{scx=Hira}\\p{scx=Kana}\\p{scx=Hang}]")
    /// A run of letters in a script that spaces its words (Latin, Cyrillic, Greek…).
    private static let spacedWord = regex("[\\p{L}\\p{N}][\\p{L}\\p{N}'’-]*")
    private static let latin = regex("\\p{scx=Latn}")
    private static let letter = regex("\\p{L}")
    private static let cjkLocale = try! NSRegularExpression(pattern: "^(zh|ja|ko)\\b", options: [.caseInsensitive])

    private static func regex(_ pattern: String) -> NSRegularExpression { try! NSRegularExpression(pattern: pattern) }

    private static func count(_ re: NSRegularExpression, in text: String) -> Int {
        re.numberOfMatches(in: text, range: NSRange(location: 0, length: (text as NSString).length))
    }

    private static func holds(_ re: NSRegularExpression, _ text: String) -> Bool {
        re.firstMatch(in: text, range: NSRange(location: 0, length: (text as NSString).length)) != nil
    }

    /// CJK characters and the other words of a text.
    public static func measure(_ text: String) -> Measure {
        var m = Measure()
        m.han = count(han, in: text)
        m.kana = count(kana, in: text)
        m.hangul = count(hangul, in: text)
        let spaced = cjkChars.stringByReplacingMatches(in: text, range: NSRange(location: 0, length: (text as NSString).length),
                                                       withTemplate: " ") as NSString
        for match in spacedWord.matches(in: spaced as String, range: NSRange(location: 0, length: spaced.length)) {
            let word = spaced.substring(with: match.range)
            m.words += 1
            if holds(latin, word) { m.latinWords += 1 }
            if holds(letter, word) { m.letterWords += 1 }
        }
        return m
    }

    /// The prose of a title and story's first `readChars` characters.
    public static func readableProse(title: String, story: String) -> String {
        let text = "\(title)\n\n\(story)"
        let units = text.utf16
        guard units.count > readChars else { return StoryProse.plainText(text) }
        // Cut as JavaScript's slice cuts, in UTF-16 units (a half pair counts as no letter, either way).
        return StoryProse.plainText(String(decoding: Array(units.prefix(readChars)), as: UTF16.self))
    }

    private static func script(of m: Measure) -> DraftScript {
        if m.cjk == 0 && m.words == 0 { return .other }
        if m.cjk >= m.words {
            if m.hangul > m.han + m.kana { return .hangul }
            return m.kana * 10 >= m.cjk ? .kana : .han
        }
        return m.latinWords * 2 >= m.words ? .latin : .other
    }

    /// The script the draft is mostly written in, by what a reader reads most of: a CJK character
    /// against a word. Kana make Han Japanese; a Latin-script draft may hold a Chinese name and stays Latin.
    public static func draftScript(title: String, story: String) -> DraftScript {
        script(of: measure(readableProse(title: title, story: story)))
    }

    /// The language tag each script stands for: Han is the site's own zh-TW (so VoiceOver keeps its Taiwan voice).
    private static func lang(_ script: DraftScript) -> String? {
        switch script {
        case .han: "zh-TW"
        case .kana: "ja"
        case .hangul: "ko"
        case .latin: "en"
        case .other: nil
        }
    }

    /// How a story is set, and the language its words are in. CJK when the mirror reads Han, kana
    /// or Hangul; Latin otherwise. A text with no letters at all — empty, or digits and marks
    /// alone — is neither, and takes `fallback`: the writer passes its interface language's
    /// (`localeScript`), so an English writer's new card starts in Latin type instead of re-setting
    /// itself under the caret a moment after the first line; everyone else takes CJK, the site's own.
    public static func storyType(title: String, story: String, fallback: StoryScript = .cjk) -> StoryType {
        let m = measure(readableProse(title: title, story: story))
        if m.cjk == 0 && m.letterWords == 0 { return StoryType(script: fallback, lang: nil) }
        let read = script(of: m)
        return StoryType(script: [.han, .kana, .hangul].contains(read) ? .cjk : .latin, lang: lang(read))
    }

    /// How a story is set (`storyType`'s `script`).
    public static func storyScript(title: String, story: String, fallback: StoryScript = .cjk) -> StoryScript {
        storyType(title: title, story: story, fallback: fallback).script
    }

    /// The language a story's words are in (`storyType`'s `lang`).
    public static func storyLang(title: String, story: String) -> String? {
        storyType(title: title, story: story).lang
    }

    /// The script an empty draft starts in, from the interface's language: en is Latin, zh-TW (and
    /// any CJK language) is CJK.
    public static func localeScript(_ locale: String) -> StoryScript {
        holds(cjkLocale, locale) ? .cjk : .latin
    }

    /// The type a story being written is set in, re-read as it is written (the writer asks on its
    /// autosave tick, never per keystroke). `current` is what it is set in now — for a new draft its
    /// interface language's (`localeScript`), for a draft opened again `storyType`'s reading of it.
    /// The draft changes type only once it holds `writerFloor` units and leans clearly the other
    /// way (`writerLean`); a draft with no letters keeps what it has.
    public static func writerScript(current: StoryScript, title: String, story: String) -> StoryScript {
        let m = measure(readableProse(title: title, story: story))
        let units = m.cjk + m.words
        if units < writerFloor || (m.cjk == 0 && m.letterWords == 0) { return current }
        let share = Double(m.cjk) / Double(units)
        if current == .cjk { return share <= writerLean ? .latin : .cjk }
        return share >= 1 - writerLean ? .cjk : .latin
    }
}
