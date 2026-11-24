import SwiftUI

// MARK: - Modal

extension View {
    /// The web's Modal: a wobbly card on the warm backdrop, over the whole
    /// screen (tab bar, status bar and home indicator included). There is no ✕:
    /// a modal's ways out are the buttons at its foot (one with nothing else
    /// there ends in a ``ModalCloseButton``), a tap beside the card, and
    /// VoiceOver's escape — none of them while `dismissible` is false (an
    /// action in flight). `closeLabel` is what the backdrop says it does to
    /// VoiceOver: the modal's own cancel or close words.
    ///
    /// `clipsToPaper` (round 27, the passages' dialog): what the card holds is clipped to the paper's own wobble and the
    /// pen line drawn over it, so a row's ink may run past the words' inset to the paper's edge (``ModalPaper``) — the
    /// web's Modal clipping its scroll body to the paper (`useModalPaper()`). Off, as every other dialog has it.
    ///
    /// `paperInset`: the content's inset from the paper's frame, a side — ``ModalPaper/inset`` (28) for every dialog but
    /// the tap lists' family, which stands ``ModalPaper/listInset`` (24) in (round 33 §Q2). Its children read it as
    /// ``EnvironmentValues/modalPaperInset``.
    public func organicModal<Card: View>(isPresented: Binding<Bool>, seed: Double = 17, maxWidth: CGFloat = 440,
                                         closeLabel: String, dismissible: Bool = true, clipsToPaper: Bool = false,
                                         paperInset: CGFloat = ModalPaper.inset,
                                         @ViewBuilder content: @escaping () -> Card) -> some View {
        modifier(OrganicModalPresenter(isPresented: isPresented, seed: seed, maxWidth: maxWidth,
                                       closeLabel: closeLabel, dismissible: dismissible, clipsToPaper: clipsToPaper,
                                       paperInset: paperInset, card: content))
    }

    /// ConfirmModal: title, a line of explanation, then cancel and the verb at
    /// the bottom right (``ModalActions``). No button draws a pen line: cancel
    /// is the tonal pill, the verb a solid fill — red when it can't be undone
    /// (`destructive`), saying `workingLabel` (the bare verb) while `busy`. A confirm given no `busy`
    /// closes at once and never works in place: its verb keeps its own words' size (round 21). `error` shows under the
    /// text in the danger ink when the action didn't go through. `titlePending`: the title's words are
    /// still being looked for — its line is kept, unwritten, rather than words
    /// that change under the reader (the web's `data-pending`).
    public func organicConfirm(isPresented: Binding<Bool>, title: String, message: String, cancelLabel: String,
                               confirmLabel: String, workingLabel: String? = nil, closeLabel: String, busy: Bool? = nil,
                               error: String? = nil, destructive: Bool = false, titlePending: Bool = false, seed: Double = 67,
                               onConfirm: @escaping () -> Void) -> some View {
        organicModal(isPresented: isPresented, seed: seed, maxWidth: 400, closeLabel: closeLabel, dismissible: busy != true) {
            OrganicConfirmContent(title: title, message: message, cancelLabel: cancelLabel, confirmLabel: confirmLabel,
                                  workingLabel: workingLabel, busy: busy, error: error, destructive: destructive,
                                  titlePending: titlePending,
                                  onCancel: { isPresented.wrappedValue = false }, onConfirm: onConfirm)
        }
    }
}

extension View {
    /// A one-exit notice: something happened that leaves nothing to choose (an action the server
    /// refused, the card as it was) — its heading, a line saying what happened, and the tonal close
    /// at the bottom right (``ModalCloseButton``), never a cancel beside a retry. The web's Modal with
    /// `closeButton`, Android's OrganicAlert.
    public func organicNotice(isPresented: Binding<Bool>, title: String, message: String, closeLabel: String,
                              seed: Double = 67) -> some View {
        organicModal(isPresented: isPresented, seed: seed, maxWidth: 400, closeLabel: closeLabel) {
            OrganicNoticeContent(title: title, message: message, closeLabel: closeLabel) { isPresented.wrappedValue = false }
        }
    }
}

