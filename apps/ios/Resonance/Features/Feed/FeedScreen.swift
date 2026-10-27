import DesignSystem
import ResonanceKit
import SwiftUI

/// The home feed (home/page.tsx): today's picks right under the brand bar (no
/// page title: the first card's top edge is the bar's pen line), then "load
/// more" for the latest cards, a quiet end mark once nothing more can load, and
/// the prompt to write. Picks that come after the latest cards are showing go
/// on top of them at once: a reader at the top sees the first of them there, one
/// further down keeps the cards in front of them where they are (the list anchors
/// its scroll on them, a grid keeps the picks in rows of their own above) and
/// hears of them from the shell's toast, 今天的推薦來了 · 往上看, which takes the
/// feed up to them (``PicksNotice``).
struct FeedScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.window) private var window
    @Environment(\.isSelectedTab) private var onSelectedTab
    @State private var model: FeedModel?
    /// The list rests at its top (as TabScreen tells it).
    @State private var atTop = true
    /// Each one takes the list back to its top (the toast's 往上看).
    @State private var upRequests = 0
    /// Between appearing and disappearing: the top of the tab's stack.
    @State private var appeared = false
    @State private var picksNotice = PicksNotice()

    var body: some View {
        TabScreen("", head: model?.cards.first?.id, toTopRequests: upRequests, onAtTop: reachedTop, hidesTabBar: true) {
            content
        }
        .animation(.easeInOut(duration: 0.25), value: model?.refreshFailure)
        // A pull's gap wears the first band's paper (round 5 B1).
        .pullPaper(pullPaper)
        .refreshable {
            // Asked for by hand: the server answers, not the HTTP cache.
            session.httpCache.freshness.invalidate()
            await model?.refresh()
            // Nothing came back: the feed stayed; the quiet line over it says so, and so does VoiceOver.
            if let failure = model?.refreshFailure { AccessibilityNotification.Announcement(failure.message).post() }
        }
        // VoiceOver's Refresh further down the feed: the reader's place stays — the pages read with it, what's new above.
        .sketchRefreshInPlace {
            session.httpCache.freshness.invalidate()
            await model?.refreshInPlace()
            if let failure = model?.refreshFailure { AccessibilityNotification.Announcement(failure.message).post() }
        }
        .task {
            if model == nil { model = makeModel() }
            if model?.phase == .idle { await model?.load() }
        }
        // Back after a while: the feed asks again behind what it shows.
        .onChange(of: session.awayRefreshes) {
            Task { await model?.revalidate() }
        }
        // Today's picks landed above a reader down the list: the toast says so, the whole pill the way up.
        .onChange(of: model?.picksLanded ?? 0) { before, now in
            if now > before, picksNotice.landed(atTop: atTop, inView: inView) { tellPicks() }
        }
        // Out of sight (another tab, a page over the feed) the toast has nothing to scroll; back in view,
        // picks that landed meanwhile are told of.
        .onAppear {
            appeared = true
            if inView, picksNotice.back(atTop: atTop) { tellPicks() }
        }
        .onDisappear {
            appeared = false
            takeDownPicksToast()
        }
        .onChange(of: onSelectedTab) { _, selected in
            if !selected {
                takeDownPicksToast()
            } else if appeared, picksNotice.back(atTop: atTop) {
                tellPicks()
            }
        }
    }

    /// The feed is on show: the top of its stack, on the tab chosen.
    private var inView: Bool { appeared && onSelectedTab }

    /// 今天的推薦來了 · 往上看: up to the picks when tapped.
    private func tellPicks() {
        picksNotice.shown(session.toasts.show(L10n.Home.Recommended.arrived, action: PicksNotice.action { upRequests += 1 }))
    }

    private func takeDownPicksToast() {
        if let id = picksNotice.takeDown() { session.toasts.dismiss(id) }
    }

    /// The list came to rest at its top, or left it: at the top by hand, the toast's job is done.
    private func reachedTop(_ top: Bool) {
        atTop = top
        if top, let id = picksNotice.reachedTop() { session.toasts.dismiss(id) }
    }

    /// The paper of the band at the bar's line, when the feed's top is one: the first card's family
    /// (the list's colouring gives the first card its own preference), or the first skeleton's. None
    /// over the bordered grid, an empty or failed feed, or a refresh note above the cards.
    private var pullPaper: CardPalette? {
        guard window.layoutClass != .expanded else { return nil }
        switch model?.phase ?? .idle {
        case .idle, .loading:
            return CardPalette(index: CardPalette.palettes([nil])[0])
        case .failed:
            return nil
        case .loaded:
            guard let model, !model.isEmpty, model.refreshFailure == nil,
                  let first = StoryCardList.families(model.cards, splitAt: splitAt(model)).first else { return nil }
            return CardPalette(index: first)
        }
    }

    /// Picks put on top of the latest cards are a block of their own above them.
    private func splitAt(_ model: FeedModel) -> Int? {
        model.picksOnTop ? model.leadingPicks : nil
    }

    private func makeModel() -> FeedModel {
        let api = session.reading
        // The last run's feed for this account, drawn at once on a cold start; blocked people left out.
        let keeping = session.uid.map { FeedKeeping(session.kept, uid: $0) }
        let blocked = { [session] in session.blockedIds }
        #if DEBUG
        // `-feedPicksDelay <seconds>` holds today's picks back (screen checks of picks put on top of the
        // latest cards), and `-feedPicks <id,id,…>` stands those cards in for them (the emulator has none):
        // cards of their own — ids marked, as the latest cards hold the real ones — with a reason, as picks have.
        let delay = UserDefaults.standard.double(forKey: "feedPicksDelay")
        let standIns = UserDefaults.standard.string(forKey: "feedPicks")?.split(separator: ",").map(String.init)
        if delay > 0 || standIns != nil {
            return FeedModel(feed: { try await api.feed(after: $0) }, recommended: {
                if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
                guard let standIns else { return try await api.recommended() }
                return try await api.cards(keys: standIns).map { card in
                    var pick = card
                    pick.id = "pick-\(card.id)"
                    pick.reason = "stand-in pick"
                    return pick
                }
            // Stand-ins are kept nowhere (nor is a kept feed drawn first): each launch is a cold load.
            }, keeping: standIns == nil ? keeping : nil, blocked: blocked)
        }
        #endif
        return FeedModel(api: api, keeping: keeping, blocked: blocked)
    }

    @ViewBuilder private var content: some View {
        switch model?.phase ?? .idle {
        case .idle, .loading:
            FeedSkeleton(count: 6, underBar: true)
        case .failed:
            OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                Task { await model?.load() }
            }
            .padding(.top, 40)
        case .loaded:
            if let model, model.isEmpty {
                OrganicEmptyState(title: L10n.Home.Empty.title, message: L10n.Home.Empty.subtitle,
                                  actionTitle: L10n.Home.Empty.cta) { writer.open() }
                    .padding(.top, 40)
            } else if let model {
                if let failure = model.refreshFailure {
                    // A pull that brought nothing back: the feed stays, and a quiet line over it says why
                    // (the first card then starts below it, with its own top rule).
                    RefreshNote(text: failure.message).padding(.top, 28)
                }
                // The scroll anchors on the cards, so picks put on top of them never move the one being read.
                StoryCardList(cards: model.cards, underBar: model.refreshFailure == nil, anchorsScroll: true,
                              splitAt: splitAt(model))
                footer(model)
            }
        }
    }

    /// Under the last card, 48 below it: the way on while more can load (alone, no sentence); once
    /// nothing more can, the end mark (design §2) in the same place.
    @ViewBuilder private func footer(_ model: FeedModel) -> some View {
        if model.canLoadMore {
            FeedMoreButton(loading: model.isLoadingMore) {
                Task { await model.loadMore() }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .padding(.horizontal, 20)
        } else if model.latestVisible {
            FeedEndMark()
                .frame(maxWidth: .infinity)
                .padding(.top, 48)
                .padding(.horizontal, 20)
        }
    }
}

