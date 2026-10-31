import DesignSystem
import ResonanceKit
import SwiftUI

/// The message being written (round 9 §4, round 10 §3, round 22 §4): a capsule floating over the thread —
/// ＋ at its start (the attach panel), the text, ☺ (the sticker panel) and Send as its end segment — and, in
/// rows straight over it, what rides with the message: the reply it carries, the note being answered, a card
/// or the pictures picked (one or the other), and why the last try didn't go. The rows have no frame: they
/// sit on the foot's paper (``ComposerBacking``, the screen's), which fades in over the 6 the foot gains above
/// them and the top 6 of the first row, before its ink (round 11 §3). The capsule keeps its geometry in every
/// state: 48 for a line of text at any text size, taller only with more lines (up to five, then it scrolls,
/// its edges fading); from the third line ⤢ grows it over the thread (option C) and ⤡ brings it back.
/// Sending never holds the composer — a message goes to the outbox and the field is empty for the next one,
/// with its keyboard still up. The twin of Android's ThreadComposer.
struct ThreadComposer: View {
    @Bindable var model: ThreadModel
    @Binding var composing: Bool
    /// What lies under the capsule (round 22 §4.1): ☺ shows ⌨ while the sticker panel is open, ＋ its open
    /// state while the attach panel is, and the send segment ↑ / ↓ in the sticker panel with nothing to send.
    var panels = ComposerPanels()
    /// Grown over the thread: the text box's height (nil at rest).
    var expandedTextHeight: CGFloat?
    /// ＋ was tapped: where it is on the screen (the Mac's popover hangs from it).
    let onAttach: (CGRect) -> Void
    /// ☺ / ⌨ was tapped.
    var onStickers: () -> Void = {}
    /// ↑ / ↓ was tapped.
    var onPanelFace: () -> Void = {}
    /// ⤢ (true) or ⤡ (false) was tapped.
    var onExpand: (Bool) -> Void = { _ in }
    /// Pictures were pasted into the field.
    var onPastePictures: ([Data]) -> Void = { _ in }
    /// How many lines the text runs to (the send block from the second, ⤢ from the third).
    @State private var lines = 1
    /// Text beyond the text box's top and bottom edges: they fade out there.
    @State private var fadeTop = false
    @State private var fadeBottom = false

    /// What rides with the message, top to bottom.
    private var rides: [ComposerRide] {
        ComposerRide.of(reply: model.replyingTo != nil, note: model.noteRef != nil, card: model.pendingCard != nil,
                        picture: !model.pendingPictures.isEmpty, error: model.error != nil)
    }

