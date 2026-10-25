import DesignSystem
import ResonanceKit
import SwiftUI

/// The message being written (round 9 §4, round 10 §3): a capsule floating over the thread — ＋ at its
/// start (圖片 · 卡片, the screen's menu over it), the text, Send as its end segment — and, in rows
/// straight over it, what rides with the message: the reply it carries, the note being answered, a
/// card or a picture (one of the two), and why the last try didn't go. The rows have no frame: they
/// sit on the foot's paper (``ComposerBacking``, the screen's), which fades in over the 6 the foot
/// gains above them and the top 6 of the first row, before its ink (round 11 §3). The capsule keeps its geometry in every state: 48 for a line of text at any text
/// size, taller only with more lines (up to five, then it scrolls). Sending never holds the composer —
/// a message goes to the outbox and the field is empty for the next one, with its keyboard still up.
/// The twin of Android's ThreadComposer.
struct ThreadComposer: View {
    @Bindable var model: ThreadModel
    var composing: FocusState<Bool>.Binding
    /// The ＋ was tapped: where it is on the screen, for its menu to hang from.
    let onAttach: (CGRect) -> Void

    /// What rides with the message, top to bottom.
    private var rides: [ComposerRide] {
        ComposerRide.of(reply: model.replyingTo != nil, note: model.noteRef != nil, card: model.pendingCard != nil,
                        picture: model.pendingPicture != nil || model.preparingPicture, error: model.error != nil)
    }

    var body: some View {
        let rides = rides
        VStack(spacing: 0) {
            if !rides.isEmpty {
                VStack(spacing: 0) {
                    // The 6 the foot gains over its rows: where its paper starts to fade in.
                    Color.clear.frame(height: ComposerMetrics.fadeRoom(riding: true))
                    ForEach(rides, id: \.self) { ride in row(ride) }
                }
                .padding(.bottom, ComposerMetrics.slipGap)
                .transition(.opacity)
            }
            ComposerCapsule(focused: composing.wrappedValue, canSend: model.canSend, attachLabel: L10n.Messages.attach,
                            sendLabel: L10n.Messages.send, onAttach: onAttach, onSend: { if model.canSend { model.send() } }) {
                ComposerField(model: model, composing: composing)
            }
        }
        .animation(.easeOut(duration: 0.16), value: rides)
    }

    /// One riding thing as its row: lead · words · ✕.
    @ViewBuilder private func row(_ ride: ComposerRide) -> some View {
        switch ride {
        case .reply:
            if let quote = model.replyingTo {
                ComposerRow(label: quote.senderId == model.me ? L10n.Messages.replyingToSelf : L10n.Messages.replyingTo(handle: model.displayHandle),
                            detail: quote.summary(picture: L10n.Messages.replyImage, card: L10n.Messages.replyCard)
                                .replacingOccurrences(of: "\n", with: " "),
                            removeLabel: L10n.Messages.replyCancel, onRemove: { model.cancelReply() }) {
                    ReplyRule().frame(height: 34)
                }
            }
        case .note:
            ComposerRow(label: L10n.Messages.quotedNote, removeLabel: L10n.Messages.removeCard, onRemove: { model.noteRef = nil }) {
                ComposerRowTile(.glyph(.note))
            }
        case .card:
            if let card = model.pendingCard {
                ComposerRow(label: L10n.Messages.attachCardShort, detail: card.title, removeLabel: L10n.Messages.removeCard,
                            onRemove: { model.pendingCard = nil }) {
                    ComposerRowTile(card.imageUrl.flatMap(URL.init(string:)).map { .cover($0) } ?? .glyph(.cards))
                }
            }
        case .picture:
            // While it is readied, the pen's loader in its place and nothing to take away yet.
            ComposerRow(label: L10n.Messages.attachImage, removeLabel: L10n.Messages.removeImage,
                        onRemove: model.preparingPicture ? nil : { model.pendingPicture = nil }) {
                ComposerRowTile(.picture(model.preparingPicture ? nil : model.pendingPicture?.preview))
            }
        case .error:
            if let error = model.error {
                Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, ComposerMetrics.rowStart)
                    .padding(.vertical, 6)
                    .allowsHitTesting(false)
            }
        }
    }
}

/// What rides with the message (round 10 §3.4), in its order over the capsule: the reply, the note it
/// answers, the card or the picture, then why the last try didn't go.
nonisolated enum ComposerRide: Hashable {
    case reply, note, card, picture, error

    static func of(reply: Bool, note: Bool, card: Bool, picture: Bool, error: Bool) -> [ComposerRide] {
        var rides: [ComposerRide] = []
        if reply { rides.append(.reply) }
        if note { rides.append(.note) }
        if card { rides.append(.card) }
        if picture { rides.append(.picture) }
        if error { rides.append(.error) }
        return rides
    }
}

