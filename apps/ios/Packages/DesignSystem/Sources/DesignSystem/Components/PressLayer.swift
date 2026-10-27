import SwiftUI

// Round 16 §3–§4: the five hand-drawn reactions, the paper sheet the press-and-hold layer is made of,
// the chips a message wears in its gutter, and the quiet line an unsent message leaves.

extension ReactionId {
    /// What a reaction is called (`messages.reactions.<id>` in the caller's strings), in the stickers' order.
    public nonisolated static var order: [ReactionId] { [.heart, .moved, .laugh, .hug, .thumbs] }
}

/// One of the five message reactions (the web's atoms/ReactionGlyph), drawn from the generated layers
/// (Generated/Reactions.swift) bottom to top in a 24 box: each layer's fill and pen in its colour —
/// fixed in both schemes as emoji keep theirs — except the outer rim (`.outline`), which is the palette's
/// `reactionOutline` (deep brown on paper, chalk at night), so a sticker never melts into the dark.
/// Round caps and joins. Decorative: the control or chip holding it says what it means.
public struct ReactionGlyph: View {
    let id: ReactionId
    var size: CGFloat

    public init(_ id: ReactionId, size: CGFloat = 24) {
        self.id = id
        self.size = size
    }

    public var body: some View {
        let layers = id.layers
        Canvas { ctx, canvas in
            let scale = Double(canvas.width) / 24
            for layer in layers {
                let path = Self.path(layer.commands, scale: scale)
                var pen = ctx
                pen.opacity = layer.opacity
                if let fill = layer.fill { pen.fill(path, with: .color(Self.colour(fill))) }
                if let stroke = layer.stroke {
                    pen.stroke(path, with: .color(Self.colour(stroke)),
                               style: StrokeStyle(lineWidth: layer.width * scale, lineCap: .round, lineJoin: .round))
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    /// A sticker colour: the rim the scheme's, the rest their own (Display P3).
    static func colour(_ colour: ReactionColour) -> Color {
        if colour == .outline { return Tokens.reactionOutline }
        let p3 = colour.p3
        return Color(.displayP3, red: p3.red, green: p3.green, blue: p3.blue)
    }

    /// The layer's commands as a path (0 move, 1 line, 2 curve, 3 close), in a box `24 × scale`.
    static func path(_ commands: [Double], scale: Double) -> Path {
        var p = Path()
        var i = 0
        func pt(_ k: Int) -> CGPoint { CGPoint(x: commands[k] * scale, y: commands[k + 1] * scale) }
        while i < commands.count {
            switch commands[i] {
            case 0: p.move(to: pt(i + 1)); i += 3
            case 1: p.addLine(to: pt(i + 1)); i += 3
            case 2: p.addCurve(to: pt(i + 5), control1: pt(i + 1), control2: pt(i + 3)); i += 7
            default: p.closeSubpath(); i += 1
            }
        }
        return p
    }
}

// MARK: - The press layer's paper

/// The press-and-hold layer's paper (round 16 §3, round 17 §1): every menu's sheet now
/// (``OrganicMenuPanel``) — the menus' paper, a step toward the ink at night (L ≈ 28 %) so it stands off the
/// dimmed thread. The reactions float over the scrim with no paper of their own (round 17 §2).
public enum PressSheet {
    /// The sheet's paper: `--menu-paper`, at night 94 % of it toward the ink.
    public static var paper: Color { MenuColors.raisedPaper }

    /// The disc under the viewer's own reaction in the tray: the accent's light wash by day; at night the
    /// accent itself at 30 % over the raised paper (review F4: the light wash there, ≈ 1.2 : 1 against
    /// the paper, all but vanished — this lands near L 38 %), opaque, so it reads as chosen on the scrim.
    /// The web's `.trayWash`.
    public static let chosenDisc: Color = Palette.made { accent, scheme in
        func token(_ t: PaletteToken) -> (L: Double, C: Double, H: Double, alpha: Double) {
            OKLCHColor.components(Palette.oklch(t, accent: accent, scheme: scheme)) ?? (0, 0, 0, 1)
        }
        guard scheme == .dark else { return token(.terracottaLight) }
        return Palette.mixOKLCH(token(.terracotta), 0.3, MenuColors.paperOKLCH(hue: nil, scheme, accent: accent))
    }
}

/// The press layer's measures (round 16 §3, round 17 §2), the same on the web and Android.
public nonisolated enum PressMetrics {
    /// The tray: five 44 cells floating over the scrim, no paper round them — 220 × 44; its stickers 32.
    public static let trayCell: CGFloat = 44
    public static let traySticker: CGFloat = 32
    public static var trayWidth: CGFloat { trayCell * 5 }
    public static var trayHeight: CGFloat { trayCell }
    /// The tray 8 over the lifted message, the list 10 under it, both 12 inside the region the scrim covers.
    public static let trayGap: CGFloat = 8
    public static let listGap: CGFloat = 10
    public static let margin: CGFloat = 12

    /// The list's height for `rows` and a footer (the menus' one sheet, ``MenuSheetMetrics``).
    public static func listHeight(rows: Int, footer: Bool) -> CGFloat {
        MenuSheetMetrics.height(rows: rows, footer: footer)
    }
}

// MARK: - Reaction chips

/// A message's reactions as they sit in its gutter (round 16 §3): a paper capsule (the cream) with a
/// 2 pt ring of the thread's paper and no pen line, each distinct reaction's sticker at 18 — the same
/// one from both people once, with a muted 「2」 — a second sticker 20 further out. Placed by the
/// caller beside the bubble's foot, so the row never grows for it.
public struct ReactionChips: View {
    public nonisolated struct Entry: Equatable, Sendable {
        public let id: ReactionId
        public let count: Int

        public init(id: ReactionId, count: Int) {
            self.id = id
            self.count = count
        }
    }

    let entries: [Entry]
    /// Which way the chip grows from the bubble: toward the leading edge (your own) or the trailing (theirs).
    let outward: HorizontalEdge
    let seed: Double

    public init(_ entries: [Entry], outward: HorizontalEdge, seed: Double = 41) {
        self.entries = entries
        self.outward = outward
        self.seed = seed
    }

    public var body: some View {
        // The sticker nearest the bubble first: your own chip grows leftward, theirs rightward.
        let shown = outward == .leading ? Array(entries.reversed()) : entries
        HStack(spacing: 2) {
            ForEach(shown, id: \.id) { entry in
                HStack(spacing: 2) {
                    ReactionGlyph(entry.id, size: ReactionChipMetrics.sticker)
                    if entry.count > 1 {
                        Text(verbatim: "\(entry.count)")
                            .font(AppFonts.body(12, weight: .medium))
                            .foregroundStyle(Tokens.textMuted)
                            .padding(.trailing, 1)
                    }
                }
            }
        }
        .padding(.horizontal, ReactionChipMetrics.padX)
        .frame(height: ReactionChipMetrics.height)
        .background {
            let shape = WobRectShape(radius: ReactionChipMetrics.height / 2, seed: seed, mag: 0.8)
            ZStack {
                shape.fill(Tokens.cream).padding(-ReactionChipMetrics.ring)
                shape.fill(Tokens.cream)
            }
        }
    }
}

/// The chips' measures: 18 stickers in a 24 capsule, 3 of paper at its ends, a 2 ring round it; it
/// overlaps the bubble's edge by 6. A finger's target round it is at least 44 × 44 (review S7).
public nonisolated enum ReactionChipMetrics {
    public static let sticker: CGFloat = 18
    public static let height: CGFloat = 24
    public static let padX: CGFloat = 3
    public static let ring: CGFloat = 2
    public static let overlap: CGFloat = 6
    public static let target: CGFloat = 44
}

/// A tap target at least `side` × `side`, centred on what it is given (an unseen `contentShape`): a small
/// control — a reaction chip — keeps a finger's 44 while it is drawn smaller.
public nonisolated struct MinimumTarget: Shape {
    public var side: CGFloat

    public init(side: CGFloat = ReactionChipMetrics.target) {
        self.side = side
    }

    public func path(in rect: CGRect) -> Path {
        Path(Self.frame(rect, side: side))
    }

    /// `rect` grown about its centre to at least `side` on each axis.
    public static func frame(_ rect: CGRect, side: CGFloat) -> CGRect {
        rect.insetBy(dx: -max(0, side - rect.width) / 2, dy: -max(0, side - rect.height) / 2)
    }
}

// MARK: - The unsent line

/// What an unsent message leaves in its place (round 16 §3): one line tall, on its sender's side — the
/// bubble's own outline in a dashed light pen (INK_LIGHT, dash 4/4) with no paper, and a muted 13 line
/// saying who unsent it.
public struct UnsentBubble: View {
    let text: String
    let mine: Bool
    let seed: Double
    let tuckTop: Bool
    let tuckBottom: Bool

    public init(text: String, mine: Bool, seed: Double, tuckTop: Bool = false, tuckBottom: Bool = false) {
        self.text = text
        self.mine = mine
        self.seed = seed
        self.tuckTop = tuckTop
        self.tuckBottom = tuckBottom
    }

    public var body: some View {
        Text(text)
            .font(AppFonts.body(13, oblique: false))
            .foregroundStyle(Tokens.textMuted)
            .lineLimit(1)
            .padding(.horizontal, BubbleMetrics.padX)
            .padding(.vertical, 7)
            .background {
                MessageBubbleShape(seed: seed, mine: mine, tuckTop: tuckTop, tuckBottom: tuckBottom)
                    .stroke(Tokens.textMuted.opacity(0.7),
                            style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round, lineJoin: .round, dash: [4, 4]))
            }
    }
}
