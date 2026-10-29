import DesignSystem
import ResonanceKit
import SwiftUI

enum AppTab: Hashable, CaseIterable {
    case feed, messages, write, notifications, cardBox

    var title: String {
        switch self {
        case .feed: L10n.Native.tabFeed
        case .messages: L10n.App.Nav.messages
        case .write: L10n.App.Nav.write
        case .notifications: L10n.App.Nav.notifications
        case .cardBox: L10n.App.Nav.me
        }
    }

    /// The web's glyphs for the same places (Subnavbar, NotificationBell, the header's write entry).
    var icon: IconName {
        switch self {
        case .feed: .sparkle
        case .messages: .chat
        case .write: .pen
        case .notifications: .bell
        case .cardBox: .cards
        }
    }

    /// The glyph's solid twin, for the chosen tab (round 16 §2). The pen is an action, never chosen.
    var selectedIcon: IconName? {
        switch self {
        case .feed: .sparkleFill
        case .messages: .chatFill
        case .write: nil
        case .notifications: .bellFill
        case .cardBox: .cardsFill
        }
    }
}

/// The phone's tab bar giving the home feed the screen (round 16 §2): after 24 pt of downward scroll past
/// the first 80 of the list it slides away; 12 pt back up, reaching the top or reaching the end bring it
/// back. Pure, so the rule is pinned without a scroll view (the twin of Android's TabBarScroll).
nonisolated struct TabBarScroll: Equatable {
    static let hideAfter: CGFloat = 24
    static let showAfter: CGFloat = 12
    static let pastTop: CGFloat = 80

    private(set) var hidden = false
    private var last: CGFloat?
    /// The scroll so far in one direction: positive down, negative up.
    private var run: CGFloat = 0

    /// The list at `y` (its offset from its top, kept within 0…`limit` so a rubber band past either end
    /// moves nothing): whether the bar is hidden now.
    @discardableResult
    mutating func scrolled(to y: CGFloat, limit: CGFloat) -> Bool {
        defer { last = y }
        guard let last else { return hidden }
        // At the top, or at the end with nothing more to read: the bar is back.
        if y <= 0 || (limit > 0 && y >= limit - 0.5) {
            run = 0
            hidden = false
            return hidden
        }
        let step = y - last
        guard step != 0 else { return hidden }
        if run != 0, (step > 0) != (run > 0) { run = 0 }
        run += step
        if !hidden, run >= Self.hideAfter, y > Self.pastTop { hidden = true; run = 0 }
        if hidden, run <= -Self.showAfter { hidden = false; run = 0 }
        return hidden
    }

    /// Shown again (a status-bar tap, back to the top, a tab change, the app coming back).
    mutating func show() {
        hidden = false
        run = 0
    }
}

/// Whether the phone's tab bar is out of the way now: the home feed says so as it scrolls, the tab
/// view shows it again on a tab change or coming back to the app.
@Observable
final class TabBarHiding {
    private(set) var hidden = false
    @ObservationIgnored private var rule = TabBarScroll()

    func scrolled(to y: CGFloat, limit: CGFloat) {
        let now = rule.scrolled(to: y, limit: limit)
        if now != hidden { hidden = now }
    }

    func show() {
        rule.show()
        if hidden { hidden = false }
    }
}

extension EnvironmentValues {
    /// Whether the tab a page is on is the one chosen. Every tab's stack stays mounted (unseen under
    /// the chosen one), so a page on another tab never disappears: what may only happen while it is
    /// seen (a conversation being read) asks this too.
    @Entry var isSelectedTab = true
    /// Counts the taps on a tab that is already chosen and at its root: each one takes the root's
    /// list back to its top.
    @Entry var scrollToTop = 0
    /// How far the phone's tab bar sits under the bottom safe area's top edge (round 17 §7): what a tab's
    /// root takes less at its foot for it.
    @Entry var tabBarLowered: CGFloat = 0
}

/// Which navigation chrome a tab shows over its stack (round 5 C1), from the window and the pages
/// pushed over the tab's root.
enum TabChrome {
    /// A tablet's header carries the tab group and the pen on a tab's root only: a pushed page has
    /// its back arrow, its context and its actions — only "back" leads out.
    static func headerTabs(_ layout: LayoutClass, pushed: [Route]) -> Bool {
        layout.topTabs && pushed.isEmpty
    }

    /// A phone's bottom bar shows on a tab's root only, as the tablet's header tabs do: a pushed
    /// page has its back arrow, and only "back" leads out (the owner; Android draws the same).
    static func bottomBar(_ layout: LayoutClass, pushed: [Route]) -> Bool {
        !layout.topTabs && pushed.isEmpty
    }
}

