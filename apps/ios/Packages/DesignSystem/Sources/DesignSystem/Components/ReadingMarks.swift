import SwiftUI

// MARK: - Where a reading page's views are (the paper puppets' places, round 19)

/// What a view marked for the paper puppets is on a reading page (the home feed, a card's page): the
/// web's ReadingScene (src/lib/mascots/reading/scene.ts) is put together from these.
public nonisolated enum ReadingMarkRole: Hashable, Sendable {
    /// A card in a list: its id (the puppets' places on it are named by it, so they stay put as a lazy
    /// list's other cards come and go) and how its outline is drawn (round 20).
    case card(key: String, outline: ReadingCardOutline)
    /// A card's author row (whoever sits on the card under it keeps off it).
    case cardFoot
    /// A card's title words.
    case cardWords
    /// A piece of a story title as it is laid out (a CJK title's clause; a Latin title whole), with the
    /// height of one of its lines.
    case titleClause(lineBox: CGFloat)
    case cover
    /// The story's column.
    case column
    /// One of the story's own blocks (a paragraph, a heading, a quote, a picture).
    case block
    /// The response bar at the story's end, and what stands above it (its tags).
    case respond
    case ceiling
    /// The feed's 顯示更多, or its end line.
    case more
    case end
}

/// How a marked card's line is drawn (round 20, the owner: 「卡片的 border 應該要在小精靈的前面」): the
/// puppets' scene follows the drawn line — its extent, its top edge, its pen — not the flat frame the card
/// is laid out in, which the wobble swings a few points past, so whoever climbs up from behind a card
/// stays under the whole of its line.
public nonisolated enum ReadingCardOutline: Hashable, Sendable {
    /// A phone's band (and down a medium window's middle): the seven-turn wavy rule along its top
    /// (``StoryBand``'s edge), in the light pen. `seed` is the card's own.
    case band(seed: Double)
    /// A wide grid's bordered card: its own wobbly outline (``CardOutlineShape``), in the house pen.
    case bordered(seed: Double)

    /// The width of the pen the line is drawn with.
    public var pen: CGFloat {
        switch self {
        case .band: Tokens.inkLight
        case .bordered: Tokens.ink
        }
    }

    /// The corner the card is laid out with (a band has none).
    public var radius: CGFloat {
        switch self {
        case .band: 0
        case .bordered: 22
        }
    }

    /// The drawn line in the card's own box of `size` (its top left at 0,0), as points along it a few
    /// apart (`step`) — the very shapes the card draws.
    public func drawn(in size: CGSize, step: CGFloat = 4) -> [CGPoint] {
        guard size.width > 0, size.height > 0 else { return [] }
        let path: Path = switch self {
        // The band's edge: 6 tall, laid 3 above the band's top, its wave about its middle.
        case let .band(seed): StoryBand.edgeShape(seed: seed).path(in: CGRect(x: 0, y: -3, width: size.width, height: 6))
        case let .bordered(seed): CardOutlineShape(seed: seed).path(in: CGRect(origin: .zero, size: size))
        }
        return path.flattened(step: step)
    }
}

