import DesignSystem
import ResonanceKit
import SwiftUI

/// The publish step's tags (round 16 §1, and its review's S1 / S2 / N6): the section's label on its own line,
/// as 卡片類型's below it; under it the chosen tags wrapping like words — lg outlined pills, quiet (half the
/// accent's light wash on the paper, the soft pen, words at 500, a muted ✕), each ✕ a 44 × 44 target named for
/// its tag — and under them the field, the chat composer's capsule (``TagEntryCapsule``): the text, then one end segment
/// behind a wavy seam that asks the model for tags (✦ 「AI 建議」) with nothing typed, or adds the word
/// typed (＋ 「新增」). Return, a comma (，、 too) or the segment adds; on a hardware keyboard Backspace in
/// the empty field takes the last tag back (never on the soft keyboard, where it is too easy to hit). An
/// input method still composing (zhuyin's underlined candidate) is not a word yet: the segment keeps its
/// suggest face until it ends, and a tap on it then ends it first and adds the word. The field never moves
/// under the caret: when anything above it changes height while the field is in use — the tags wrapping or
/// unwrapping, the first one bringing their row, the preview's own tag row coming with the model's first tags —
/// the page scrolls by as much (`onShift`; the field's top is measured in the step's content, ``PublishStep/space``).
/// The preview card above stays a pure preview. The error line under it is the field's.
struct TagField<Label: View>: View {
    let tags: [String]
    @Binding var draft: String
    let placeholder: String
    let suggesting: Bool
    let error: String?
    let onRemove: (String) -> Void
    let onAdd: () -> Void
    let onSuggest: () -> Void
    /// The row of tags above the field changed height by this much while the field was in use: the page
    /// scrolls by it, so the field stays where it was on the screen.
    var onShift: (CGFloat) -> Void = { _ in }
    @ViewBuilder let label: Label

    @FocusState private var focused: Bool
    /// An input method is composing in the field (marked text): nothing typed is a word yet.
    @State private var composing = false
    /// The segment was used and what it does may still change the row (the model's tags on their way).
    @State private var fromSegment = false
    /// The field's top in the step's content (``PublishStep/space``), as last laid out.
    @State private var fieldTop: CGFloat?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var ready: Bool { TagInput.ready(draft: draft, composing: composing) }

    var body: some View {
        VStack(alignment: .leading, spacing: PublishStep.labelGap) {
            // The label alone on its line (review S1: the pills once wrapped under it, a hanging indent), the
            // tags 8 under it; with none, their row takes no room and the label stands over the field.
            VStack(alignment: .leading, spacing: 0) {
                label
                FlowRow(spacing: 8, lineSpacing: 8) {
                    ForEach(tags, id: \.self) { tag in
                        TagPill(tag, fill: Self.pillFill, size: .lg, outlined: true, quiet: true,
                                removeLabel: L10n.Write.tagsRemoveLabel(tag: tag)) { onRemove(tag) }
                            .transition(.asymmetric(insertion: reduceMotion ? .identity : .scale(scale: 0.85).combined(with: .opacity),
                                                    removal: .opacity))
                    }
                }
                .padding(.top, tags.isEmpty ? 0 : Self.pillsGap)
            }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.16), value: tags)
            VStack(alignment: .leading, spacing: 6) {
                TagEntryCapsule(focused: focused, ready: ready, thinking: suggesting && !ready,
                                suggestLabel: L10n.Write.tagsSuggestShort, suggestAccessibility: L10n.Write.tagsSuggestLabel,
                                addLabel: L10n.Write.tagsAdd, addAccessibility: L10n.Write.tagsAddLabel(tag: TagInput.trimmed(draft)),
                                onSegment: tapSegment) {
                    entry
                }
                // No help line under the field (round 8 §2.2): the slot shows only an error.
                if let error {
                    Text(error)
                        .font(AppFonts.body(Tokens.hintSize))
                        .foregroundStyle(Tokens.terracotta)
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(PublishStep.space)).minY } action: { top in
                // Something above moved the field while it is in use (the tags' row, the preview's): keep it still.
                if let before = fieldTop, top != before, focused || fromSegment { onShift(top - before) }
                fieldTop = top
            }
        }
        .onChange(of: tags) { before, after in
            // Said once for each add, of one (typed) or several (the model's): a polite announcement.
            let added = after.filter { !before.contains($0) }.count
            if added > 0, focused || fromSegment {
                AccessibilityNotification.Announcement(L10n.Write.tagsAdded(count: added)).post()
            }
        }
        .onChange(of: suggesting) { _, now in
            // The model has answered: the segment's change is over once its tags are merged and laid out — a moment
            // later, not on the next turn, which came before the new layout did (the first tags bring the row of
            // pills and the preview's tag row, and the field moved under them).
            guard !now else { return }
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(400))
                if !suggesting { fromSegment = false }
            }
        }
        #if DEBUG
        // `-writeTagFocus YES` puts the caret in the tag field once the step is up (screen checks).
        .task {
            guard UserDefaults.standard.bool(forKey: "writeTagFocus") else { return }
            try? await Task.sleep(for: .seconds(1.2))
            focused = true
        }
        #endif
    }

    /// The text as the composer draws its own: its size, and the padding that sits one line in the 48.
    private var entry: some View {
        let metrics = ComposerText.current()
        // Named by the section's label, as the web's input is (review N6), not by its placeholder.
        return TextField(text: $draft, prompt: fieldPrompt(placeholder, size: ComposerMetrics.textSize)) { Text(L10n.Write.tagsLabel) }
            .font(Font(metrics.font))
            .foregroundStyle(Tokens.text)
            .tint(Tokens.terracotta)
            .focused($focused)
            .submitLabel(.done)
            .onSubmit(commit)
            .padding(.vertical, metrics.padding)
            .onChange(of: draft) { composing = FirstResponder.hasMarkedText() }
            // Marked text set, chosen or ended without the words changing still says so to the field.
            .onReceive(NotificationCenter.default.publisher(for: UITextField.textDidChangeNotification)) { _ in
                if focused { composing = FirstResponder.hasMarkedText() }
            }
            .onChange(of: focused) { _, now in if !now { composing = false } }
            // A hardware keyboard's Backspace in the empty field takes the last tag back — its first press
            // only (`.down`, never a held key's repeats); the soft keyboard never sends it here.
            .onKeyPress(.delete, phases: .down) { _ in
                guard TagInput.takesBackLast(draft: draft, composing: composing || FirstResponder.hasMarkedText()),
                      let last = tags.last else { return .ignored }
                onRemove(last)
                return .handled
            }
    }

    /// The segment: a composition still open is ended first (its word committed, then added); a word
    /// typed is added; nothing typed asks the model.
    private func tapSegment() {
        if composing || FirstResponder.hasMarkedText(), let input = FirstResponder.current() as? UITextField {
            input.unmarkText()
            draft = input.text ?? draft
            composing = false
        }
        if TagInput.ready(draft: draft, composing: false) {
            commit()
        } else {
            fromSegment = true
            onSuggest()
        }
    }

    /// Add what is typed and stay for the next one (Return would otherwise put the keyboard away).
    private func commit() {
        guard TagInput.ready(draft: draft, composing: false) else { return }
        onAdd()
        Task { @MainActor in focused = true }
    }

    /// Between the label and the tags under it (the web's 8).
    static var pillsGap: CGFloat { 8 }
    /// A chosen tag's paper (review S2): `color-mix(in oklch, var(--color-terracotta-light) 50%, var(--color-cream))`,
    /// quieter than the step's one button and the AI 建議 segment's peach beside it.
    static var pillFill: Color { Palette.mix(.terracottaLight, 0.5, .cream) }
}