/// Where the shell's toast sits (trash.spec §6): 12 above a phone's tab bar on a tab's root, 16
/// above the home indicator on a page pushed over it (the web's phone), 24 from the foot of the
/// window when the tabs are in the header (a tablet).
enum ToastPlacement {
    /// `lowered`: how far the bar sits into the home indicator's room (``OrganicTabBar/lowered(bottomInset:)``).
    static func bottom(_ layout: LayoutClass, tabBar: Bool, lowered: CGFloat = 0) -> CGFloat {
        if tabBar { return OrganicTabBar<AppTab>.height + HeaderEdge.height + 12 - lowered }
        return layout.topTabs ? 24 : 16
    }
}

/// Where a conversation opened from a page goes (round 5 E3). On a tablet a conversation belongs to
/// the Messages tab wherever it is opened from (a bell row, a profile's message action, any `thread`
/// route): that tab is chosen and shows it — beside the list in two panes, or pushed over the list —
/// while the tab it came from keeps its own stack. In two panes the Messages tab's own pages (a
/// profile pushed over the panes) hand it to the detail pane too. A phone pushes it where it is.
enum ThreadPlacement {
    static func opensInMessages(_ route: Route, from tab: AppTab, layout: LayoutClass) -> Bool {
        guard case .thread = route, layout.topTabs else { return false }
        return tab != .messages || layout == .expanded
    }
}

/// What a tap on a tab does: the pen writes; another tab is chosen (where it was left); the chosen one
/// goes back to its root, or, already there, back to the top of its list.
enum TabTap: Equatable {
    case write, choose, popToRoot, scrollToTop

    static func of(_ picked: AppTab, current: AppTab, pushed: Int) -> TabTap {
        if picked == .write { return .write }
        if picked != current { return .choose }
        return pushed > 0 ? .popToRoot : .scrollToTop
    }
}

/// Four tabs and the pen. Each tab keeps its own navigation stack alive, so
/// switching tabs preserves where you were; re-tapping the current tab pops
/// to its root, and at its root takes its list back to the top. On a phone the
/// bar stays on pushed pages (the system's convention), giving way only to the
/// writer, the thought map and a conversation (``TabChrome``). A window medium
/// or wider (an iPad) carries the tabs in the middle of a full-width header
/// instead — one segmented group — and the pen at its end (round 5 B2, C:
/// iPadOS's top tabs, drawn our way), on a tab's root only: the root's bar
/// leaves them room (``HeaderChrome``), and a pushed page shows neither, its
/// own back arrow the way out. One navigation state, drawn either way, so
/// rotating or resizing the window never loses the place. On an expanded
/// window the Messages tab draws its conversation beside the list
/// (``MessagesPanes``). ⌘1…⌘4 choose a tab, ⌘N writes.
struct MainTabView: View {
    @Environment(SessionStore.self) private var session
    @State private var tab: AppTab = .feed
    @State private var paths: [AppTab: [Route]] = [:]
    @State private var writer = WriteLauncher()
    /// The window as measured here (never the screen: an iPad window can be any width).
    @State private var window = WindowLayout.phone
    /// The header's tab group as drawn (its width is what each page's bar leaves room for).
    @State private var groupWidth: CGFloat = 0
    /// Taps on each tab while it was chosen and at its root (``EnvironmentValues/scrollToTop``).
    @State private var toTop: [AppTab: Int] = [:]
    /// The phone's tab bar slid away while the home feed is read (round 16 §2).
    @State private var barHiding = TabBarHiding()
    /// The window's bottom safe area: how far the bar travels to be out of sight.
    @State private var bottomInset: CGFloat = 0
    /// The home indicator's room (the bottom safe area without a keyboard): the bar sits 10 into an iPhone's.
    @State private var homeInset: CGFloat = 0
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @Environment(\.accessibilitySwitchControlEnabled) private var switchControl
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let push = PushCenter.shared

    private let tabs: [AppTab] = [.feed, .messages, .notifications, .cardBox]
    #if DEBUG
    private static var openedLaunchRoute = false
    private static var openedLaunchWriter = false
    #endif

    /// The header's tabs and pen over the current tab: its root only.
    private var topTabs: Bool { TabChrome.headerTabs(window.layoutClass, pushed: path(tab).wrappedValue) }

    /// The phone's bottom bar over the current tab's page.
    private var bottomBar: Bool { TabChrome.bottomBar(window.layoutClass, pushed: path(tab).wrappedValue) }

    /// The bar out of the way: the feed scrolled it off — never while VoiceOver or Switch Control is on.
    private var barAway: Bool { bottomBar && barHiding.hidden && !voiceOver && !switchControl }

    /// The conversation beside the list (expanded windows).
    private var twoPane: Bool { window.layoutClass == .expanded }

