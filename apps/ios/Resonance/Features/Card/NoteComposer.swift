import DesignSystem
import ResonanceKit
import SwiftUI

/// NoteComposer (the plain variant in its modal): a little note to the card's
/// author — the only reader it will ever have. Four lines to write in, the
/// privacy hint for the first few times, the count, and past 200 characters
/// an offer to make it a resonance card instead. 寄出 closes it at once with a
/// toast (round 21) and the note goes on behind it, under its card's attempt
/// (``NoteSends``); a failure says so in a toast whose 再寄一次 opens the composer
/// again on the words, kept. Words typed and not sent are kept on the device
/// (``NoteDrafts``) as they are typed and however the composer closes — a tap
/// beside it, 取消, the app going away — and it opens again from them on this
/// card; they go once the server has the note, or handed to a resonance.
struct NoteComposer: View {
    let cardId: String
    let onClose: () -> Void
    /// 紙條 → 共振: the text becomes the story of a resonance to this card.
    let onUpgrade: (String) -> Void
    /// Opens this card's page (the toast's 再寄一次, when the page is gone by then).
    var openCard: () -> Void = {}
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var text = ""
    @State private var error: String?
    @State private var showsHint = false
    /// The words the server refused (three notes already wait, a block): the same words sent again
    /// would only be refused again, so Send waits for an edit (and the refusal stays said until then).
    @State private var refused: String?
    /// Who is writing: the account signed in as the composer opened, whose draft it keeps.
    @State private var author: String?
    /// The words went on (sent, or into a resonance): nothing of them is kept any more.
    @State private var letGo = false
    /// The draft kept a moment after typing stops.
    @State private var keeping: Task<Void, Never>?
    @FocusState private var focused: Bool

    static let maxLength = 2000
    static let upgradeThreshold = 200
    /// How long after the last keystroke the words are kept (closing keeps them at once).
    static let keepDelay: Duration = .milliseconds(400)

    /// The web counts the trimmed text in UTF-16 units.
    private var count: Int { words.utf16.count }
    private var words: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var valid: Bool { count > 0 && count <= Self.maxLength && session.me != nil && words != refused }

    var body: some View {
        content
            .onAppear(perform: restoreDraft)
            // However the composer goes — 取消, a tap beside it, the card's page leaving — what is typed is kept.
            .onDisappear(perform: keepDraft)
            .onChange(of: scenePhase) { _, phase in if phase != .active { keepDraft() } }
    }

