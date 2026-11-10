import DesignSystem
import ResonanceKit
import SwiftUI

/// How the Messages tab's one stack draws on an expanded window (design §9): the conversation at
/// its foot is the detail pane beside the list; only what is pushed over that conversation (a
/// profile, a card) is pushed, over the whole content area. Narrower, the same stack draws as it
/// always has — rotating or resizing never loses the place.
enum MessagesPanes {
    /// The conversation the detail pane shows (the stack's first page, when it is one) and the
    /// pages pushed over it.
    static func split(_ path: [Route]) -> (detail: Route?, pushed: [Route]) {
        guard let first = path.first, case .thread = first else { return (nil, path) }
        return (first, Array(path.dropFirst()))
    }

    static func merge(detail: Route?, pushed: [Route]) -> [Route] {
        (detail.map { [$0] } ?? []) + pushed
    }

    /// A conversation chosen in the list (or opened by a link or a push): it takes the detail pane's
    /// place, and what was pushed over the one before goes with it. The same one again, with nothing
    /// to do there, changes nothing.
    static func choose(_ route: Route, in path: [Route]) -> [Route] {
        if let detail = split(path).detail, route.reopens(detail) { return path }
        return [route]
    }
}

/// The conversation chosen in a two-pane Messages (a row wears the active wash), and how a row chooses.
struct ChosenThread {
    var route: Route?
    var choose: (Route) -> Void

    /// Whether the row for `person` is the one in the detail pane.
    func isChosen(_ person: Person) -> Bool {
        guard case let .thread(handle, uid, _)? = route else { return false }
        if let uid { return uid == person.id }
        return handle.caseInsensitiveCompare(person.handle) == .orderedSame
    }
}

/// The window's header drawn above a root screen by its host (a two-pane Messages, round 5 B2):
/// the screen leaves its own bar out and says when it has scrolled, for the header's pen line.
struct HeaderAbove {
    var scrolled: (Bool) -> Void
}

/// The invite's band atop a two-pane Mac list, carried up under the window's header (``PaneListBandTop``) and on across
/// the detail pane's gutter (round 24, ``PaneGutterBand``): where the band is in the panes' space
/// (``MessagesTwoPane/space``) and how far its foot rule runs past the list. Written by the band as the list scrolls and
/// read only by those two papers, so neither pane draws again for it.
///
/// Whether there is a band is the list's word (``listChanged(from:to:)``), never the band's own appearing: a page pushed
/// over the panes or another tab takes the band off screen (its `onDisappear`) and brings it back with its geometry
/// unchanged, so nothing would place it again — its place is kept until the list says it is gone (round 24 review).
@Observable final class PaneBand {
    /// Where the papers lay the band; nil while the list draws none, or before the band has said where it is.
    private(set) var frame: CGRect?
    private(set) var reach: CGFloat = 0
    /// Whether the list draws its band, and where the band last said it was (either may come first as it appears).
    @ObservationIgnored private var offered = false
    @ObservationIgnored private var last: (frame: CGRect, reach: CGFloat)?
    /// How the papers come in with the band: its fade, or none when it simply stands.
    @ObservationIgnored private var arrival: Animation?

    /// The band's own fade (``ConversationsScreen``'s on the invite showing), for its papers.
    static let fade = Animation.easeOut(duration: 0.2)

    /// What of the list decides its band: whether it has read its rows, and whether it draws the band.
    nonisolated struct ListState: Equatable {
        var loaded: Bool
        var banded: Bool
    }

    /// Where the band is, as the list lays it out and scrolls. Only a band the list draws is laid (one on its way out,
    /// fading, lays nothing again).
    func place(_ frame: CGRect, reach: CGFloat) {
        last = (frame, reach)
        guard offered else { return }
        guard self.frame != nil else {
            withAnimation(arrival) { self.frame = frame; self.reach = reach }
            return
        }
        if self.frame != frame { self.frame = frame }
        if self.reach != reach { self.reach = reach }
    }

