import DesignSystem
import ResonanceKit
import SwiftUI

/// What the link editor opens on (round 16 §6): the link the selection is in (or none), whether 卡片 is
/// offered — the link is, or will be, alone in its paragraph — and which way it starts: the link's own,
/// else 文字 for selected words and 卡片 on an empty line.
struct StoryLinkRequest: Identifiable, Equatable {
    let id = UUID()
    let link: StoryEditorBridge.Link?
    let offersCard: Bool
    let display: StoryEditorBridge.Link.Display

    /// From the bridge's state as the link tool is tapped (`caret`: nothing selected).
    static func of(link: StoryEditorBridge.Link?, canCard: Bool, caret: Bool) -> StoryLinkRequest {
        let offersCard = canCard || link?.standalone == true
        let display: StoryEditorBridge.Link.Display = link?.display ?? (offersCard && caret ? .card : .text)
        return StoryLinkRequest(link: link, offersCard: offersCard, display: offersCard ? display : .text)
    }

    /// A link card tapped in the story: its editor, 卡片 chosen.
    static func card(_ href: String) -> StoryLinkRequest {
        StoryLinkRequest(link: .init(href: href, display: .card, standalone: true, words: href), offersCard: true, display: .card)
    }

    static func == (a: StoryLinkRequest, b: StoryLinkRequest) -> Bool { a.id == b.id }
}

/// The writer's link editor (round 16 §6, round 17 §6.2): the app's modal dialog — the one its confirms are —
/// never a bottom sheet. Its title says what it does (插入連結 for a new link, 編輯連結 for the caret's), the
/// address under it (prefilled with the caret's link only, selected, the clipboard read on an explicit paste
/// and never on opening), then 顯示為 卡片 | 文字 when the link stands alone in its paragraph — the label on its
/// line, the publish step's segmented choice under it — and the foot: 移除連結 (an existing link) at its start,
/// 完成 at its end. Return is 完成. An address the link rules don't take says so in one muted line under the
/// field and is never stored (no `javascript:`, no `data:`). No ✕: a tap beside it or the escape gesture
/// closes it; the story then takes its caret back (``WriteScreen``).
struct StoryLinkModal: View {
    let request: StoryLinkRequest
    /// 完成 with the address as typed and the way to show it: true once the story took it.
    let onApply: (String, StoryEditorBridge.Link.Display) async -> Bool
    let onRemove: () -> Void
    let onClose: () -> Void

    @State private var address: String
    @State private var display: StoryEditorBridge.Link.Display
    @State private var invalid = false
    @State private var applying = false
    /// The field's own selection: the address there already is selected through it once the field has the
    /// focus (review A6) — never a select-all sent to whatever is first responder, which could be the story.
    @State private var selection: TextSelection?
    @State private var selectedOnce = false
    @FocusState private var fieldFocused: Bool

    init(request: StoryLinkRequest, onApply: @escaping (String, StoryEditorBridge.Link.Display) async -> Bool,
         onRemove: @escaping () -> Void, onClose: @escaping () -> Void) {
        self.request = request
        self.onApply = onApply
        self.onRemove = onRemove
        self.onClose = onClose
        _address = State(initialValue: request.link?.href ?? "")
        _display = State(initialValue: request.display)
    }

    /// The modal's measures (round 17 §6.2): title → field 16, field → the choice 24, the choice's label →
    /// its control the publish step's 12, then 28 of air over the foot; at most 400 wide. Its controls — the
    /// field, 卡片 | 文字, 移除連結 and 完成 — are one height, 44 (review D5).
    enum Metrics {
        static let maxWidth: CGFloat = 400
        static let titleGap: CGFloat = 16
        static let choiceGap: CGFloat = 24
        static let footGap: CGFloat = 28
        static let control: CGFloat = ModalMetrics.minButtonHeight
        /// The field's words: 15 on a line of 1.6.
        static let fieldText: CGFloat = 15
        static var fieldLine: CGFloat { fieldText * 1.6 }
        /// Above and below the field's line, so the field is `control` tall.
        static var fieldPadY: CGFloat { (control - fieldLine) / 2 }
    }

    /// The modal's title: 插入連結 for a new link, 編輯連結 for one already there.
    static func title(_ request: StoryLinkRequest) -> String {
        request.link == nil ? L10n.Write.Editor.insertLink : L10n.Write.Editor.linkEdit
    }

