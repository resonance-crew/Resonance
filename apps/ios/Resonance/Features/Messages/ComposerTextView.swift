import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The composer's text (round 22 §4.3), a `UITextView` of its own rather than SwiftUI's field: one line at
/// rest, growing to five and then scrolling — the box running right up to the capsule's pen line (its padding
/// inside it), its top and bottom edges fading out over 14 pt while there is text beyond them (`onFades`, read
/// from the scroll offset: the host masks it, so the fade itself is the edge, v2) — and, grown over the thread
/// (option C), the same view taller, so the caret, its undo, an input method's marked text (zhuyin) and the
/// keyboard all stay.
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
    /// Whether there is text beyond the box's top and its bottom edge (each fades out while there is).
    var onFades: (Bool, Bool) -> Void = { _, _ in }

    static let fade: CGFloat = 14

    /// The padding inside the box, above and below the text: the capsule's whole padding — the box is the capsule's
    /// height, so the text scrolls right to the pen line.
    static func inset(_ metrics: ComposerText) -> CGFloat { metrics.padding }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> ComposerTextBox {
        let box = ComposerTextBox()
        box.textView.delegate = context.coordinator
        box.textView.onReturn = { context.coordinator.parent.onReturn() }
        box.textView.onPastePictures = { context.coordinator.parent.onPastePictures($0) }
        box.onFades = { top, bottom in context.coordinator.parent.onFades(top, bottom) }
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

/// The text view inside its box: the placeholder over it while it is empty; it says when there is text beyond an
/// edge (`onFades`), for the host's mask to fade it out there.
final class ComposerTextBox: UIView {
    let textView = ComposerUITextView()
    let placeholder = UILabel()
    private let content = UIView()
    var metrics: ComposerText?
    var onFades: ((Bool, Bool) -> Void)?
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
        // The text's own size settles after a layout: the fades follow it (more lines below, or none any more).
        sizeWatch = textView.observe(\.contentSize, options: [.new]) { [weak self] _, _ in
            MainActor.assumeIsolated { self?.updateFades(force: true) }
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (box: ComposerTextBox, _) in
            box.placeholder.textColor = Tokens.UI.textMuted
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

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

    /// The fade over each edge shows only while there is text beyond it: said when that changes.
    func updateFades(force: Bool = false) {
        let offset = textView.contentOffset.y
        let top = offset > 0.5
        let bottom = offset + textView.bounds.height < textView.contentSize.height - 0.5
        guard force || top != shownFades.top || bottom != shownFades.bottom else { return }
        let changed = top != shownFades.top || bottom != shownFades.bottom
        shownFades = (top, bottom)
        guard changed else { return }
        // Not inside SwiftUI's update of the view: the host's state changes after it.
        DispatchQueue.main.async { [weak self] in self?.onFades?(top, bottom) }
    }
}

/// The composer text's fades (round 22 v2): an alpha mask over the text box, clear over 14 pt at an edge with
/// text beyond it, so the words fade out right at the capsule's pen line — never paper laid over them.
struct ComposerFadeMask: View {
    let top: Bool
    let bottom: Bool

    var body: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom)
                .frame(height: top ? ComposerTextView.fade : 0)
            Color.black
            LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom)
                .frame(height: bottom ? ComposerTextView.fade : 0)
        }
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
