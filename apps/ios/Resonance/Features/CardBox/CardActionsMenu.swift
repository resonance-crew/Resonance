import DesignSystem
import ResonanceKit
import SwiftUI

/// What 刪除 on a card's ⋯ does first (trash.spec §0): most cards go to the trash at once, with the
/// toast's 復原 (or the card page's banner) as the way back. One asks first, in the plain colour of
/// 取消共振: a published resonance, public and under the writer's name, whose original is named —
/// the trash takes it back at once, and with it a connection only it held, which a restore never
/// brings back. An original whose byline isn't known yet is looked up before anything happens.
nonisolated enum TrashDecision: Equatable {
    /// To the trash now.
    case now
    /// The plain question (刪除這張共振卡？) first.
    case ask
    /// The original's byline first (then ``afterLookUp(originalAnonymous:)``).
    case lookUp

    static func of(published: Bool, visibility: String, anonymous: Bool, answering: String?,
                   answeringAnonymous: Bool?) -> TrashDecision {
        // Only a resonance that reached its original's author (published, public, named) takes anything back for good.
        guard answering != nil, published, visibility == "public", !anonymous else { return .now }
        switch answeringAnonymous {
        case true?: return .now
        case false?: return .ask
        case nil: return .lookUp
        }
    }

    /// Once the original is looked up: an anonymous one (whose author it never connected the writer
    /// with) goes at once; a named one — or one that can't be read: a connection can outlive the
    /// original going private — asks first.
    static func afterLookUp(originalAnonymous: Bool?) -> TrashDecision {
        originalAnonymous == true ? .now : .ask
    }
}

/// How the trash says a card went in: the toast with its 復原 (the card box, where the card leaves
/// its shelf), or the page itself (the card's own page, which stays and shows its trash banner).
enum TrashFeedback: Equatable {
    case toast, page
}

/// The owner's ⋯ on a card (CardActionsMenu.tsx): 編輯 (公開發表 on a 私人卡's own page, whose pen is
/// 編輯, round 12 §3) / 轉為草稿 (a card readers can see, round 8 §1.2) / 取消共振 (a card that resonates
/// with another) / 刪除, in the shared
/// OrganicMenu. 刪除 moves the card to the trash, where it waits 30 days:
/// no dialog except the one ``TrashDecision`` asks — the toast's 復原 and the
/// trash shelf are the way back. Taking a resonance back asks first, in the
/// web's own small dialog. Visibility, the trash and the resonance go through
/// the server (PATCH /api/v1/cards/{id}, POST …/trash, DELETE …/resonances/{id}),
/// which also refreshes the site's cached pages — never straight to Firestore, whose
/// rules refuse both on a published card. A change that didn't go through says
/// so, and the card stays where it was.
///
/// On a resonance each of them can end the connection with the original's
/// author: the change names the card it answered (its page reads again), and
/// the connection's screens hear of it from the live connections list.
struct CardActionsMenu: View {
    let cardId: String
    let visibility: String
    var seed: Double = 7
    var hue: Double?
    /// The card this one resonates with, if any — and its title, when the page has it (else it is
    /// asked for when the question is).
    var answering: String?
    var answeringTitle: String?
    /// Whether the original it answers is anonymous, when the page knows (else looked up when 刪除 needs it).
    var answeringAnonymous: Bool?
    /// Published (a draft takes nothing back), and under the writer's name or not.
    var isPublished = false
    var anonymous = false
    /// What the undo toast names.
    var title = ""
    var trashFeedback: TrashFeedback = .toast
    /// Whether the card opens once edited (false on the card's own page, which is already underneath).
    var showsCardAfterEdit = true
    /// The page beside it shows its own 編輯 (a 私人卡's card page, its pen): the ⋯ then leads with 公開發表
    /// instead — the writer's publish step with 公開 chosen (round 12 §3) — so the page never says 編輯 twice.
    var editShown = false
    var onChanged: () -> Void = {}
    /// The card went to the trash (its lists are told already).
    var onTrashed: () -> Void = {}
    /// The card box (`.toast`): the card leaves its shelf at once (`true`), before the server answers, and
    /// comes back should it refuse (`false`) — said then in a toast, which outlives the card's ⋯.
    var onLeaving: (Bool) -> Void = { _ in }
    /// A chip over a card's cover (the card box), bare in the card page's bar.
    var trigger: MenuTrigger = .chip
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    /// The resonance's question before it goes to the trash.
    @State private var confirming = false
    @State private var unresonating = false
    @State private var busy = false
    @State private var failed = false
    /// The visibility change didn't go through: a small notice says so.
    @State private var visibilityFailed = false
    /// Moving it to the trash didn't go through (asked without a question): a notice says so.
    @State private var trashFailed = false
    /// The answered card's title, asked for when the page didn't have it.
    @State private var asked = AnsweredTitle()