extension Path {
    /// The path as points along it, about `step` apart (each curve cut into pieces no longer than that).
    nonisolated func flattened(step: CGFloat) -> [CGPoint] {
        var out: [CGPoint] = []
        var at = CGPoint.zero
        var start = CGPoint.zero
        func line(to p: CGPoint) {
            let n = max(1, Int((hypot(p.x - at.x, p.y - at.y) / step).rounded(.up)))
            for i in 1...n {
                let t = CGFloat(i) / CGFloat(n)
                out.append(CGPoint(x: at.x + (p.x - at.x) * t, y: at.y + (p.y - at.y) * t))
            }
            at = p
        }
        func curve(_ c1: CGPoint, _ c2: CGPoint, _ p: CGPoint) {
            // The control polygon's length bounds the curve's: cut by it.
            let length = hypot(c1.x - at.x, c1.y - at.y) + hypot(c2.x - c1.x, c2.y - c1.y) + hypot(p.x - c2.x, p.y - c2.y)
            let n = max(1, Int((length / step).rounded(.up)))
            let p0 = at
            for i in 1...n {
                let t = CGFloat(i) / CGFloat(n), u = 1 - t
                let a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
                out.append(CGPoint(x: a * p0.x + b * c1.x + c * c2.x + d * p.x, y: a * p0.y + b * c1.y + c * c2.y + d * p.y))
            }
            at = p
        }
        forEach { element in
            switch element {
            case let .move(to: p):
                at = p
                start = p
                out.append(p)
            case let .line(to: p): line(to: p)
            case let .quadCurve(to: p, control: c):
                curve(CGPoint(x: at.x + (c.x - at.x) * 2 / 3, y: at.y + (c.y - at.y) * 2 / 3),
                      CGPoint(x: p.x + (c.x - p.x) * 2 / 3, y: p.y + (c.y - p.y) * 2 / 3), p)
            case let .curve(to: p, control1: c1, control2: c2): curve(c1, c2, p)
            case .closeSubpath: line(to: start)
            }
        }
        return out
    }
}

/// A marked view's frame in the scrolled content (``ReadingMarks/space``).
public nonisolated struct ReadingMark: Equatable, Sendable {
    public var role: ReadingMarkRole
    public var rect: CGRect

    public init(_ role: ReadingMarkRole, _ rect: CGRect) {
        self.role = role
        self.rect = rect
    }
}

/// Every marked view on the page, gathered for the screen that hosts the paper puppets. Each marked view
/// tells the sink where it is (and takes itself back when it goes) — not a preference, which a lazy
/// stack's cells don't hand up. Marks are measured only while a page puts a sink in the environment
/// (``EnvironmentValues/readingMarkSink``: the puppets' switch is on): otherwise the marked views carry nothing.
@MainActor public final class ReadingMarkSink {
    private var marks: [UUID: ReadingMark] = [:]
    /// Something changed: the page builds its scene again (it throttles).
    public var onChange: (() -> Void)?

    public init() {}

    /// The marks, in no order.
    public var all: [ReadingMark] { Array(marks.values) }

    func set(_ id: UUID, _ mark: ReadingMark) {
        guard marks[id] != mark else { return }
        marks[id] = mark
        onChange?()
    }

    func remove(_ id: UUID) {
        guard marks.removeValue(forKey: id) != nil else { return }
        onChange?()
    }
}

public nonisolated enum ReadingMarks {
    /// The named coordinate space of the scrolled content (its top left is the content's).
    public static let space = "reading.marks"
}

extension EnvironmentValues {
    /// The page hosts the paper puppets: marked views say where they are, here.
    @Entry public var readingMarkSink: ReadingMarkSink? = nil
}

extension View {
    /// Says where this view is, for the paper puppets (only while there is a ``EnvironmentValues/readingMarkSink``).
    public func readingMark(_ role: ReadingMarkRole) -> some View {
        modifier(ReadingMarkModifier(role: role))
    }
}

private struct ReadingMarkModifier: ViewModifier {
    let role: ReadingMarkRole
    @Environment(\.readingMarkSink) private var sink
    @State private var id = UUID()

    func body(content: Content) -> some View {
        // The background is always there (switching never rebuilds what it marks); it measures only with a sink.
        content.background {
            if let sink {
                GeometryReader { geo in
                    let rect = geo.frame(in: .named(ReadingMarks.space))
                    Color.clear
                        .onChange(of: rect, initial: true) { _, now in sink.set(id, ReadingMark(role, now)) }
                        .onDisappear { sink.remove(id) }
                }
            }
        }
    }
}

extension View {
    /// ``readingMark(_:)`` when there is a role, else nothing.
    @ViewBuilder func readingMark(_ role: ReadingMarkRole?) -> some View {
        if let role { readingMark(role) } else { self }
    }
}

extension View {
    /// The scrolled content's root on a page that may host the paper puppets: the space its marks are
    /// measured in (``ReadingMarks/space``) — the puppets' own layer lies over it, in the same points.
    public func readingContent() -> some View {
        coordinateSpace(.named(ReadingMarks.space))
    }
}
