import ResonanceAPI
import ResonanceKit

// The passages in a translation (round 31 §R; the owner: 「如果我讀翻譯的文章，譬如說中文翻成英文，那我這邊顯示的清單三句
// 應該也要都翻成英文才對哦……它這個句子還要可以對應回去原本的那個標在畫面上」). The translation's answer says the card's
// passages as it says them (`TranslationResponse.passages`: the original's ids, each with a piece of the translated story,
// word for word); the page reads its passages in those words while the translation is on screen.

/// What the page reads its passages in: `words` is nil while the story is in its own words, else the translation's
/// pieces — empty when the translation placed none (an older translation, none found), which offers and marks nothing,
/// as before this round.
nonisolated enum TranslatedPassages {
    /// The pieces the page reads its passages in: nil on the original, the translation's (or none) while it shows.
    static func words(translated: Bool, translation: [TapPassage]?) -> [TapPassage]? {
        translated ? (translation ?? []) : nil
    }

    /// The dialog's rows (§R1): the card's passages, in their order and with their ids — on the original as they are,
    /// in a translation each in the translation's words, those it lacks left out. A press still sends the id.
    static func rows(_ card: [TapPassage], words: [TapPassage]?) -> [TapPassage] {
        guard let words else { return card }
        return card.compactMap { passage in
            words.first { $0.id == passage.id }.map { TapPassage(id: passage.id, text: $0.text) }
        }
    }

    /// A translation on screen that says fewer than two of the card's passages (the original's own rule,
    /// ``TapPassageRules/fewest``; the web's `PASSAGES_MIN`): no dialog in translation, as before this round.
    static func saysTooFew(_ card: [TapPassage], words: [TapPassage]?) -> Bool {
        words != nil && !TapPassageRules.offers(rows(card, words: words))
    }

    /// Whether the card offers its passages to this reader: two at least (``TapPassageRules/offers(_:)``) — in a
    /// translation, two at least of them said in it.
    static func offers(_ card: [TapPassage], words: [TapPassage]?) -> Bool {
        TapPassageRules.offers(rows(card, words: words))
    }

    /// The picked sentences the story marks (§R2): on the original as they are; in a translation each picked id the
    /// translation has, with its piece's words (the same people), and none it lacks.
    static func picked(_ picked: [TapPicked], words: [TapPassage]?) -> [TapPicked] {
        guard let words else { return picked }
        return picked.compactMap { sentence in
            guard let piece = words.first(where: { $0.id == sentence.id }) else { return nil }
            var shown = sentence
            shown.text = piece.text
            return shown
        }
    }
}