    /// The list as it was and is (told as it first appears and on each change): its band drawn or gone — the invite
    /// offered or answered (不用了, 好，通知我), no one to connect with, the rows read again. The papers come and go
    /// with the band: fading as it does when the invite comes or goes (the list's 0.2 s), standing and leaving with it
    /// at once when the list first shows or its rows are read (again).
    func listChanged(from was: ListState, to now: ListState) {
        guard now.banded != offered else { return }
        offered = now.banded
        arrival = Self.arrival(from: was, to: now)
        if offered {
            if let last { withAnimation(arrival) { frame = last.frame; reach = last.reach } }
        } else {
            last = nil
            if frame != nil { withAnimation(arrival) { frame = nil; reach = 0 } }
        }
    }

    /// How the papers come or go as the list goes from `was` to `now`: with the band's fade when the invite came or
    /// went (``ConversationsScreen`` fades the band on that alone), at once with the band when the list first shows
    /// (`was` is `now`) or its rows were read (again).
    static func arrival(from was: ListState, to now: ListState) -> Animation? {
        was != now && was.loaded == now.loaded ? fade : nil
    }

    /// Where the list lays the band's paper up under the header (``PaneListBandTop``), down from the top of a box laid
    /// as the rule's is (``PaneLines/tuck`` over the header's foot, under its wave), for the `band` where it is in that
    /// box: to a point over the band's top — the gap a pull opens over it included — or, the band scrolled up under
    /// the header, to the header's foot as far as the band reaches. Nil when there is nothing to lay (the band gone up
    /// past the wave).
    static func listPaper(band: CGRect) -> Range<CGFloat>? {
        let to = max(band.minY + 1, min(PaneLines.tuck, band.maxY))
        return to > 0 ? 0..<to : nil
    }
}

extension EnvironmentValues {
    /// Set in a two-pane Messages: the rows choose rather than push.
    @Entry var chosenThread: ChosenThread? = nil
    /// Set over the list of a two-pane Messages: where the invite's band is, for the detail pane's gutter.
    @Entry var paneBand: PaneBand? = nil
    /// Set over the list of a two-pane Messages: its header is the window's, drawn above both panes.
    @Entry var headerAbove: HeaderAbove? = nil
    /// The thread is the detail pane beside the list: no back arrow, the rule at its leading side.
    @Entry var inDetailPane = false
}

/// The list | rule | conversation of an expanded window's Messages, under the window's full-width
/// header (round 5 B2, D5: the brand at its leading end, the tabs and the pen over it); the
/// conversation keeps its own bar at the top of its pane, under the header's wave — the header's
/// line, the rule and the pane bar's foot one constant pen (D4, ``PaneLines``).
struct MessagesTwoPane: View {
    let detail: Route?
    let choose: (Route) -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window
    @State private var listScrolled = false
    @State private var band = PaneBand()

    /// The panes' coordinate space: where the list's invite band tells the gutter it is.
    static let space = "messages.panes"

    var body: some View {
        HStack(spacing: 0) {
            ConversationsScreen()
                .environment(\.chosenThread, ChosenThread(route: detail, choose: choose))
                .environment(\.headerAbove, HeaderAbove { listScrolled = $0 })
                .environment(\.paneBand, band)
                .frame(width: Tokens.msgListW)
                // The list's invite band, up under the window's header (the Mac's: nothing elsewhere).
                .overlay { PaneListBandTop(band: band) }
            ZStack {
                if case let .thread(handle, uid, note)? = detail {
                    ThreadScreen(handle: handle, uid: uid, note: note)
                        .id(detail)
                        .transition(.opacity)
                } else {
                    EmptyDetailPane(noConversations: noConversations)
                        .transition(.opacity)
                }
            }
            .environment(\.inDetailPane, true)
            // The pane's bar is its own, under the window's header: no room kept for the tabs. Its line is
            // the pane's, drawn from the rule (round 5 D4: ``PaneLines``).
            .environment(\.headerChrome, nil)
            .environment(\.headerLineInk, .hidden)
            // Exactly what is left beside the list: nothing in the thread may widen its pane.
            .frame(width: max(0, window.contentWidth - Tokens.msgListW))
            .frame(maxHeight: .infinity)
            // The list's invite band, carried across the gutter to the rule (the Mac's: nothing elsewhere).
            .overlay { PaneGutterBand(band: band) }
            .animation(.easeInOut(duration: 0.16), value: detail)
        }
        .coordinateSpace(.named(Self.space))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) {
            // One pen with the panes' rules, which no scrolling inks in (round 5 D4).
            OrganicBrandBar(title: L10n.App.Nav.messages, scrolled: listScrolled)
                .environment(\.headerLineInk, .pane)
        }
        // The status bar keeps the header's paper.
        .overlay(alignment: .top) {
            Color.clear.frame(height: 0).background(Tokens.cream.ignoresSafeArea(edges: .top))
        }
    }

    private var noConversations: Bool {
        let store = session.conversations
        return store.loaded && store.conversations.isEmpty && store.starters.isEmpty
    }
}

