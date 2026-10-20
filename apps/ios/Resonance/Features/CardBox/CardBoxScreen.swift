import DesignSystem
import ResonanceKit
import SwiftUI

/// My card box (me/page.tsx): who I am, then my cards on seven shelves —
/// published, private, drafts, the cards I resonated with, cards linking to
/// mine, bookmarks, and the trash (always last, before the thought map).
struct CardBoxScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window
    @Environment(\.openRoute) private var openRoute
    @Environment(WriteLauncher.self) private var writer
    @State private var shelf: ReadingAPI.CardBoxShelf = .published
    @State private var shelves: [ReadingAPI.CardBoxShelf: [FeedCard]] = [:]
    @State private var failed = false
    /// The published shelf the last run kept has been looked for (once, on a cold start).
    @State private var drewKept = false
    /// Shelves on screen that the server hasn't answered for since they were
    /// kept, or since the app came back after a while: asked for again when shown.
    @State private var unconfirmed: Set<ReadingAPI.CardBoxShelf> = []
    /// A pull to refresh that brought nothing back, and the shelf it was for: that shelf stayed (and
    /// a quiet line over it says why) — over that shelf only, never one chosen while it was on its way.
    @State private var refreshFailure: ShelfFailure?

    /// The shelves in the strip's order: the trash always last (trash.spec §4), shown even while empty —
    /// it is read only when chosen, never to decide whether it shows.
    static let order: [ReadingAPI.CardBoxShelf] = [.published, ._private, .draft, .resonated, .linked, .bookmarks, .trash]
    #if DEBUG
    private static var choseLaunchShelf = false
    #endif
    /// The shelves of my own cards (OWNED_TABS): each card gets its ⋯.
    static let owned: Set<ReadingAPI.CardBoxShelf> = [.published, ._private, .draft]

    private var phone: Bool { window.layoutClass == .compact }

    var body: some View {
        // A phone's card box keeps 8 more air under the bar's line and around the shelf tabs (round 5 E2).
        TabScreen(L10n.App.Nav.me, titleInBar: true, phoneTop: 24) {
            header.alignedWithCardGrid().padding(.bottom, phone ? 32 : 24)
            tabs.padding(.bottom, phone ? 36 : 28)
            shelfContent
        }
        .refreshable {
            // Asked for by hand: the server answers, not the HTTP cache.
            session.httpCache.freshness.invalidate()
            await session.loadMe()
            let refreshed = shelf
            let showing = shelves[refreshed] != nil
            let failure = await load(refreshed, force: true)
            // Nothing came back for a shelf on screen: it stays, a quiet line over it saying why (VoiceOver too).
            // Left for another shelf meanwhile: the answer isn't about what is on screen, and nothing is said.
            guard let after = Self.afterRefresh(of: refreshed, showing: showing, failure: failure, shown: shelf) else { return }
            withAnimation(.easeInOut(duration: 0.25)) { refreshFailure = after }
            if let after { AccessibilityNotification.Announcement(after.failure.message).post() }
        }
        #if DEBUG
        .task {
            // `-cardBoxShelf <web key>` opens on that shelf (screen checks).
            guard !Self.choseLaunchShelf, let key = UserDefaults.standard.string(forKey: "cardBoxShelf"),
                  let chosen = Self.order.first(where: { Self.webKey($0) == key }) else { return }
            Self.choseLaunchShelf = true
            shelf = chosen
        }
        #endif
        .task(id: shelf) {
            refreshFailure = nil
            // Another shelf's failure isn't this one's: it shows its skeleton until its own answer.
            failed = false
            await load(shelf)
        }
        // The writer or a card's ⋯ changed something: every shelf may have moved.
        .onChange(of: writer.changes) {
            shelves = [:]
            unconfirmed = []
            Task { await load(shelf) }
        }
        // Back after a while: every shelf asks again behind what it shows (this one now, the others when opened).
        .onChange(of: session.awayRefreshes) {
            unconfirmed = Set(shelves.keys)
            Task { await load(shelf) }
        }
    }

    @ViewBuilder private var header: some View {
        if let me = session.me {
            HStack(spacing: 16) {
                Button { openRoute(.author(me.handle)) } label: {
                    HandDrawnAvatar(initials: me.initials, imageURL: me.avatarUrl.flatMap(URL.init(string:)),
                                    color: OKLCHColor.parse(me.accentColor) ?? Tokens.terracottaLight, size: 72,
                                    seed: Double(seedFromString(me.id)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.Me.viewPublicProfile)
                VStack(alignment: .leading, spacing: 4) {
                    Text(me.handle).font(AppFonts.heading(24)).foregroundStyle(Tokens.text)
                    Text(me.bio ?? L10n.Me.bioEmpty).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                }
                Spacer(minLength: 0)
                // The settings entry. A phone: the person glyph, bare — a glyph beside the name, not a chip; not the
                // pen, which means "write". A tablet has the room to say what it is, as the web's wide page does:
                // the labelled tonal button.
                if phone {
                    OrganicIconButton(.user, label: L10n.Me.editProfile, size: 20) { openRoute(.settings) }
                } else {
                    OrganicButton(L10n.Me.editProfile, icon: .user, variant: .tonal, size: .sm) { openRoute(.settings) }
                }
            }
        } else if case .failed = session.profile {
            OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                Task { await session.loadMe() }
            }
        }
    }

    /// OrganicTabs' surface variant: the active shelf sits on a hand-drawn
    /// wash (seeded per tab key, as on the web), with no rim — the wash alone
    /// marks it, one frame per layer.
    private var tabs: some View {
        ScrollViewReader { proxy in
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Self.order, id: \.self) { s in
                    let active = s == shelf
                    Button { shelf = s } label: {
                        Text(Self.title(s))
                            .font(AppFonts.body(14, weight: active ? .semibold : .medium))
                            .foregroundStyle(active ? Tokens.terracotta : Tokens.textMuted)
                            .padding(.horizontal, 16)
                            .padding(.top, 10)
                            .padding(.bottom, 14)
                            .background {
                                if active {
                                    let shape = WobRectShape(radius: 12, seed: Double(23 + Self.webKey(s).count * 7))
                                    shape.fill(Tokens.terracottaLight.opacity(0.55))
                                }
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
                    .id(s)
                }
                // The thought map is the strip's last tab; it opens its own screen (OrganicTabs' thoughtMapHref).
                Button { openRoute(.thoughtMap) } label: {
                    Text(L10n.Me.Tabs.thoughtMap)
                        .font(AppFonts.body(14, weight: .medium))
                        .foregroundStyle(Tokens.textMuted)
                        .padding(.horizontal, 16)
                        .padding(.top, 10)
                        .padding(.bottom, 14)
                }
                .buttonStyle(.plain)
            }
            // Room for the wobble, which bleeds a few points past the tab; on a wide window the strip
            // starts where the head and the grid do.
            .padding(.horizontal, window.layoutClass == .compact ? 20 : max(0, (window.contentWidth - 1200) / 2) + window.pad)
            .padding(.vertical, 7)
        }
        .scrollIndicators(.hidden)
        // The shelf chosen is in view (the trash, last, is off a phone's edge).
        .onChange(of: shelf, initial: true) { _, chosen in
            withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(chosen) }
        }
        }
        .sensoryFeedback(.selection, trigger: shelf)
    }

    @ViewBuilder private var shelfContent: some View {
        if let note = refreshFailure?.over(shelf), shelves[shelf] != nil { RefreshNote(text: note.message) }
        if let cards = shelves[shelf] {
            if cards.isEmpty {
                // The shared empty state (design §1); the empty published shelf also points at the first story (ux §4).
                if shelf == .bookmarks {
                    OrganicEmptyState(message: Self.empty(shelf), icon: .bookmark, seed: 59)
                } else if shelf == .trash {
                    OrganicEmptyState(title: Self.empty(shelf), message: L10n.Me.emptyTrashLine(days: CardTrash.days),
                                      icon: .trash, seed: 61)
                } else if shelf == .published {
                    OrganicEmptyState(title: Self.empty(shelf), actionTitle: L10n.Me.emptyPublishedCta, icon: .cards, seed: 53) {
                        writer.open()
                    }
                } else {
                    OrganicEmptyState(title: Self.empty(shelf), icon: .cards, seed: 53)
                }
            } else if shelf == .trash {
                TrashShelf(cards: cards)
            } else if shelf == .linked {
                MiniCardList(cards: cards)
            } else if Self.owned.contains(shelf) {
                ManagedCardList(cards: cards, resumesDrafts: shelf == .draft)
            } else {
                StoryCardList(cards: cards)
            }
        } else if failed {
            OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                Task { await load(shelf, force: true) }
            }
        } else {
            FeedSkeleton(count: 6)
        }
    }

    /// Shows shelf `s` — from what is known, else as the server answers (always, `force`d). Answers
    /// why it couldn't (nil when it could, or there was nothing to ask).
    @discardableResult
    private func load(_ s: ReadingAPI.CardBoxShelf, force: Bool = false) async -> RefreshFailure? {
        // A cold start: the published shelf as the last run kept it, at once — then the server's.
        if s == .published, shelves[s] == nil, !drewKept, let uid = session.uid {
            drewKept = true
            if let kept = session.kept.value(.published, uid: uid) {
                shelves[s] = kept
                unconfirmed.insert(s)
            }
        }
        guard force || shelves[s] == nil || unconfirmed.contains(s) else { return nil }
        let asked = Self.asked(with: s, force: force, known: Set(shelves.keys), unconfirmed: unconfirmed)
        do {
            let answered = try await session.reading.cardBox(shelves: asked)
            for (shelf, cards) in answered {
                shelves[shelf] = cards
                unconfirmed.remove(shelf)
            }
            // The kept published shelf is the server's latest, whichever shelf asked for it.
            if let published = answered[.published], let uid = session.uid { session.kept.save(published, as: .published, uid: uid) }
            let missing = answered[s] == nil
            // The page-wide state is the shelf on screen's: a shelf left behind can't turn another's skeleton into an error.
            if s == shelf { failed = missing }
            if !missing, s == shelf { refreshFailure = nil }
            return missing ? .failed : nil
        } catch {
            // Left for another shelf (its task cancelled): not a failure to show.
            guard !Task.isCancelled else { return nil }
            if s == shelf { failed = true }
            return RefreshFailure(error)
        }
    }

    /// A refresh's failure, with the shelf it was for.
    struct ShelfFailure: Equatable {
        let shelf: ReadingAPI.CardBoxShelf
        let failure: RefreshFailure

        /// What it says over the shelf on screen: nothing over another shelf.
        func over(_ shown: ReadingAPI.CardBoxShelf) -> RefreshFailure? { shown == shelf ? failure : nil }
    }

    /// What a refresh of `refreshed` (on screen with cards when it began: `showing`) leaves once
    /// answered, with `shown` on screen now: the line over the shelf, saying why nothing came back
    /// (nil: none), and said to VoiceOver too. Nil when the reader has moved to another shelf
    /// meanwhile: that shelf's own load owns what is said over it.
    static func afterRefresh(of refreshed: ReadingAPI.CardBoxShelf, showing: Bool, failure: RefreshFailure?,
                             shown: ReadingAPI.CardBoxShelf) -> ShelfFailure?? {
        guard refreshed == shown else { return nil }
        return .some(showing ? failure.map { ShelfFailure(shelf: refreshed, failure: $0) } : nil)
    }

    /// The shelves one request asks for to show `s`: my own cards' shelves come
    /// together (one GET /me/cardbox), so opening the box brings the private
    /// and draft shelves along with the published one — each that isn't known
    /// yet or is waiting to be asked again (all of them, asked for by hand).
    /// The others (cards by other people) are asked for alone, when shown.
    static func asked(with s: ReadingAPI.CardBoxShelf, force: Bool, known: Set<ReadingAPI.CardBoxShelf>,
                      unconfirmed: Set<ReadingAPI.CardBoxShelf>) -> Set<ReadingAPI.CardBoxShelf> {
        guard owned.contains(s) else { return [s] }
        return owned.filter { force || !known.contains($0) || unconfirmed.contains($0) }.union([s])
    }

    static func title(_ s: ReadingAPI.CardBoxShelf) -> String {
        switch s {
        case .published: L10n.Me.Tabs.published
        case ._private: L10n.Me.Tabs.`private`
        case .draft: L10n.Me.Tabs.draft
        case .resonated: L10n.Me.Tabs.resonated
        case .linked: L10n.Me.Tabs.linked
        case .bookmarks: L10n.Me.Tabs.bookmarks
        case .trash: L10n.Me.Tabs.trash
        }
    }

    /// The web's tab key, which seeds the active tab's outline.
    static func webKey(_ s: ReadingAPI.CardBoxShelf) -> String {
        switch s {
        case .published: "published"
        case ._private: "private"
        case .draft: "draft"
        case .resonated: "resonated"
        case .linked: "linked"
        case .bookmarks: "bookmarks"
        case .trash: "trash"
        }
    }

    static func empty(_ s: ReadingAPI.CardBoxShelf) -> String {
        switch s {
        case .published: L10n.Me.emptyPublished
        case ._private: L10n.Me.emptyPrivate
        case .draft: L10n.Me.emptyDraft
        case .resonated: L10n.Me.emptyResonated
        case .linked: L10n.Me.emptyLinked
        case .bookmarks: L10n.Me.emptyBookmarks
        case .trash: L10n.Me.emptyTrash
        }
    }
}

