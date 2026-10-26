import SwiftUI

/// The story-card palette (StoryCard.tsx, lib/design/dominantHue): a card
/// prefers the palette slot nearest its cover's dominant hue, or cycles through
/// the six by position when it has none; in a list, ``palettes(_:)`` keeps
/// neighbours apart (lib/design/cardColours).
public nonisolated struct CardPalette: Sendable {
    /// CARD_HUES, in palette order.
    public static let hues: [Double] = [55, 290, 140, 88, 215, 18]

    public let index: Int
    public var hue: Double { Self.hues[index] }
    public var fill: Color { Tokens.cardFills[index] }
    public var border: Color { Tokens.cardBorders[index] }
    /// The family's deep pen (`CARD_BORDERS[f][1]`): the face of a control in the card's colours
    /// (round 9 §8, the cover's 加一張圖片 · 生成圖片) and the ink of one on its fill (更換封面).
    public var deep: Color {
        switch index {
        case 1: Tokens.cardBorder1Dark
        case 2: Tokens.cardBorder2Dark
        case 3: Tokens.cardBorder3Dark
        case 4: Tokens.cardBorder4Dark
        case 5: Tokens.cardBorder5Dark
        default: Tokens.cardBorder0Dark
        }
    }

    /// A card's own family from its id (round 9 §8): `seedFromId(id) % 6`, the bubbles' hash twinned on
    /// all three platforms — what the publish step's preview of a card with no cover wears, so its
    /// cover buttons take that card's colours rather than the first family's on every card. The feed
    /// still colours a coverless card by its place in the list.
    public static func family(id: String) -> Int {
        Int(seedFromId(id)) % hues.count
    }
    /// `oklch(97.5% 0.012 hue)` — the card's paper.
    public var interior: Color { Self.interiors[index] }
    /// `oklch(92.5% 0.024 hue)` — the bordered card's paper under a pointer (the web's BrushWash).
    public var hovered: Color { Self.hovereds[index] }
    /// `oklch(55% 0.04 hue / 0.4)` — the wavy rule above the byline.
    public var separator: Color { Self.separators[index] }
    /// `oklch(44% 0.08 hue)` — Resonance's handwritten margin note.
    public var noteInk: Color { Self.noteInks[index] }

    // Each family's, worked out once from the very CSS strings they were read from on every access.
    static let interiors = hues.map { OKLCHColor.parse("oklch(97.5% 0.012 \($0))") ?? Tokens.cardBg }
    static let hovereds = hues.map { OKLCHColor.parse("oklch(92.5% 0.024 \($0))") ?? Tokens.cardBg }
    static let separators = hues.map { OKLCHColor.parse("oklch(55% 0.04 \($0) / 0.4)") ?? Tokens.fieldBorder }
    static let noteInks = hues.map { OKLCHColor.parse("oklch(44% 0.08 \($0))") ?? Tokens.textMuted }
    /// `oklch(90% 0.06 hue)` — MiniStoryCard's cover and avatar fallback.
    public var accent: Color { OKLCHColor.color(0.9, 0.06, hue) }
    /// The cover placeholder's hatching: the fill darkened by 7 L, at 0.28.
    public var stripe: Color {
        let (L, C) = Self.fillLC[index]
        return OKLCHColor.color(L - 0.07, C, hue, alpha: 0.28)
    }

    /// CARD_FILLS' lightness and chroma, in palette order.
    static let fillLC: [(Double, Double)] = [(0.9, 0.065), (0.94, 0.032), (0.93, 0.042), (0.92, 0.075), (0.92, 0.033), (0.89, 0.047)]

    public init(accentHue: Double?, position: Int) {
        index = Self.preferred(accentHue: accentHue, position: position)
    }

    /// The family a list's colouring chose for the card (``palettes(_:)``).
    public init(index: Int) {
        self.index = ((index % Self.hues.count) + Self.hues.count) % Self.hues.count
    }

    /// A card's own family (`preferredPalette`): the one nearest its cover's hue, else its position's.
    public static func preferred(accentHue: Double?, position: Int) -> Int {
        if let accentHue { return nearest(accentHue) }
        return ((position % hues.count) + hues.count) % hues.count
    }

    /// How many cards before a card its family must differ from (`CARD_COLOUR_WINDOW`).
    public static let window = 3

    /// For each family, the other five, nearest hue first, equally near the lower index first
    /// (`CARD_FAMILY_ORDER`): where a clash moves a card.
    public static let order: [[Int]] = hues.indices.map { family in
        hues.indices.filter { $0 != family }.sorted { a, b in
            let da = distance(hues[family], hues[a]), db = distance(hues[family], hues[b])
            return da != db ? da < db : a < b
        }
    }

    /// The family of every card of a list, in its order (`cardPalettes`, round 5 B3): a card keeps its
    /// preference unless one of the ``window`` cards before it wears that family, then it takes the
    /// first of ``order`` none of them wears — so four cards in a row always differ, and one, two and
    /// three row-major columns all keep neighbours apart. Each card depends only on those before it:
    /// a page appended never recolours one shown. Colour the list as displayed (after blocks, every
    /// loaded page, skeletons after the cards as hue-less ones). Pinned by native/fixtures/card-colours.json.
    public static func palettes(_ accentHues: [Double?]) -> [Int] {
        var out: [Int] = []
        out.reserveCapacity(accentHues.count)
        for (i, hue) in accentHues.enumerated() {
            let near = out[max(0, i - window)..<i]
            let own = preferred(accentHue: hue, position: i)
            // Six families and three neighbours: some other family is always free.
            out.append(near.contains(own) ? (order[own].first { !near.contains($0) } ?? own) : own)
        }
        return out
    }

    /// The families of cards put on top of a list already shown and coloured (`below`, which keeps its
    /// own: the feed's picks that came after its latest cards). The rule run upward from where the two
    /// meet: from the last of them to the first, a card keeps its preference (by its place among them)
    /// unless one of the ``window`` cards after it wears that family — the next of them, then the first
    /// of `below` — and takes the first of ``order`` none of those wears. Whichever way a pair is
    /// visited, the later card checked the earlier, so four cards in a row still differ, across the
    /// seam too, and `below` keeps every colour it had.
    public static func palettes(_ accentHues: [Double?], over below: [Int]) -> [Int] {
        var out = [Int](repeating: 0, count: accentHues.count)
        for i in accentHues.indices.reversed() {
            let after = Array((out[(i + 1)...] + below).prefix(window))
            let own = preferred(accentHue: accentHues[i], position: i)
            out[i] = after.contains(own) ? (order[own].first { !after.contains($0) } ?? own) : own
        }
        return out
    }

    static func nearest(_ hue: Double) -> Int {
        hues.indices.min { distance(hue, hues[$0]) < distance(hue, hues[$1]) } ?? 0
    }

    /// `hueDistance`: the shorter way round the colour wheel.
    static func distance(_ a: Double, _ b: Double) -> Double {
        let d = abs(a - b).truncatingRemainder(dividingBy: 360)
        return min(d, 360 - d)
    }
}

