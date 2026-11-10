import DesignSystem
import ResonanceKit
import SwiftUI

/// The reply ask's inside (docs/specs/notification-asks.md §2), in the shell's organic modal: the
/// heading, one muted line on what a yes brings, a quiet hint that Settings keeps it, then 先不要
/// (tonal) · 開啟通知 (solid) at the foot's end — stacked, 開啟通知 on top, when they don't fit.
struct NotificationAskDialog: View {
    let moment: NotificationAsks.Moment
    let onLater: () -> Void
    let onTurnOn: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(moment == .publish ? L10n.NotifyAsk.publishTitle : L10n.NotifyAsk.replyTitle).padding(.bottom, 8)
            ModalBody(moment == .publish ? L10n.NotifyAsk.publishBody : L10n.NotifyAsk.replyBody)
            CSSText(L10n.NotifyAsk.changeLater, font: AppFonts.scaledUIFont(.body, size: Tokens.hintSize), lineHeight: 1.55,
                    color: Tokens.UI.textMuted)
                .padding(.top, 14)
            ModalActions {
                OrganicButton(L10n.NotifyAsk.later, variant: .tonal, size: .sm, action: onLater)
            } verb: {
                OrganicButton(L10n.NotifyAsk.turnOn, variant: .solid, size: .sm, action: onTurnOn)
            }
            .padding(.top, 18)
        }
    }
}

/// How an invite sits, by the kind of device (round 24, the owner): on a phone a grey band of the list it heads
/// (``AsideBand``) — on the Mac's conversations too, filling its pane up to the header's line and across to the rule
/// between the panes; on a tablet (an iPad, one pane or two, either way up) a borderless card in the content's own
/// margins (「應該要做這種沒有 border 的卡片…因為它這時候左邊右邊的 padding 已經變多了」), never a band edge to edge.
nonisolated enum InviteLook: Equatable {
    case band
    case card
}

/// An invite to a push atop the conversations (§4 a connection's new cards), as ``InviteLook`` says. A band runs from
/// edge to edge of the list, its top the bar's pen line — its paper up under the bar's wave (`tuck`; a pull's gap is the
/// screen's to paint grey, ``AsideBand``) — with a rule along its foot (`reach` runs it on to the panes' rule on the Mac, ``PaneBand``);
/// its words keep the rows' column (`leading` / `trailing` from the list's edges, inside the readable column), `top`
/// over them. A card stands in the rows' column, its words 22 in (22 over the title, 20 under the buttons). Either way:
/// the title, 8, the line, 14, then 不用了 (tonal) · 好，通知我 (solid) at the row's end, stacked, the verb on top, when
/// they don't fit; the verb loops while the system and the server answer.
struct NotificationInviteCard: View {
    let invite: NotificationAsks.Invite
    let working: Bool
    var look: InviteLook = .band
    var leading: CGFloat = ListBands.contentInset
    var trailing: CGFloat = ListBands.contentInset
    var tuck: CGFloat = 0
    /// Above a band's words (on a phone 16, so they stand 20 under the bar's foot — the band starts 4 under it —
    /// level with the feed's invite).
    var top: CGFloat = 20
    /// How far a band's foot rule runs past its trailing edge (``AsideBand``).
    var reach: CGFloat = 0
    let onNo: () -> Void
    let onYes: () -> Void
    @Environment(\.paneBand) private var paneBand

    var body: some View {
        Group {
            switch look {
            case .band:
                words
                    .padding(.leading, leading)
                    .padding(.trailing, trailing)
                    .padding(.top, top)
                    .padding(.bottom, 20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .readableColumn()
                    .asideBand(tuck: tuck, reach: reach)
                    // Carried on across the detail pane's gutter (the Mac's two panes): where the band is, as it scrolls.
                    // Whether it is there at all is the list's to say (``PaneBand/listChanged(from:to:)``): off screen
                    // under a pushed page it keeps its place.
                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(MessagesTwoPane.space)) } action: { frame in
                        if reach > 0 { paneBand?.place(frame, reach: reach) }
                    }
            case .card:
                words
                    .padding(.horizontal, 22)
                    .padding(.top, 22)
                    .padding(.bottom, 20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .inviteCard()
            }
        }
        .accessibilityElement(children: .contain)
        .transition(.opacity)
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(invite == .picks ? L10n.NotifyAsk.picksTitle : L10n.NotifyAsk.connectionCardsTitle)
                .font(AppFonts.heading(18))
                .foregroundStyle(Tokens.text)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 8)
            // On the grey, band and card alike, the muted ink that clears 4.5:1 there.
            ModalBody(invite == .picks ? L10n.NotifyAsk.picksBody : L10n.NotifyAsk.connectionCardsBody, color: AsideBand.muted)
            ModalActions(busy: working) {
                OrganicButton(L10n.NotifyAsk.no, variant: .tonal, size: .sm, action: onNo)
            } verb: {
                OrganicButton(L10n.NotifyAsk.yes, variant: .solid, size: .sm, action: onYes)
            }
            .padding(.top, 14)
        }
    }
}