    private var content: some View { form }

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            FieldLabel(text: L10n.Card.Note.label).padding(.bottom, 10)
            TextField(text: $text, prompt: fieldPrompt(L10n.Card.Note.placeholder), axis: .vertical) { Text(L10n.Card.Note.label) }
                .lineLimit(4...8)
                .lineSpacing(15 * 0.6)
                .font(AppFonts.body(15))
                .foregroundStyle(Tokens.text)
                .focused($focused)
                // The name the interaction flows find it by (maestro/flows; Android's flowTag).
                .accessibilityIdentifier("note-field")
                .padding(.horizontal, Tokens.fieldPadX)
                .padding(.vertical, Tokens.fieldPadY)
                .frame(minHeight: 96, alignment: .top)
                .modifier(FieldSurface(seed: 17, focused: focused))
                .onChange(of: text) { _, new in
                    if new.utf16.count > Self.maxLength { text = String(new.utf16.prefix(Self.maxLength)) ?? new }
                    // Other words: another note, which the server may take — the refusal is no longer theirs.
                    if let refused, words != refused {
                        self.refused = nil
                        error = nil
                    }
                    // Kept a moment after typing stops (emptied, the draft goes).
                    keeping?.cancel()
                    keeping = Task {
                        try? await Task.sleep(for: Self.keepDelay)
                        if !Task.isCancelled { keepDraft() }
                    }
                }
            HStack(alignment: .top, spacing: 12) {
                if showsHint {
                    Text(L10n.Card.Note.hint).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted).lineSpacing(12 * 0.5)
                }
                Spacer(minLength: 0)
                Text(verbatim: "\(count) / \(Self.maxLength)")
                    .font(AppFonts.body(11)).monospacedDigit()
                    .foregroundStyle(count > Self.maxLength ? Tokens.terracotta : Tokens.textMuted)
            }
            .padding(.top, 6)
            if count > Self.upgradeThreshold {
                Button {
                    // The words become the resonance's story, which the writer keeps from here.
                    letDraftGo()
                    onUpgrade(text)
                } label: {
                    Text(L10n.Card.Note.upgrade).font(AppFonts.body(13)).foregroundStyle(Tokens.terracotta).underline()
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
                .padding(.bottom, 10)
            }
            if let error {
                // What every dialog says a failure in: 13pt in the danger ink (12pt terracotta read 3.5:1).
                ModalError(error).padding(.top, 4).padding(.bottom, 10)
            }
            // The foot every dialog shares: cancel the tonal pill, Send the solid verb, rightmost.
            ModalActions {
                OrganicButton(L10n.Card.Note.cancel, variant: .tonal, size: .sm, action: onClose)
            } verb: {
                // Closes as it is pressed (round 21): nothing to wait for here.
                OrganicButton(L10n.Card.Note.send, variant: .solid, size: .sm, action: send)
                    .disabled(!valid)
            }
            .padding(.top, 18)
        }
        .task { showsHint = await session.hints?.claim("note-privacy") ?? false }
    }

    /// 寄出: the composer closes at once with 「紙條已寄出」 and the note goes on behind it (round 21) — its words
    /// kept on the device until the server has them, under the card's attempt's client id (a retry, never a
    /// second note). A failure says so in a toast (三張已在等 for the letter's cap), whose 再寄一次 opens the
    /// composer again on the words. The notification permission is asked only once the note has gone.
    private func send() {
        guard valid else { return }
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // Taken now: the composer is closed before the server answers.
        let (drafts, uid, cardId, sends, toasts, messaging, openCard) =
            (session.noteDrafts, author, cardId, session.noteSends, session.toasts, session.messaging, openCard)
        let attempt = sends.attempt(cardId)
        sends.refused(cardId, words: nil)
        keepDraft()
        onClose()
        toasts.show(L10n.Card.Note.sent)
        Task {
            do {
                _ = try await attempt.send(cardId: cardId, text: words) { try await messaging.sendNote(cardId: cardId, text: words, clientId: $0) }
                // The server has it (201): its draft goes — unless other words were written there since.
                if let uid, drafts.text(uid: uid, cardId: cardId)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? words == words {
                    drafts.clear(uid: uid, cardId: cardId)
                }
                PushCenter.shared.reachedOut()
            } catch {
                let failure = NoteFailure(error)
                if failure.refused { sends.refused(cardId, words: words, message: failure.message) }
                let waits = (error as? APIFailure)?.status == 409
                toasts.show(waits ? L10n.Card.Note.waitForReply : L10n.Card.Note.failed,
                            action: ToastCenter.Action(label: L10n.Card.Note.reopen, accessibilityLabel: L10n.Card.Note.reopen) {
                    sends.reopen(cardId)
                    if !sends.isHosted(cardId) { openCard() }
                })
            }
        }
    }

    // MARK: The draft kept on the device

    /// Opening on this card: the words left unsent here, if any (for the account signed in now).
    private func restoreDraft() {
        guard author == nil, let uid = session.uid else { return }
        author = uid
        if text.isEmpty, let kept = session.noteDrafts.text(uid: uid, cardId: cardId) { text = kept }
        // Opened again on words the server refused: said again, and Send waits for an edit.
        if let refusal = session.noteSends.refusal(cardId), refusal.words == words {
            refused = refusal.words
            error = refusal.message
        }
    }

    /// The words as they are now, kept — or, emptied, let go — for the account that typed them, while
    /// it is still the one signed in (a sign-out has cleared the device of it). Nothing once they went on.
    private func keepDraft() {
        keeping?.cancel()
        guard !letGo, let author, session.uid == author else { return }
        session.noteDrafts.keep(text, uid: author, cardId: cardId)
    }

    /// The words went on (the note sent, or made a resonance's story): nothing of them is kept.
    private func letDraftGo() {
        keeping?.cancel()
        letGo = true
        if let author { session.noteDrafts.clear(uid: author, cardId: cardId) }
    }
}

/// A note that didn't go, as the composer says it: in the app's words, never the server's (which
/// are English, and for a block would say more than the web's composer does) — three notes left
/// unanswered wait for the author's reply, a card gone (deleted, or hidden from the writer since,
/// its notes with it) can't be found, anything else is the send error (as the web's NoteComposer
/// says them). `refused`: the server answered no to these words (three notes waiting, a block, no
/// pen name, the card gone), which sending them again would only hear again; the rest (offline,
/// the server's trouble) is a retry.
struct NoteFailure: Equatable {
    let message: String
    let refused: Bool

    init(_ error: Error) {
        let failure = error as? APIFailure
        switch failure?.status {
        case 409: message = L10n.Card.Note.waitForReply
        case 404: message = L10n.Card.NotFound.title
        default: message = L10n.Messages.sendError
        }
        refused = [403, 404, 409].contains(failure?.status ?? 0)
    }
}