/// A one-exit notice's inside: heading, the line, the close at the bottom right.
public struct OrganicNoticeContent: View {
    let title: String
    let message: String
    let closeLabel: String
    let onClose: () -> Void

    public init(title: String, message: String, closeLabel: String, onClose: @escaping () -> Void) {
        self.title = title
        self.message = message
        self.closeLabel = closeLabel
        self.onClose = onClose
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(title).padding(.bottom, 8)
            ModalBody(message)
            ModalCloseButton(closeLabel, action: onClose)
        }
    }
}

/// ConfirmModal's inside, for hosts that compose their own modal.
public struct OrganicConfirmContent: View {
    let title: String
    let message: String
    let cancelLabel: String
    let confirmLabel: String
    var workingLabel: String?
    var busy: Bool?
    var error: String?
    var destructive: Bool
    var titlePending: Bool
    let onCancel: () -> Void
    let onConfirm: () -> Void

    public init(title: String, message: String, cancelLabel: String, confirmLabel: String, workingLabel: String? = nil,
                busy: Bool? = nil, error: String? = nil, destructive: Bool = false, titlePending: Bool = false,
                onCancel: @escaping () -> Void, onConfirm: @escaping () -> Void) {
        self.title = title
        self.message = message
        self.cancelLabel = cancelLabel
        self.confirmLabel = confirmLabel
        self.workingLabel = workingLabel
        self.busy = busy
        self.error = error
        self.destructive = destructive
        self.titlePending = titlePending
        self.onCancel = onCancel
        self.onConfirm = onConfirm
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Pending: its line kept, unwritten (and unread by VoiceOver) until the words are known.
            ModalTitle(title)
                .opacity(titlePending ? 0 : 1)
                .accessibilityHidden(titlePending)
                .animation(.easeOut(duration: 0.2), value: titlePending)
                .padding(.bottom, 8)
            ModalBody(message).padding(.bottom, error == nil ? 18 : 10)
            if let error {
                ModalError(error).padding(.bottom, 14)
            }
            ModalActions(busy: busy) {
                OrganicButton(cancelLabel, variant: .tonal, size: .sm, action: onCancel)
            } verb: {
                OrganicButton(confirmLabel, variant: destructive ? .danger : .solid, size: .sm, action: onConfirm)
                    .workingLabel(workingLabel)
            }
        }
    }
}

/// A dialog's heading: Playfair 20, bold.
public struct ModalTitle: View {
    let text: String
    public init(_ text: String) { self.text = text }
    public var body: some View {
        Text(text)
            .font(AppFonts.heading(20))
            .foregroundStyle(Tokens.text)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A dialog's explanation: 14 on a 1.6 line, muted.
public struct ModalBody: View {
    let text: String
    var color: Color
    public init(_ text: String, color: Color = Tokens.textMuted) {
        self.text = text
        self.color = color
    }
    public var body: some View {
        CSSText(text, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.6, color: UIColor(color))
    }
}

/// An action that didn't go through: 13pt in the danger ink.
public struct ModalError: View {
    let text: String
    public init(_ text: String) { self.text = text }
    public var body: some View {
        Text(text)
            .font(AppFonts.body(13))
            .foregroundStyle(Tokens.danger)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isStaticText)
    }
}

/// A dialog's foot when it asks for a choice (ModalActions.tsx): right-aligned in scanning order —
/// the way out (`cancel`, the tonal pill) then the verb (solid, or danger), 10 apart — at every
/// width. A pair too wide for one row (a narrow phone, long English words, a large text size)
/// stacks rather than squeezing its labels: the verb on top, the way out under it, both still at
/// the right (Material's stacked dialog buttons, iOS's stacked alerts). Each button is at least
/// 44pt tall, a finger's. `busy` (the action on its way, round 5 B6): the verb shows its pen loop
/// at full colour (``OrganicButton/loading(_:)``), the way out is disabled (its usual fade), and
/// neither takes a tap, VoiceOver's included. A foot given a `busy` at all (false too) has a verb that
/// can be busy, as wide at rest as at work (round 21); one given none closes before anything is asked.
public struct ModalActions<Cancel: View, Verb: View>: View {
    let canBeBusy: Bool
    let busy: Bool
    let cancel: Cancel
    let verb: Verb

