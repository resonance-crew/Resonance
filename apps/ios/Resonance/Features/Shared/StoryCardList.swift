import DesignSystem
import ResonanceKit
import SwiftUI

/// Cards as the web lists them: full-bleed bands on a phone (and down a medium
/// window's middle), the bordered cards in two or three columns on a wide one
/// (``CardColumns``), each a link to its page. A card on screen is remembered,
/// so its page opens with it drawn.
struct StoryCardList: View {
    let cards: [FeedCard]
    /// The first card's top edge is the bar's pen line (home: design §2).
    var underBar = false
    /// The cards are the scroll's anchor (the feed): a card being read stays where it is when cards
    /// come in above it. Each card is then known by its id, not its place in the list.
    var anchorsScroll = false
    /// The cards before this index came in on top of the others (the feed's late picks): they are a
    /// block of their own above them — rows of their own in a grid, coloured and drawn as a list of
    /// their own — and the cards under them stay exactly as they were drawn before they came: in
    /// their places and columns, in their colours and shapes.
    var splitAt: Int? = nil
    var onAppearLast: (() -> Void)? = nil
    @Environment(SessionStore.self) private var session

    var body: some View {
        let split = min(max(splitAt ?? 0, 0), cards.count)
        let families = Self.families(cards, splitAt: splitAt)
        // The cards under a block put on top are drawn by their place among them, as before it came.
        CardColumns(count: cards.count, underBar: underBar, split: split, ids: ids()) { i, bordered in
            cell(i, position: i < split ? i : i - split, palette: families[i], bordered: bordered)
        }
    }

    /// Each card's colour family as the list draws it — one colouring for the list as shown (round 5
    /// B3): no card wears a neighbour's family. The cards under a block put on top (`splitAt`) keep
    /// theirs, the list as it was; the block is coloured upward from where the two meet. (The pull's
    /// paper wears the first's.)
    static func families(_ cards: [FeedCard], splitAt: Int?) -> [Int] {
        let split = min(max(splitAt ?? 0, 0), cards.count)
        let below = CardPalette.palettes(cards[split...].map(\.accentHue))
        return CardPalette.palettes(cards[..<split].map(\.accentHue), over: below) + below
    }

    private func cell(_ i: Int, position: Int, palette: Int, bordered: Bool) -> some View {
        let card = cards[i]
        return NavigationLink(value: Route.card(card.routeKey)) {
            StoryCardView(card.story, position: position, isLast: i == cards.count - 1, underBar: underBar && i == 0, bordered: bordered,
                          palette: palette)
        }
        .buttonStyle(.plain)
        .onAppear {
            session.cardPreviews.remember(card)
            if i == cards.count - 1 { onAppearLast?() }
        }
    }

    /// The cards' identities when the scroll anchors on them (a card twice in a list keeps both).
    private func ids() -> [String]? {
        guard anchorsScroll else { return nil }
        var seen = Set<String>()
        return cards.indices.map { i in seen.insert(cards[i].id).inserted ? cards[i].id : "\(cards[i].id)#\(i)" }
    }
}

/// A story-card list's layout (design §10): one column of bands, or on an expanded window the
/// web's desktop grid — 2 or 3 columns by the content's width, row-major (card i in column i mod n,
/// each column stacking its own, as CardLinkGrid), 24 apart, within 1200 and the page's pads.
struct CardColumns<Item: View>: View {
    let count: Int
    var underBar = false
    /// The items before this index came in on top of the others (the feed's late picks): a grid lays
    /// them out in rows of their own above the rest, which keep their columns — the rest stay in the
    /// same container either way. One column holds them all, in order.
    var split = 0
    /// The items' identities, which also makes them the scroll's targets: a scroll position kept on one
    /// keeps it in place when items come in above it. By index when none are given.
    var ids: [String]? = nil
    @ViewBuilder let item: (_ index: Int, _ bordered: Bool) -> Item
    @Environment(\.window) private var window
    /// The list's own width (a card page's column is narrower than the window).
    @State private var measured: CGFloat?

