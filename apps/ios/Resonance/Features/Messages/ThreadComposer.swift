import DesignSystem
import ResonanceKit
import SwiftUI

/// The message being written (round 9 §4, round 10 §3, round 22 §4, round 23 §2): a capsule floating over the
/// thread — ＋ at its start (the attach panel), the text, ☺ (the sticker panel) and Send as its end segment — and,
/// inside it over the text line (Telegram's way, the owner's call), what rides with the message: the reply it
/// carries, the note being answered, a card or the pictures picked (one or the other), and why the last try didn't
/// go. Its rows run in the capsule's three columns: a mark in ＋'s, the words where the text starts, a ✕ in Send's;
/// whenever anything rides Send is the block at the foot corner. The capsule keeps its geometry in every state: 48
/// for a line of text at any text size, taller only with more lines (up to five — three on a short viewport — then
/// it scrolls, its edges fading) or what rides; from the third line ⤢ grows it over the thread (option C) and ⤡
/// brings it back. Sending never holds the composer — a message goes to the outbox and the field is empty for the
/// next one, with its keyboard still up. The twin of Android's ThreadComposer.
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
    /// The reply's words were tapped: the thread goes to the message it answers (and pulses it).
    var onJump: (String) -> Void = { _ in }
    /// A hardware keyboard's Esc in the field: whether the screen took it (else the field's own).
    var onEscape: () -> Bool = { false }
    /// The capsule on the screen — what rides in it included — and how tall what rides in it is.
    var onCapsuleFrame: (CGRect) -> Void = { _ in }
    var onRidingHeight: (CGFloat) -> Void = { _ in }
    /// How many lines the text runs to (the send block from the second, ⤢ from the third).
    @State private var lines = 1
    /// Text beyond the text box's top and bottom edges: they fade out there.
    @State private var fadeTop = false
    @State private var fadeBottom = false
    /// A phone on its side: rows of one line, smaller thumbnails, three lines of text (round 23).
    @Environment(\.verticalSizeClass) private var verticalSize

    /// What rides with the message, top to bottom.
    private var rides: [ComposerRide] { Self.rides(model) }

    static func rides(_ model: ThreadModel) -> [ComposerRide] {
        ComposerRide.of(reply: model.replyingTo != nil, note: model.noteRef != nil, card: model.pendingCard != nil,
                        picture: !model.pendingPictures.isEmpty, error: model.error != nil)
    }

    var body: some View {
        let rides = rides
        let short = verticalSize == .compact
        let metrics = ComposerText.current()
        let expanded = model.composerExpanded && expandedTextHeight != nil
        let offersStickers = Self.offersStickers(draft: model.draft)
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
            onFace: onPanelFace, block: Self.sendsFromBlock(lines: lines, expanded: expanded, riding: !rides.isEmpty),
            steady: true,
            onAttach: onAttach, onSend: { if model.canSend { model.send() } }
        ) {
            ComposerTextView(text: $model.draft, focused: $composing, placeholder: L10n.Messages.placeholder,
                             accessibilityLabel: L10n.Messages.threadWith(handle: model.displayHandle), metrics: metrics,
                             expandedHeight: expanded ? expandedTextHeight : nil,
                             maxLines: ComposerMetrics.maxLines(short: short),
                             onLines: { lines = $0 },
                             onReturn: { if model.canSend { model.send() } },
                             onEscape: onEscape,
                             onPastePictures: onPastePictures,
                             onFades: { top, bottom in
                                 if fadeTop != top { fadeTop = top }
                                 if fadeBottom != bottom { fadeBottom = bottom }
                             })
                .mask { ComposerFadeMask(top: fadeTop, bottom: fadeBottom) }
        } riding: {
            // Inside the pen line, over the text line: no divider, the rows touching (round 23 §2). The block is always
            // there (0 tall with nothing in it) so its height is said when the last row goes too.
            VStack(spacing: 0) {
                ForEach(rides, id: \.self) { ride in row(ride, short: short) }
            }
            .padding(.top, rides.isEmpty ? 0 : ComposerMetrics.ridingTop)
            // A tap anywhere among them gives the field the keyboard — never takes it away (the foot's paper would).
            .contentShape(Rectangle())
            .onTapGesture { composing = true }
            .onGeometryChange(for: CGFloat.self) { $0.size.height.rounded() } action: { onRidingHeight($0) }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(rides.isEmpty ? "" : L10n.Messages.composerRiding)
            .accessibilityHidden(rides.isEmpty)
        }
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { onCapsuleFrame($0) }
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

    /// Past one line, grown over the thread, or with anything riding (round 23 §2), Send is the block on the last row,
    /// ⤢ / ⤡ over it (round 22 v2) — a capsule made taller by its rows never paints a tall send strip.
    nonisolated static func sendsFromBlock(lines: Int, expanded: Bool, riding: Bool = false) -> Bool {
        lines > 1 || expanded || riding
    }

    /// One riding thing as its row: mark · (media) words · ✕.
    @ViewBuilder private func row(_ ride: ComposerRide, short: Bool) -> some View {
        let rowHeight = short ? ComposerMetrics.shortRowHeight : ComposerMetrics.rowHeight
        let mark = short ? rowHeight - 8 : ComposerMetrics.leadMark
        switch ride {
        case .reply:
            if let quote = model.replyingTo {
                ComposerRow(label: quote.senderId == model.me ? L10n.Messages.replyingToSelf : L10n.Messages.replyingTo(handle: model.displayHandle),
                            detail: Self.replyDetail(quote),
                            removeLabel: L10n.Messages.replyCancel, onRemove: { model.cancelReply() },
                            // Its words go to the message it answers, pulsed there (the thread's quote does the same).
                            onTap: { onJump(quote.id) }, short: short) {
                    ReplyRule().frame(height: rowHeight - 2 * ComposerMetrics.replyRuleInset)
                } media: {
                    ReplyMedia(quote: quote, model: model, side: short ? mark : ComposerMetrics.replyMedia)
                }
            }
        case .note:
            ComposerRow(label: L10n.Messages.quotedNote, removeLabel: L10n.Messages.removeNote, onRemove: { model.noteRef = nil },
                        onTap: { composing = true }, short: short) {
                ComposerRowTile(.glyph(.note), side: mark)
            }
        case .card:
            if let card = model.pendingCard {
                // A 私人卡 says so: the message is what lets them read it.
                ComposerRow(label: CardScreen.isPrivate(card) ? L10n.Messages.privateCard : L10n.Messages.attachCardShort,
                            detail: card.title, removeLabel: L10n.Messages.removeCard,
                            onRemove: { model.pendingCard = nil }, onTap: { composing = true }, short: short) {
                    ComposerRowTile(card.imageUrl.flatMap(URL.init(string:)).map { .cover($0) } ?? .glyph(.cards), side: mark)
                }
            }
        case .picture:
            PictureStrip(model: model, short: short)
        case .error:
            if let error = model.error {
                ComposerErrorRow(text: error)
            }
        }
    }
}