    public init(busy: Bool? = nil, @ViewBuilder cancel: () -> Cancel, @ViewBuilder verb: () -> Verb) {
        canBeBusy = busy != nil
        self.busy = busy == true
        self.cancel = cancel()
        self.verb = verb()
    }

    public var body: some View {
        let way = cancel.disabled(busy)
        let doing = verb.environment(\.organicButtonLoading, busy).environment(\.organicButtonCanBeBusy, canBeBusy)
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                way
                doing
            }
            VStack(alignment: .trailing, spacing: 10) {
                doing
                way
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .environment(\.organicButtonMinHeight, ModalMetrics.minButtonHeight)
        .environment(\.organicButtonsHeld, busy)
        .allowsHitTesting(!busy)
        .animation(.easeOut(duration: 0.16), value: busy)
    }
}

public enum ModalMetrics {
    /// A dialog's buttons are never shorter than a finger needs (the small pills are about 38pt).
    public static let minButtonHeight: CGFloat = 44
    /// A button that can't be pressed yet (the way out while the verb works): the disabled fade.
    public static let disabledOpacity = 0.45
}

/// The way out of a modal with nothing else at its foot (a list to look through, a note just
/// sent, a thank-you, "that didn't go through"): its close words as a small tonal pill at the
/// bottom right, 18 under the content (ModalCloseRow) — where a choice's cancel and verb stand
/// (``ModalActions``, after the body's 18), so every dialog ends at the same corner. Android's
/// ModalCloseButton.
public struct ModalCloseButton: View {
    let label: String
    let action: () -> Void

    public init(_ label: String, action: @escaping () -> Void) {
        self.label = label
        self.action = action
    }

    public var body: some View {
        OrganicButton(label, variant: .tonal, size: .sm, action: action)
            .environment(\.organicButtonMinHeight, ModalMetrics.minButtonHeight)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.top, 18)
    }
}

struct OrganicModalPresenter<Card: View>: ViewModifier {
    @Binding var isPresented: Bool
    let seed: Double
    let maxWidth: CGFloat
    let closeLabel: String
    let dismissible: Bool
    let clipsToPaper: Bool
    let paperInset: CGFloat
    let card: () -> Card
    /// The cover itself; it comes and goes without UIKit's slide, and the
    /// stage inside fades and pops like the web's dialog.
    @State private var coverShown = false

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $coverShown) {
                OrganicModalStage(isPresented: $isPresented, coverShown: $coverShown, seed: seed, maxWidth: maxWidth,
                                  closeLabel: closeLabel, dismissible: dismissible, clipsToPaper: clipsToPaper,
                                  paperInset: paperInset, card: card)
                    .presentationBackground(.clear)
            }
            .onChange(of: isPresented, initial: true) { _, show in
                if show && !coverShown {
                    withTransaction(\.disablesAnimations, true) { coverShown = true }
                }
            }
    }
}

/// Whether an organic modal is up (round 16 review F8): the app softens the screen under it by 2 pt
/// (``View/softenedUnderModals()`` on its root), as the web's Modal backdrop blurs what it covers — the
/// press layer over a thread does the same (``View/softened(_:)``), so a confirm a tap after it looks alike.
/// Counted, as one modal can open over another's close.
@MainActor @Observable public final class ModalBackdrop {
    public static let shared = ModalBackdrop()
    public private(set) var depth = 0
    public var isUp: Bool { depth > 0 }

    func raise() { depth += 1 }
    func lower() { depth = max(0, depth - 1) }
}

/// How far the screen under a modal or the press layer is softened (the web's `blur(2px)`).
public nonisolated enum Soften {
    public static let radius: CGFloat = 2
    public static let duration: Double = 0.15
}

extension View {
    /// Softens this view by ``Soften/radius`` while `on`, fading in and out with the scrim over it.
    public func softened(_ on: Bool) -> some View {
        animation(.easeOut(duration: Soften.duration)) { $0.blur(radius: on ? Soften.radius : 0) }
    }