/// The end of the feed (design §2): a short pen wave with a terracotta dot just past its end —
/// the pen lifted — and one quiet line under it. Not a heading.
struct FeedEndMark: View {
    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 5) {
                PenWaveShape(seed: 307, amp: 1.2)
                    .stroke(Tokens.fieldBorderHover.opacity(0.7), style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                    .frame(width: 40, height: 8)
                Circle().fill(Tokens.terracotta).frame(width: 3.2, height: 3.2)
            }
            .accessibilityHidden(true)
            CSSText(L10n.Home.feedEnd, font: AppFonts.scaledUIFont(.body, size: 13.5), lineHeight: 1.5,
                    color: Tokens.UI.textMuted, alignment: .center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// The feed's way on (the web's FeedMore): "Load more" alone, in the tonal label's ink with no face
/// of its own — not a form's button — the press washing a wobbly squircle as a bare glyph's does.
/// While the next page is on its way the pen loop draws itself before the label (as a button's
/// does) and taps do nothing.
struct FeedMoreButton: View {
    let loading: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if loading { SketchLoader(size: 15, color: Tokens.buttonOnTonal) }
                Text(L10n.Home.moreBtn)
                    .font(AppFonts.body(14, weight: .semibold))
                    .foregroundStyle(Tokens.buttonOnTonal)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle(inset: 0))
        .disabled(loading)
        .accessibilityLabel(loading ? L10n.Home.moreLoading : L10n.Home.moreBtn)
    }
}

