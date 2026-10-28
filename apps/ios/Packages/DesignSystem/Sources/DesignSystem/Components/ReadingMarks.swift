import SwiftUI

// MARK: - Where a reading page's views are (the paper puppets' places, round 19)

/// What a view marked for the paper puppets is on a reading page (the home feed, a card's page): the
/// web's ReadingScene (src/lib/mascots/reading/scene.ts) is put together from these.
public nonisolated enum ReadingMarkRole: Hashable, Sendable {
    /// A card in a list, drawn with corners this round (a phone's band: 0).
    case card(radius: CGFloat)
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

/// Where the scrolled content's top left is in the page's frame (``ReadingMarks/frameSpace``, the scroll
/// view's own space, in which the puppets' overlay is measured too): how far it is scrolled, as the
/// overlay sees it. Reported while there is a ``EnvironmentValues/readingMarkSink``.
public nonisolated struct ReadingContentOrigin: PreferenceKey {
    public static let defaultValue: CGPoint? = nil

    public static func reduce(value: inout CGPoint?, nextValue: () -> CGPoint?) {
        if let next = nextValue() { value = next }
    }
}

extension ReadingMarks {
    /// The named coordinate space of the page's scroll view (around it and the overlay over it).
    public static let frameSpace = "reading.frame"
}

extension View {
    /// The scrolled content's root on a page that may host the paper puppets: the space its marks are
    /// measured in (``ReadingMarks/space``), and where it is in the scroll view (``ReadingContentOrigin``).
    public func readingContent() -> some View {
        modifier(ReadingContentModifier())
    }
}

private struct ReadingContentModifier: ViewModifier {
    @Environment(\.readingMarkSink) private var sink

    func body(content: Content) -> some View {
        content
            .coordinateSpace(.named(ReadingMarks.space))
            .background {
                if sink != nil {
                    GeometryReader { geo in
                        Color.clear.preference(key: ReadingContentOrigin.self, value: geo.frame(in: .named(ReadingMarks.frameSpace)).origin)
                    }
                }
            }
    }
}