    /// The bar's five items in its order, the pen among them as its action; the header's group takes
    /// the four tabs of them (``OrganicTopTabs/segments(_:)``).
    static func tabItems(notifications: Int, messages: Int) -> [OrganicTabItem<AppTab>] {
        AppTab.allCases.map {
            OrganicTabItem(id: $0, title: $0.title, icon: $0.icon, selectedIcon: $0.selectedIcon, isAction: $0 == .write,
                           badge: $0 == .notifications ? notifications : $0 == .messages ? messages : 0)
        }
    }

    var body: some View {
        effects(chrome)
    }

    private var chrome: some View {
        stacks
            // Each page's bar spans the window and leaves the tabs and the pen their room.
            .environment(\.headerChrome, window.topTabs ? HeaderChrome(groupWidth: groupWidth) : nil)
            .overlay(alignment: .top) {
                if topTabs { headerTabs.transition(.opacity) }
            }
            .animation(.easeOut(duration: 0.16), value: topTabs)
            // The app's one toast, over whichever page asked for it and the ones after it.
            .overlay(alignment: .bottom) {
                // A toast rides with the bar: down with it when the feed has scrolled it away.
                ToastHost(session.toasts)
                    .padding(.bottom, ToastPlacement.bottom(window.layoutClass, tabBar: bottomBar && !barAway, lowered: barLowered))
                    .animation(.easeOut(duration: 0.12), value: bottomBar)
                    .animation(barMotion, value: barAway)
            }
        // The window's width: the root's own plus the safe areas at its sides (a landscape iPhone's notch).
        .onGeometryChange(for: WindowLayout.self) { geo in
            WindowLayout(width: geo.size.width + geo.safeAreaInsets.leading + geo.safeAreaInsets.trailing,
                         height: geo.size.height + geo.safeAreaInsets.top + geo.safeAreaInsets.bottom)
        } action: { window = $0 }
        .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.bottom } action: { bottomInset = $0 }
        // The home indicator's room alone (never the keyboard's): what the bar is lowered into.
        .background {
            Color.clear
                .ignoresSafeArea(.keyboard)
                .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.bottom } action: { homeInset = $0 }
        }
        .environment(\.window, window)
        .environment(\.tabBarLowered, barLowered)
        .environment(barHiding)
        // Another tab, the app back in front, a page over the root and back: the bar is there again.
        .onChange(of: tab) { barHiding.show() }
        .onChange(of: bottomBar) { barHiding.show() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { barHiding.show() } }
        #if targetEnvironment(macCatalyst)
        // The Mac's menu bar carries ⌘N, ⌘, and ⌘1…⌘4 (MacMenuCommands) and asks for them here.
        .onReceive(NotificationCenter.default.publisher(for: MacMenuCommand.posted)) { note in
            guard let command = MacMenuCommand(note) else { return }
            switch command {
            case .write: writer.open()
            case .settings: open(.settings)
            default: if let t = command.tab { select(t) }
            }
        }
        #else
        // The hardware keyboard's ⌘N opens the writer, as the pen does; ⌘1…⌘4 choose a tab, as a tap does.
        .background {
            Button(L10n.App.Nav.write) { writer.open() }
                .keyboardShortcut("n", modifiers: .command)
                .opacity(0)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            ForEach(Array(tabs.enumerated()), id: \.element) { i, t in
                Button(t.title) { select(t) }
                    .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: .command)
                    .opacity(0)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        #endif
    }

    /// The tablet header's own chrome (round 5 B2, C), drawn once above the stacks over a tab's root:
    /// the tab group on the window's centre line, the pen at its trailing end, in the 72 row under the
    /// status bar that the root's bar shares. It fades as a page pushes over the root.
    private var headerTabs: some View {
        ZStack {
            BadgedTabs { items in
                OrganicTopTabs(items: items, selection: tab, labels: window.layoutClass.tabLabels,
                               room: HeaderChrome.labelRoom(width: window.width), label: L10n.App.Nav.main,
                               onSelect: select) { groupWidth = $0 }
            }
            HStack {
                Spacer(minLength: 0)
                OrganicPenButton(title: AppTab.write.title, icon: AppTab.write.icon) { writer.open() }
            }
            .padding(.trailing, HeaderChrome.edge(width: window.width))
        }
        .frame(height: HeaderChrome.rowHeight)
    }

    private var stacks: some View {
        ZStack(alignment: .bottom) {
            ForEach(tabs, id: \.self) { t in
                NavigationStack(path: path(t)) {
                    root(t)
                        .toolbar(.hidden, for: .navigationBar)
                        .appRoutes()
                }
                .environment(\.openRoute, OpenRouteAction(
                    tab: t,
                    push: { route in
                        if ThreadPlacement.opensInMessages(route, from: t, layout: window.layoutClass) {
                            open(route)
                        } else {
                            paths[t, default: []].append(route)
                        }
                    },
                    popToRoot: { paths[t] = [] },
                    replaceTop: { route in
                        var path = paths[t] ?? []
                        if !path.isEmpty { path.removeLast() }
                        paths[t] = path + [route]
                    },
                    cardBox: {
                        paths[t] = []
                        paths[.cardBox] = []
                        tab = .cardBox
                    }
                ))
                .environment(\.isSelectedTab, t == tab)
                .environment(\.scrollToTop, toTop[t] ?? 0)
                .opacity(t == tab ? 1 : 0)
                .allowsHitTesting(t == tab)
                .accessibilityHidden(t != tab)
            }
            if bottomBar {
                BadgedTabs { items in OrganicTabBar(items: items, selection: tab, onSelect: select) }
                    // A field's keyboard rises over it rather than carrying it up.
                    .ignoresSafeArea(.keyboard, edges: .bottom)
                    // Scrolled away by the feed (round 16 §2): down out of sight with its wavy edge, over the
                    // list (which keeps its room at the foot, so nothing reflows) — or, under Reduce Motion, a fade.
                    // Lowered into the home indicator's room (round 17 §7, addendum A2): the row's middle 50 over the screen's foot.
                    .offset(y: barLowered + (barAway && !reduceMotion ? barTravel : 0))
                    .opacity(barAway && reduceMotion ? 0 : 1)
                    .allowsHitTesting(!barAway)
                    .accessibilityHidden(barAway)
                    .animation(barMotion, value: barAway)
                    // In place, fading: back from a page it gave way to it is simply there again (a slide
                    // up after the pop has finished read as arriving late), and it gives way as quickly.
                    .transition(.opacity)
            }
        }
    }

    /// How far the bar goes to be out of sight: itself, its wavy edge and the home indicator's room it
    /// doesn't already stand in.
    private var barTravel: CGFloat { OrganicTabBar<AppTab>.height + HeaderEdge.height + bottomInset - barLowered + 8 }

    /// How far the phone's bar sits into the home indicator's room (none on a tablet: its tabs are in the header).
    private var barLowered: CGFloat { window.topTabs ? 0 : OrganicTabBar<AppTab>.lowered(bottomInset: homeInset) }

    /// Going: 200 ms easing in; coming back: 220 ms easing out; under Reduce Motion a 150 ms fade.
    private var barMotion: Animation {
        if reduceMotion { return .easeInOut(duration: 0.15) }
        return barAway ? .easeIn(duration: 0.2) : .easeOut(duration: 0.22)
    }

    /// What the tab view does around its stacks: the deletion's undo, the writer's requests, links and pushes.
    private func effects(_ content: some View) -> some View {
        @Bindable var session = session
        return content
        .accountDeletionNotice()
        // A resonance restored from the trash that came back on its own says so, wherever it was restored from.
        .organicNotice(isPresented: $session.restoredAloneNotice, title: L10n.Me.Actions.restored,
                       message: L10n.Me.Actions.restoredAloneBody, closeLabel: L10n.Safety.Report.close, seed: 17)
        .animation(.easeOut(duration: 0.12), value: bottomBar)
        .background(Tokens.cream)
        .environment(writer)
        .onAppear {
            writer.onChange = { [session] in
                session.noteOwnWrite()
                // A resonance made, changed or taken back can begin or end a connection: the live list says
                // so (`connectionsMoved`), so it should be listening — a failed listener listens again.
                session.conversations.resume()
            }
        }
        // The writer is a page on the current tab's stack, like the others.
        .onChange(of: writer.requested) { _, request in
            guard let request else { return }
            writer.requested = nil
            // A second tap on a pen while the first page is arriving must not stack another.
            if case .write? = paths[tab]?.last { return }
            paths[tab, default: []].append(.write(request))
        }
        .onOpenURL(perform: open)
        // A tapped push: its page, or the notifications when it has none (also after a cold start).
        .onChange(of: push.opened, initial: true) { _, opened in
            guard let opened else { return }
            push.opened = nil
            // A message sent to the account signed in before this one: nothing of it is opened here.
            guard opened.isFor(session.uid) else { return }
            if let id = opened.notificationId { session.notifications.markRead(id: id) }
            if let url = URL(string: opened.route, relativeTo: session.config.origin)?.absoluteURL,
               let route = Route(url: url, origin: session.config.origin) {
                let row = opened.notificationId.flatMap { id in session.notifications.items.first { $0.id == id } }
                open(Self.withSender(route, uid: opened.fromUserId, of: row))
            } else {
                tab = .notifications
            }
        }
        #if DEBUG
        // `-debugToast "…"` shows the shell's toast at launch (screen checks), with `-debugToastVerb "…"`
        // as an undo that shows 「已還原」 when tapped.
        .task {
            guard let message = UserDefaults.standard.string(forKey: "debugToast") else { return }
            let verb = UserDefaults.standard.string(forKey: "debugToastVerb")
            let toasts = session.toasts
            toasts.show(message, action: verb.map { verb in
                ToastCenter.Action(label: verb, accessibilityLabel: "\(message) · \(verb)", icon: .restore) {
                    toasts.show(L10n.Me.Actions.restored)
                }
            })
        }
        // `-openWriter YES` opens the writer on a new card at launch, `-writeCard <id>` on one of your cards
        // (screen checks: with `-writeTitle`/`-writeStory`, and `-writeStep publish` for the publish step).
        .task {
            // `-cardBoxShelf trash` (any shelf's web key) opens the card box on that shelf.
            if UserDefaults.standard.string(forKey: "cardBoxShelf") != nil, !Self.openedLaunchWriter { tab = .cardBox }
            guard !Self.openedLaunchWriter else { return }
            if let card = UserDefaults.standard.string(forKey: "writeCard") {
                Self.openedLaunchWriter = true
                paths[tab, default: []].append(.write(.init(cardId: card)))
            } else if UserDefaults.standard.bool(forKey: "openWriter") {
                Self.openedLaunchWriter = true
                paths[tab, default: []].append(.write(.init()))
            }
        }
        // `-route /card/<slug>` or `-route /u/<handle>` opens that page at launch (screen checks); a query
        // comes along (`/messages/<handle>?note=…&card=…`, a bell's link).
        .task {
            // Once per launch: the tab view reappears (a language change), and must not push the page again.
            guard !Self.openedLaunchRoute, let path = UserDefaults.standard.string(forKey: "route") else { return }
            Self.openedLaunchRoute = true
            // `/settings` and `/settings/<section>` (profile, account, privacy, notifications, language, appearance,
            // terms, delete) open Settings or one of its pages, which have no site URL.
            if let settings = Self.launchSettings(path) { return paths[tab, default: []].append(contentsOf: settings) }
            open(URL(string: path, relativeTo: session.config.origin)?.absoluteURL ?? session.config.origin.appending(path: path))
        }
        #endif
    }

    #if DEBUG
    /// The pages a `-route /settings[/<section>]` launch opens (screen checks): Settings, then the section.
    static func launchSettings(_ path: String) -> [Route]? {
        let parts = path.split(separator: "/").map(String.init)
        guard parts.first == "settings" else { return nil }
        guard parts.count > 1 else { return [.settings] }
        guard let section = SettingsSection.allCases.first(where: { "\($0)" == parts[1] }) else { return [.settings] }
        return [.settings, .settingsSection(section)]
    }
    #endif

    /// Site links (universal links, shared URLs) open on the current tab.
    private func open(_ url: URL) {
        guard let route = Route(url: url, origin: session.config.origin) else { return }
        open(route)
    }

    private func open(_ route: Route) {
        // A conversation belongs to the Messages tab's stack.
        if case .thread = route { tab = .messages }
        // Its message tapped while the conversation is open: it is on screen already, not opened again over itself.
        if let top = paths[tab]?.last, route.reopens(top) { return }
        // Two panes: the conversation takes the detail pane's place, over nothing.
        if case .thread = route, twoPane {
            paths[.messages] = MessagesPanes.choose(route, in: paths[.messages] ?? [])
            return
        }
        paths[tab, default: []].append(route)
    }

    /// A push's link names the sender by pen name; a conversation opens by
    /// their uid, which the push carries (`data.fromUserId`) — even on a cold
    /// start, before any bell row has arrived. An older push without it takes
    /// the uid from its bell row, when that has arrived.
    static func withSender(_ route: Route, uid: String? = nil, of item: NotificationsStore.Item?) -> Route {
        guard case let .thread(handle, nil, note) = route else { return route }
        if let uid { return .thread(handle: handle, uid: uid, note: note) }
        guard let item, item.fromHandle == handle, let uid = item.fromUserId else { return route }
        return .thread(handle: handle, uid: uid, note: note)
    }

    @ViewBuilder private func root(_ t: AppTab) -> some View {
        switch t {
        case .feed: FeedScreen()
        case .messages:
            if twoPane {
                MessagesTwoPane(detail: MessagesPanes.split(paths[.messages] ?? []).detail) { route in
                    paths[.messages] = MessagesPanes.choose(route, in: paths[.messages] ?? [])
                }
            } else {
                ConversationsScreen()
            }
        case .notifications: NotificationsScreen()
        case .cardBox: CardBoxScreen()
        case .write: EmptyView()
        }
    }

    private func select(_ picked: AppTab) {
        switch TabTap.of(picked, current: tab, pushed: path(tab).wrappedValue.count) {
        case .write: writer.open()
        case .choose: tab = picked
        // In two panes the conversation beside the list stays; what was pushed over it goes.
        case .popToRoot: path(tab).wrappedValue = []
        case .scrollToTop: toTop[tab, default: 0] += 1
        }
    }

    /// The stack a tab's NavigationStack draws: in two panes, the Messages tab's conversation is the
    /// root's detail pane, so only what is pushed over it is.
    private func path(_ t: AppTab) -> Binding<[Route]> {
        guard t == .messages, twoPane else { return Binding(get: { paths[t] ?? [] }, set: { paths[t] = $0 }) }
        return Binding(get: { MessagesPanes.split(paths[.messages] ?? []).pushed },
                       set: { paths[.messages] = MessagesPanes.merge(detail: MessagesPanes.split(paths[.messages] ?? []).detail, pushed: $0) })
    }
}

