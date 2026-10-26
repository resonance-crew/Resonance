import DesignSystem
import ResonanceKit
import SwiftUI

/// My card box (me/page.tsx): who I am, then my cards on six shelves — published, 私人卡 (cards never
/// published and published cards kept private together, round 8 §1.1 / round 9 §1), the cards I
/// resonated with, cards linking to mine, bookmarks, and the trash (always last, before the thought map).
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
    /// The read each shelf waits for: an answer from one a newer read took over is dropped.
    @State private var reads = ShelfReads()
    /// 清空垃圾桶's question, here rather than on the trash shelf: the shelves read again after an
    /// emptying (they all go to their skeletons), and the question — with what went wrong — stays.
    @State private var emptying = EmptyTrashQuestion()

    /// The shelves in the strip's order: the trash always last (trash.spec §4), shown even while empty —
    /// it is read only when chosen, never to decide whether it shows. No 私人卡 shelf: a published
    /// private card is a 私人卡, on that shelf (`.draft`, which shows both — ``draftShelf(private:drafts:)``).
    static let order: [ReadingAPI.CardBoxShelf] = [.published, .draft, .resonated, .linked, .bookmarks, .trash]
    #if DEBUG
    private static var choseLaunchShelf = false
    #endif
    /// The shelves of my own cards (OWNED_TABS), asked for together: each card gets its ⋯.
    static let owned: Set<ReadingAPI.CardBoxShelf> = [.published, ._private, .draft]
    /// The most the 私人卡 shelf shows (each of its two lists is the server's newest 40).
    static let draftShelfMax = 40

    private var phone: Bool { window.layoutClass == .compact }

    var body: some View {
        // The people head (round 9 §9): the avatar 40 / 56 under the bar's pen line, as on a person's page.
        TabScreen(L10n.App.Nav.me, titleInBar: true, phoneTop: PenLineGap.fromFoot(Tokens.peopleHeadGapCompact),
                  tabletTop: PenLineGap.fromFoot(Tokens.peopleHeadGap)) {
            header.alignedWithCardGrid().padding(.bottom, phone ? 32 : 24)
            // The trash's line stands 24 under the shelf strip's washes (round 9 §5; the strip pads them 7).
            tabs.padding(.bottom, shelf == .trash && cards(.trash)?.isEmpty == false ? 24 - Self.tabsInnerPad : (phone ? 36 : 28))
            shelfContent
        }
        .refreshable {
            // Asked for by hand: the server answers, not the HTTP cache.
            session.httpCache.freshness.invalidate()
            await session.loadMe()
            let refreshed = shelf
            let showing = cards(refreshed) != nil
            let failure = await load(refreshed, force: true)
            // Nothing came back for a shelf on screen: it stays, a quiet line over it saying why (VoiceOver too).
            // Left for another shelf meanwhile: the answer isn't about what is on screen, and nothing is said.
            guard let after = Self.afterRefresh(of: refreshed, showing: showing, failure: failure, shown: shelf) else { return }
            withAnimation(.easeInOut(duration: 0.25)) { refreshFailure = after }
            if let after { AccessibilityNotification.Announcement(after.failure.message).post() }
        }
        #if DEBUG
        .task {
            // `-cardBoxShelf <web key>` opens on that shelf (screen checks); `private` opens 私人卡.
            guard !Self.choseLaunchShelf, let key = UserDefaults.standard.string(forKey: "cardBoxShelf"),
                  let chosen = Self.shelf(forKey: key) else { return }
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
        // The writer or a card's ⋯ changed something: every shelf may have moved — and no read begun
        // before it (one on its way may hold the shelf from before) is what they show.
        .onChange(of: writer.changes) {
            reads.supersedeAll()
            shelves = [:]
            unconfirmed = []
            Task { await load(shelf) }
        }
        // Back after a while: every shelf asks again behind what it shows (this one now, the others when opened).
        .onChange(of: session.awayRefreshes) {
            unconfirmed = Set(shelves.keys)
            Task { await load(shelf) }
        }
        // For good, every card here: the verb in red; busy through the whole emptying; a failure said
        // in the question, which stays to try again — unless the trash, read again, is empty after all.
        .organicConfirm(isPresented: $emptying.asking, title: L10n.Me.Actions.emptyTrashTitle, message: L10n.Me.Actions.emptyTrashBody,
                        cancelLabel: L10n.Me.Actions.deleteCancel, confirmLabel: L10n.Me.Actions.emptyTrash,
                        closeLabel: L10n.Me.Actions.deleteCancel, busy: emptying.busy,
                        error: emptying.failed ? L10n.Safety.actionError : nil, destructive: true, seed: 67) {
            Task {
                await emptying.confirm(empty: { _ = try await session.writing.emptyTrash() }, remaining: {
                    // Whatever went before the answer was lost: asked of the server, not the HTTP cache.
                    session.noteOwnWrite()
                    return try? await session.reading.cardBox(.trash).count
                }, changed: {
                    session.noteOwnWrite()
                    writer.noteChange(.init())
                })
            }
        }
    }

    /// The shelf strip's own air over and under its washes.
    static let tabsInnerPad: CGFloat = 7

    @ViewBuilder private var header: some View {
        if let me = session.me {
            HStack(spacing: 16) {
                Button { openRoute(.author(me.handle)) } label: {
                    HandDrawnAvatar(initials: me.initials, imageURL: me.avatarUrl.flatMap(URL.init(string:)),
                                    color: OKLCHColor.avatar(me.accentColor) ?? Tokens.terracottaLight, size: 72,
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
        } else {
            // Who I am, still on its way: the head's shapes where they will land, so nothing moves (round 9 §9).
            HStack(spacing: 16) {
                SkeletonBlock(width: 72, circle: true)
                VStack(alignment: .leading, spacing: 10) {
                    SkeletonBlock(width: 120, height: 24, radius: 8)
                    SkeletonBlock(width: 180, height: 14)
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement()
            .accessibilityLabel("Loading")
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
            .padding(.vertical, Self.tabsInnerPad)
        }
        .scrollIndicators(.hidden)
        // The shelf chosen is in view (the trash, last, is off a phone's edge).
        .onChange(of: shelf, initial: true) { _, chosen in
            withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(chosen) }
        }
        }
        .sensoryFeedback(.selection, trigger: shelf)
    }

    /// What shelf `s` shows, as far as it is known: the 私人卡 shelf is the drafts and the published
    /// private cards together (both must be known), every other shelf its own list.
    private func cards(_ s: ReadingAPI.CardBoxShelf) -> [FeedCard]? {
        guard s == .draft else { return shelves[s] }
        return Self.draftShelf(private: shelves[._private], drafts: shelves[.draft])
    }

    @ViewBuilder private var shelfContent: some View {
        if let note = refreshFailure?.over(shelf), cards(shelf) != nil { RefreshNote(text: note.message) }
        if let cards = cards(shelf) {
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
                TrashShelf(cards: cards) { emptying.ask() }
            } else if shelf == .linked {
                MiniCardList(cards: cards)
            } else if Self.owned.contains(shelf) {
                ManagedCardList(cards: cards)
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
        // The 私人卡 shelf waits on both of its lists.
        let waiting = s == .draft ? unconfirmed.contains(.draft) || unconfirmed.contains(._private) : unconfirmed.contains(s)
        guard force || cards(s) == nil || waiting else { return nil }
        let asked = Self.asked(with: s, force: force, known: Set(shelves.keys), unconfirmed: unconfirmed)
        let read = reads.begin(asked)
        do {
            let answered = try await session.reading.cardBox(shelves: asked)
            // A shelf a newer read asked for since (a change, an undo a moment later) waits for that one's answer.
            for (shelf, cards) in answered where reads.current(shelf, read) {
                shelves[shelf] = cards
                unconfirmed.remove(shelf)
            }
            // The kept published shelf is the server's latest, whichever shelf asked for it.
            if let published = answered[.published], reads.current(.published, read), let uid = session.uid {
                session.kept.save(published, as: .published, uid: uid)
            }
            // Taken over: the newer read says what there is to say about this shelf.
            guard reads.current(s, read) else { return nil }
            // The 私人卡 shelf shows the private cards too: missing while they are known nowhere.
            let missing = answered[s] == nil || (s == .draft && answered[._private] == nil && shelves[._private] == nil)
            // The page-wide state is the shelf on screen's: a shelf left behind can't turn another's skeleton into an error.
            if s == shelf { failed = missing }
            if !missing, s == shelf { refreshFailure = nil }
            return missing ? .failed : nil
        } catch {
            // Left for another shelf (its task cancelled), or taken over by a newer read: not a failure to show.
            guard !Task.isCancelled, reads.current(s, read) else { return nil }
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
    /// and draft lists along with the published one — each that isn't known
    /// yet or is waiting to be asked again (all of them, asked for by hand).
    /// The others (cards by other people) are asked for alone, when shown.
    static func asked(with s: ReadingAPI.CardBoxShelf, force: Bool, known: Set<ReadingAPI.CardBoxShelf>,
                      unconfirmed: Set<ReadingAPI.CardBoxShelf>) -> Set<ReadingAPI.CardBoxShelf> {
        guard owned.contains(s) else { return [s] }
        return owned.filter { force || !known.contains($0) || unconfirmed.contains($0) }.union([s])
    }

    /// The 私人卡 shelf (round 8 §1.1): the drafts never published and the published private cards
    /// together, the most recently changed first — by `editedAt`, a card without one by `publishedAt`
    /// (one with neither after those that have one, in the order it came) — each card once, at most
    /// `draftShelfMax`. Nil until both lists are known.
    static func draftShelf(private privateCards: [FeedCard]?, drafts: [FeedCard]?) -> [FeedCard]? {
        guard let privateCards, let drafts else { return nil }
        var seen = Set<String>()
        let keyed = (drafts + privateCards).filter { seen.insert($0.id).inserted }.enumerated().map { place, card in
            (place: place, card: card, changed: (card.editedAt ?? card.publishedAt).flatMap(ISO8601.date))
        }
        let ordered = keyed.sorted { a, b in
            switch (a.changed, b.changed) {
            case let (x?, y?): x != y ? x > y : a.place < b.place
            case (.some, nil): true
            case (nil, .some): false
            case (nil, nil): a.place < b.place
            }
        }
        return Array(ordered.prefix(draftShelfMax).map(\.card))
    }

    /// The shelf a web key names — `private` (the 私人卡 shelf there was) opens 私人卡.
    static func shelf(forKey key: String) -> ReadingAPI.CardBoxShelf? {
        key == webKey(._private) ? .draft : order.first { webKey($0) == key }
    }

    static func title(_ s: ReadingAPI.CardBoxShelf) -> String {
        switch s {
        case .published: L10n.Me.Tabs.published
        // Never a shelf of its own any more: its cards are on 草稿 (round 8 §1.1).
        case ._private: L10n.Me.Tabs.draft
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
        case ._private: L10n.Me.emptyDraft
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
/// everyone else sees it (design §13) — that is its marker, no badge. A tap opens
/// the card's page, a 私人卡 too (round 9 §1): the owner reads it there, its 編輯
/// a tap away in the bar, as on every card.
private struct ManagedCardList: View {
    let cards: [FeedCard]
    @Environment(SessionStore.self) private var session

    var body: some View {
        // Bands, or the bordered grid on a wide window (as every story-card list).
        let palettes = CardPalette.palettes(cards.map(\.accentHue))
        CardColumns(count: cards.count) { i, bordered in
            let card = cards[i]
            let hue = CardPalette(index: palettes[i]).hue
            NavigationLink(value: Route.card(card.routeKey)) {
                StoryCardView(card.publicStory, position: i, isLast: i == cards.count - 1, bordered: bordered, palette: palettes[i])
            }
            .onAppear { session.cardPreviews.remember(card) }
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
/// nothing under the cards (round 11 §7: restoring says who reads the card) — every card opening its
/// page, with its trash banner (round 9 §1). Its ⋯ restores it or deletes it for good. Over the cards one row,
/// no container (round 9 §5): how long the trash keeps them at its start — and, while an anonymous card
/// is here, that the notes left on it went with it — and 清空 at its end.
private struct TrashShelf: View {
    let cards: [FeedCard]
    /// 清空垃圾桶: the question is the card box's (it outlives the shelf reading again).
    let onEmpty: () -> Void
    @Environment(\.window) private var window

    var body: some View {
        // 16 down to a phone's first band, 24 to a grid (whose own top keeps 4).
        VStack(alignment: .leading, spacing: window.layoutClass == .expanded ? 20 : 16) {
            header.alignedWithCardGrid()
            TrashCardList(cards: cards)
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(L10n.Me.trashHint(days: CardTrash.days))
                // A privacy statement: the same size as the line over it.
                if TrashCaption.holdsAnonymous(cards) { Text(L10n.Me.trashAnonymousNotes) }
            }
            .font(AppFonts.body(13))
            .lineSpacing(13 * 0.35)
            .foregroundStyle(Tokens.textMuted)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            EmptyTrashButton(action: onEmpty)
        }
    }
}

/// 🗑 清空 (round 9 §5): a text button in the danger ink — the trash glyph before its word, no fill —
/// whose press washes the danger ink faintly round it, a finger tall; named 清空垃圾桶 for VoiceOver.
/// It only opens the question (in red).
struct EmptyTrashButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                OrganicIcon(.trash, size: 16, color: Tokens.danger, strokeWidth: Tokens.ink)
                Text(L10n.Me.Actions.emptyTrashShort)
                    .font(AppFonts.body(14, weight: .semibold))
                    .foregroundStyle(Tokens.danger)
                    .lineLimit(1)
                    .fixedSize()
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle(inset: 2, color: Tokens.danger.opacity(0.12)))
        // The glyph's own room sits in the margin, its ink on the shelf strip's end edge.
        .padding(.trailing, -10)
        .accessibilityLabel(L10n.Me.Actions.emptyTrash)
    }
}

/// 清空垃圾桶's question (trash.spec §5.3): asked first, busy through the whole emptying, then gone —
/// or, when it didn't all go, still asking with the error, to try once more (先留著 closes it). A
/// failed emptying may have emptied the trash all the same (the server went on deleting after an
/// answer that came too late, round 8 §6.2): the trash is read again before anything is said, and
/// found empty, the question goes as if it had worked. What is left is read again either way
/// (`changed`), under the question.
@MainActor @Observable
final class EmptyTrashQuestion {
    var asking = false
    private(set) var busy = false
    private(set) var failed = false

    func ask() {
        failed = false
        asking = true
    }

    /// `remaining`: how many cards the trash holds, read again after a failure (nil: it couldn't be read).
    func confirm(empty: () async throws -> Void, remaining: () async -> Int?, changed: () -> Void) async {
        guard !busy else { return }
        busy = true
        failed = false
        defer { busy = false }
        do {
            try await empty()
            asking = false
        } catch {
            if await remaining() == 0 { asking = false } else { failed = true }
        }
        changed()
    }
}

/// Which read each card-box shelf waits for (Android's `readBy`): the shelves change under reads on
/// their way — a card moved to the trash and its undo a second later each read them again — and an
/// answer from a read a newer one took over (or begun before a change) must not put back the shelf
/// as it was before.
final class ShelfReads {
    private var count = 0
    private var by: [ReadingAPI.CardBoxShelf: Int] = [:]

    /// A read of `shelves` begins: it is the one they wait for now.
    func begin(_ shelves: Set<ReadingAPI.CardBoxShelf>) -> Int {
        count += 1
        for shelf in shelves { by[shelf] = count }
        return count
    }

    /// Whether `read`'s answer is still what `shelf` waits for.
    func current(_ shelf: ReadingAPI.CardBoxShelf, _ read: Int) -> Bool { by[shelf] == read }

    /// Something changed: no read on its way is what any shelf waits for.
    func supersedeAll() { by = [:] }
}

/// The trash's cards (ProfileTabs' trash shelf): each as the shelves show a card, nothing under its
/// byline (round 11 §7), with the trash's ⋯ over its top-right corner; an anonymous one wears the anonymous byline, as on the other
/// owned shelves. Every one opens its page — its trash banner there, published or never (round 9 §1:
/// the server answers its author for both).
private struct TrashCardList: View {
    let cards: [FeedCard]

    var body: some View {
        let palettes = CardPalette.palettes(cards.map(\.accentHue))
        CardColumns(count: cards.count) { i, bordered in
            let card = cards[i]
            let hue = CardPalette(index: palettes[i]).hue
            let face = StoryCardView(card.publicStory, position: i, isLast: i == cards.count - 1, bordered: bordered,
                                     palette: palettes[i])
            // Never prefilled from the shelf: a trash summary isn't the card's page.
            NavigationLink(value: Route.card(card.routeKey)) { face }
                .buttonStyle(.plain)
            .overlay(alignment: .topTrailing) {
                TrashActionsMenu(cardId: card.id, seed: hue, hue: hue)
                    .padding(.top, 14 - 3)
                    .padding(.trailing, (bordered ? 14 : 34) - 3)
            }
        }
    }
}
