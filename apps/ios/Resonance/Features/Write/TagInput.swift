import Foundation

/// What the tag field does with the words it is given (TagField.tsx): a comma
/// of either width or the enumeration comma (、) ends a tag, so a pasted list
/// splits in one go, and a tag is trimmed and never added twice. Pure, so the
/// rules are pinned without a keyboard. The twin of Android's TagInput.
/// Nonisolated, since the tag field's Layout calls it off the main actor's turn.
nonisolated enum TagInput {
    private static let separators: Set<Character> = [",", "，", "、"]

    /// The text as typed or pasted, cut at its separators: the words it has
    /// finished (not yet trimmed) and what is still being typed after the last
    /// separator.
    static func split(_ text: String) -> (words: [String], rest: String) {
        guard text.contains(where: separators.contains) else { return ([], text) }
        var words = text.split(omittingEmptySubsequences: false, whereSeparator: separators.contains).map(String.init)
        let rest = words.removeLast()
        return (words, String(rest.drop(while: \.isWhitespace)))
    }

    /// `tags` with `words` added, in order: trimmed, blanks and tags already there left out.
    static func merge(_ tags: [String], _ words: [String]) -> [String] {
        var next = tags
        for word in words {
            let tag = word.trimmingCharacters(in: .whitespacesAndNewlines)
            if !tag.isEmpty, !next.contains(tag) { next.append(tag) }
        }
        return next
    }

    /// The field's text once it holds a line break (nil: none): one typed — Return, the rest of the text as
    /// it was (`before`) — is taken out and asks for the word to be added (`submit`); lines pasted in are
    /// parted as a comma parts them, the last one left to type on.
    static func returned(_ text: String, before: String) -> (text: String, submit: Bool)? {
        guard text.contains(where: \.isNewline) else { return nil }
        let joined = text.filter { !$0.isNewline }
        if joined == before { return (joined, true) }
        return (text.split(whereSeparator: \.isNewline).joined(separator: ","), false)
    }

    /// What is typed, trimmed: the tag it would add.
    static func trimmed(_ draft: String) -> String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Whether the field holds a word to add (round 16 §1): something typed, and no input method still
    /// composing it — zhuyin's underlined candidate is not a word yet.
    static func ready(draft: String, composing: Bool) -> Bool {
        !composing && !trimmed(draft).isEmpty
    }

    /// Whether a hardware keyboard's Backspace takes the last tag back: only in an empty field, nothing
    /// being composed (Backspace then belongs to the input method).
    static func takesBackLast(draft: String, composing: Bool) -> Bool {
        draft.isEmpty && !composing
    }
}