    /// Readers can see it (published, and public or for connections): the only card with a visibility
    /// row — every 草稿 (never published, or kept private) is published from the writer's step.
    private var readersSee: Bool { Self.readersSee(published: isPublished, visibility: visibility) }

    nonisolated static func readersSee(published: Bool, visibility: String) -> Bool {
        published && visibility != "private"
    }

    var body: some View {
        OrganicMenu(items: items, label: L10n.Me.Actions.menuLabel, seed: seed, hue: hue, trigger: trigger)
            .opacity(busy && !confirming && !unresonating ? 0.6 : 1)
            .allowsHitTesting(!busy || confirming || unresonating)
            // To the trash, where it can be restored: the plain solid fill, as 取消共振's — only the
            // connection it takes back doesn't come back, which is what the question is for.
            .organicConfirm(isPresented: $confirming, title: L10n.Me.Actions.trashResonanceTitle,
                            message: L10n.Me.Actions.trashResonanceBody(days: CardTrash.days),
                            cancelLabel: L10n.Me.Actions.deleteCancel, confirmLabel: L10n.Me.Actions.trashResonanceConfirm,
                            closeLabel: L10n.Me.Actions.deleteCancel, busy: busy,
                            error: failed ? L10n.Safety.actionError : nil, seed: seed + 5) {
                Task { await trashNow() }
            }
            // The card stays: nothing here can't be undone, so the verb is the plain solid fill.
            .organicConfirm(isPresented: $unresonating, title: unresonateTitle, message: L10n.Me.Actions.unresonateConfirmBody,
                            cancelLabel: L10n.Me.Actions.deleteCancel, confirmLabel: L10n.Me.Actions.unresonateConfirm,
                            closeLabel: L10n.Me.Actions.deleteCancel, busy: busy, error: failed ? L10n.Safety.actionError : nil,
                            titlePending: asked.looking, seed: seed + 9) {
                Task { await unresonate() }
            }
            // Moving it to the drafts didn't go through: the card is as it was. Said in a notice with one way
            // out, as every refusal is (the web's, Android's): the menu is still there to try again from.
            .organicNotice(isPresented: $visibilityFailed, title: L10n.Me.Actions.makePrivate, message: L10n.Safety.actionError,
                           closeLabel: L10n.Safety.Report.close, seed: seed + 11)
            .organicNotice(isPresented: $trashFailed, title: L10n.Me.Actions.delete, message: L10n.Safety.actionError,
                           closeLabel: L10n.Safety.Report.close, seed: seed + 13)
            .task(id: unresonating) {
                guard unresonating, asked.looking, let answering else { return }
                await AnsweredTitle.lookUp {
                    try await session.reading.cards(keys: [answering]).first { $0.id == answering }?.title
                } then: { asked.found($0) }
            }
    }

    /// 「不再與〈title〉共振？」 — or the plain words when the title can't be read.
    private var unresonateTitle: String { asked.heading }

    /// The ⋯'s rows, in order.
    nonisolated enum Row: Equatable {
        case edit, publish, visibility, unresonate, delete
    }

    /// 編輯, 轉為草稿 — only on a card readers can see (round 8 §1.2): a 草稿's type is chosen in the
    /// writer's publish step (公開 · 匿名公開 · 草稿), so every 草稿's ⋯ is the same — 取消共振 on a
    /// resonance, 刪除. On a 私人卡's own page, where its pen beside the ⋯ is 編輯 (`editShown`), the first row
    /// is 公開發表 instead (round 12 §3), the way to that step; the card box's ⋯ has no pen beside it.
    nonisolated static func rows(readersSee: Bool, answering: Bool, editShown: Bool = false) -> [Row] {
        [editShown && !readersSee ? .publish : .edit] + (readersSee ? [.visibility] : []) + (answering ? [.unresonate] : []) + [.delete]
    }

    private var items: [OrganicMenuItem] {
        Self.rows(readersSee: readersSee, answering: answering != nil, editShown: editShown).map { row in
            switch row {
            case .edit:
                OrganicMenuItem(id: "edit", title: L10n.Me.Actions.edit, icon: .pen) { writer.edit(cardId, showsCard: showsCardAfterEdit) }
            case .publish:
                OrganicMenuItem(id: "publish", title: L10n.Me.Actions.publishPublicly, icon: .globe) { writer.publishPublicly(cardId) }
            case .visibility:
                OrganicMenuItem(id: "visibility", title: L10n.Me.Actions.makePrivate, icon: .lock) { Task { await makeDraft() } }
            case .unresonate:
                OrganicMenuItem(id: "unresonate", title: L10n.Me.Actions.unresonate, icon: .wave) {
                    failed = false
                    // The title before the question shows, when the page or the session has it; else it is asked for,
                    // the heading held back meanwhile — never words that change under the reader.
                    asked.open(page: answeringTitle, kept: answering.flatMap { session.cardPreviews.card(for: $0)?.title })
                    unresonating = true
                }
            case .delete:
                OrganicMenuItem(id: "delete", title: L10n.Me.Actions.delete, icon: .trash, danger: true) {
                    Task { await delete() }
                }
            }
        }
    }