/// The tabs with their badges (``MainTabView/tabItems(notifications:messages:)``), the counts read
/// here: a badge that changes draws the bar again, not the tab view and its four stacks.
private struct BadgedTabs<Content: View>: View {
    @Environment(SessionStore.self) private var session
    @ViewBuilder let content: ([OrganicTabItem<AppTab>]) -> Content

    var body: some View {
        content(MainTabView.tabItems(notifications: session.notifications.unreadCount, messages: session.conversations.unreadTotal))
    }
}

/// A tab's root screen: the brand bar (the web's phone AppHeader), then the
/// page title and the content scrolling under the bar, with room at the
/// bottom for the tab bar. The brand bar has nothing to press, so it gives the
/// stories the room: it slides up under the status bar while reading down and
/// comes back on the way up (settling shown or hidden when the scroll stops).
/// A `banner` floats just under the bar, over the content, and moves with it.
/// A `.refreshable` given to it is pulled with the Resonance loader
/// (`sketchRefreshable`), never the system's spinner, and offered to VoiceOver
/// as a "Refresh" action on everything in the list (`sketchRefreshAction`).
/// Home has no page title (an empty `title`): the brand bar alone, and the
/// feed's first card begins right at the bar's line. Every other tab
/// (`titleInBar`) names itself in the bar where "Resonance" stood, with any
/// `trailing` control at the bar's end, and the content starts just under the
/// bar's line. The height between the bar and the tab bar is handed to a
/// filling ``OrganicEmptyState`` (`emptyStateRegion`).
struct TabScreen<Trailing: View, Banner: View, Content: View>: View {
    let title: String
    var headerSpacing: CGFloat
    var titleInBar: Bool
    /// With the title in the bar, how far under its line the content starts on a phone (the card box
    /// keeps 8 more: round 5 E2), and whether a tablet gives it the header's gap (not the Messages
    /// list, whose panes are fixed).
    var phoneTop: CGFloat
    var tabletGap: Bool
    /// A tablet's own air under the header in place of the header's gap under the pen line (Me's people head, round 9 §9).
    var tabletTop: CGFloat?
    /// The list's first item as it is now (the feed's first card), for lists whose items anchor the
    /// scroll (a scroll target layout: a reader further down keeps the item they are reading where it
    /// is when items come in above it). When it changes while the list rests at its top — picks put
    /// on top of the feed, a pull that brought others — the list goes on showing its top, the new first
    /// item, rather than the item it had there.
    var head: String?
    /// Each change takes the list back to its top, as a tap on its chosen tab does (the feed's
    /// 今天的推薦來了 · 往上看).
    var toTopRequests = 0
    /// Told whether the list rests at its top, each time that changes.
    var onAtTop: (Bool) -> Void = { _ in }
    /// The phone's tab bar slides away as this list is read down (round 16 §2: the home feed only).
    var hidesTabBar = false
    /// Told whether the reader is within a screen and a half of the list's end, each time that changes
    /// (the home feed fetches its next page then: round 19). Nil: nothing watches.
    var onNearEnd: ((Bool) -> Void)?
    /// The paper puppets may come to this list (round 19: the home feed), while Settings → 外觀 → 小紙團 is on.
    var hostsMascots = false
    @Environment(TabBarHiding.self) private var barHiding: TabBarHiding?
    let trailing: Trailing
    let banner: Banner
    let content: Content
    /// The screen's `.refreshable` (the feed, the card box), handed on to the scroll view drawn with the loader.
    @Environment(\.refresh) private var refresh
    /// With the tabs in the header there is no tab bar to keep room for, and the bar stays.
    @Environment(\.window) private var window
    /// How far the tab bar sits into the home indicator's room (round 17 §7).
    @Environment(\.tabBarLowered) private var lowered
    /// The Messages list beside a conversation: the window's header is drawn above it, full width.
    @Environment(\.headerAbove) private var headerAbove
    /// A tap on this tab while it is chosen and here: back to the top.
    @Environment(\.scrollToTop) private var toTop
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var position = ScrollPosition(idType: String.self, edge: .top)
    /// The list rests at its top (nothing scrolled under the bar).
    @State private var atTop = true
    @State private var scrolled = false
    /// How far the brand bar has slid up (0…`travel`).
    @State private var hidden: CGFloat = 0
    /// The list's offset near its top (clamped: further down it doesn't matter), and the top it rests
    /// at — `RefreshPull`'s own measure of the gap a pull opens (`drawnDown`).
    @State private var nearTop: CGFloat = 0
    @State private var restingTop: CGFloat = 0
    /// What the scroll view shows between its insets (the bar above, the home indicator below).
    @State private var visibleHeight: CGFloat = 0
    /// How far the list is drawn down past its top (a pull, or the room a refresh keeps): the banner
    /// rides on the list, below the loader in that gap, never over it.
    private var drawnDown: CGFloat { max(0, -(nearTop + restingTop)) }
    /// The bar's row above its wavy edge: 4 of air and the 44 lockup. A tablet's header carries the
    /// navigation and never slides away.
    private var travel: CGFloat { window.topTabs ? 0 : 48 }
    private var topPadding: CGFloat {
        guard titleInBar else { return title.isEmpty ? 0 : 40 }
        return window.topTabs && tabletGap ? tabletTop ?? HeaderChrome.contentTop(width: window.width) : phoneTop
    }
    /// What the tab bar takes at the foot (nothing when the tabs are in the header), less what of it stands
    /// in the home indicator's room (round 17 §7).
    private var bottomRoom: CGFloat { window.topTabs ? 0 : OrganicTabBar<AppTab>.height + HeaderEdge.height - lowered }

