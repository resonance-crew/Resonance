import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The composer's text (round 22 §4.3), a `UITextView` of its own rather than SwiftUI's field: one line at
/// rest, growing to five and then scrolling, the box running from the capsule's edge (its padding inside it),
/// its top and bottom edges fading over 14 pt while there is text beyond them (read from the scroll offset), and — grown over the thread (option C) — the same
/// view taller, so the caret, its undo, an input method's marked text (zhuyin) and the keyboard all stay.
/// Says how many lines it runs to (⤢ shows from the third), sends on a hardware Return (Shift-Return is a new
/// line; an input method composing keeps its Return), and hands pasted pictures to the composer.
struct ComposerTextView: UIViewRepresentable {
    @Binding var text: String
    @Binding var focused: Bool
    let placeholder: String
    let accessibilityLabel: String
    let metrics: ComposerText
    /// Grown over the thread: the text box's height (else as tall as its lines, up to five).
    var expandedHeight: CGFloat?
    var onLines: (Int) -> Void = { _ in }
    var onReturn: () -> Void = {}
    var onPastePictures: ([Data]) -> Void = { _ in }

    static let fade: CGFloat = 14
    /// The box stops this far inside the capsule's pen line (its wobble swings about 2): the fades end on the
    /// paper, never over the line. The rest of the capsule's padding is inside the box, where the text scrolls.
    static let edge: CGFloat = 4

    /// The padding inside the box, above and below the text.
    static func inset(_ metrics: ComposerText) -> CGFloat { max(0, metrics.padding - edge) }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> ComposerTextBox {
        let box = ComposerTextBox()
        box.textView.delegate = context.coordinator
        box.textView.onReturn = { context.coordinator.parent.onReturn() }
        box.textView.onPastePictures = { context.coordinator.parent.onPastePictures($0) }
        apply(box, initial: true)
        return box
    }

    func updateUIView(_ box: ComposerTextBox, context: Context) {
        context.coordinator.parent = self
        apply(box, initial: false)
        let view = box.textView
        // Never under an input method's marked text: setting it would end the composition.
        if view.text != text, view.markedTextRange == nil {
            view.attributedText = NSAttributedString(string: text, attributes: Self.attributes(metrics))
            box.textChanged()
        }
        if focused, !view.isFirstResponder, view.window != nil {
            DispatchQueue.main.async { if self.focused, !view.isFirstResponder { view.becomeFirstResponder() } }
        } else if !focused, view.isFirstResponder {
            DispatchQueue.main.async { if !self.focused, view.isFirstResponder { view.resignFirstResponder() } }
        }
    }

    private func apply(_ box: ComposerTextBox, initial: Bool) {
        let view = box.textView
        let attributes = Self.attributes(metrics)
        if initial || box.metrics?.font != metrics.font || box.metrics?.lineHeight != metrics.lineHeight || box.metrics?.padding != metrics.padding {
            box.metrics = metrics
            let inset = Self.inset(metrics)
            view.textContainerInset = UIEdgeInsets(top: inset, left: 0, bottom: inset, right: 0)
            box.setNeedsLayout()
            view.typingAttributes = attributes
            if !view.text.isEmpty, view.markedTextRange == nil {
                view.attributedText = NSAttributedString(string: view.text, attributes: attributes)
            }
            box.placeholder.font = metrics.font
        }
        box.placeholder.text = placeholder
        view.accessibilityLabel = accessibilityLabel
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView box: ComposerTextBox, context: Context) -> CGSize? {
        let width = proposal.width ?? box.bounds.width
        guard width > 0 else { return nil }
        // The box runs from the capsule's edge: its padding is inside it, where the text scrolls under the fades.
        let inset = Self.inset(metrics)
        let text = box.contentHeight(width: width) - 2 * inset
        let lines = Self.lines(height: text, metrics: metrics)
        DispatchQueue.main.async { context.coordinator.report(lines) }
        let shown = expandedHeight.map { max(metrics.lineHeight, $0) }
            ?? min(text, Self.height(lines: ComposerMetrics.maxLines, metrics: metrics))
        return CGSize(width: width, height: shown + 2 * inset)
    }

    /// How many lines a text box `height` tall holds.
    static func lines(height: CGFloat, metrics: ComposerText) -> Int {
        max(1, Int(((height + metrics.lineSpacing) / (metrics.lineHeight + metrics.lineSpacing)).rounded()))
    }

    /// The height of `lines` lines.
    static func height(lines: Int, metrics: ComposerText) -> CGFloat {
        CGFloat(lines) * metrics.lineHeight + CGFloat(max(0, lines - 1)) * metrics.lineSpacing
    }

    /// The text's attributes: the face at the person's size, its lines one height (a line of Chinese, in the
    /// taller fallback face, no taller than one of Latin), the glyphs centred on it.
    static func attributes(_ metrics: ComposerText) -> [NSAttributedString.Key: Any] {
        let paragraph = NSMutableParagraphStyle()
        paragraph.minimumLineHeight = metrics.lineHeight
        paragraph.maximumLineHeight = metrics.lineHeight
        paragraph.lineSpacing = metrics.lineSpacing
        return [
            .font: metrics.font,
            .foregroundColor: Tokens.UI.text,
            .paragraphStyle: paragraph,
            .baselineOffset: (metrics.lineHeight - metrics.font.lineHeight) / 2,
        ]
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: ComposerTextView
        private var lastLines = 0

        init(_ parent: ComposerTextView) {
            self.parent = parent
        }

        func report(_ lines: Int) {
            guard lines != lastLines else { return }
            lastLines = lines
            parent.onLines(lines)
        }

        func textViewDidChange(_ textView: UITextView) {
            (textView as? ComposerUITextView)?.box?.textChanged()
            if parent.text != textView.text { parent.text = textView.text }
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            if !parent.focused { parent.focused = true }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            if parent.focused { parent.focused = false }
        }

        func scrollViewDidScroll(_ scrollView: UIScrollView) {
            (scrollView as? ComposerUITextView)?.box?.updateFades()
        }
    }
}