    /// The app's root: softened while an organic modal is up over it (``ModalBackdrop``).
    public func softenedUnderModals() -> some View {
        modifier(SoftenedUnderModals())
    }
}

private struct SoftenedUnderModals: ViewModifier {
    func body(content: Content) -> some View {
        content.softened(ModalBackdrop.shared.isUp)
    }
}

struct OrganicModalStage<Card: View>: View {
    @Binding var isPresented: Bool
    @Binding var coverShown: Bool
    let seed: Double
    let maxWidth: CGFloat
    let closeLabel: String
    let dismissible: Bool
    let clipsToPaper: Bool
    var paperInset: CGFloat = ModalPaper.inset
    let card: () -> Card
    @State private var shown = false
    /// This modal counts toward ``ModalBackdrop`` (from its appearing to its closing).
    @State private var raised = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Over the whole screen, the status bar and the home indicator too, so no band
                // of another brightness is left at either end. For VoiceOver it is the way out,
                // read after the card (whose ✕ it used to be).
                Tokens.scrim
                    .ignoresSafeArea()
                    .opacity(shown ? 1 : 0)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: close)
                    .accessibilityElement()
                    .accessibilityLabel(closeLabel)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction(.default, close)
                    .accessibilityHidden(!dismissible)
                // The backdrop scrolls when the dialog is taller than the screen
                // (the web's overflow-y: auto); a tap beside the card closes it.
                ScrollView {
                    OrganicModalCard(seed: seed, maxWidth: maxWidth, clipsToPaper: clipsToPaper, inset: paperInset, content: card)
                        // What the stage leaves the card (round 32 §P1): a dialog that must never outgrow it — the
                        // passages' — caps its own scroll by it, so this backdrop never has to scroll.
                        .environment(\.modalRoom, ModalPaper.room(stage: geo.size.height))
                        .contentShape(Rectangle())
                        .onTapGesture {}
                        .scaleEffect(shown ? 1 : 0.96)
                        .opacity(shown ? 1 : 0)
                        .padding(ModalPaper.margin)
                        .frame(maxWidth: .infinity, minHeight: geo.size.height)
                        .contentShape(Rectangle())
                        .onTapGesture(perform: close)
                }
                .scrollBounceBehavior(.basedOnSize)
                .scrollIndicators(.hidden)
                .accessibilitySortPriority(1)
            }
            // VoiceOver stays inside (the card and the backdrop's close), and its escape closes.
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal)
            .accessibilityAction(.escape, close)
            .onEscapeKey(close)
        }
        .onAppear {
            withAnimation(.timingCurve(0.2, 0.9, 0.3, 1.05, duration: 0.28)) { shown = true }
            if !raised {
                raised = true
                ModalBackdrop.shared.raise()
            }
        }
        .onChange(of: isPresented) { _, open in
            guard !open else { return }
            // The screen under it sharpens as the scrim lifts.
            lowerBackdrop()
            withAnimation(.easeIn(duration: 0.16)) { shown = false } completion: {
                withTransaction(\.disablesAnimations, true) { coverShown = false }
            }
        }
        .onDisappear(perform: lowerBackdrop)
    }

    private func lowerBackdrop() {
        guard raised else { return }
        raised = false
        ModalBackdrop.shared.lower()
    }

    private func close() {
        if dismissible { isPresented = false }
    }
}

/// The dialog card: card paper with grain in the wobbly outline — radius 26,
/// the wobble 2.5% of its short side, three or four turns across and five or
/// six down — and the ink border. `clipsToPaper`: the content is clipped to the
/// paper and the border drawn over it (``View/organicModal(isPresented:seed:maxWidth:closeLabel:dismissible:clipsToPaper:content:)``).
struct OrganicModalCard<Content: View>: View {
    let seed: Double
    let maxWidth: CGFloat
    var clipsToPaper = false
    var inset: CGFloat = ModalPaper.inset
    let content: () -> Content