    /// Whether the foot offers 移除連結: only for a link already there.
    static func offersRemove(_ request: StoryLinkRequest) -> Bool { request.link != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(Self.title(request))
                .padding(.bottom, Metrics.titleGap)
            VStack(alignment: .leading, spacing: 6) {
                TextField(text: $address, selection: $selection, prompt: fieldPrompt(L10n.Write.Editor.linkPlaceholder)) {
                    Text(L10n.Write.Editor.linkPlaceholder)
                }
                    .font(AppFonts.body(Metrics.fieldText))
                    .foregroundStyle(Tokens.text)
                    .tint(Tokens.terracotta)
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .focused($fieldFocused)
                    .onSubmit { Task { await apply() } }
                    .onChange(of: address) { invalid = false }
                    .onChange(of: fieldFocused) { _, focused in if focused { selectAddress() } }
                    .frame(minHeight: Metrics.fieldLine)
                    .padding(.horizontal, Tokens.fieldPadX)
                    .padding(.vertical, Metrics.fieldPadY)
                    .modifier(FieldSurface(seed: 71, focused: fieldFocused))
                if invalid {
                    Text(L10n.Write.Editor.linkInvalid)
                        .font(AppFonts.body(13))
                        .foregroundStyle(Tokens.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .transition(.opacity)
                        .onAppear { AccessibilityNotification.Announcement(L10n.Write.Editor.linkInvalid).post() }
                }
            }
            if request.offersCard {
                VStack(alignment: .leading, spacing: Tokens.publishLabelGap) {
                    Text(L10n.Write.Editor.linkShowAs)
                        .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
                        .tracking(Tokens.labelSize * 0.06)
                        .foregroundStyle(Tokens.textMuted)
                        .accessibilityAddTraits(.isHeader)
                    SegmentedActionBar([option(.card, L10n.Write.Editor.linkAsCard, icon: .frame),
                                        option(.text, L10n.Write.Editor.linkAsText, icon: .link)],
                                       fill: Tokens.creamDark, height: Metrics.control)
                }
                .padding(.top, Metrics.choiceGap)
            }
            HStack(spacing: 10) {
                if Self.offersRemove(request) {
                    // Quiet (review D5): words alone, no fill — it takes the link off, nothing more, so not red.
                    QuietTextButton(L10n.Write.Editor.linkRemove) {
                        onRemove()
                        onClose()
                    }
                }
                Spacer(minLength: 0)
                OrganicButton(L10n.Write.Editor.linkApply, variant: .solid, size: .sm) { Task { await apply() } }
                    .loading(applying)
                    .disabled(address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .environment(\.organicButtonMinHeight, ModalMetrics.minButtonHeight)
            .padding(.top, Metrics.footGap)
        }
        .animation(.easeOut(duration: 0.15), value: invalid)
        .onAppear { fieldFocused = true }
    }

    /// The address there already, selected through the field's own selection once it has the focus: typing
    /// replaces it, as a browser's address bar does. Once, on opening; a moment later again, in case the field
    /// took the focus before its text view did (the selection then lands on nothing).
    private func selectAddress() {
        guard !selectedOnce, !address.isEmpty else { return }
        selectedOnce = true
        selection = Self.wholeAddress(address)
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(120))
            if fieldFocused, selection == nil || selection == TextSelection(insertionPoint: address.endIndex) {
                selection = Self.wholeAddress(address)
            }
        }
    }

    /// The whole of the address, as the field's selection.
    static func wholeAddress(_ address: String) -> TextSelection {
        TextSelection(range: address.startIndex..<address.endIndex)
    }

    private func option(_ value: StoryEditorBridge.Link.Display, _ label: String, icon: IconName) -> SegmentSpec {
        let chosen = display == value
        return SegmentSpec(id: value.rawValue, icon: icon, label: label,
                           fill: chosen ? Tokens.buttonTonal : nil,
                           ink: chosen ? Tokens.buttonOnTonal : Tokens.segmentIdleInk,
                           pressInk: Tokens.towardInk.opacity(0.05), selected: chosen) {
            display = value
        }
    }

    /// 完成: what the link rules take goes to the story; anything else says so and stays, the field focused.
    private func apply() async {
        guard !applying, let href = StoryLinks.linkTarget(address) else {
            invalid = true
            fieldFocused = true
            return
        }
        applying = true
        let took = await onApply(href, request.offersCard ? display : .text)
        applying = false
        if took {
            onClose()
        } else {
            invalid = true
            fieldFocused = true
        }
    }
}

/// A quiet button of words alone (review D5): the text ink, semibold 14 as a small button's label, no fill — a
/// press washes faintly round it — 44 tall, its words on the content's edge (its padding hangs in the margin).
struct QuietTextButton: View {
    let title: String
    let action: () -> Void

    init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    static let padX: CGFloat = 12

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(AppFonts.body(14, weight: .semibold))
                .tracking(14 * 0.02)
                .foregroundStyle(Tokens.text)
                .lineLimit(1)
                .padding(.horizontal, Self.padX)
                .frame(minHeight: StoryLinkModal.Metrics.control)
                .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle(inset: 2, color: Tokens.text.opacity(0.08)))
        .padding(.leading, -Self.padX)
    }
}