/// The text view inside its box: the placeholder over it while it is empty, the fades masking its edges.
final class ComposerTextBox: UIView {
    let textView = ComposerUITextView()
    let placeholder = UILabel()
    /// What the fades lie over: the text and its placeholder (the box itself is SwiftUI's to lay out and clip).
    private let content = UIView()
    var metrics: ComposerText?
    /// The fades: the capsule's own paper coming on over 14 at each inner edge — on solid paper, the same as the
    /// text's alpha going out (a layer mask on the text didn't take under SwiftUI's host).
    private let topFade = CAGradientLayer()
    private let bottomFade = CAGradientLayer()
    private var shownFades: (top: Bool, bottom: Bool) = (false, false)
    private var sizeWatch: NSKeyValueObservation?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        textView.backgroundColor = .clear
        textView.textContainerInset = .zero
        textView.textContainer.lineFragmentPadding = 0
        textView.isScrollEnabled = true
        textView.showsVerticalScrollIndicator = false
        textView.alwaysBounceVertical = false
        textView.tintColor = Tokens.UI.terracotta
        textView.adjustsFontForContentSizeCategory = false
        textView.textDragInteraction?.isEnabled = true
        addSubview(content)
        content.addSubview(textView)
        textView.box = self
        placeholder.textColor = Tokens.UI.textMuted
        placeholder.isAccessibilityElement = false
        placeholder.isUserInteractionEnabled = false
        content.addSubview(placeholder)
        for fade in [topFade, bottomFade] {
            fade.startPoint = CGPoint(x: 0.5, y: 0)
            fade.endPoint = CGPoint(x: 0.5, y: 1)
            fade.opacity = 0
            content.layer.addSublayer(fade)
        }
        paintFades()
        // The text's own size settles after a layout: the fades follow it (more lines below, or none any more).
        sizeWatch = textView.observe(\.contentSize, options: [.new]) { [weak self] _, _ in
            MainActor.assumeIsolated { self?.updateFades(force: true) }
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (box: ComposerTextBox, _) in
            box.placeholder.textColor = Tokens.UI.textMuted
            box.paintFades()
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        paintFades()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        content.frame = bounds
        textView.frame = content.bounds
        let line = metrics?.lineHeight ?? 22
        let pad = metrics.map(ComposerTextView.inset) ?? 0
        placeholder.frame = CGRect(x: 0, y: pad, width: bounds.width, height: min(max(0, bounds.height - pad), line))
        updateFades(force: true)
    }

    /// The text's height at `width`, all its lines and the padding above and below them.
    func contentHeight(width: CGFloat) -> CGFloat {
        let size = textView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return max((metrics?.lineHeight ?? 0) + 2 * (metrics.map(ComposerTextView.inset) ?? 0), ceil(size.height))
    }

    func textChanged() {
        placeholder.isHidden = !textView.text.isEmpty
        updateFades()
    }

    /// The fade over each inner edge shows only while there is text beyond it.
    func updateFades(force: Bool = false) {
        let offset = textView.contentOffset.y
        let top = offset > 0.5
        let bottom = offset + textView.bounds.height < textView.contentSize.height - 0.5
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let h = min(ComposerTextView.fade, content.bounds.height / 2)
        topFade.frame = CGRect(x: 0, y: 0, width: content.bounds.width, height: h)
        bottomFade.frame = CGRect(x: 0, y: content.bounds.height - h, width: content.bounds.width, height: h)
        if force || top != shownFades.top || bottom != shownFades.bottom {
            shownFades = (top, bottom)
            topFade.opacity = top ? 1 : 0
            bottomFade.opacity = bottom ? 1 : 0
        }
        CATransaction.commit()
    }

    /// The fades in the capsule's paper, for the scheme it is drawn in.
    func paintFades() {
        let paper = Tokens.UI.cream.resolvedColor(with: traitCollection)
        topFade.colors = [paper.cgColor, paper.withAlphaComponent(0).cgColor]
        bottomFade.colors = [paper.withAlphaComponent(0).cgColor, paper.cgColor]
    }
}

/// The composer's `UITextView`: a hardware Return sends (unless Shift is held, or an input method is
/// composing), and a picture on the pasteboard is handed to the composer rather than pasted as text.
final class ComposerUITextView: UITextView {
    weak var box: ComposerTextBox?
    var onReturn: () -> Void = {}
    var onPastePictures: ([Data]) -> Void = { _ in }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        if let key = presses.first?.key, key.keyCode == .keyboardReturnOrEnter || key.keyCode == .keypadEnter,
           ComposerKeys.sends(shift: key.modifierFlags.contains(.shift), composing: markedTextRange != nil) {
            onReturn()
            return
        }
        super.pressesBegan(presses, with: event)
    }

    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        if action == #selector(paste(_:)), Self.pasteboardPictures() { return true }
        return super.canPerformAction(action, withSender: sender)
    }

    override func paste(_ sender: Any?) {
        guard Self.pasteboardPictures() else { return super.paste(sender) }
        let pictures = (UIPasteboard.general.images ?? []).compactMap { $0.pngData() }
        if pictures.isEmpty { super.paste(sender) } else { onPastePictures(pictures) }
    }

    private static func pasteboardPictures() -> Bool {
        UIPasteboard.general.hasImages
    }
}