/// Why the last try didn't go (round 23 §2): its small terracotta mark in ＋'s column, its words in terracotta
/// where the text starts, nothing in Send's column (no ✕: it goes with the next try). At least 32 tall.
private struct ComposerErrorRow: View {
    let text: String

    var body: some View {
        HStack(spacing: 0) {
            WobCircleShape(seed: 37, options: WobCircleOptions(segments: 6, mag: 0.4, cpJitter: 0.2))
                .fill(Tokens.terracotta)
                .frame(width: 6, height: 6)
                .frame(width: ComposerMetrics.leadColumn)
                .accessibilityHidden(true)
            Text(text).font(AppFonts.body(ComposerMetrics.errorSize)).foregroundStyle(Tokens.terracotta)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 7)
            Color.clear.frame(width: ComposerMetrics.sendWidth, height: 1)
        }
        .frame(minHeight: ComposerMetrics.errorMinHeight)
    }
}

/// A reply's media at the start of its words (round 23, Telegram's photo reply): a quoted sticker's still, faded as
/// the thread's quote draws it; the picture it answers, from the thread's own copy; or the cover of the card it
/// carried. Nothing for words alone.
private struct ReplyMedia: View {
    let quote: ReplyQuote
    let model: ThreadModel
    let side: CGFloat
    @State private var picture: UIImage?

