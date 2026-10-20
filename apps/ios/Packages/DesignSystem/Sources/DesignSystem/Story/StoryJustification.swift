import UIKit

/// Justified Chinese as a browser sets it (`text-align: justify` with `text-justify: auto`): the
/// room left on a line is shared out between its characters — between two CJK characters, beside a
/// CJK character, and at a space — never inside a Latin word, and a paragraph's last line (or a line
/// ending in a forced break) stays as it falls.
///
/// TextKit's own `.justified` widens only the spaces when a line has any, so a Chinese line holding
/// 「iPhone」 opened two wide holes round the word while its characters stayed packed; and a line
/// with none was spread glyph by glyph, Latin letters too. So a story's justified paragraphs are laid
/// out ragged (`ragged`), then each line's slack is added as letter spacing after the characters
/// that may take it (`apply`) — the same line breaks, now meeting the column on both sides.
public enum StoryJustification {
    /// Whether any paragraph of `text` asks to be justified.
    public static func wanted(_ text: NSAttributedString) -> Bool {
        var found = false
        text.enumerateAttribute(.paragraphStyle, in: NSRange(location: 0, length: text.length)) { value, _, stop in
            if (value as? NSParagraphStyle)?.alignment == .justified { found = true; stop.pointee = true }
        }
        return found
    }

    /// `text` with every justified paragraph set to its natural alignment (laid out ragged, then
    /// justified by hand).
    public static func ragged(_ text: NSAttributedString) -> NSAttributedString {
        guard wanted(text) else { return text }
        let out = NSMutableAttributedString(attributedString: text)
        text.enumerateAttribute(.paragraphStyle, in: NSRange(location: 0, length: text.length)) { value, range, _ in
            guard let style = value as? NSParagraphStyle, style.alignment == .justified,
                  let natural = style.mutableCopy() as? NSMutableParagraphStyle else { return }
            natural.alignment = .natural
            out.addAttribute(.paragraphStyle, value: natural, range: range)
        }
        return out
    }

    /// Justifies `storage` (already `ragged`) as laid out in `container`, in place. Answers whether
    /// it did: when the spread would have moved a line break, the storage is put back as it was.
    @discardableResult
    public static func apply(storage: NSTextStorage, layoutManager lm: NSLayoutManager, container: NSTextContainer) -> Bool {
        let width = container.size.width - 2 * container.lineFragmentPadding
        guard width.isFinite, width > 0, storage.length > 0 else { return false }
        lm.ensureLayout(for: container)
        let before = lines(lm, container)
        let text = storage.string as NSString
        var spread: [(range: NSRange, extra: CGFloat)] = []
        for (n, line) in before.enumerated() {
            // A paragraph's last line, and one ending in a forced break, are left as they fall.
            guard n < before.count - 1, line.length > 0 else { continue }
            let last = text.character(at: NSMaxRange(line) - 1)
            if last == 0x0A || last == 0x2028 || last == 0x2029 { continue }
            guard justifiable(storage, at: line.location) else { continue }
            var visible = line
            while visible.length > 0, isSpace(text.character(at: NSMaxRange(visible) - 1)) { visible.length -= 1 }
            guard visible.length > 1 else { continue }
            let glyphs = lm.glyphRange(forCharacterRange: visible, actualCharacterRange: nil)
            let used = lm.boundingRect(forGlyphRange: glyphs, in: container)
            // A hair short of the edge, so the spread line never reaches past it and breaks again.
            let slack = width - (used.maxX - container.lineFragmentPadding) - 0.25
            guard slack > 0.25 else { continue }
            // Character by character as a reader sees them (a pair of surrogates, an emoji with its
            // modifiers, is one), the room after each that may take it.
            var characters: [(range: NSRange, scalar: UInt32)] = []
            text.enumerateSubstrings(in: visible, options: .byComposedCharacterSequences) { sub, range, _, _ in
                characters.append((range, sub?.unicodeScalars.first?.value ?? 0))
            }
            var opportunities: [NSRange] = []
            for (a, b) in zip(characters, characters.dropFirst())
            where opportunity(a.scalar, b.scalar) && !isCode(storage, a.range.location) && !isCode(storage, b.range.location) {
                opportunities.append(a.range)
            }
            guard !opportunities.isEmpty else { continue }
            let each = slack / CGFloat(opportunities.count)
            spread += opportunities.map { ($0, each) }
        }
        guard !spread.isEmpty else { return false }
        let original = NSAttributedString(attributedString: storage)
        storage.beginEditing()
        for (range, extra) in spread {
            let kern = (storage.attribute(.kern, at: range.location, effectiveRange: nil) as? CGFloat) ?? 0
            storage.addAttribute(.kern, value: kern + extra, range: range)
        }
        storage.endEditing()
        lm.ensureLayout(for: container)
        if lines(lm, container) != before {
            storage.setAttributedString(original)
            lm.ensureLayout(for: container)
            return false
        }
        return true
    }

