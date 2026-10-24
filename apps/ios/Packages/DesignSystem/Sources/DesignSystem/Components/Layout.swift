import SwiftUI

/// The width classes (design §8): the web's breakpoints, decided from the window's measured width —
/// never the device or `UIScreen` (an iPad window can be any width from a third of the screen up).
public nonisolated enum LayoutClass: Sendable, Equatable {
    case compact, medium, expanded

    /// compact < 600 ≤ medium < 900 ≤ expanded.
    public static func of(_ width: CGFloat) -> LayoutClass {
        width < Tokens.bpMedium ? .compact : width < Tokens.bpExpanded ? .medium : .expanded
    }

    /// The writer and the thought map side by side (the web's ≥ 1200 workspace).
    public static func writerSplit(_ width: CGFloat) -> Bool { width >= Tokens.bpWide }

    /// The tabs sit in the middle of a full-width header from medium up (round 5 B2: iPadOS's top
    /// tab bar, drawn our way); a phone keeps the bottom tab bar.
    public var topTabs: Bool { self != .compact }

    /// The header's tabs carry their words (expanded, room allowing); on medium, glyphs alone.
    public var tabLabels: Bool { self == .expanded }

    /// The page's side padding for a window `width` (the web's `--page-pad-x`: clamp(20, 4vw, 48)).
    public static func pad(_ width: CGFloat) -> CGFloat { min(max(width * 0.04, 20), 48) }

    /// How many bordered cards across: 2 or 3 on expanded (3 from 960 of content), bands (1) otherwise.
    public static func feedColumns(_ layout: LayoutClass, contentWidth: CGFloat) -> Int {
        layout == .expanded ? (contentWidth >= Tokens.feedThreeColMin ? 3 : 2) : 1
    }

    /// The widest a chat bubble's row may be in a thread list `listWidth` wide.
    public static func bubbleMax(_ listWidth: CGFloat) -> CGFloat {
        min((listWidth - 32) * 0.72, Tokens.bubbleMax)
    }

    /// The bordered grid's content width: at most 1200 with the page's pads inside it.
    public static func feedContentWidth(window: CGFloat) -> CGFloat {
        max(0, min(window, 1200) - 2 * pad(window))
    }

    /// The side inset that keeps content in a centred `measure` column inside `width`, never under `pad`.
    public static func columnInset(_ width: CGFloat, measure: CGFloat = Tokens.measure, pad: CGFloat) -> CGFloat {
        max(pad, (width - measure) / 2)
    }

    /// Which column (of `columns`) the card at `index` goes in: row-major, as the web's CardLinkGrid.
    public static func column(of index: Int, columns: Int) -> Int { columns > 0 ? index % columns : 0 }
}

/// The window as the app's root measured it, handed to every page.
public nonisolated struct WindowLayout: Sendable, Equatable {
    public var width: CGFloat
    public var height: CGFloat

    public init(width: CGFloat, height: CGFloat) {
        self.width = width
        self.height = height
    }

    public var layoutClass: LayoutClass { .of(width) }
    public var topTabs: Bool { layoutClass.topTabs }
    public var pad: CGFloat { LayoutClass.pad(width) }
    /// What the pages have across: the whole window (the tabs are in the header, or at the foot).
    public var contentWidth: CGFloat { width }
    public var writerSplit: Bool { LayoutClass.writerSplit(width) }

    /// A phone in portrait: what every view assumed before windows could be wide.
    public static let phone = WindowLayout(width: 390, height: 844)
}

extension EnvironmentValues {
    /// The window's measured size (set once at the root, from its geometry).
    @Entry public var window: WindowLayout = .phone
}

extension View {
    /// Keeps the scrolled content in a centred reading column of `measure` (plus the 20 of the content's
    /// own sides) on a window wider than a phone, while the scroll view stays the full width — its
    /// indicator at the window's edge. A compact window is left exactly as it was.
    public func readableColumn(_ measure: CGFloat = Tokens.measure) -> some View {
        modifier(ReadableColumn(measure: measure))
    }
}

private struct ReadableColumn: ViewModifier {
    let measure: CGFloat
    @Environment(\.window) private var window

    func body(content: Content) -> some View {
        if window.layoutClass == .compact {
            content
        } else {
            content.frame(maxWidth: measure + 40).frame(maxWidth: .infinity)
        }
    }
}