/// The Mac list's invite band carried on across the detail pane's leading gutter to the rule between the panes (round 24,
/// the owner: 「它的這個底色你可以看到區塊破掉了，這個線都應該要接在一起，底色要填滿」): the band's grey and grain from the
/// pane's top (under the header, where the list's paper runs up and a pull's gap opens) down to the band's foot, cut along
/// the rule's own line; the band's foot rule run on to meet the rule (the same line, ``AsideBand/footRule(width:)``); and
/// the rule drawn again over the paper — one constant opaque ink, so it simply stays on top. Laid in ``PaneLines``' own
/// box, over the pane; nothing while the band isn't there.
private struct PaneGutterBand: View {
    let band: PaneBand

    var body: some View {
        GeometryReader { geo in
            if let frame = band.frame {
                let box = geo.frame(in: .named(MessagesTwoPane.space))
                let foot = frame.maxY - box.minY
                if foot > 0 {
                    let above = Path(CGRect(x: 0, y: 0, width: geo.size.width, height: foot))
                    let lead = PaneLeadShape()
                    ZStack(alignment: .topLeading) {
                        ZStack {
                            lead.fill(AsideBand.paper)
                            GrainLayer(shape: lead, mode: .tile, opacity: AsideBand.grain, tile: "grain-overlay")
                        }
                        .mask { above }
                        AsideBand.footRule(width: frame.width + band.reach)
                            .offset(x: frame.minX - box.minX, y: foot - 3)
                            .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
                            .mask { lead }
                        PaneRuleGeometry(height: Double(geo.size.height)).path
                            .stroke(PaneLines.ink, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                            .mask { Path(CGRect(x: 0, y: 0, width: geo.size.width, height: foot + 6)) }
                    }
                    .transition(.opacity)
                }
            }
        }
        .padding(.top, -PaneLines.tuck)
        .ignoresSafeArea(edges: .bottom)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The Mac list's invite band joined to the window's header (round 24, the owner: 「讓它這個區塊直接接著上方的這個Header
/// 下方的線就好」). The band's paper runs up from its top as under a phone's bar, but over everything above the list's
/// top the list keeps the page's paper (``TabScreen``'s, for a status bar), so it stopped at the header's foot: a sliver
/// of the page under the header's wave. Laid over the list, under the header: the band's grey and grain from under the
/// header's wave (``PaneLines/tuck`` up, as the rule's top) down to the band's top — the gap a pull opens over it
/// included — or, the band scrolled up under the header, down to the header's foot as far as the band reaches. Laid
/// as ``PaneLines``' box is (its content from the list's safe top, the header's foot, and 8 up); nothing while the
/// band isn't there.
private struct PaneListBandTop: View {
    let band: PaneBand

    var body: some View {
        GeometryReader { geo in
            if let frame = band.frame {
                let box = geo.frame(in: .named(MessagesTwoPane.space))
                let inBox = frame.offsetBy(dx: -box.minX, dy: -box.minY)
                if let span = PaneBand.listPaper(band: inBox) {
                    Rectangle()
                        .fill(AsideBand.paper)
                        .overlay { GrainLayer(shape: Rectangle(), mode: .tile, opacity: AsideBand.grain, tile: "grain-overlay") }
                        .frame(width: inBox.width, height: span.upperBound)
                        .offset(x: inBox.minX)
                        .transition(.opacity)
                }
            }
        }
        // Up under the header's wave, as ``PaneLines`` reaches.
        .padding(.top, -PaneLines.tuck)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// What lies before the panes' rule in ``PaneLines``' box: the box's leading edge down one side, the rule's centre line
/// up the other (``PaneScrimShape``'s other half).
private nonisolated struct PaneLeadShape: Shape {
    func path(in rect: CGRect) -> Path {
        let rule = PaneRuleGeometry(height: Double(rect.height))
        var path = rule.path.offsetBy(dx: rect.minX, dy: rect.minY)
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + rect.height + 40))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        path.closeSubpath()
        return path
    }
}

/// The detail pane with nothing chosen: the bar's paper, empty, and the empty state — pick a
/// conversation, or (none at all) how conversations begin.
private struct EmptyDetailPane: View {
    let noConversations: Bool
    @State private var height: CGFloat = 0
    @State private var barHeight: CGFloat?

    var body: some View {
        VStack(spacing: 0) {
            OrganicInlineBar("", backLabel: L10n.Messages.back).backHidden(true)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { barHeight = $0 }
            // The region is what the pane leaves under its bar, measured on a view that takes exactly that
            // and laid over it. Measured on the state itself (which is as tall as the region it was given),
            // it never shrank: a window made shorter (a Mac's, as it opens or under a drag) kept the old
            // height, the pane stood taller than the window and the header rode up over the tabs.
            Color.clear
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
                .overlay(alignment: .top) {
                    Group {
                        if noConversations {
                            OrganicEmptyState(title: L10n.Messages.emptyTitle, message: L10n.Messages.empty, icon: .chat, seed: 23, fills: true)
                        } else {
                            OrganicEmptyState(message: L10n.Messages.pickOne, icon: .chat, seed: 23, fills: true)
                        }
                    }
                    .environment(\.emptyStateRegion, height)
                    .padding(.leading, PaneLines.gutter)
                }
        }
        .overlay { PaneLines(barHeight: barHeight) }
        .background(Tokens.cream)
    }
}

/// The panes' rule beside the conversation (round 24, part 3 §B–C): ``PaneLines``' own box — the pane up under the
/// window's header by ``PaneLines/tuck``, down through its bottom inset to the window's foot — measured in a space the
/// thread names (`space`), so what the thread draws from the rule's line (``FromPaneRule``) is cut along the very curve
/// the rule is stroked on.
struct PaneRuleBox: Equatable {
    var box: CGRect
    var space: String

    /// What lies past the rule's centre line, in the space of a view at `frame` (in ``space``).
    func trailing(of frame: CGRect) -> Path {
        PaneScrimShape().path(in: box.offsetBy(dx: -frame.minX, dy: -frame.minY))
    }
}

/// Content that runs on across the detail pane's leading gutter to the rule between the panes (round 24, part 3 §C, the
/// owner: the attach panel's line "沒有接在這個兩側"): laid ``PaneLines/gutter`` before its own place — the column the
/// thread keeps beside the gutter — and cut along the rule's centre line, so the rule stroked over it hides the cut and
/// nothing of it shows on the list's side. Without a rule (one pane) the content as it is.
struct FromPaneRule<Content: View>: View {
    let rule: PaneRuleBox?
    @ViewBuilder let content: Content

    var body: some View {
        if let rule {
            GeometryReader { geo in
                content
                    .frame(width: geo.size.width, height: geo.size.height)
                    .mask { rule.trailing(of: geo.frame(in: .named(rule.space))) }
            }
            .padding(.leading, -PaneLines.gutter)
        } else {
            content
        }
    }
}
