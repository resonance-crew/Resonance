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
    /// How many lines the text runs to (⤢ from the third).
    @State private var lines = 1

    /// What rides with the message, top to bottom.
    private var rides: [ComposerRide] {
        ComposerRide.of(reply: model.replyingTo != nil, note: model.noteRef != nil, card: model.pendingCard != nil,
                        picture: !model.pendingPictures.isEmpty, error: model.error != nil)
    }

    var body: some View {
        let rides = rides
        let metrics = ComposerText.current()
        let expanded = model.composerExpanded && expandedTextHeight != nil
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
                stickers: ComposerSideButton(on: panels.stickersOpen, label: panels.stickersOpen ? L10n.Messages.keyboard : L10n.Messages.stickers,
                                             action: onStickers),
                corner: lines >= ComposerMetrics.expandAtLines || expanded
                    ? ComposerSideButton(on: expanded, label: expanded ? L10n.Messages.collapseComposer : L10n.Messages.expandComposer,
                                         action: { onExpand(!expanded) })
                    : nil,
                sendFace: panels.sendFace(canSend: model.hasSomethingToSend),
                faceLabel: panels.expanded ? L10n.Messages.stickerPanelCollapse : L10n.Messages.stickerPanelExpand,
                onFace: onPanelFace, expanded: expanded,
                onAttach: onAttach, onSend: { if model.canSend { model.send() } }
            ) {
                ComposerTextView(text: $model.draft, focused: $composing, placeholder: L10n.Messages.placeholder,
                                 accessibilityLabel: L10n.Messages.threadWith(handle: model.displayHandle), metrics: metrics,
                                 expandedHeight: expanded ? expandedTextHeight : nil,
                                 onLines: { lines = $0 },
                                 onReturn: { if model.canSend { model.send() } },
                                 onPastePictures: onPastePictures)
                    .padding(.vertical, ComposerTextView.edge)
            }
        }
        .animation(.easeOut(duration: 0.16), value: rides)
        .onChange(of: model.draft) { _, new in
            if new.utf16.count > ThreadModel.maxLength { model.draft = String(new.utf16.prefix(ThreadModel.maxLength)) ?? new }
        }
    }

    /// One riding thing as its row: lead · words · ✕.
    @ViewBuilder private func row(_ ride: ComposerRide) -> some View {
        switch ride {
        case .reply:
            if let quote = model.replyingTo {
                ComposerRow(label: quote.senderId == model.me ? L10n.Messages.replyingToSelf : L10n.Messages.replyingTo(handle: model.displayHandle),
                            detail: quote.summary(picture: L10n.Messages.replyImage, card: L10n.Messages.replyCard,
                                                  stickerName: { StickerLibrary.shared.name($0) })
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

/// The pictures riding with the next send (round 22 §4.2), as a row in the reply's style: their thumbnails
/// in the order picked — each numbered, each with its own ✕ (the pen's loader while one is readied) —, how
/// many they are (and that 10 is the most), and a ✕ taking them all off.
struct PictureStrip: View {
    @Bindable var model: ThreadModel

    var body: some View {
        let pictures = model.pendingPictures
        HStack(spacing: ComposerMetrics.rowLeadGap) {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(Array(pictures.enumerated()), id: \.element.key) { i, picture in
                        PictureThumb(picture: picture, number: pictures.count > 1 ? i + 1 : nil) { model.removePicture(picture.key) }
                    }
                }
                .padding(.vertical, 4)
            }
            .scrollIndicators(.hidden)
            .scrollBounceBehavior(.basedOnSize)
            // Three thumbnails at a time (each with its ✕'s room); past three, half of the next says the strip scrolls.
            .frame(width: PictureThumb.slot * (pictures.count <= 3 ? CGFloat(pictures.count) : 3.5))
            VStack(alignment: .leading, spacing: 1) {
                Text(L10n.Messages.picturesCount(count: pictures.count))
                    .font(AppFonts.body(12, weight: .semibold)).foregroundStyle(Tokens.text).lineLimit(1)
                if pictures.count >= AlbumRef.maxCount {
                    Text(L10n.Messages.picturesMax).font(AppFonts.body(12.5)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .allowsHitTesting(false)
            OrganicIconButton(.close, label: L10n.Messages.removeImage, size: 16) { model.removePictures() }
                .disabled(model.preparingPicture && pictures.count == 1)
        }
        .padding(.vertical, ComposerMetrics.rowPadY)
        .padding(.leading, ComposerMetrics.rowStart)
        .padding(.trailing, (ComposerMetrics.sendWidth - 44) / 2)
        .frame(minHeight: ComposerMetrics.rowMinHeight)
        .accessibilityElement(children: .contain)
    }
}

/// One picture in the strip: 48 × 48 cover-cropped, its place in the order at its foot, a ✕ at its corner.
private struct PictureThumb: View {
    let picture: RidingPicture
    let number: Int?
    let onRemove: () -> Void

    static let side: CGFloat = 48
    /// A thumbnail's room in the strip: itself, its ✕ hanging 6 past its corner, and the 8 to the next.
    static let slot: CGFloat = side + 6 + 8

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
            .overlay(alignment: .bottomLeading) {
                if let number {
                    Text("\(number)")
                        .font(AppFonts.body(11, weight: .semibold)).foregroundStyle(Tokens.cream)
                        .frame(width: 18, height: 18)
                        .background { WobCircleShape(seed: Double(number) * 7).fill(Tokens.buttonFill) }
                        .padding(3)
                        .accessibilityHidden(true)
                }
            }
            Button(action: onRemove) {
                ZStack {
                    WobCircleShape(seed: 13).fill(Tokens.cream)
                    WobCircleShape(seed: 13).stroke(Tokens.fieldBorder, lineWidth: Tokens.inkLight)
                    OrganicIcon(.close, size: 10, color: Tokens.text, strokeWidth: Tokens.ink)
                }
                .frame(width: 20, height: 20)
                .frame(width: 30, height: 30)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .offset(x: 9, y: -9)
            .accessibilityLabel(L10n.Messages.removeImage)
            .disabled(picture.picked == nil)
        }
        .padding(.top, 6)
        .padding(.trailing, 6)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(number.map { "\(L10n.Messages.attachImage) \($0)" } ?? L10n.Messages.attachImage)
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