/// Where a card page's article and its rail sit (reading-type §4, the web's three-track grid). The
/// byline is under the title at every width (round 8 §10.1): the rail holds the story's table of
/// contents alone, so only a story that has one gets it.
///
/// - expanded, with contents: in the window less the page's pads (W), the text column
///   T = min(--measure, W − R), where R = the rail gap and the rail (`railReach`); centred while
///   there is room for the rail beside it (S = max(0, min((W − T) / 2, W − T − R))), sliding left
///   below that. The rail stands the rail gap (`--story-rail-gap`) past the text.
/// - expanded with no contents, and medium: one centred column, T = min(--measure, width − 2 · pad);
///   no rail.
/// - compact: the window, 20 a side.
///
/// `article` counts the article's own 20 sides (its text is `article − 40`); `leading` and `railX`
/// are from the page's leading edge.
public nonisolated struct CardPageLayout: Sendable, Equatable {
    public var rail: Bool
    public var article: CGFloat
    public var leading: CGFloat
    public var railX: CGFloat

    public init(rail: Bool, article: CGFloat, leading: CGFloat, railX: CGFloat) {
        self.rail = rail
        self.article = article
        self.leading = leading
        self.railX = railX
    }

    /// The article's own sides, inside `article`.
    public static let articleInset: CGFloat = 20
    /// What the rail takes beside the text: its gap and its width (R).
    public static var railReach: CGFloat { Tokens.storyRailGap + Tokens.cardRailW }

    /// The text column's width (what the story is set in).
    public var text: CGFloat { max(0, article - 2 * Self.articleInset) }

    /// `width`: what the page has across; `window`: the window's width; `contents`: the story has a
    /// table of contents for the rail (an expanded window's only reason for one).
    public static func of(width: CGFloat, window: CGFloat, contents: Bool = true) -> CardPageLayout {
        let pad = LayoutClass.pad(window)
        switch LayoutClass.of(window) {
        case .compact:
            return CardPageLayout(rail: false, article: width, leading: 0, railX: 0)
        case .medium:
            return centred(width: width, pad: pad)
        case .expanded:
            guard contents else { return centred(width: width, pad: pad) }
            let inner = max(0, width - 2 * pad)
            let text = max(0, min(Tokens.measure, inner - railReach))
            let slide = max(0, min((inner - text) / 2, inner - text - railReach))
            let start = pad + slide
            return CardPageLayout(rail: true, article: text + 2 * articleInset, leading: start - articleInset,
                                  railX: start + text + Tokens.storyRailGap)
        }
    }

    /// Where a card page's share and ⋯ stand (round 8 §10.1), by the window: on a tablet's — medium and
    /// up — at the end of the byline under the title, with the author and the read time · date, as the
    /// web's byline holds them at every width, and not in the bar; on a phone's (compact, an iPad's
    /// narrow split too) in the bar, as phone apps keep a page's actions. The story's end row holds
    /// them at every width.
    public static func actionsInByline(window: CGFloat) -> Bool { LayoutClass.of(window) != .compact }

    /// One column of the measure (or the width less its pads), centred; no rail.
    private static func centred(width: CGFloat, pad: CGFloat) -> CardPageLayout {
        let text = max(0, min(Tokens.measure, width - 2 * pad))
        return CardPageLayout(rail: false, article: text + 2 * articleInset, leading: (width - text) / 2 - articleInset, railX: 0)
    }
}

extension View {
    /// The hardware keyboard's Esc (and ⌘.) does `action` — a modal or a menu closes, as its backdrop
    /// does. A control nobody sees holds the shortcut (VoiceOver's escape is the view's own action).
    public func onEscapeKey(_ action: @escaping () -> Void) -> some View {
        background {
            Button("", action: action)
                .keyboardShortcut(.cancelAction)
                .opacity(0)
                .frame(width: 0, height: 0)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

extension View {
    /// A page head over a grid of cards (a card box, a profile): on a window wider than a phone it
    /// lines up with the grid — the same centred 1200 and the page's pad — rather than the window's
    /// edge. A compact window is left exactly as it was.
    public func alignedWithCardGrid(phonePadding: CGFloat = 20) -> some View {
        modifier(GridAligned(phonePadding: phonePadding))
    }
}

private struct GridAligned: ViewModifier {
    let phonePadding: CGFloat
    @Environment(\.window) private var window

    func body(content: Content) -> some View {
        if window.layoutClass == .compact {
            content.padding(.horizontal, phonePadding)
        } else {
            content
                .padding(.horizontal, window.pad)
                .frame(maxWidth: 1200, alignment: .leading)
                .frame(maxWidth: .infinity)
        }
    }
}