    init(_ title: String, headerSpacing: CGFloat = 20, titleInBar: Bool = false, phoneTop: CGFloat = 16, tabletGap: Bool = true,
         tabletTop: CGFloat? = nil, head: String? = nil, toTopRequests: Int = 0, onAtTop: @escaping (Bool) -> Void = { _ in },
         hidesTabBar: Bool = false, onNearEnd: ((Bool) -> Void)? = nil, hostsMascots: Bool = false,
         @ViewBuilder trailing: () -> Trailing = { EmptyView() },
         @ViewBuilder banner: () -> Banner, @ViewBuilder content: () -> Content) {
        self.hidesTabBar = hidesTabBar
        self.hostsMascots = hostsMascots
        self.onNearEnd = onNearEnd
        self.title = title
        self.headerSpacing = headerSpacing
        self.titleInBar = titleInBar
        self.phoneTop = phoneTop
        self.tabletGap = tabletGap
        self.tabletTop = tabletTop
        self.head = head
        self.toTopRequests = toTopRequests
        self.onAtTop = onAtTop
        self.trailing = trailing()
        self.banner = banner()
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // A tablet's refresh keeps a taller gap open than the system's (round 5 E2).
                SketchRefreshRoom()
                if !titleInBar, !title.isEmpty {
                    OrganicLargeHeader(title) { trailing }
                        .padding(.bottom, headerSpacing)
                }
                content
            }
            // An empty state fills what is left between the bar's line and the tab bar.
            .environment(\.emptyStateRegion, max(0, visibleHeight - topPadding - bottomRoom))
            // --page-pad-top on a phone; with the title in the bar, 16 of air under its line; none
            // without a title (home: the first card is the bar's edge).
            .padding(.top, topPadding)
            .padding(.bottom, window.topTabs ? 40 : 110 - lowered)
            // For whoever can't pull, the same refresh is the list's "Refresh" action (among VoiceOver's actions on any of its rows).
            .sketchRefreshAction(named: L10n.Native.refresh)
            // Where the paper puppets' marks are measured, and their island laid over: the scrolled content's own points.
            .mascotContent()
        }
        .modifier(MascotHosting(hosts: hostsMascots, footRoom: bottomRoom))
        .scrollPosition($position)
        .onChange(of: toTop) { backToTop() }
        .onChange(of: toTopRequests) { backToTop() }
        // A new first item: at the top the list shows it; further down the anchored scroll has kept the
        // reader's item where it was.
        .onScrollGeometryChange(for: Bool.self) { geo in geo.contentOffset.y + geo.contentInsets.top <= 1 } action: { _, top in
            atTop = top
            onAtTop(top)
        }
        .onChange(of: head) {
            if atTop { position.scrollTo(edge: .top) }
        }
        .onHeaderScroll($scrolled)
        .onChange(of: scrolled) { _, now in headerAbove?.scrolled(now) }
        // The offset within the scrollable range only: a rubber-band past either end must not move the bar.
        .onScrollGeometryChange(for: CGFloat.self) { geo in
            let limit = max(0, geo.contentSize.height + geo.contentInsets.top + geo.contentInsets.bottom - geo.containerSize.height)
            return min(max(geo.contentOffset.y + geo.contentInsets.top, 0), limit)
        } action: { old, new in
            hidden = new <= 0 ? 0 : min(travel, max(0, hidden + new - old))
        }
        // How far the end is, in steps of 16 (so the answer follows a scroll and the content growing
        // under it, the first page's arrival included) — told on as near or not.
        .onScrollGeometryChange(for: Int.self) { geo in
            guard onNearEnd != nil, geo.containerSize.height > 0 else { return 0 }
            let left = geo.contentSize.height - (geo.contentOffset.y + geo.containerSize.height)
            return Int(((left - 1.5 * geo.containerSize.height) / 16).rounded(.down))
        } action: { _, steps in
            onNearEnd?(steps < 0)
        }
        // The tab bar's own rule (round 16 §2), from the same offset and its end.
        .onScrollGeometryChange(for: [CGFloat].self) { geo in
            let limit = max(0, geo.contentSize.height + geo.contentInsets.top + geo.contentInsets.bottom - geo.containerSize.height)
            return [min(max(geo.contentOffset.y + geo.contentInsets.top, 0), limit), limit]
        } action: { _, now in
            guard hidesTabBar, !window.topTabs else { return }
            barHiding?.scrolled(to: now[0], limit: now[1])
        }
        .onScrollPhaseChange { _, phase, context in
            guard phase == .idle else { return }
            let y = context.geometry.contentOffset.y + context.geometry.contentInsets.top
            withAnimation(.easeOut(duration: 0.18)) { hidden = y < travel || hidden < travel / 2 ? 0 : travel }
        }
        .scrollIndicators(.hidden)
        .background(Tokens.cream)
        .onScrollGeometryChange(for: CGFloat.self) { min($0.contentOffset.y, 0) } action: { _, y in nearTop = y }
        .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.top } action: { restingTop = $0 }
        // The container is the scroll view's frame inside its insets: the bar above, the home indicator below.
        .onScrollGeometryChange(for: CGFloat.self) { $0.containerSize.height } action: { _, h in
            visibleHeight = h
        }
        // Under the refresh, so the banner keeps riding on the list over a tablet's taller gap.
        .overlay(alignment: .top) { SketchRefreshRiding { room in banner.offset(y: drawnDown + room - hidden) } }
        .sketchRefreshable(refresh)
        .safeAreaInset(edge: .top, spacing: 0) {
            if headerAbove == nil {
                OrganicBrandBar(title: titleInBar ? title : nil, scrolled: scrolled) { if titleInBar { trailing } }
                    .offset(y: -hidden)
            }
        }
        // The status bar keeps its paper while the bar slides under it.
        .overlay(alignment: .top) {
            Color.clear.frame(height: 0).background(Tokens.cream.ignoresSafeArea(edges: .top))
        }
    }

    /// Back to the list's top — gliding there, or at once under Reduce Motion — with the bar shown.
    private func backToTop() {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.35)) { position.scrollTo(edge: .top) }
        withAnimation(.easeOut(duration: 0.18)) { hidden = 0 }
        if hidesTabBar { barHiding?.show() }
    }
}

extension TabScreen where Banner == EmptyView {
    init(_ title: String, headerSpacing: CGFloat = 20, titleInBar: Bool = false, phoneTop: CGFloat = 16, tabletGap: Bool = true,
         tabletTop: CGFloat? = nil, head: String? = nil, toTopRequests: Int = 0, onAtTop: @escaping (Bool) -> Void = { _ in },
         hidesTabBar: Bool = false, onNearEnd: ((Bool) -> Void)? = nil, hostsMascots: Bool = false,
         @ViewBuilder trailing: () -> Trailing = { EmptyView() }, @ViewBuilder content: () -> Content) {
        self.init(title, headerSpacing: headerSpacing, titleInBar: titleInBar, phoneTop: phoneTop, tabletGap: tabletGap,
                  tabletTop: tabletTop, head: head, toTopRequests: toTopRequests, onAtTop: onAtTop, hidesTabBar: hidesTabBar,
                  onNearEnd: onNearEnd, hostsMascots: hostsMascots, trailing: trailing, banner: { EmptyView() }, content: content)
    }
}