/// My own cards (ProfileTabs' managed shelves): each with the owner's ⋯ over
/// its top-right corner. An anonymous one wears the anonymous byline exactly as
/// everyone else sees it (design §13) — that is its marker, no badge. A draft
/// has no page yet, so tapping it resumes writing.
private struct ManagedCardList: View {
    let cards: [FeedCard]
    let resumesDrafts: Bool
    @Environment(WriteLauncher.self) private var writer
    @Environment(SessionStore.self) private var session

    var body: some View {
        // Bands, or the bordered grid on a wide window (as every story-card list).
        let palettes = CardPalette.palettes(cards.map(\.accentHue))
        CardColumns(count: cards.count) { i, bordered in
            let card = cards[i]
            let hue = CardPalette(index: palettes[i]).hue
            Group {
                if resumesDrafts {
                    Button { writer.edit(card.id) } label: {
                        StoryCardView(card.publicStory, position: i, isLast: i == cards.count - 1, bordered: bordered, palette: palettes[i])
                    }
                } else {
                    NavigationLink(value: Route.card(card.routeKey)) {
                        StoryCardView(card.publicStory, position: i, isLast: i == cards.count - 1, bordered: bordered, palette: palettes[i])
                    }
                    .onAppear { session.cardPreviews.remember(card) }
                }
            }
            .buttonStyle(.plain)
            // .actions: the chip 14 in from the card's corner (a band's box sits 20 in from the screen;
            // a bordered card's corner is its own); the trigger's 44pt hit box reaches 3 past the 38pt chip.
            .overlay(alignment: .topTrailing) {
                CardActionsMenu(cardId: card.id, visibility: card.visibility.rawValue, seed: hue, hue: hue,
                                answering: card.referenceCardId, isPublished: card.publishedAt != nil,
                                anonymous: card.anonymous, title: card.title)
                    .padding(.top, 14 - 3)
                    .padding(.trailing, (bordered ? 14 : 34) - 3)
            }
        }
    }
}