    var body: some View {
        let rides = rides
        let metrics = ComposerText.current()
        let expanded = model.composerExpanded && expandedTextHeight != nil
        let offersStickers = Self.offersStickers(draft: model.draft)
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
            ComposerCapsule(
                focused: composing, canSend: model.canSend, attachOpen: panels.attachOpen, attachLabel: L10n.Messages.attach,
                sendLabel: L10n.Messages.send,
                stickers: !offersStickers ? nil
                    : ComposerSideButton(on: panels.stickersOpen, label: panels.stickersOpen ? L10n.Messages.keyboard : L10n.Messages.stickers,
                                         action: onStickers),
                corner: lines >= ComposerMetrics.expandAtLines || expanded
                    ? ComposerSideButton(on: expanded, label: expanded ? L10n.Messages.collapseComposer : L10n.Messages.expandComposer,
                                         action: { onExpand(!expanded) })
                    : nil,
                sendFace: panels.sendFace(canSend: model.hasSomethingToSend),
                faceLabel: panels.expanded ? L10n.Messages.stickerPanelCollapse : L10n.Messages.stickerPanelExpand,
                onFace: onPanelFace, block: Self.sendsFromBlock(lines: lines, expanded: expanded),
                onAttach: onAttach, onSend: { if model.canSend { model.send() } }
            ) {
                ComposerTextView(text: $model.draft, focused: $composing, placeholder: L10n.Messages.placeholder,
                                 accessibilityLabel: L10n.Messages.threadWith(handle: model.displayHandle), metrics: metrics,
                                 expandedHeight: expanded ? expandedTextHeight : nil,
                                 onLines: { lines = $0 },
                                 onReturn: { if model.canSend { model.send() } },
                                 onPastePictures: onPastePictures,
                                 onFades: { top, bottom in
                                     if fadeTop != top { fadeTop = top }
                                     if fadeBottom != bottom { fadeBottom = bottom }
                                 })
                    .mask { ComposerFadeMask(top: fadeTop, bottom: fadeBottom) }
            }
        }
        .animation(.easeOut(duration: 0.16), value: rides)
        .onChange(of: model.draft) { _, new in
            if new.utf16.count > ThreadModel.maxLength { model.draft = String(new.utf16.prefix(ThreadModel.maxLength)) ?? new }
        }
    }

    /// The words under 「回覆…」: the quote's (one line) — none for a sticker it can draw, whose still stands there.
    static func replyDetail(_ quote: ReplyQuote) -> String? {
        let words = QuotedReply.words(quote)
        return words.isEmpty ? nil : words.replacingOccurrences(of: "\n", with: " ")
    }

    /// ☺ only while nothing is written (round 22 v2): a sticker goes on its own, and words take the room it had.
    nonisolated static func offersStickers(draft: String) -> Bool {
        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Past one line (or grown over the thread) Send is the block on the last row, ⤢ / ⤡ over it (round 22 v2).
    nonisolated static func sendsFromBlock(lines: Int, expanded: Bool) -> Bool { lines > 1 || expanded }

    /// One riding thing as its row: lead · words · ✕.
    @ViewBuilder private func row(_ ride: ComposerRide) -> some View {
        switch ride {
        case .reply:
            if let quote = model.replyingTo {
                let sticker = QuotedReply.quotedSticker(quote)
                ComposerRow(label: quote.senderId == model.me ? L10n.Messages.replyingToSelf : L10n.Messages.replyingTo(handle: model.displayHandle),
                            detail: Self.replyDetail(quote),
                            removeLabel: L10n.Messages.replyCancel, onRemove: { model.cancelReply() }) {
                    HStack(spacing: ComposerMetrics.rowLeadGap) {
                        ReplyRule().frame(height: 34)
                        // A sticker answered: its still alone, no words (the thread's quote is the same); VoiceOver names it.
                        if let sticker {
                            StickerStill(sticker: sticker, side: ComposerMetrics.rowThumb)
                                .accessibilityElement()
                                .accessibilityLabel(L10n.Messages.stickerLabel(name: StickerLibrary.shared.label(sticker)))
                        }
                    }
                }
            }
        case .note:
            ComposerRow(label: L10n.Messages.quotedNote, removeLabel: L10n.Messages.removeCard, onRemove: { model.noteRef = nil }) {
                ComposerRowTile(.glyph(.note))
            }
        case .card:
            if let card = model.pendingCard {
                // A 私人卡 says so: the message is what lets them read it.
                ComposerRow(label: CardScreen.isPrivate(card) ? L10n.Messages.privateCard : L10n.Messages.attachCardShort,
                            detail: card.title, removeLabel: L10n.Messages.removeCard,
                            onRemove: { model.pendingCard = nil }) {
                    ComposerRowTile(card.imageUrl.flatMap(URL.init(string:)).map { .cover($0) } ?? .glyph(.cards))
                }
            }
        case .picture:
            PictureStrip(model: model)
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

/// The pictures riding with the next send (round 22 §4.2, v2): their thumbnails in the order picked, straight over
/// the capsule, each taken off by its own ✕ at its top-right corner (the pen's loader while one is readied) — no
/// numbers, no count, no clear-all: unpicking is one by one, there or in the attach panel's picker.
struct PictureStrip: View {
    @Bindable var model: ThreadModel

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(model.pendingPictures) { picture in
                    PictureThumb(picture: picture) { model.removePicture(picture.key) }
                }
            }
            .padding(.leading, ComposerMetrics.rowStart)
            .padding(.trailing, ComposerMetrics.rowStart)
            .padding(.vertical, ComposerMetrics.rowPadY)
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize)
        .frame(minHeight: ComposerMetrics.rowMinHeight)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.Messages.picturesCount(count: model.pendingPictures.count))
    }
}

/// One picture in the strip: 56 × 56 cover-cropped, a small round ✕ on its top-right corner — a calm circle, its
/// hand-drawn wobble low (v2: the old one read as a blob).
struct PictureThumb: View {
    let picture: RidingPicture
    let onRemove: () -> Void

    static let side: CGFloat = 56
    /// The ✕'s disc and how little it wobbles.
    static let removeDisc: CGFloat = 20
    static let removeWobble = WobCircleOptions(segments: 8, mag: 0.35, cpJitter: 0.15)

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let image = picture.picked?.preview {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    ComposerRowTile.tonal.overlay { SketchLoader(size: 18) }
                }
            }
            .frame(width: Self.side, height: Self.side)
            .clipShape(ComposerRowTile.shape)
            .accessibilityHidden(true)
            Button(action: onRemove) {
                ZStack {
                    WobCircleShape(seed: 13, options: Self.removeWobble).fill(Tokens.cream)
                    WobCircleShape(seed: 13, options: Self.removeWobble).stroke(Tokens.fieldBorderHover, lineWidth: Tokens.inkLight)
                    OrganicIcon(.close, size: 10, color: Tokens.text, strokeWidth: Tokens.ink)
                }
                .frame(width: Self.removeDisc, height: Self.removeDisc)
                // A finger's room round the small disc.
                .frame(width: 32, height: 32)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .offset(x: 10, y: -10)
            .accessibilityLabel(L10n.Messages.removeImage)
            .disabled(picture.picked == nil)
        }
        .padding(.top, 8)
        .padding(.trailing, 8)
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