    var body: some View {
        if let sticker = QuotedReply.quotedSticker(quote) {
            // A sticker answered: its still alone, no words (the thread's quote is the same); VoiceOver names it.
            StickerStill(sticker: sticker, side: side)
                .opacity(QuotedReply.stickerFade)
                .accessibilityElement()
                .accessibilityLabel(L10n.Messages.stickerLabel(name: StickerLibrary.shared.label(sticker)))
        } else if quote.image, let image = model.message(quote.id)?.image {
            ComposerRowTile(.picture(picture ?? model.pictures.cached(image.id, .thumb)), side: side)
                .task(id: image.id) {
                    if picture == nil, model.pictures.cached(image.id, .thumb) == nil {
                        picture = await model.pictures.image(image.id, .thumb)
                    }
                }
        } else if let cardRef = quote.cardRef, let cover = model.card(cardRef)?.imageUrl.flatMap(URL.init(string:)) {
            ComposerRowTile(.cover(cover), side: side)
        }
    }
}

/// The pictures riding with the next send (round 22 §4.2, v2; round 23: inside the capsule), in the order picked,
/// across the capsule's inner width 8 in from its sides — 8 + 56 + 8 — scrolling sideways with its ends fading
/// where more lies beyond (a mouse's wheel scrolls it too); each taken off by its own ✕ on its top-right corner (the
/// pen's loader while one is readied) — no numbers, no count, no clear-all: unpicking is one by one, there or in the
/// attach panel's picker.
struct PictureStrip: View {
    @Bindable var model: ThreadModel
    var short = false

    var body: some View {
        let side = short ? ComposerMetrics.shortStripThumb : ComposerMetrics.stripThumb
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Array(model.pendingPictures.enumerated()), id: \.element.id) { i, picture in
                    PictureThumb(picture: picture, side: side, index: i) { model.removePicture(picture.key) }
                }
            }
            // The last ✕'s swing into the strip's end.
            .padding(.trailing, PictureThumb.removeOut)
            .padding(.vertical, ComposerMetrics.stripPad)
            .background { WheelScrollsSideways() }
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize)
        .sidewaysEdgeFades()
        .frame(height: ComposerMetrics.stripHeight(short: short))
        .padding(.horizontal, ComposerMetrics.stripInset)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.Messages.picturesCount(count: model.pendingPictures.count))
    }
}

/// One picture in the strip: `side` square cover-cropped, a small round ✕ on its top-right corner, its middle 4 in
/// from the corner so the whole disc stays inside the capsule's pen line — a calm circle, its hand-drawn wobble low
/// (v2: the old one read as a blob).
struct PictureThumb: View {
    let picture: RidingPicture
    var side: CGFloat = ComposerMetrics.stripThumb
    var index = 0
    let onRemove: () -> Void

    /// The ✕'s disc and how little it wobbles.
    static let removeDisc: CGFloat = 20
    static let removeWobble = WobCircleOptions(segments: 8, mag: 0.35, cpJitter: 0.15)
    /// The disc's middle, in from the thumbnail's top-right corner; how far it swings out past its edges.
    static let removeIn: CGFloat = 4
    static var removeOut: CGFloat { removeDisc / 2 - removeIn }

