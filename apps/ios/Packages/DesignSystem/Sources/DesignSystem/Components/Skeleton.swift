import Synchronization
import UIKit
import SwiftUI

/// Skeleton.tsx: one placeholder block with the warm shimmer — sand, then a
/// light band of the card's hue sweeping across, 1.5s a pass. Plain sand
/// under Reduce Motion (the web's `animation: none`).
public struct SkeletonBlock: View {
    var width: CGFloat?
    var fraction: CGFloat?
    var height: CGFloat?
    var radius: CGFloat
    var circle: Bool
    var alignment: Alignment

    /// `width` nil fills the row (or `fraction` of it), `height` nil the
    /// height it is offered (a cover); `radius` is the web's default 7.
    public init(width: CGFloat? = nil, fraction: CGFloat? = nil, height: CGFloat? = 14, radius: CGFloat = 7,
                circle: Bool = false, alignment: Alignment = .leading) {
        self.width = width
        self.fraction = fraction
        self.height = height
        self.radius = radius
        self.circle = circle
        self.alignment = alignment
    }

    @Environment(\.skeletonHue) private var hue
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The shimmer's place in its pass, from the one timeline of a skeleton screen (``SkeletonTimeline``).
    @Environment(\.skeletonPhase) private var sharedPhase
    @Environment(\.skeletonPaused) private var paused

    public var body: some View {
        if circle {
            let side = width ?? height ?? 14
            fill.clipShape(Circle()).frame(width: side, height: side)
        } else if let fraction {
            GeometryReader { geo in
                fill.clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                    .frame(width: geo.size.width * fraction)
                    .frame(maxWidth: .infinity, alignment: alignment)
            }
            .frame(height: height)
        } else {
            fill.clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                .frame(width: width, height: height)
                .frame(maxWidth: width == nil ? .infinity : nil, maxHeight: height == nil ? .infinity : nil, alignment: .leading)
        }
    }

    @ViewBuilder private var fill: some View {
        if reduceMotion {
            Self.base
        } else if let sharedPhase {
            Self.shimmer(phase: sharedPhase, highlight: Self.highlight(hue))
                .accessibilityHidden(true)
        } else {
            let highlight = Self.highlight(hue)
            // A faint band 1.5 s a pass: 30 frames a second are enough (audit I4), and none on a tab not shown.
            TimelineView(.animation(minimumInterval: SkeletonBlock.frameInterval, paused: paused)) { timeline in
                Self.shimmer(phase: Self.phase(at: timeline.date), highlight: highlight)
            }
            .accessibilityHidden(true)
        }
    }

    /// How often a shimmer is redrawn: 30 a second, never the display's 120.
    static let frameInterval: Double = 1.0 / 30

    /// Where the shimmer is in its 1.5 s pass at `date`, eased: every block on screen shares it.
    static func phase(at date: Date) -> Double {
        ease(date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.5) / 1.5)
    }

    /// --skeleton-base: the well with a touch of ink in light; in dark the card paper's, lifted off the
    /// night paper (the well would sink into it).
    static let base = Tokens.skeletonBase

    /// color-mix(in oklab, <highlight> 50%, var(--skeleton-glow)), the highlight being the card family's
    /// skeleton step on a card (oklch(88% .08 hue) in light, 34% .05 in dark), or the theme's light
    /// accent elsewhere — all of the palette the window wears now. Each hue's made once, for every theme
    /// and scheme, and picked at draw time as the tokens are.
    static func highlight(_ hue: Double?) -> Color {
        let key = hue.map { Int(($0 * 100).rounded()) } ?? -1
        if let kept = highlights.withLock({ $0[key] }) { return kept }
        let color = Palette.made { accent, scheme in
            let c = highlightOKLCH(hue, accent: accent, scheme: scheme)
            return (c.L, c.C, c.H, 1)
        }
        highlights.withLock { $0[key] = color }
        return color
    }

    private static let highlights = Mutex<[Int: Color]>([:])

    /// The highlight as OKLCH: the card's shade (or the theme's light accent) and --skeleton-glow
    /// averaged in OKLab (a = C·cos h, b = C·sin h), so the mix stays on the line between them. An
    /// average of hues instead swung a lavender card's light through red to pink and a blue one's to
    /// green (both on the way to the cream's 75°).
    public static func highlightOKLCH(_ hue: Double?, accent: Accent = .terracotta,
                                      scheme: PaletteScheme = .light) -> (L: Double, C: Double, H: Double) {
        func token(_ t: PaletteToken) -> (L: Double, C: Double, H: Double) {
            let c = OKLCHColor.components(Palette.oklch(t, accent: accent, scheme: scheme)) ?? (0.5, 0, 0, 1)
            return (c.L, c.C, c.H)
        }
        let card = hue.map { scheme == .light ? (L: 0.88, C: 0.08, H: $0) : (L: 0.34, C: 0.05, H: $0) } ?? token(.terracottaLight)
        let glow = token(.skeletonGlow)
        func lab(_ c: (L: Double, C: Double, H: Double)) -> (L: Double, a: Double, b: Double) {
            let r = c.H * .pi / 180
            return (c.L, c.C * cos(r), c.C * sin(r))
        }
        let x = lab(card), y = lab(glow)
        let L = (x.L + y.L) / 2, a = (x.a + y.a) / 2, b = (x.b + y.b) / 2
        let H = atan2(b, a) * 180 / .pi
        return (L, (a * a + b * b).squareRoot(), H < 0 ? H + 360 : H)
    }

    /// The gradient is 4× the block wide (stops at 25/37/63%) and slides from
    /// background-position 100% to −100%, repeating — so the light band
    /// crosses once per pass, left to right.
    static func shimmer(phase: Double, highlight: Color) -> some View {
        // The band's peak, in block widths from the left edge; the repeating
        // copy four widths back takes over near the end of a pass.
        var peak = -1.52 + 6 * phase
        if peak > 2.2 { peak -= 4 }
        return LinearGradient(stops: [
            .init(color: base, location: 0),
            .init(color: highlight, location: 0.48 / 1.52),
            .init(color: base, location: 1),
        ], startPoint: UnitPoint(x: peak - 0.48, y: 0.5), endPoint: UnitPoint(x: peak + 1.04, y: 0.5))
    }

    /// CSS `ease` (cubic-bezier(.25, .1, .25, 1)) at progress `x`.
    static func ease(_ x: Double) -> Double {
        func bezier(_ t: Double, _ p1: Double, _ p2: Double) -> Double {
            let u = 1 - t
            return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t
        }
        var lo = 0.0, hi = 1.0
        for _ in 0..<20 {
            let mid = (lo + hi) / 2
            if bezier(mid, 0.25, 0.25) < x { lo = mid } else { hi = mid }
        }
        return bezier((lo + hi) / 2, 0.1, 1)
    }
}