/// A pull to refresh that brought nothing back, said quietly over what stayed on screen (never the
/// page's load error): a muted line, centred, gone with the next answer.
struct RefreshNote: View {
    let text: String

    var body: some View {
        EmptyNote(text, size: 13, centered: true)
            .padding(.horizontal, 20)
            .padding(.top, -12)
            .padding(.bottom, 24)
            .transition(.opacity)
    }
}

/// When today's picks are told of (round 7 §2): picks that land on top of the latest cards while the
/// reader is down the list — where the feed keeps their place, so the picks are out of sight above
/// them — bring the shell's toast, 今天的推薦來了 · 往上看, the whole pill the way up. At the top
/// already, the picks are simply the first thing in view, and nothing is said. Reaching the top by
/// hand takes the toast down (its job is done); the feed leaving the screen does too, and picks that
/// landed while it was away are told of once it is back, the reader still down the list.
struct PicksNotice: Equatable {
    /// The toast showing, by its id in the shell's center.
    private(set) var toast: Int?
    /// Picks landed while the feed was out of sight, the reader down the list: said once it is back.
    private(set) var owed = false

    /// Picks went on top of the latest cards: whether to say so now.
    mutating func landed(atTop: Bool, inView: Bool) -> Bool {
        guard !atTop else { return false }
        guard inView else {
            owed = true
            return false
        }
        return true
    }

    /// The feed is in view again: whether to say what landed while it wasn't.
    mutating func back(atTop: Bool) -> Bool {
        defer { owed = false }
        return owed && !atTop
    }

    /// The toast went up under `id`.
    mutating func shown(_ id: Int) {
        toast = id
        owed = false
    }

    /// The feed left the screen: the toast to take down, if one shows.
    mutating func takeDown() -> Int? {
        defer { toast = nil }
        return toast
    }

    /// The list reached its top: nothing is owed any more, and the toast showing goes.
    mutating func reachedTop() -> Int? {
        owed = false
        return takeDown()
    }

    /// The toast's action: 往上看 after the words, the arrow before them; the pill is named by both.
    static func action(up: @escaping @MainActor () -> Void) -> ToastCenter.Action {
        ToastCenter.Action(label: L10n.Home.Recommended.arrivedAction,
                           accessibilityLabel: "\(L10n.Home.Recommended.arrived) · \(L10n.Home.Recommended.arrivedAction)",
                           icon: .arrowUp, perform: up)
    }
}