    var body: some View {
        Group {
            if let image = picture.picked?.preview {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                ComposerRowTile.tonal.overlay { SketchLoader(size: 18) }
            }
        }
        .frame(width: side, height: side)
        .clipShape(ComposerRowTile.shape(side: side))
        .accessibilityHidden(true)
        .overlay(alignment: .topTrailing) {
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
            // Its middle `removeIn` in from the corner (the 32 room centred on it).
            .offset(x: 16 - Self.removeIn, y: Self.removeIn - 16)
            .accessibilityLabel(L10n.Messages.removeImageAt(n: index + 1))
            .disabled(picture.picked == nil)
        }
    }
}

/// A sideways scroll's ends fade while there is more beyond them (``ScrollEdgeFades``' sideways twin).
private struct SidewaysEdgeFades: ViewModifier {
    @State private var before = false
    @State private var after = false

    private struct Ends: Equatable {
        var before: Bool
        var after: Bool
    }

    func body(content: Content) -> some View {
        let length = ScrollEdgeFades.length
        content
            .onScrollGeometryChange(for: Ends.self) { geo in
                let ends = ScrollEdgeFades.edges(offset: geo.contentOffset.x + geo.contentInsets.leading,
                                                 content: geo.contentSize.width + geo.contentInsets.leading + geo.contentInsets.trailing,
                                                 visible: geo.containerSize.width)
                return Ends(before: ends.above, after: ends.below)
            } action: { _, ends in
                before = ends.before
                after = ends.after
            }
            .mask {
                HStack(spacing: 0) {
                    LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: .trailing)
                        .frame(width: before ? length : 0)
                    Color.black
                    LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: after ? length : 0)
                }
                .animation(.easeOut(duration: 0.15), value: before)
                .animation(.easeOut(duration: 0.15), value: after)
            }
    }
}

extension View {
    fileprivate func sidewaysEdgeFades() -> some View { modifier(SidewaysEdgeFades()) }
}

/// A mouse's (or a trackpad's) vertical scroll moves the sideways strip it is in (round 23 §2, a fine pointer: the Mac,
/// an iPad with a mouse): a pan that takes scroll events only — never a touch — added to the scroll view it sits in.
private struct WheelScrollsSideways: UIViewRepresentable {
    func makeUIView(context: Context) -> WheelView { WheelView() }
    func updateUIView(_ view: WheelView, context: Context) {}

    final class WheelView: UIView, UIGestureRecognizerDelegate {
        private weak var scroller: UIScrollView?
        private lazy var wheel: UIPanGestureRecognizer = {
            let pan = UIPanGestureRecognizer(target: self, action: #selector(scrolled(_:)))
            pan.allowedScrollTypesMask = .all
            pan.allowedTouchTypes = []
            pan.delegate = self
            return pan
        }()
        private var last: CGPoint = .zero

        override func didMoveToWindow() {
            super.didMoveToWindow()
            var view = superview
            while let v = view, !(v is UIScrollView) { view = v.superview }
            guard let found = view as? UIScrollView, found !== scroller else { return }
            scroller?.removeGestureRecognizer(wheel)
            scroller = found
            found.addGestureRecognizer(wheel)
        }

        @objc private func scrolled(_ pan: UIPanGestureRecognizer) {
            guard let scroller else { return }
            let t = pan.translation(in: scroller)
            if pan.state == .began { last = .zero }
            let dx = t.x - last.x, dy = t.y - last.y
            last = t
            // Only a vertical scroll: a sideways one is the scroll view's own.
            guard abs(dy) > abs(dx) else { return }
            let most = max(0, scroller.contentSize.width - scroller.bounds.width)
            scroller.contentOffset.x = min(most, max(0, scroller.contentOffset.x - dy))
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }
}

/// What rides with the message (round 10 §3.4, round 23 §2), in its order inside the capsule over the text line: the
/// reply, the note it answers, the card or the picture, then why the last try didn't go.
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
