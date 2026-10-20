import DesignSystem
import ResonanceKit
import SwiftUI

/// The trash's moves from the app — what 刪除 says once a card is in, bringing a card back, deleting
/// it for good — each through the server (POST …/trash, …/restore, DELETE …?onlyIfTrashed=true),
/// then the screens that showed the card where it was are told (`WriteLauncher.noteChange`: the card
/// box's shelves, the trash among them, the card's page, the page of a resonance's original). What
/// is said about it — the toast, the banner, the notice — outlives whatever asked: it belongs to the
/// session (the toast host, the shell's notice). The web's lib/data/trash.
@MainActor enum TrashMoves {
    /// What the moves ask of the server and where they say how it went: the session's, or a test's.
    struct Host {
        var restoreCard: (String) async throws -> RestoredCard
        /// Deletes for good, only while the card is still in the trash (`onlyIfTrashed`).
        var deleteCard: (String) async throws -> Void
        var toasts: ToastCenter
        /// A card's preview the lists remembered, gone with the move.
        var forget: (String) -> Void
        /// A restored resonance came back on its own: the shell's notice says so.
        var restoredAlone: () -> Void

        init(restoreCard: @escaping (String) async throws -> RestoredCard, deleteCard: @escaping (String) async throws -> Void,
             toasts: ToastCenter, forget: @escaping (String) -> Void = { _ in }, restoredAlone: @escaping () -> Void = {}) {
            self.restoreCard = restoreCard
            self.deleteCard = deleteCard
            self.toasts = toasts
            self.forget = forget
            self.restoredAlone = restoredAlone
        }

        init(session: SessionStore) {
            let writing = session.writing
            self.init(restoreCard: { try await writing.restoreCard($0) },
                      deleteCard: { try await writing.deleteCard($0, onlyIfTrashed: true) },
                      toasts: session.toasts, forget: { [weak session] in session?.cardPreviews.forget($0) },
                      restoredAlone: { [weak session] in session?.restoredAloneNotice = true })
        }
    }

    /// 「已移到垃圾桶 · 復原」: the toast after 刪除, whose 復原 brings the card back — even once the
    /// ⋯ that trashed it has left with its card.
    static func announceTrashed(cardId: String, title: String, answering: String?, session: SessionStore, writer: WriteLauncher) {
        let named = !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        session.toasts.show(L10n.Me.Actions.trashed,
                            announcement: named ? L10n.Me.Actions.movedToTrash(title: title) : L10n.Me.Actions.trashed,
                            action: ToastCenter.Action(label: L10n.Me.Actions.undo,
                                                       accessibilityLabel: named ? L10n.Me.Actions.undoTrashLabel(title: title)
                                                           : L10n.Me.Actions.undoTrash,
                                                       icon: .restore) {
                Task { await restore(cardId, answering: answering, session: session, writer: writer) }
            })
    }

    /// Brings the card back as it was: 「已還原」, or — a resonance that came back on its own — the
    /// shell's notice; a failure says so (the trash is the way to try again). True when it came back.
    @discardableResult
    static func restore(_ cardId: String, answering: String?, session: SessionStore, writer: WriteLauncher) async -> Bool {
        await restore(cardId, answering: answering, host: Host(session: session), writer: writer)
    }

    @discardableResult
    static func restore(_ cardId: String, answering: String?, host: Host, writer: WriteLauncher) async -> Bool {
        do {
            let restored = try await host.restoreCard(cardId)
            host.forget(cardId)
            // Coming back as a resonance, it shows the link again where the original shows it.
            writer.noteChange(.init(cardId: cardId, referenceCardId: restored.card.referenceCardId ?? answering))
            if restored.droppedResonance {
                host.restoredAlone()
            } else {
                host.toasts.show(L10n.Me.Actions.restored)
            }
            return true
        } catch {
            // What showed the card reads again all the same: one gone meanwhile (emptied on another device,
            // purged) leaves the shelf and its page, rather than failing the same way at every try.
            writer.noteChange(.init(cardId: cardId, referenceCardId: answering))
            host.toasts.show(L10n.Me.Actions.undoFailed)
            return false
        }
    }

    /// What deleting for good came to.
    enum Forever: Equatable {
        /// Gone: 「已永久刪除」.
        case deleted
        /// Restored meanwhile (another device): it stays, and the lists read again to show where.
        case notInTrash
    }

