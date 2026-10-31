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

/// An invite to a push (§3 tonight's card above the home feed, §4 a connection's new cards atop the
/// conversations): a sheet of the dialog's paper in the dialog's pen line (no shadow) — an aside, never
/// read as a feed card — with the dialog's title and line, and 不用了 (tonal) · 好，通知我 (solid) at its
/// end, as a dialog's foot sits — stacked, the verb on top, when they don't fit; the verb loops while
/// the system and the server answer. At most ``maxWidth`` wide, centred.
struct NotificationInviteCard: View {
    let invite: NotificationAsks.Invite
    let working: Bool
    let onNo: () -> Void
    let onYes: () -> Void

    /// A readable column on a tablet.
    static let maxWidth: CGFloat = 600

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(invite == .picks ? L10n.NotifyAsk.picksTitle : L10n.NotifyAsk.connectionCardsTitle)
                .padding(.bottom, 8)
            ModalBody(invite == .picks ? L10n.NotifyAsk.picksBody : L10n.NotifyAsk.connectionCardsBody)
            ModalActions(busy: working) {
                OrganicButton(L10n.NotifyAsk.no, variant: .tonal, size: .sm, action: onNo)
            } verb: {
                OrganicButton(L10n.NotifyAsk.yes, variant: .solid, size: .sm, action: onYes)
            }
            .padding(.top, 18)
        }
        .padding(.horizontal, 24)
        .padding(.top, 22)
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .organicSurface(fill: Tokens.cardBg, stroke: Tokens.modalBorder, radius: 22, seed: 17)
        .frame(maxWidth: Self.maxWidth)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .transition(.opacity)
    }
}

/// The invite as a page shows it: while it shows, with its buttons wired to the session's asks.
struct NotificationInvite: View {
    let invite: NotificationAsks.Invite
    var connected = false
    @Environment(SessionStore.self) private var session

    var body: some View {
        let asks = session.notifyAsks
        if asks.shows(invite, connected: connected) {
            NotificationInviteCard(invite: invite, working: asks.working == invite,
                                   onNo: { withAnimation(.easeOut(duration: 0.2)) { asks.decline(invite) } },
                                   onYes: { Task { await asks.accept(invite) } })
        }
    }
}

/// Tonight's card's invite on the home feed (§3, the owner's 2026-11-01 call: no card within a card).
/// On a phone's banded feed it is a band of its own on the page's paper, between the header's pen line
/// above and the first card's top wave below, its words where a card's are (``bandInset``): the title,
/// 8, the line, 14, then 不用了 · 好，通知我 at the row's end (stacked when they don't fit). Over a
/// tablet's grid it is one wide card spanning every column, outlined as the grid's cards are (their
/// outline, inset and padding) in the dialog's paper and pen: the words on the left, the two buttons on
/// the right of the same row, centred against them — under the words, at the end, when there's no room.
struct PicksInvite: View {
    /// Over the bordered grid (a tablet), not the bands.
    let wide: Bool
    @Environment(SessionStore.self) private var session
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var width: CGFloat = 0

    /// A banded card's words from the screen's edge: the page's 20 and the card's own 18.
    static let bandInset: CGFloat = 38
    /// The narrowest a wide card keeps its buttons beside its words.
    static let rowWidth: CGFloat = 640

    var body: some View {
        let asks = session.notifyAsks
        if asks.shows(.picks) {
            let working = asks.working == .picks
            let no: () -> Void = { withAnimation(.easeOut(duration: 0.2)) { asks.decline(.picks) } }
            let yes: () -> Void = { Task { await asks.accept(.picks) } }
            Group {
                if wide { card(working: working, no: no, yes: yes) } else { band(working: working, no: no, yes: yes) }
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
            ModalBody(L10n.NotifyAsk.picksBody)
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
    }

    private func card(working: Bool, no: @escaping () -> Void, yes: @escaping () -> Void) -> some View {
        // Its long edges turn as a story card's do per point (the owner: a stretched card's edge mustn't go straight).
        let shape = CardOutlineShape(seed: 17, alongLength: true)
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
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .background {
            ZStack {
                shape.fill(Tokens.cardBg)
                GrainLayer(shape: shape, mode: .tile, opacity: 0.2, tile: "grain-card")
                shape.stroke(Tokens.modalBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
            }
            .accessibilityHidden(true)
        }
    }
}