/// The writer's save state as its bar says it (round 8 §2.1): one quiet word after the title —
/// 儲存中⋯ · 已儲存 · 修改已暫存, or 未儲存 in the error ink — 13 in the muted ink, on one line. It goes
/// before the title gives way (the bar's `titleFirst`): shown whole, or not at all. Nothing before the
/// card's first write. (VoiceOver hears each new word from the writer, `announce(_:)`.)
extension WriteModel.SaveState {
    /// The bar's second line under its title (round 11 §5): the word, in the error ink when it failed.
    static func subtitle(_ state: WriteModel.SaveState?, help: String?) -> BarTitles.Subtitle {
        BarTitles.Subtitle(text: state?.label, ink: state == .failed ? Tokens.terracotta : Tokens.textMuted, help: help ?? state?.label)
    }
}

struct SaveStateWord: View {
    let state: WriteModel.SaveState?
    /// What a pointer resting on it reads: the word with the last write's time (``WriteModel/saveStateHelp``).
    var help: String? = nil

    var body: some View {
        if let state {
            ViewThatFits(in: .horizontal) {
                Text(state.label)
                    .font(AppFonts.body(13))
                    .foregroundStyle(state == .failed ? Tokens.terracotta : Tokens.textMuted)
                    .lineLimit(1)
                    .fixedSize()
                    .contentTransition(.opacity)
                    .animation(.easeOut(duration: 0.16), value: state)
                Color.clear.frame(width: 0, height: 0)
            }
            .help(help ?? state.label)
            // Offered what the title left, before the bar's spacer takes it.
            .layoutPriority(0.5)
        }
    }

    /// A polite live region's word: queued behind whatever VoiceOver is saying, never cutting it off.
    static func announce(_ state: WriteModel.SaveState?) {
        guard let state else { return }
        var words = AttributedString(state.label)
        words.accessibilitySpeechAnnouncementPriority = .low
        AccessibilityNotification.Announcement(words).post()
    }
}

/// One half of the image surface (upload or illustrate): the terracotta glyph,
/// the muted title and its fainter hint, centred.
struct MediaHalf: View {
    let icon: IconName
    let title: String
    let hint: String

    var body: some View {
        VStack(spacing: 6) {
            OrganicIcon(icon, size: 26, color: Tokens.terracotta)
            Text(title).font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.textMuted)
            Text(hint).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted).opacity(0.75)
        }
        .multilineTextAlignment(.center)
        .padding(.vertical, 22)
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
    }
}

/// The image surface's frame (HandDrawnDashedSurface R16, seed 31, bow 0.8):
/// the field's line, terracotta while something is on its way in.
struct MediaFrame: ViewModifier {
    var busy = false

    func body(content: Content) -> some View {
        content.background {
            AutoWobRectShape(radius: 16, seed: 31, curve: 0.8)
                .stroke(busy ? Tokens.terracotta : Tokens.fieldBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
        }
    }
}