    /// A grid's two blocks, as the scroll knows them.
    static var topBlock: String { "columns.top" }
    static var restBlock: String { "columns.rest" }

    private struct Slot: Hashable {
        let index: Int
        let id: String
    }

    private func slots(_ indices: some Sequence<Int>) -> [Slot] {
        indices.map { Slot(index: $0, id: ids?[$0] ?? String($0)) }
    }

    var body: some View {
        let width = measured ?? window.contentWidth
        let content = max(0, min(width, 1200) - 2 * window.pad)
        let columns = LayoutClass.feedColumns(window.layoutClass, contentWidth: content)
        let split = min(max(split, 0), count)
        Group {
            if columns > 1 {
                // Under the bar a card's outline is never beneath it at rest (design §2): it starts the
                // tablet header's 32 under its line (round 5 E2). Under a block on top, a grid's gap.
                // The scroll's targets are the blocks, their gaps in them: the rest keep their place as a
                // whole when a block comes on top, and the list's top is the first block's, gap and all.
                VStack(spacing: 0) {
                    if split > 0 {
                        grid(0..<split, columns: columns, top: underBar ? HeaderChrome.contentTop : 4).id(Self.topBlock)
                    }
                    grid(split..<count, columns: columns, top: split > 0 ? Tokens.feedGap - 8 : underBar ? HeaderChrome.contentTop : 4)
                        .id(Self.restBlock)
                }
                .scrollTargetLayout(isEnabled: ids != nil)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(slots(0..<count), id: \.id) { slot in item(slot.index, false) }
                }
                .scrollTargetLayout(isEnabled: ids != nil)
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { measured = $0 }
    }

    /// The items of `range` in rows of `columns`, row-major from the range's start.
    private func grid(_ range: Range<Int>, columns: Int, top: CGFloat) -> some View {
        HStack(alignment: .top, spacing: Tokens.feedGap) {
            ForEach(0..<columns, id: \.self) { column in
                LazyVStack(spacing: Tokens.feedGap) {
                    ForEach(slots(stride(from: range.lowerBound + column, to: range.upperBound, by: columns)), id: \.id) { slot in
                        item(slot.index, true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .top)
            }
        }
        .padding(.horizontal, window.pad)
        .frame(maxWidth: 1200)
        .frame(maxWidth: .infinity)
        .padding(.top, top)
        .padding(.bottom, 8)
    }
}

/// MiniCardGrid: the pared-back bands for resonances and linked cards on a phone and a medium
/// window; on an expanded one the related list's bordered grid — its card, columns, gutter and
/// insets, a lone card in the first column (round 5 D3) — so a card page's lists line up.
struct MiniCardList: View {
    let cards: [FeedCard]
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window

    var body: some View {
        if window.layoutClass == .expanded {
            StoryCardList(cards: cards)
        } else {
            bands
        }
    }

    private var bands: some View {
        let palettes = CardPalette.palettes(cards.map(\.accentHue))
        return LazyVStack(spacing: 0) {
            ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                NavigationLink(value: Route.card(card.routeKey)) {
                    MiniStoryCardView(card.mini, position: i, isLast: i == cards.count - 1, palette: palettes[i])
                }
                .buttonStyle(.plain)
                .onAppear { session.cardPreviews.remember(card) }
            }
        }
    }
}

/// FeedSkeleton: loading bands in the real card's chrome, so nothing jumps
/// when the cards arrive.
struct FeedSkeleton: View {
    var count = 6
    var underBar = false

    var body: some View {
        // Hue-less cards by position (the rule's answer for them).
        let palettes = CardPalette.palettes(Array(repeating: nil, count: count))
        CardColumns(count: count, underBar: underBar) { i, bordered in
            StoryCardSkeleton(position: i, isLast: i == count - 1, underBar: underBar && i == 0, bordered: bordered, palette: palettes[i])
        }
        .accessibilityElement()
        .accessibilityLabel("Loading")
        .skeletonTimeline()
    }
}