// MARK: - Controls in a card's colours (round 9 §8)

extension OrganicButtonFace {
    /// 加一張圖片 · 生成圖片 over a coverless card's striped picture: the family's deep pen as the face,
    /// its words and glyph in the family's paper, the buttons' grain; a press darkens it as every solid
    /// face's does.
    public static func cardDeep(_ palette: CardPalette) -> OrganicButtonFace {
        OrganicButtonFace(fill: palette.deep, label: palette.interior, pressInk: .black.opacity(0.14), seed: 3)
    }

    /// The same button while it can't be pressed (生成圖片 with no story yet): the family's tonal step as
    /// the face with the muted words — never the alpha fade, which the stripes would show through.
    public static func cardDeepDisabled(_ palette: CardPalette) -> OrganicButtonFace {
        OrganicButtonFace(fill: palette.accent, label: Tokens.textMuted, pressInk: .clear, seed: 3)
    }

    /// 更換封面 on a card's picture: the family's fill, opaque, its words and glyph in the family's deep
    /// pen (its pen line, the family's own at INK, is the button's `outline`), the cards' grain.
    public static func cardChip(_ palette: CardPalette) -> OrganicButtonFace {
        OrganicButtonFace(fill: palette.fill, label: palette.deep, pressInk: palette.border.opacity(0.16), seed: 401,
                          grain: "grain-card", grainOpacity: 0.3)
    }
}
