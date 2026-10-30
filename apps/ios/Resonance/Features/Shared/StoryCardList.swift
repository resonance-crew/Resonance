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
    /// Cards from this index on have just been brought in (the home feed's 「顯示更多」, round 19): each
    /// rises into place as it comes on screen, a beat after the one before it. Cards already drawn
    /// never play it again.
    var enterFrom: Int? = nil
    var onAppearLast: (() -> Void)? = nil
    @Environment(SessionStore.self) private var session

    var body: some View {
        let split = min(max(splitAt ?? 0, 0), cards.count)
        let families = Self.families(cards, splitAt: splitAt)
        let keys = Self.keys(cards)
        // The cards under a block put on top are drawn by their place among them, as before it came.
        CardColumns(count: cards.count, underBar: underBar, split: split, ids: anchorsScroll ? keys : nil) { i, bordered in
            cell(i, key: keys[i], position: i < split ? i : i - split, palette: families[i], bordered: bordered)
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

    private func cell(_ i: Int, key: String, position: Int, palette: Int, bordered: Bool) -> some View {
        let card = cards[i]
        return NavigationLink(value: Route.card(card.routeKey)) {
            StoryCardView(card.story, position: position, isLast: i == cards.count - 1, underBar: underBar && i == 0, bordered: bordered,
                          palette: palette)
        }
        .buttonStyle(.plain)
        // Where the paper puppets may sit (round 19): its top as drawn (round 20: its line stays in front
        // of whoever is behind it), named by the card, so a visitor stays as the cards round it come and go.
        .readingMark(.card(key: key, outline: StoryCardView.readingOutline(position: position, bordered: bordered)))
        .modifier(CardEntrance(delay: enterFrom.flatMap { i >= $0 ? CardEntrance.delay(i - $0) : nil }))
        .onAppear {
            session.cardPreviews.remember(card)
            if i == cards.count - 1 { onAppearLast?() }
            CoverPrefetch.ahead(Self.coversAhead(of: i, in: cards))
        }
    }

    /// How many covers past a card on screen are fetched ahead of the reader.
    static let coversAhead = 6

    /// The covers of the few cards after card `i`, which the reader comes to next.
    static func coversAhead(of i: Int, in cards: [FeedCard]) -> [URL] {
        guard i + 1 < cards.count else { return [] }
        return cards[(i + 1)..<min(cards.count, i + 1 + coversAhead)].compactMap { $0.imageUrl.flatMap(URL.init(string:)) }
    }

    /// The cards' identities (a card twice in a list keeps both): the scroll's anchors on the feed, and
    /// what names the paper puppets' places on each.
    static func keys(_ cards: [FeedCard]) -> [String] {
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
                // tablet header's gap under its line (round 5 E2, `HeaderChrome.contentGap(width:)`). Under a block on top, a grid's gap.
                // The scroll's targets are the blocks, their gaps in them: the rest keep their place as a
                // whole when a block comes on top, and the list's top is the first block's, gap and all.
                VStack(spacing: 0) {
                    if split > 0 {
                        grid(0..<split, columns: columns, top: underBar ? HeaderChrome.contentTop(width: window.width) : 4).id(Self.topBlock)
                    }
                    grid(split..<count, columns: columns, top: split > 0 ? Tokens.feedGap - 8 : underBar ? HeaderChrome.contentTop(width: window.width) : 4)
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

extension View {
    /// What heads a story-card list (a profile's section title) starts where its cards do: inside the
    /// bordered grid's 1200 and the page's pads on a window wide enough for columns, else `inset` from
    /// the page's edge over the bands (Android's `CardListLayout.headerInset`).
    func cardListHeaderInset(_ inset: CGFloat = 20) -> some View {
        modifier(CardListHeaderInset(inset: inset))
    }
}

private struct CardListHeaderInset: ViewModifier {
    let inset: CGFloat
    @Environment(\.window) private var window

    func body(content: Content) -> some View {
        let grid = LayoutClass.feedColumns(window.layoutClass, contentWidth: LayoutClass.feedContentWidth(window: window.contentWidth)) > 1
        if grid {
            content.padding(.horizontal, window.pad).frame(maxWidth: 1200).frame(maxWidth: .infinity)
        } else {
            content.padding(.horizontal, inset)
        }
    }
}

/// A card brought in by 「顯示更多」 (CardLinkGrid's `card-enter`): its ink comes up from nothing as it
/// rises 18 into place — 460 ms on the web's curve, each card 70 ms after the one before it, none
/// waiting more than 420 ms. Drawn without a delay (already on screen, or come in some other way), it
/// is simply there; so is every card under Reduce Motion. The rise is drawn only (an offset), so
/// nothing around it moves.
struct CardEntrance: ViewModifier {
    /// The card's wait before it rises; nil: it doesn't.
    let delay: Double?
    @State private var risen: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let duration = 0.46
    static let stagger = 0.07
    static let maxDelay = 0.42
    static let rise: CGFloat = 18
    static let curve = Animation.timingCurve(0.2, 0.7, 0.2, 1, duration: duration)

    /// The wait of the card `k` places after the first one brought in.
    static func delay(_ k: Int) -> Double { min(Double(max(0, k)) * stagger, maxDelay) }

    init(delay: Double?) {
        self.delay = delay
        // Decided once, when the card is first drawn: a card on screen keeps its place whatever comes later.
        _risen = State(initialValue: delay == nil)
    }

    func body(content: Content) -> some View {
        content
            .opacity(risen ? 1 : 0)
            .offset(y: risen ? 0 : Self.rise)
            .onAppear {
                guard !risen else { return }
                if reduceMotion {
                    risen = true
                } else {
                    withAnimation(Self.curve.delay(delay ?? 0)) { risen = true }
                }
            }
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