extension EnvironmentValues {
    /// The card hue a skeleton's shimmer takes (a StoryCard sets
    /// --skeleton-highlight to its own family); nil is the theme's.
    @Entry public var skeletonHue: Double? = nil
    /// The shimmer's eased place in its pass, from a ``SkeletonTimeline`` around the blocks; nil, each
    /// block keeps a timeline of its own.
    @Entry var skeletonPhase: Double? = nil
    /// The skeletons under it stand still: a tab that isn't the one shown (audit I3) keeps its screen,
    /// but nothing on it runs a timeline.
    @Entry public var skeletonPaused = false
}

/// One timeline for every ``SkeletonBlock`` inside: a skeleton screen's blocks (a loading feed has
/// some sixty) take their shimmer's phase from it rather than each running a display-rate timeline
/// of its own. The phase is the same — every block's comes from the frame's time — so the shimmer
/// looks exactly as before. Inside another one, it leaves the outer timeline to do it. Paused under
/// Reduce Motion, where the blocks are plain sand, and on a tab not shown (`skeletonPaused`).
public struct SkeletonTimeline<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.skeletonPhase) private var outer
    @Environment(\.skeletonPaused) private var paused
    let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        if outer != nil {
            content
        } else {
            TimelineView(.animation(minimumInterval: SkeletonBlock.frameInterval, paused: reduceMotion || paused)) { timeline in
                content.environment(\.skeletonPhase, SkeletonBlock.phase(at: timeline.date))
            }
        }
    }
}

extension View {
    /// The skeleton blocks in this view shimmer from one timeline (``SkeletonTimeline``): for a view
    /// that is a skeleton all through, never around content that stays (the timeline runs while it shows).
    public func skeletonTimeline() -> some View {
        SkeletonTimeline { self }
    }
}

// MARK: - Lines of words

extension EnvironmentValues {
    /// Whether the words a skeleton stands for are a Chinese interface's: a line holding Han takes the
    /// fallback face's height, taller than a Latin line's, so each ``SkeletonLine`` is measured on Han
    /// beside Latin, and an English interface's on Latin alone — the rows a reader mostly sees are the
    /// ones it matches. Set once at the app's root, from the interface language.
    @Entry public var skeletonHan: Bool = false
}

/// What a skeleton measures a line of interface words on (``EnvironmentValues/skeletonHan``).
public enum SkeletonSample {
    public static func line(han: Bool) -> String { han ? "讀Ag" : "Ag" }
}

