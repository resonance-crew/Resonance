import DesignSystem
import ResonanceKit
import SwiftUI

/// The note to a card's author, written in place under the story (round 26, SETTLED "the note, in place" — the
/// owner: 「這個寄小紙條的界面應該不要做成 pop ups，因為它會擋住這個畫面上其他東西，這樣使用者會沒辦法，他的思緒會跳掉」). The
/// story's end has one note field at most, and only 寄小紙條 opens it: never a dialog, nothing over the story. Its
/// rules, pure so they are pinned (`NoteInPlaceTests`); the field itself is ``NoteField``.
nonisolated enum NoteInPlace {
    static let maxLength = 2000
    /// Past this many characters the line offers to make the words a card instead.
    static let upgradeThreshold = 200
    /// From this many characters the count shows at the line's end.
    static let countFrom = 1800
    /// How long after the last keystroke the words are kept (leaving keeps them at once).
    static let keepDelay: Duration = .milliseconds(400)
    /// The field's block: 12 under the faces' row, 40 to what follows (the page's own 40 under the story's end).
    static let gapAbove: CGFloat = 12
    static let gapBelow: CGFloat = 40
    /// Once the keyboard has risen under the field, its block rests this far over it: the scroll's reach, never the
    /// layout's (`noteScrollTarget(_:)`).
    static let keyboardGap: CGFloat = 12
    /// Wider than a phone, the field is as wide as the story's measure at most.
    static let maxWidth: CGFloat = 680
    /// Under the field: its one line, 6 below it.
    static let lineGap: CGFloat = 6
    /// Opening and closing (none under Reduce Motion).
    static let change = Animation.easeOut(duration: 0.15)

    /// The one line under the field, by priority: why a send failed > the offer to make it a card (past 200). Nil:
    /// nothing to say, and nothing is under the field. (No line says who reads it any more: the placeholder does —
    /// the owner, 2026-11-19: 「把这段话只有作者会看到这句把它移除掉」.)
    enum Line: Equatable {
        case error(String)
        case upgrade
    }

    static func line(error: String?, count: Int) -> Line? {
        if let error { return .error(error) }
        return count > upgradeThreshold ? .upgrade : nil
    }

    /// The count shows at the line's end only near the limit.
    static func showsCount(_ count: Int) -> Bool { count >= countFrom }

    /// The web counts the trimmed text in UTF-16 units.
    static func count(_ text: String) -> Int {
        text.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count
    }

    /// The field's one placeholder, whatever the reader's tap (「悄悄告訴作者，哪一段打動你」: where the words go and what
    /// to write, the owner's 2026-11-19 ask) — it no longer turns to 「哪一段讓你有共鳴？」 while the tap is on.
    static var placeholder: String { L10n.Card.Note.placeholder }

    /// What a tap on 寄小紙條 does (Escape the same once the field is open): closed, it opens (focused); open and
    /// empty, it closes; open with words, it only takes the focus back — words are never hidden.
    enum SegmentTap: Equatable { case open, close, focus }

    static func segmentTap(open: Bool, text: String) -> SegmentTap {
        guard open else { return .open }
        return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .close : .focus
    }

    /// A draft not yet sent opens the field as the page opens (words are never hidden behind the segment).
    static func opensOnArrival(draft: String?) -> Bool {
        !(draft ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// The words `-visualNote lines` opens the field on: three lines, as the web's and Android's `card-note-lines`.
    static let visualLines = "讀到早晨屬於自己的那段，\n想起我第一次一個人搬出來住，\n也是這樣手忙腳亂地沖咖啡。"

    /// Lines before it scrolls inside: a phone 3 (2 in a short window — a phone on its side), wider 5. No ⤢.
    static func maxLines(compact: Bool, shortWindow: Bool) -> Int {
        guard compact else { return 5 }
        return shortWindow ? 2 : 3
    }

    /// The field's width: a phone's column (nil), wider the story's column up to 680, starting where it starts.
    static func width(compact: Bool, column: CGFloat) -> CGFloat? {
        // Before the column is measured, the column's own width (nothing drawn 0 wide for a frame).
        compact || column <= 0 ? nil : min(column, maxWidth)
    }
}

extension View {
    /// The note's block as the page lays it out and as its focus scrolls it (SETTLED "the note, in place" 2): nothing
    /// under it in the layout — the page's own 40 follows it to the next section, as on the web and Android — while what
    /// the scroll brings to the visible bottom (anchor `.bottom`) is a clear reach ``NoteInPlace/keyboardGap`` tall right
    /// under the block, so the block rests 12 over the keyboard (Android's bring-into-view rect, `NoteKeyboardClearance`).
    /// The reach carries the id because a scroll takes an element's frame as its parent places it: on the block itself,
    /// the layout's footprint, which the reach must not add to. It is clear and takes no touch.
    func noteScrollTarget(_ id: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            self
            Color.clear.frame(width: 1, height: NoteInPlace.keyboardGap).id(id)
        }
        .padding(.bottom, -NoteInPlace.keyboardGap)
    }
}

/// The note field, open in place under the story's end row: ``NoteFieldCapsule`` — the envelope's column, the text
/// (one line in 48, growing to ``NoteInPlace/maxLines(compact:shortWindow:)`` then scrolling inside), 寄出 — and one
/// line under it (``NoteInPlace/Line``; the count at its end near the limit). Today's composer, moved, not
/// rewritten: the words are kept on the device as they are typed and however the page goes (``NoteDrafts``), and 寄出
/// clears and closes the field at once with 「紙條寄出了」 while the note goes on behind it under its card's attempt
/// (``NoteSends``: a retry is never a second note). A failure while the page is still there brings the field back on
/// the words with the line saying why; once the page is gone, a toast's 再寄一次 opens the card with the field open.
struct NoteField: View {
    let cardId: String
    /// Opened by the reader (the segment, a reopen): it takes the focus as it appears. A draft opening the field with
    /// the page doesn't — no keyboard comes unasked.
    var focusOnAppear = true
    /// Bumped to give the open field the focus again (the segment tapped with words in it).
    var focusRequest = 0
    /// Why the last send failed, when the field opened again on its words.
    var why: String?
    /// The release screenshots' words (`-visualNote lines`): the field opens on them and keeps nothing — no draft read,
    /// none written, so the next capture's field is as it was.
    var shownText: String?
    /// Whether the field holds words (the segment and Escape close an empty field, only focus a written one).
    @Binding var hasWords: Bool
    let onClose: () -> Void
    /// The words become the story of a card answering this one (the line's offer past 200).
    let onUpgrade: (String) -> Void
    /// Opens this card's page (the toast's 再寄一次, when the page is gone by then).
    var openCard: () -> Void = {}
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.window) private var window
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    /// Typing here is reading the card (§U7.1: a key) — the on-screen keyboard's keys come to the page as words only.
    @Environment(\.cardInteracted) private var interacted
    @State private var text = ""
    @State private var error: String?
    /// The words `error` was said of: other words, and it goes.
    @State private var errorFor: String?
    /// The words the server refused (three notes already wait, a block): Send waits for an edit.
    @State private var refused: String?
    /// Who is writing: the account signed in as the field opened, whose draft it keeps.
    @State private var author: String?
    /// The words went on (sent, or into a card): nothing of them is kept any more.
    @State private var letGo = false
    @State private var keeping: Task<Void, Never>?
    /// More than one line: the send segment is a block at the capsule's foot.
    @State private var block = false
    @FocusState private var focused: Bool

    private var count: Int { NoteInPlace.count(text) }
    private var words: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var valid: Bool { count > 0 && count <= NoteInPlace.maxLength && session.me != nil && words != refused }

    var body: some View {
        let type = ComposerText.current()
        VStack(alignment: .leading, spacing: NoteInPlace.lineGap) {
            NoteFieldCapsule(focused: focused, canSend: valid, block: block, sendLabel: L10n.Card.Tap.send, onSend: send) {
                TextField(text: $text, prompt: fieldPrompt(NoteInPlace.placeholder, size: type.font.pointSize),
                          axis: .vertical) { Text(L10n.Card.Note.entry) }
                    .lineLimit(1...NoteInPlace.maxLines(compact: window.layoutClass == .compact,
                                                         shortWindow: verticalSizeClass == .compact))
                    .lineSpacing(type.lineSpacing)
                    .font(Font(type.font))
                    .foregroundStyle(Tokens.text)
                    .focused($focused)
                    .padding(.vertical, type.padding)
                    // The name the interaction flows find it by (maestro/flows; Android's flowTag).
                    .accessibilityIdentifier("note-field")
                    .onGeometryChange(for: Bool.self) { $0.size.height > ComposerMetrics.height + 1 } action: { block = $0 }
                    .onKeyPress(.escape) {
                        if words.isEmpty { onClose() } else { focused = false }
                        return .handled
                    }
            }
            if let line = NoteInPlace.line(error: error, count: count) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    lineView(line)
                    Spacer(minLength: 0)
                    if NoteInPlace.showsCount(count) { countView }
                }
                .transition(.opacity)
            } else if NoteInPlace.showsCount(count) {
                HStack { Spacer(minLength: 0); countView }
            }
        }
        .onAppear {
            if let shownText { text = shownText } else { restoreDraft() }
            if focusOnAppear { focusSoon() }
        }
        .onDisappear(perform: keepDraft)
        .onChange(of: scenePhase) { _, phase in if phase != .active { keepDraft() } }
        .onChange(of: focusRequest) { _, _ in focusSoon() }
        .onChange(of: text) { _, new in
            interacted()
            if new.utf16.count > NoteInPlace.maxLength { text = String(new.utf16.prefix(NoteInPlace.maxLength)) ?? new }
            hasWords = !words.isEmpty
            // Other words: another note, which the server may take — the refusal and what was said of it go.
            if let refused, words != refused { self.refused = nil }
            if let errorFor, words != errorFor {
                self.errorFor = nil
                error = nil
            }
            keeping?.cancel()
            keeping = Task {
                try? await Task.sleep(for: NoteInPlace.keepDelay)
                if !Task.isCancelled { keepDraft() }
            }
        }
    }

    /// A beat after it is asked, once the field is in the page to take the keyboard.
    private func focusSoon() {
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(60))
            focused = true
        }
    }

    @ViewBuilder private func lineView(_ line: NoteInPlace.Line) -> some View {
        switch line {
        case let .error(message):
            ModalError(message)
        case .upgrade:
            Button {
                // The words become the card's story, which the writer keeps from here.
                let words = text
                letDraftGo()
                onUpgrade(words)
            } label: {
                // The tonal button's ink (4.5:1 on the paper; terracotta read 3.5:1).
                Text(L10n.Card.Note.upgrade).font(AppFonts.body(13)).foregroundStyle(Tokens.buttonOnTonal).underline()
                    .fixedSize(horizontal: false, vertical: true)
            }
            .buttonStyle(.plain)
        }
    }

    private var countView: some View {
        Text(verbatim: "\(count) / \(NoteInPlace.maxLength)")
            .font(AppFonts.body(11)).monospacedDigit()
            .foregroundStyle(count > NoteInPlace.maxLength ? Tokens.danger : Tokens.textMuted)
    }

    /// 寄出: the field clears and closes at once with 「紙條寄出了」 and the note goes on behind it — its words kept on
    /// the device until the server has them, under the card's attempt's client id (a retry, never a second note).
    /// A failure brings the field back on the words while the page is there (its line says why), else says so in a
    /// toast whose 再寄一次 opens the card with the field open. The notification permission is asked once it went.
    private func send() {
        guard valid else { return }
        let words = self.words
        let (drafts, uid, cardId, sends, toasts, messaging, openCard) =
            (session.noteDrafts, author, cardId, session.noteSends, session.toasts, session.messaging, openCard)
        let attempt = sends.attempt(cardId)
        sends.refused(cardId, words: nil)
        keepDraft()
        // Nothing more is kept from the field going: the words are kept as they were sent.
        keeping?.cancel()
        letGo = true
        onClose()
        toasts.show(L10n.Card.Note.sent)
        Task {
            do {
                _ = try await attempt.send(cardId: cardId, text: words) { try await messaging.sendNote(cardId: cardId, text: words, clientId: $0) }
                // The server has it (201): its draft goes — unless other words were written there since.
                if let uid, drafts.text(uid: uid, cardId: cardId)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? words == words {
                    drafts.clear(uid: uid, cardId: cardId)
                }
                PushCenter.shared.reachedOut(.reply)
            } catch {
                let failure = NoteFailure(error)
                if failure.refused { sends.refused(cardId, words: words, message: failure.message) }
                if sends.isHosted(cardId) {
                    // The page is still there: the field comes back on the words, its line saying why.
                    sends.reopen(cardId, why: failure.message)
                } else {
                    let waits = (error as? APIFailure)?.status == 409
                    toasts.show(waits ? L10n.Card.Note.waitForReply : L10n.Card.Note.failed,
                                action: ToastCenter.Action(label: L10n.Card.Note.reopen, accessibilityLabel: L10n.Card.Note.reopen) {
                        sends.reopen(cardId)
                        if !sends.isHosted(cardId) { openCard() }
                    })
                }
            }
        }
    }

    // MARK: The draft kept on the device

    /// Opening on this card: the words left unsent here, if any (for the account signed in now).
    private func restoreDraft() {
        guard author == nil, let uid = session.uid else { return }
        author = uid
        if text.isEmpty, let kept = session.noteDrafts.text(uid: uid, cardId: cardId) { text = kept }
        hasWords = !words.isEmpty
        // Opened again on words the server refused: said again, and Send waits for an edit.
        if let refusal = session.noteSends.refusal(cardId), refusal.words == words {
            refused = refusal.words
            error = refusal.message
            errorFor = words
        } else if let why, !words.isEmpty {
            error = why
            errorFor = words
        }
    }

    /// The words as they are now, kept — or, emptied, let go — for the account that typed them, while it is still the
    /// one signed in (a sign-out has cleared the device of it). Nothing once they went on.
    private func keepDraft() {
        keeping?.cancel()
        guard !letGo, let author, session.uid == author else { return }
        session.noteDrafts.keep(text, uid: author, cardId: cardId)
    }

    /// The words went on (made a card's story): nothing of them is kept.
    private func letDraftGo() {
        keeping?.cancel()
        letGo = true
        if let author { session.noteDrafts.clear(uid: author, cardId: cardId) }
    }
}

/// The place of the note field while the author waits to answer three notes (`CardTap.mayNote` false): one muted line,
/// no field — the card's draft stays on the device for when they answer.
struct NoteWaitLine: View {
    var body: some View {
        Text(L10n.Card.Note.waitForReply)
            .font(AppFonts.body(13.5)).foregroundStyle(Tokens.textMuted)
            .lineSpacing(13.5 * 0.4)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, minHeight: ComposerMetrics.height, alignment: .leading)
    }
}

/// A note that didn't go, as the field says it: in the app's words, never the server's (which are English, and for a
/// block would say more than the web's does) — three notes left unanswered wait for the author's reply, a card gone
/// (deleted, or hidden from the writer since, its notes with it) can't be found, anything else is the send error.
/// `refused`: the server answered no to these words (three notes waiting, a block, no pen name, the card gone), which
/// sending them again would only hear again; the rest (offline, the server's trouble) is a retry.
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