    /// What changed: this card, and on a resonance the card it answers (its page lists it).
    private var change: WriteLauncher.Change { .init(cardId: cardId, referenceCardId: answering) }

    /// 轉為草稿: the card kept to its author (PATCH visibility private, as 轉為私人 was); its byline stays.
    private func makeDraft() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        guard let card = try? await session.writing.updateCard(cardId, visibility: ._private) else {
            visibilityFailed = true
            return
        }
        visibilityFailed = false
        session.cardPreviews.remember(card)
        writer.noteChange(change)
        onChanged()
    }

    /// The card stays, answering nothing; the server lets go of its link to the card it answered.
    private func unresonate() async {
        guard let answering, !busy else { return }
        busy = true
        failed = false
        defer { busy = false }
        do {
            try await session.writing.unresonate(from: answering, cardId: cardId)
        } catch {
            failed = true
            return
        }
        unresonating = false
        // This card's page, the page of the card it answered, and the card box's shelves read again.
        writer.noteChange(change)
        onChanged()
    }

    /// 刪除: to the trash — asking first only for a resonance that reached a named original.
    private func delete() async {
        guard !busy else { return }
        failed = false
        var decision = TrashDecision.of(published: isPublished, visibility: visibility, anonymous: anonymous,
                                        answering: answering, answeringAnonymous: answeringAnonymous)
        if decision == .lookUp, let answering {
            busy = true
            let original = try? await session.reading.cards(keys: [answering]).first { $0.id == answering }
            busy = false
            decision = TrashDecision.afterLookUp(originalAnonymous: original?.anonymous)
        }
        switch decision {
        case .now, .lookUp: await trashNow()
        case .ask: confirming = true
        }
    }

    private func trashNow() async {
        guard !busy else { return }
        busy = true
        failed = false
        defer { busy = false }
        // In the card box the card leaves its shelf at once, and this ⋯ (its question too) with it: what the
        // rest needs is taken before it goes.
        let leaves = trashFeedback == .toast
        let (cardId, change, title, answering, session, writer, onLeaving, onTrashed) =
            (cardId, change, title, answering, session, writer, onLeaving, onTrashed)
        if leaves {
            confirming = false
            onLeaving(true)
        }
        do {
            try await session.writing.trashCard(cardId)
        } catch {
            // Not moved: the card is back in every list, and the writer is told — in the toast where it had left
            // its shelf, else in the question, if one was asked.
            if leaves {
                onLeaving(false)
                session.toasts.show(L10n.Me.Actions.trashFailed)
            } else if confirming { failed = true } else { trashFailed = true }
            return
        }
        confirming = false
        session.cardPreviews.forget(cardId)
        writer.noteChange(change)
        onTrashed()
        if leaves {
            TrashMoves.announceTrashed(cardId: cardId, title: title, answering: answering, session: session, writer: writer)
        }
    }
}

/// The title of the card a resonance answers, for the question that takes the resonance back
/// (「不再與〈title〉共振？」), as far as it is known — known before the question shows when the page
/// or the session has it, else looked for while its heading is held back (`looking`), as the web
/// and Android hold it. A title that can't be read leaves the plain 「取消共振」.
struct AnsweredTitle: Equatable {
    private(set) var title: String?
    /// Being looked for: the question's heading keeps its line, unwritten.
    private(set) var looking = false

    /// The question opens: the page's title, else one already known or kept; none, it is looked for.
    mutating func open(page: String?, kept: String?) {
        title = page ?? title ?? kept
        looking = title == nil
    }

    /// The lookup's answer (nil: it found nothing, or failed).
    mutating func found(_ found: String?) {
        if title == nil { title = found }
        looking = false
    }

    var heading: String {
        title.map { L10n.Me.Actions.unresonateConfirmTitle(title: $0) } ?? L10n.Me.Actions.unresonate
    }

    /// Reads the answered card's title (`read`) and hands it over (`found`) — unless the question was
    /// closed meanwhile: the lookup left behind (its read refused as cancelled, which `try?` makes a
    /// "none") must not settle the question opened again since, whose heading would then show the
    /// plain words and change to the title under the reader.
    static func lookUp(_ read: () async throws -> String?, then found: (String?) -> Void) async {
        let title = try? await read()
        guard !Task.isCancelled else { return }
        found(title)
    }
}