/// The capsule's text: 16 × the interface scale (its own text size, at most 1.25×) on one line at
/// rest, its padding worked out from the line it really draws so that line sits centred in the 48
/// (``ComposerMetrics/textPadding(lineHeight:)``); more lines grow the capsule, to five, then it scrolls.
private struct ComposerField: View {
    @Bindable var model: ThreadModel
    var composing: FocusState<Bool>.Binding

    var body: some View {
        let metrics = ComposerText.current()
        TextField(text: $model.draft, prompt: fieldPrompt(L10n.Messages.placeholder, size: ComposerMetrics.textSize), axis: .vertical) {
            Text(L10n.Messages.threadWith(handle: model.displayHandle))
        }
        .lineLimit(1...ComposerMetrics.maxLines)
        .lineSpacing(metrics.lineSpacing)
        .font(Font(metrics.font))
        .foregroundStyle(Tokens.text)
        .tint(Tokens.terracotta)
        .focused(composing)
        .padding(.vertical, metrics.padding)
        .onChange(of: model.draft) { _, new in
            if new.utf16.count > ThreadModel.maxLength { model.draft = String(new.utf16.prefix(ThreadModel.maxLength)) ?? new }
        }
        // A hardware keyboard (an iPad's): Return sends, Shift-Return starts a new line — and while an
        // input method is composing (zhuyin, pinyin), Return is its own, choosing the words.
        .onKeyPress(.return, phases: .down) { press in
            guard ComposerKeys.sends(shift: press.modifiers.contains(.shift), composing: FirstResponder.hasMarkedText()) else {
                return .ignored
            }
            if model.canSend { model.send() }
            return .handled
        }
    }
}

/// The composer text's face at the person's text size, and how it sits in the capsule's 48.
struct ComposerText {
    let font: UIFont
    /// The tallest line the field draws at this size: the face's own, or a line of Chinese, which
    /// falls back to Noto Sans TC (taller than DM Sans) — so typing Chinese never grows the capsule.
    let lineHeight: CGFloat
    let padding: CGFloat
    let lineSpacing: CGFloat

    /// At the interface scale `scale` (``TextScale/factor(relativeTo:)``: at most 1.25).
    static func at(scale: CGFloat) -> ComposerText {
        let size = (ComposerMetrics.textSize * scale).rounded()
        let font = AppFonts.uiFont(.body, size: size)
        let line = max(font.lineHeight, AppFonts.normalLineBox(.body, size: size, text: "字"))
        return ComposerText(font: font, lineHeight: line, padding: ComposerMetrics.textPadding(lineHeight: line),
                            lineSpacing: (size * 0.3).rounded())
    }

    @MainActor static func current() -> ComposerText { at(scale: TextScale.factor(relativeTo: .body)) }
}

/// A calm line at the thread's foot, centred and muted: in the composer's place where there is
/// nothing to write (a note waiting for its answer, no connection), or over it.
struct ThreadFootNote: View {
    let text: String
    var size: CGFloat = 13

    var body: some View {
        Text(text)
            .font(AppFonts.body(size)).foregroundStyle(Tokens.textMuted)
            .lineSpacing(size * 0.35)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
    }
}

/// What Return does in the composer on a hardware keyboard (the web's ThreadComposer onKeyDown).
nonisolated enum ComposerKeys {
    /// Return sends unless Shift is held (a new line) or an input method is composing (its candidate).
    static func sends(shift: Bool, composing: Bool) -> Bool { !shift && !composing }
}

/// The text view holding the keyboard, found by the responder chain (UIKit says no other way).
enum FirstResponder {
    private static weak var found: UIResponder?

    static func current() -> UIResponder? {
        found = nil
        UIApplication.shared.sendAction(#selector(UIResponder.resonanceCaptureFirstResponder), to: nil, from: nil, for: nil)
        return found
    }

    /// An input method is composing in it (marked text, as zhuyin's underlined candidate).
    static func hasMarkedText() -> Bool {
        (current() as? UITextInput)?.markedTextRange != nil
    }

    fileprivate static func capture(_ responder: UIResponder) { found = responder }
}

extension UIResponder {
    @objc fileprivate func resonanceCaptureFirstResponder() { FirstResponder.capture(self) }
}