/// The invite as a page shows it: while it shows, with its buttons wired to the session's asks.
struct NotificationInvite: View {
    let invite: NotificationAsks.Invite
    var connected = false
    var look: InviteLook = .band
    var leading: CGFloat = ListBands.contentInset
    var trailing: CGFloat = ListBands.contentInset
    var tuck: CGFloat = 0
    var top: CGFloat = 20
    var reach: CGFloat = 0
    @Environment(SessionStore.self) private var session

    var body: some View {
        let asks = session.notifyAsks
        if asks.shows(invite, connected: connected) {
            NotificationInviteCard(invite: invite, working: asks.working == invite, look: look, leading: leading, trailing: trailing,
                                   tuck: tuck, top: top, reach: reach,
                                   onNo: { withAnimation(.easeOut(duration: 0.2)) { asks.decline(invite) } },
                                   onYes: { Task { await asks.accept(invite) } })
        }
    }
}

/// Tonight's card's invite on the home feed (§3, the owner's 2026-11-01 call: no card within a card), as ``Look`` says:
/// - `.band` — a phone's banded feed: a band of its own in the thread's grey (``AsideBand``, round 24), between the
///   header's pen line above (its paper running up under the bar's wave; the feed paints a pull's gap grey) — or its
///   own rule under the refresh note — and the first card's top wave below, its words where a card's are
///   (``bandInset``): the title, 8, the line, 14, then 不用了 · 好，通知我 at the row's end (stacked when they don't fit);
/// - `.column` — a tablet's banded feed (an iPad upright, a medium window): a borderless card whose edges are the
///   bands' content edges (where their covers' are; the host lays it in that column, 24 under the bar's foot and 24
///   over the first card's top rule), 26 over its title (round 24, the owner: 「文字上面的 padding 應該多一點」);
/// - `.grid` — over a tablet's grid: one wide card spanning every column, outlined as the grid's cards are (their
///   outline, inset and padding), borderless.
/// A card is the thread's grey in its organic outline with the grid cards' grain, no pen line (``inviteCard()``): the
/// words on the left, the two buttons on the right of the same row, centred against them — under the words, at the
/// end, when there's no room.
struct PicksInvite: View {
    enum Look { case band, column, grid }
    let look: Look
    /// A phone's band right under the bar (no refresh note above it): its top is the bar's pen line.
    var underBar = true
    @Environment(SessionStore.self) private var session
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var width: CGFloat = 0

    /// A banded card's words from the screen's edge: the page's 20 and the card's own 18.
    static let bandInset: CGFloat = 38
    /// The narrowest a card keeps its buttons beside its words.
    static let rowWidth: CGFloat = 640

    var body: some View {
        let asks = session.notifyAsks
        if asks.shows(.picks) {
            let working = asks.working == .picks
            let no: () -> Void = { withAnimation(.easeOut(duration: 0.2)) { asks.decline(.picks) } }
            let yes: () -> Void = { Task { await asks.accept(.picks) } }
            Group {
                if look == .band { band(working: working, no: no, yes: yes) } else { card(working: working, no: no, yes: yes) }
            }
            .accessibilityElement(children: .contain)
            .transition(.opacity)
        }
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L10n.NotifyAsk.picksTitle)
                .font(AppFonts.heading(18))
                .foregroundStyle(Tokens.text)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 8)
            // On the grey, band and card alike, the muted ink that clears 4.5:1 there.
            ModalBody(L10n.NotifyAsk.picksBody, color: AsideBand.muted)
        }
    }

    private func actions(working: Bool, no: @escaping () -> Void, yes: @escaping () -> Void) -> some View {
        ModalActions(busy: working) {
            OrganicButton(L10n.NotifyAsk.no, variant: .tonal, size: .sm, action: no)
        } verb: {
            OrganicButton(L10n.NotifyAsk.yes, variant: .solid, size: .sm, action: yes)
        }
    }

    private func band(working: Bool, no: @escaping () -> Void, yes: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            words
            actions(working: working, no: no, yes: yes).padding(.top, 14)
        }
        .padding(.horizontal, Self.bandInset)
        .padding(.top, 20)
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        // The first card's own top wave is its foot.
        .asideBand(tuck: underBar ? HeaderEdge.height : nil, bottomRule: false)
    }

    private func card(working: Bool, no: @escaping () -> Void, yes: @escaping () -> Void) -> some View {
        let beside = width >= Self.rowWidth && !typeSize.isAccessibilitySize
        return Group {
            if beside {
                HStack(alignment: .center, spacing: 24) {
                    words.frame(maxWidth: .infinity, alignment: .leading)
                    actions(working: working, no: no, yes: yes).fixedSize()
                }
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    words
                    actions(working: working, no: no, yes: yes).padding(.top, 14)
                }
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, look == .column ? 26 : 22)
        .padding(.bottom, 22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .inviteCard()
    }
}

extension View {
    /// An invite as a tablet's card (round 24, the owner: 「沒有 border 的卡片」): the thread's grey (``AsideBand/paper``,
    /// the phone's band's) in a story card's outline — its long edges turning per point, as a stretched card's must —
    /// with the grid cards' grain, and no pen line at all.
    func inviteCard() -> some View {
        background {
            let shape = CardOutlineShape(seed: 17, alongLength: true)
            ZStack {
                shape.fill(AsideBand.paper)
                GrainLayer(shape: shape, mode: .tile, opacity: 0.2, tile: "grain-card")
            }
            .accessibilityHidden(true)
        }
    }
}
