import DesignSystem
import ResonanceKit
import SwiftUI

/// 「這張卡片在垃圾桶裡」 (the web's TrashedCardBanner) — what the owner sees as the first block of
/// their card's page while it is in the trash (from the shelf, a bell, a link, or the page's own
/// 刪除, which leaves them here): how long it has and that only they can see it, and that an
/// anonymous card's notes went with it; then 還原 (the card comes back here, as it was) and 永久刪除
/// (asked first, in red, then back to the tab's root). Everyone else gets the page's not-found.
struct TrashedCardBanner: View {
    let card: FeedCard
    /// It was moved to the trash on this very page a moment ago: VoiceOver comes to the banner's title.
    var focusTitle = false
    /// Deleted for good: the page goes.
    var onDeleted: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.window) private var window
    @AccessibilityFocusState private var titleFocused: Bool
    @State private var busy: Busy?
    @State private var confirming = false
    @State private var failed = false

    private enum Busy { case restore, delete }

    /// Whether the card's page shows the banner (and leaves out its share, its ⋯ and its lists): the
    /// owner's card in the trash.
    static func shows(_ detail: CardDetail) -> Bool {
        detail.isOwner && detail.card.isTrashed
    }

    /// The caption: when it goes, and that only the owner can see it.
    static func caption(_ card: FeedCard, now: Date = .now) -> String {
        TrashCaption.days(purgeAt: card.purgeDate, now: now).map { "\($0) · \(L10n.Card.Trashed.onlyYou)" } ?? L10n.Card.Trashed.onlyYou
    }

    var body: some View {
        let compact = window.layoutClass == .compact
        let text = VStack(alignment: .leading, spacing: 2) {
            Text(L10n.Card.Trashed.title)
                .font(AppFonts.body(15, weight: .semibold))
                .foregroundStyle(Tokens.text)
                .accessibilityFocused($titleFocused)
            Text(Self.caption(card)).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            if card.anonymous && card.publishedAt != nil {
                Text(L10n.Card.Trashed.notesGone).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        Group {
            if compact {
                // A phone: the two buttons wrap under the words, in one row at their start.
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .center, spacing: 14) {
                        glyph
                        text.frame(maxWidth: .infinity, alignment: .leading)
                    }
                    actions.padding(.leading, 34)
                }
            } else {
                HStack(alignment: .center, spacing: 14) {
                    glyph
                    text.frame(maxWidth: .infinity, alignment: .leading)
                    actions
                }
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 18)
        .background {
            // Panel soft: the paper-dark at half strength, on uneven corners.
            UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 22, bottomTrailingRadius: 18, topTrailingRadius: 24)
                .fill(Tokens.creamDark.opacity(0.5))
        }
        .accessibilityElement(children: .contain)
        .onAppear { if focusTitle { titleFocused = true } }
        .organicConfirm(isPresented: $confirming, title: L10n.Me.Actions.deleteForeverConfirmTitle,
                        message: L10n.Me.Actions.deleteConfirmBody, cancelLabel: L10n.Me.Actions.deleteCancel,
                        confirmLabel: L10n.Me.Actions.deleteForever, closeLabel: L10n.Me.Actions.deleteCancel,
                        busy: busy == .delete, error: failed ? L10n.Safety.actionError : nil, destructive: true, seed: 71) {
            Task { await deleteForever() }
        }
    }

    private var glyph: some View {
        OrganicIcon(.trash, size: 20, color: Tokens.textMuted).accessibilityHidden(true)
    }

    private var actions: some View {
        HStack(spacing: 10) {
            OrganicButton(L10n.Me.Actions.restore, variant: .solid, size: .sm) { Task { await restore() } }
                .loading(busy == .restore)
                .fixedSize()
            OrganicButton(L10n.Me.Actions.deleteForever, variant: .dangerTonal, size: .sm) {
                failed = false
                confirming = true
            }
            .fixedSize()
            .disabled(busy != nil)
        }
        .allowsHitTesting(busy == nil)
    }

    private func restore() async {
        guard busy == nil else { return }
        busy = .restore
        defer { busy = nil }
        // The page reads the card again (the change concerns it): the banner goes with the trash.
        await TrashMoves.restore(card.id, answering: nil, session: session, writer: writer)
    }

    private func deleteForever() async {
        guard busy == nil else { return }
        busy = .delete
        failed = false
        defer { busy = nil }
        do {
            let result = try await TrashMoves.deleteForever(card.id, session: session, writer: writer)
            confirming = false
            if result == .deleted { onDeleted() }
        } catch {
            failed = true
        }
    }
}

/// 刪除 from the card's own ⋯ leaves the reader on its page (trash.spec §5.4), whose banner then stands at
/// its head — far above the line they were reading, maybe. Once the banner shows, the page goes up to
/// it, as the web's focus on its title and Android's focusable title bring it into view: once for each
/// move to the trash made on the page (not again for a later read of the same card, nor for a card
/// that was in the trash when the page opened).
struct TrashedHere: Equatable {
    /// Moves to the trash made from this page's ⋯, and how many of them the page has gone up for.
    private var moved = 0
    private var shown = 0

    /// The card went to the trash from this page.
    mutating func trashed() { moved += 1 }

    /// VoiceOver's focus goes to the banner's title.
    var focusTitle: Bool { moved > 0 }

    /// Whether the page goes up to the banner now: it shows (`banner`), after a move not gone up for yet.
    mutating func bringIntoView(banner: Bool) -> Bool {
        guard banner, shown < moved else { return false }
        shown = moved
        return true
    }
}