/// The card box's 垃圾桶 (the web's TrashShelf): what I deleted, the latest in first, for 30 days —
/// each saying where it came from and when it goes (``TrashCaption``). A published card opens its
/// page (its trash banner), a draft the writer (its trashed notice). Its ⋯ restores it or deletes it
/// for good; 清空垃圾桶 deletes them all, asked first in red. Over the cards, how long the trash
/// keeps them — and, while an anonymous card is here, that the notes left on it went with it.
private struct TrashShelf: View {
    let cards: [FeedCard]
    @Environment(WriteLauncher.self) private var writer
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window
    @State private var emptying = false
    @State private var busy = false
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            header.alignedWithCardGrid()
            TrashCardList(cards: cards)
        }
        // For good, every card here: the verb in red; busy through the whole emptying.
        .organicConfirm(isPresented: $emptying, title: L10n.Me.Actions.emptyTrashTitle, message: L10n.Me.Actions.emptyTrashBody,
                        cancelLabel: L10n.Me.Actions.deleteCancel, confirmLabel: L10n.Me.Actions.emptyTrash,
                        closeLabel: L10n.Me.Actions.deleteCancel, busy: busy, error: failed ? L10n.Safety.actionError : nil,
                        destructive: true, seed: 67) {
            Task { await empty() }
        }
    }

    @ViewBuilder private var header: some View {
        let lines = VStack(alignment: .leading, spacing: 4) {
            Text(L10n.Me.trashHint(days: CardTrash.days))
            if TrashCaption.holdsAnonymous(cards) { Text(L10n.Me.trashAnonymousNotes) }
        }
        .font(AppFonts.body(13))
        .foregroundStyle(Tokens.textMuted)
        .fixedSize(horizontal: false, vertical: true)
        // It only opens a question, which is red: the tonal red, as Settings' 刪除帳號.
        let button = OrganicButton(L10n.Me.Actions.emptyTrash, variant: .dangerTonal, size: .sm) {
            failed = false
            emptying = true
        }
        .fixedSize()
        if window.layoutClass == .compact {
            // A phone: the button under the lines, at their start.
            VStack(alignment: .leading, spacing: 12) {
                lines
                button
            }
        } else {
            HStack(alignment: .center, spacing: 12) {
                lines.frame(maxWidth: .infinity, alignment: .leading)
                button
            }
        }
    }

    private func empty() async {
        guard !busy else { return }
        busy = true
        failed = false
        defer { busy = false }
        do {
            _ = try await session.writing.emptyTrash()
            emptying = false
        } catch {
            // What is left is read again, and the question stays to try once more.
            failed = true
        }
        writer.noteChange(.init())
    }
}