    /// Where the room may go: after a space, and between two characters either of which is CJK (a
    /// Han character, kana, Hangul or CJK punctuation) — not inside a run of Latin letters or digits,
    /// and not before a space (the space takes it).
    public static func opportunity(_ a: UInt32, _ b: UInt32) -> Bool {
        if isSpace(b) { return false }
        if isSpace(a) { return true }
        return isCJK(a) || isCJK(b)
    }

    static func isSpace(_ c: UInt32) -> Bool { c == 0x20 || c == 0x09 || c == 0x0A || c == 0x3000 || c == 0xA0 }
    static func isSpace(_ c: unichar) -> Bool { isSpace(UInt32(c)) }

    /// A character set wide in CJK text: ideographs (the supplementary planes' too), kana, Hangul, CJK
    /// and full-width punctuation, and the ellipsis and dashes the CJK face draws full-width.
    static func isCJK(_ c: UInt32) -> Bool {
        (0x2E80...0x9FFF).contains(c) || (0xAC00...0xD7A3).contains(c) || (0xF900...0xFAFF).contains(c)
            || (0xFE30...0xFE4F).contains(c) || (0xFF00...0xFF60).contains(c) || (0x20000...0x3FFFF).contains(c)
            || c == 0x2026 || c == 0x2014 || c == 0x2015
    }

    /// Code keeps its own spacing (story.css `letter-spacing: 0`): set in a monospaced face, it takes none of the room.
    static func isCode(_ storage: NSTextStorage, _ index: Int) -> Bool {
        (storage.attribute(.font, at: index, effectiveRange: nil) as? UIFont)?.fontDescriptor.symbolicTraits.contains(.traitMonoSpace) ?? false
    }

    /// Whether the paragraph at `index` was meant to be justified (its style says so, or it was made
    /// ragged from one that did: every story paragraph that is justified carries the marker).
    static func justifiable(_ storage: NSTextStorage, at index: Int) -> Bool {
        storage.attribute(.storyJustified, at: index, effectiveRange: nil) as? Bool ?? false
    }

    /// The character range of each line fragment.
    public static func lines(_ lm: NSLayoutManager, _ container: NSTextContainer) -> [NSRange] {
        var out: [NSRange] = []
        let glyphs = lm.glyphRange(for: container)
        lm.enumerateLineFragments(forGlyphRange: glyphs) { _, _, _, range, _ in
            out.append(lm.characterRange(forGlyphRange: range, actualGlyphRange: nil))
        }
        return out
    }

    /// `text` ready to be laid out and justified by hand: ragged, its justified paragraphs marked.
    public static func prepared(_ text: NSAttributedString) -> NSAttributedString {
        guard wanted(text) else { return text }
        let out = NSMutableAttributedString(attributedString: ragged(text))
        text.enumerateAttribute(.paragraphStyle, in: NSRange(location: 0, length: text.length)) { value, range, _ in
            if (value as? NSParagraphStyle)?.alignment == .justified { out.addAttribute(.storyJustified, value: true, range: range) }
        }
        return out
    }
}

extension NSAttributedString.Key {
    /// Marks the runs of a paragraph `StoryJustification` justifies by hand.
    static let storyJustified = NSAttributedString.Key("resonance.storyJustified")
}
