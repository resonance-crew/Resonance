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
            TimelineView(.animation) { timeline in
                Self.shimmer(phase: Self.phase(at: timeline.date), highlight: highlight)
            }
            .accessibilityHidden(true)
        }
    }

    /// Where the shimmer is in its 1.5 s pass at `date`, eased: every block on screen shares it.
    static func phase(at date: Date) -> Double {
        ease(date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.5) / 1.5)
    }

    /// color-mix(in oklch, color-mix(cream-dark 94%, text) 85%, transparent).
    static let base = OKLCHColor.color(0.8898, 0.0187, 74.1, alpha: 0.85)

    /// color-mix(in oklab, <highlight> 50%, cream), the highlight being
    /// oklch(88% .08 hue) on a card, or terracotta-light (hue 55) elsewhere.
    static func highlight(_ hue: Double?) -> Color {
        let mix = highlightOKLCH(hue)
        return OKLCHColor.color(mix.L, mix.C, mix.H)
    }

    /// The highlight as OKLCH: the card's light shade and the cream averaged in OKLab (a = C·cos h,
    /// b = C·sin h), so the mix stays on the line between them. An average of hues instead swung a
    /// lavender card's light through red to pink and a blue one's to green (both on the way to the
    /// cream's 75°).
    public static func highlightOKLCH(_ hue: Double?) -> (L: Double, C: Double, H: Double) {
        let card = (L: 0.88, C: 0.08, H: hue ?? 55)
        let cream = (L: 0.965, C: 0.015, H: 75.0)
        func lab(_ c: (L: Double, C: Double, H: Double)) -> (L: Double, a: Double, b: Double) {
            let r = c.H * .pi / 180
            return (c.L, c.C * cos(r), c.C * sin(r))
        }
        let x = lab(card), y = lab(cream)
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
}

/// One timeline for every ``SkeletonBlock`` inside: a skeleton screen's blocks (a loading feed has
/// some sixty) take their shimmer's phase from it rather than each running a display-rate timeline
/// of its own. The phase is the same — every block's comes from the frame's time — so the shimmer
/// looks exactly as before. Inside another one, it leaves the outer timeline to do it. Paused under
/// Reduce Motion, where the blocks are plain sand.
public struct SkeletonTimeline<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.skeletonPhase) private var outer
    let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        if outer != nil {
            content
        } else {
            TimelineView(.animation(minimumInterval: nil, paused: reduceMotion)) { timeline in
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