/// The trash's cards (ProfileTabs' trash shelf): each with its caption under the byline and the
/// trash's ⋯ over its top-right corner; an anonymous one wears the anonymous byline, as on the other
/// owned shelves. A published card opens its page; a draft, the writer.
private struct TrashCardList: View {
    let cards: [FeedCard]
    @Environment(WriteLauncher.self) private var writer
    @Environment(SessionStore.self) private var session

    var body: some View {
        let palettes = CardPalette.palettes(cards.map(\.accentHue))
        let now = Date.now
        CardColumns(count: cards.count) { i, bordered in
            let card = cards[i]
            let hue = CardPalette(index: palettes[i]).hue
            let face = StoryCardView(card.publicStory, position: i, isLast: i == cards.count - 1, bordered: bordered,
                                     palette: palettes[i])
                .footnote(TrashCaption.text(card, now: now))
            Group {
                if card.publishedAt == nil {
                    Button { writer.edit(card.id) } label: { face }
                } else {
                    // Never prefilled from the shelf: a trash summary isn't the card's page.
                    NavigationLink(value: Route.card(card.routeKey)) { face }
                }
            }
            .buttonStyle(.plain)
            .overlay(alignment: .topTrailing) {
                TrashActionsMenu(cardId: card.id, seed: hue, hue: hue)
                    .padding(.top, 14 - 3)
                    .padding(.trailing, (bordered ? 14 : 34) - 3)
            }
        }
    }
}