    /// Deletes the card for good — only while it is still in the trash (`onlyIfTrashed`). A card already
    /// gone (404: emptied on another device, purged after its 30 days) is deleted as far as the trash
    /// goes. Any other failure throws, for the question to say so and stay.
    static func deleteForever(_ cardId: String, session: SessionStore, writer: WriteLauncher) async throws -> Forever {
        try await deleteForever(cardId, host: Host(session: session), writer: writer)
    }

    static func deleteForever(_ cardId: String, host: Host, writer: WriteLauncher) async throws -> Forever {
        do {
            try await host.deleteCard(cardId)
        } catch let failure as APIFailure where failure.status == 409 || failure.isConflict {
            writer.noteChange(.init(cardId: cardId))
            host.toasts.show(L10n.Me.Actions.notInTrash)
            return .notInTrash
        } catch let failure as APIFailure where failure.status == 404 || failure.isNotFound {
            // Gone already: what showed it reads again, and it is what was asked for.
        }
        host.forget(cardId)
        writer.noteChange(.init(cardId: cardId))
        host.toasts.show(L10n.Me.Actions.deletedForever)
        return .deleted
    }
}

/// What a card in the trash says under it (the web's TrashShelf caption): where it came from — a
/// draft, a private card, or what restoring makes it (還原後公開: a restore never re-publishes in
/// silence) — and when it goes (「{n} 天後永久刪除」, 「一天內永久刪除」).
enum TrashCaption {
    static func from(_ card: FeedCard) -> String {
        guard card.publishedAt != nil else { return L10n.Me.TrashFrom.draft }
        switch card.restoresTo {
        case ._public?: return L10n.Me.TrashFrom.public
        case .connections?: return L10n.Me.TrashFrom.connections
        case ._private?, nil: return L10n.Me.TrashFrom.private
        }
    }

    /// When the card goes, from its purge date (nil when it says none).
    static func days(purgeAt: Date?, now: Date = .now) -> String? {
        guard let purgeAt else { return nil }
        let left = CardTrash.daysLeft(purgeAt: purgeAt, now: now)
        return left.lastDay ? L10n.Me.trashLastDay : L10n.Me.trashDaysLeft(count: left.days)
    }

    /// Whether an anonymous published card is in the trash (the notes left on it went with it):
    /// the shelf says so over the cards.
    static func holdsAnonymous(_ cards: [FeedCard]) -> Bool {
        cards.contains { $0.anonymous && $0.publishedAt != nil }
    }

    static func text(_ card: FeedCard, now: Date = .now) -> String {
        let from = from(card)
        return days(purgeAt: card.purgeDate, now: now).map { "\(from) · \($0)" } ?? from
    }
}

/// The ⋯ on a card in the trash (TrashActionsMenu.tsx): 還原 (it comes back as it was, saying
/// 「已還原」) and 永久刪除 (asked first, in red: it can't be undone). The delete keeps to the
/// trash (`onlyIfTrashed`): a card restored meanwhile, on another device, is not deleted — the
/// shelf is read again and says so.
struct TrashActionsMenu: View {
    let cardId: String
    var seed: Double = 7
    var hue: Double?
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @State private var busy = false
    @State private var confirming = false
    @State private var failed = false

    var body: some View {
        OrganicMenu(items: [
            OrganicMenuItem(id: "restore", title: L10n.Me.Actions.restore, icon: .restore) { Task { await restore() } },
            OrganicMenuItem(id: "deleteForever", title: L10n.Me.Actions.deleteForever, icon: .trash, danger: true) {
                failed = false
                confirming = true
            },
        ], label: L10n.Me.Actions.menuLabel, seed: seed, hue: hue)
        .opacity(busy && !confirming ? 0.6 : 1)
        .allowsHitTesting(!busy || confirming)
        // For good: the verb in red. A refusal is said in the dialog, which stays to try again.
        .organicConfirm(isPresented: $confirming, title: L10n.Me.Actions.deleteForeverConfirmTitle,
                        message: L10n.Me.Actions.deleteConfirmBody, cancelLabel: L10n.Me.Actions.deleteCancel,
                        confirmLabel: L10n.Me.Actions.deleteForever, closeLabel: L10n.Me.Actions.deleteCancel, busy: busy,
                        error: failed ? L10n.Safety.actionError : nil, destructive: true, seed: seed + 5) {
            Task { await deleteForever() }
        }
    }

    private func restore() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        await TrashMoves.restore(cardId, answering: nil, session: session, writer: writer)
    }

    private func deleteForever() async {
        guard !busy else { return }
        busy = true
        failed = false
        defer { busy = false }
        do {
            _ = try await TrashMoves.deleteForever(cardId, session: session, writer: writer)
            confirming = false
        } catch {
            failed = true
        }
    }
}