/// One line of words as a skeleton draws it: the line box of a line of `font` — an unseen sample
/// laid out in the words' own font, so it is as tall as the line that replaces it at every text size,
/// Han or Latin (``EnvironmentValues/skeletonHan``) — at `width` or the width it is offered, the bar
/// in its middle at the line's start (or centred, for centred words). Give the bar the words' growth
/// (`TextScale.factor(relativeTo:)` of the font's style) so it grows with them. The owner, at a large
/// text size: 「私訊頁面的 skeleton 和實際位置不一樣」. Android's SkeletonLines.
public struct SkeletonLine<Bar: View>: View {
    let font: Font
    var width: CGFloat?
    var alignment: Alignment
    let bar: Bar
    @Environment(\.skeletonHan) private var han

    public init(font: Font, width: CGFloat? = nil, alignment: Alignment = .leading, @ViewBuilder bar: () -> Bar) {
        self.font = font
        self.width = width
        self.alignment = alignment
        self.bar = bar()
    }

    public var body: some View {
        Text(verbatim: SkeletonSample.line(han: han)).font(font).lineLimit(1).hidden()
            .frame(maxWidth: width ?? .infinity, alignment: alignment)
            .frame(width: width)
            .overlay(alignment: alignment) { bar }
            .accessibilityHidden(true)
    }
}

/// One line of words drawn in CSS line boxes (`CSSText`, `ProseStyle`, a story's title and body): those
/// are exactly the face's size × the line height tall, whatever glyphs they hold, so this is that
/// height — the face given at the person's text size (`scaledUIFont`, `storyUIFont`), as the words take
/// it — with the bar in its middle. Android's CssSkeletonLines.
public struct SkeletonLineBox<Bar: View>: View {
    let lineBox: CGFloat
    var width: CGFloat?
    var alignment: Alignment
    let bar: Bar

    public init(lineBox: CGFloat, width: CGFloat? = nil, alignment: Alignment = .leading, @ViewBuilder bar: () -> Bar) {
        self.lineBox = lineBox
        self.width = width
        self.alignment = alignment
        self.bar = bar()
    }

    /// The line box of `font` at CSS `line-height` `lineHeight` (a multiple of its size), as `CSSText` draws it.
    public init(font: UIFont, lineHeight: CGFloat, width: CGFloat? = nil, alignment: Alignment = .leading,
                @ViewBuilder bar: () -> Bar) {
        self.init(lineBox: font.pointSize * lineHeight, width: width, alignment: alignment, bar: bar)
    }

    public var body: some View {
        Color.clear
            .frame(height: lineBox)
            .frame(maxWidth: width ?? .infinity)
            .frame(width: width)
            .overlay(alignment: alignment) { bar }
            .accessibilityHidden(true)
    }
}

/// A paragraph in CSS line boxes whose length is known but not its words (a card's excerpt: the story's
/// first 96 characters and 「…」): `sample` laid out unseen as `CSSText` sets it, at the width offered,
/// and a bar in each line box it takes — `bar(line, lines)` — so it holds as many lines as the words
/// that replace it, at any width and text size. Android's CssSkeletonParagraph.
public struct SkeletonParagraph<Bar: View>: View {
    let sample: String
    let font: UIFont
    let lineHeight: CGFloat
    let bar: (Int, Int) -> Bar

    public init(sample: String, font: UIFont, lineHeight: CGFloat, @ViewBuilder bar: @escaping (_ line: Int, _ lines: Int) -> Bar) {
        self.sample = sample
        self.font = font
        self.lineHeight = lineHeight
        self.bar = bar
    }

    public var body: some View {
        let lineBox = font.pointSize * lineHeight
        CSSText(sample, font: font, lineHeight: lineHeight)
            .hidden()
            .overlay(alignment: .topLeading) {
                GeometryReader { geo in
                    let lines = max(1, Int((geo.size.height / lineBox).rounded()))
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(0..<lines), id: \.self) { line in
                            SkeletonLineBox(lineBox: lineBox) { bar(line, lines) }
                        }
                    }
                }
            }
            .accessibilityHidden(true)
    }
}

/// A tag still on its way: ``TagPill``'s box — a line of its type (`size`'s, semibold) with its padding
/// above and below — `width` wide grown with the words, the whole pill shimmering. Android's SkeletonTag.
public struct SkeletonTag: View {
    let width: CGFloat
    var size: TagPill.Size
    @Environment(\.skeletonHan) private var han

    public init(width: CGFloat, size: TagPill.Size = .md) {
        self.width = width
        self.size = size
    }

    public var body: some View {
        Text(verbatim: SkeletonSample.line(han: han).uppercased())
            .font(AppFonts.body(size.font, weight: .semibold))
            .lineLimit(1)
            .hidden()
            .frame(width: width * TextScale.factor(relativeTo: .body))
            .padding(.vertical, size.padY)
            // A radius past half the height: SwiftUI draws the rounded rectangle's ends round, the pill's.
            .overlay { SkeletonBlock(height: nil, radius: 999) }
            .accessibilityHidden(true)
    }
}
