import DesignSystem
import ResonanceKit
import SwiftUI

/// The message being written (round 9 §4): a capsule floating over the thread — ＋ at its start (圖片 ·
/// 卡片, the screen's menu over it), the text, Send as its end segment — and, on a slip directly over
/// it, what rides with the message: the reply it carries, the note being answered, a card or a picture
/// (one of the two), and why the last try didn't go. The capsule keeps its geometry in every state: 48
/// for a line of text at any text size, taller only with more lines (up to five, then it scrolls).
/// Sending never holds the composer — a message goes to the outbox and the field is empty for the next
/// one, with its keyboard still up. The twin of Android's ThreadComposer.
struct ThreadComposer: View {
    @Bindable var model: ThreadModel
    var composing: FocusState<Bool>.Binding
    /// The ＋ was tapped: where it is on the screen, for its menu to hang from.
    let onAttach: (CGRect) -> Void

    /// What rides on the slip.
    private var slip: Bool {
        model.replyingTo != nil || model.noteRef != nil || model.pendingCard != nil || model.pendingPicture != nil
            || model.preparingPicture || model.error != nil
    }

    var body: some View {
        VStack(spacing: ComposerMetrics.slipGap) {
            if slip {
                ComposerSlip {
                    VStack(alignment: .leading, spacing: 6) {
                        if let quote = model.replyingTo { ReplyBar(model: model, quote: quote) }
                        if model.noteRef != nil || model.pendingCard != nil || model.pendingPicture != nil || model.preparingPicture {
                            FlowRow(spacing: 8) {
                                if model.noteRef != nil {
                                    AttachmentChip(icon: .note, title: L10n.Messages.quotedNote) { model.noteRef = nil }
                                }
                                if let card = model.pendingCard {
                                    AttachmentChip(icon: .cards, title: card.title) { model.pendingCard = nil }
                                }
                                if model.preparingPicture {
                                    PictureChip(picture: nil) {}
                                } else if let picture = model.pendingPicture {
                                    PictureChip(picture: picture.preview) { model.pendingPicture = nil }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        if let error = model.error {
                            Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.vertical, 4)
                        }
                    }
                    .padding(.leading, 12)
                    .padding(.trailing, 4)
                    .padding(.vertical, 4)
                }
                .transition(.opacity)
            }
            ComposerCapsule(focused: composing.wrappedValue, canSend: model.canSend, attachLabel: L10n.Messages.attach,
                            sendLabel: L10n.Messages.send, onAttach: onAttach, onSend: { if model.canSend { model.send() } }) {
                ComposerField(model: model, composing: composing)
            }
        }
        .animation(.easeOut(duration: 0.16), value: slip)
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

/// On the slip while replying: a wavy terracotta rule, whom to (12, semibold) over a line of what
/// (12.5), and a ✕ a finger wide.
private struct ReplyBar: View {
    let model: ThreadModel
    let quote: ReplyQuote

    var body: some View {
        let who = quote.senderId == model.me ? L10n.Messages.replyingToSelf : L10n.Messages.replyingTo(handle: model.displayHandle)
        let what = quote.summary(picture: L10n.Messages.replyImage, card: L10n.Messages.replyCard).replacingOccurrences(of: "\n", with: " ")
        HStack(spacing: 10) {
            ReplyRule().frame(height: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(who).font(AppFonts.body(12, weight: .semibold)).foregroundStyle(Tokens.text).lineLimit(1)
                Text(what).font(AppFonts.body(12.5)).foregroundStyle(Tokens.textMuted).lineLimit(1)
            }
            Spacer(minLength: 0)
            Button { model.cancelReply() } label: {
                OrganicIcon(.close, size: 15, color: Tokens.textMuted, strokeWidth: Tokens.ink)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(OrganicPressStyle())
            .accessibilityLabel(L10n.Messages.replyCancel)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .contain)
    }
}

/// A picture picked for the next message, on the slip where a card's chip shows: a small
/// thumbnail with the hand-drawn edge of the pictures, and its ✕ (移除圖片). While the picture is
/// readied (`picture` nil), the pen's loader in its place.
private struct PictureChip: View {
    let picture: UIImage?
    let onRemove: () -> Void

    var body: some View {
        let edge = WobRectShape(radius: 10, seed: 61, mag: 0.9)
        HStack(spacing: 4) {
            Group {
                if let picture {
                    Image(uiImage: picture).resizable().scaledToFill()
                } else {
                    Tokens.creamDark.overlay { SketchLoader(size: 18) }
                }
            }
            .frame(width: 44, height: 44)
            .clipShape(edge)
            .accessibilityLabel(L10n.Messages.attachImage)
            if picture != nil {
                Button(action: onRemove) {
                    OrganicIcon(.close, size: 13, color: Tokens.textMuted)
                        .frame(width: 32, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.Messages.removeImage)
            }
        }
        .padding(.leading, 4).padding(.trailing, picture == nil ? 4 : 0).padding(.vertical, 4)
        .background(Tokens.terracottaLight.opacity(0.4),
                    in: UnevenRoundedRectangle(topLeadingRadius: 12, bottomLeadingRadius: 14, bottomTrailingRadius: 12, topTrailingRadius: 14))
    }
}

/// A pending attachment on the slip: its glyph, its name, and a ✕.
private struct AttachmentChip: View {
    let icon: IconName
    let title: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            OrganicIcon(icon, size: 14, color: Tokens.text)
            Text(title).font(AppFonts.body(12)).foregroundStyle(Tokens.text).lineLimit(1).frame(maxWidth: 180, alignment: .leading)
                .fixedSize(horizontal: true, vertical: false)
            Button(action: onRemove) {
                OrganicIcon(.close, size: 13, color: Tokens.textMuted).padding(2)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.Messages.removeCard)
        }
        .padding(.leading, 10).padding(.trailing, 8).padding(.vertical, 5)
        .background(Tokens.terracottaLight.opacity(0.4),
                    in: UnevenRoundedRectangle(topLeadingRadius: 12, bottomLeadingRadius: 14, bottomTrailingRadius: 12, topTrailingRadius: 14))
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