    var body: some View {
        let shape = ModalShape(seed: seed)
        let card = VStack(alignment: .leading, spacing: 0) { content() }
            .environment(\.modalPaperInset, inset)
            .padding(.horizontal, inset)
            .padding(.vertical, ModalPaper.insetV)
            .frame(maxWidth: maxWidth, alignment: .leading)
        if clipsToPaper {
            // The clip's own frame stands ``ModalPaper/bleed`` past the paper's on every side, the paper drawn inside it and
            // the layout given back: SwiftUI clips a platform view inside (the list's UIScrollView) to the clipped view's
            // frame as well as to its shape, which would cut a row's ink square at the frame where the wobble swings out.
            let paper = InsetShape(base: shape, inset: ModalPaper.bleed)
            card
                .environment(\.modalPaperClips, true)
                .padding(ModalPaper.bleed)
                .background {
                    paper.fill(Tokens.cardBg)
                    GrainLayer(shape: paper, mode: .tile, opacity: 0.3, tile: "grain-card")
                }
                .clipShape(paper)
                // The pen line over the ink, whole: the web's border above its clipped body.
                .overlay {
                    paper.stroke(Tokens.modalBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                        .allowsHitTesting(false)
                }
                .padding(-ModalPaper.bleed)
                .accessibilityElement(children: .contain)
        } else {
            card
                .background {
                    shape.fill(Tokens.cardBg)
                    GrainLayer(shape: shape, mode: .tile, opacity: 0.3, tile: "grain-card")
                    shape.stroke(Tokens.modalBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                }
                .accessibilityElement(children: .contain)
        }
    }
}

/// A dialog's paper as its children see it: the words' inset from the paper's frame, and how far past the frame a
/// child's ink may reach so that, clipped to the wobble (which swings out as well as in), it meets the pen line
/// everywhere. A child reaches only inside an ``View/organicModal(isPresented:seed:maxWidth:closeLabel:dismissible:clipsToPaper:content:)``
/// that clips (``EnvironmentValues/modalPaperClips``); anywhere else its ink would show past the line.
public nonisolated enum ModalPaper {
    /// The content's inset from the paper's frame, a side.
    public static let inset: CGFloat = 28
    /// The tap lists' family's (who resonated — a reader's and the author's —, who picked a sentence, the passages'),
    /// a side (round 33 §Q2, the owner: 「左右 padding 稍微再收窄（28→24）」): only theirs, every other dialog keeps ``inset``.
    public static let listInset: CGFloat = 24
    /// Past the frame, a side: more than the wobble's widest swing out at a dialog's sizes.
    public static let bleed: CGFloat = 16
    /// The content's inset from the paper's frame, above and below.
    public static let insetV: CGFloat = 32
    /// The backdrop's margin round the paper, a side.
    public static let margin: CGFloat = 12
    /// The height a dialog's content may take on a stage `stage` tall (the backdrop's margins and the paper's own air
    /// taken off): what a dialog that must always fit (the passages', round 32 §P1) caps itself by.
    public static func room(stage: CGFloat) -> CGFloat { max(0, stage - 2 * margin - 2 * insetV) }
    /// The paper's outline in `rect` (the frame), as the dialog seeded `seed` draws it.
    public static func outline(in rect: CGRect, seed: Double) -> Path { ModalShape(seed: seed).path(in: rect) }
}

extension EnvironmentValues {
    /// The modal this view stands in clips its content to the paper (``ModalPaper``).
    @Entry public var modalPaperClips = false
    /// The content's inset from the paper's frame in the modal this view stands in, a side (``ModalPaper/inset`` unless
    /// the modal says otherwise).
    @Entry public var modalPaperInset: CGFloat = ModalPaper.inset
    /// The height the modal's stage leaves this dialog's content (``ModalPaper/room(stage:)``); nil outside a modal.
    @Entry public var modalRoom: CGFloat? = nil
}

nonisolated struct ModalShape: Shape {
    let seed: Double

    func path(in rect: CGRect) -> Path {
        let m = Double(min(rect.width, rect.height)) * 0.025
        return WobRectShape(radius: 26, seed: seed, mag: m, options: WobRectOptions(
            curve: 0.6, cornerJitter: 0.9, cornerOffset: 5, segmentsH: .range(3, 4), segmentsV: .range(5, 6)))
            .path(in: rect)
    }
}
