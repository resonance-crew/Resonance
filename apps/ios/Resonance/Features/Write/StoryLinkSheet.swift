import DesignSystem
import ResonanceKit
import SwiftUI

/// What the link sheet opens on (round 16 §6): the link the selection is in (or none), whether 卡片 is
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

    /// A link card tapped in the story: its sheet, 卡片 chosen.
    static func card(_ href: String) -> StoryLinkRequest {
        StoryLinkRequest(link: .init(href: href, display: .card, standalone: true, words: href), offersCard: true, display: .card)
    }

    static func == (a: StoryLinkRequest, b: StoryLinkRequest) -> Bool { a.id == b.id }
}

/// The writer's link sheet (round 16 §6), a compact sheet over the keyboard: the address (prefilled with the
/// caret's link only — the clipboard is read on an explicit paste, never on opening), 顯示為 卡片 | 文字 when
/// the link stands alone in its paragraph, then 移除連結 (an existing link) and 完成. An address the link rules
/// don't take says so in one muted line under the field and is never stored (no `javascript:`, no `data:`).
struct StoryLinkSheet: View {
    let request: StoryLinkRequest
    /// 完成 with the address as typed and the way to show it: true once the story took it.
    let onApply: (String, StoryEditorBridge.Link.Display) async -> Bool
    let onRemove: () -> Void
    let onClose: () -> Void

    @State private var address: String
    @State private var display: StoryEditorBridge.Link.Display
    @State private var invalid = false
    @State private var applying = false
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

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(request.link == nil ? L10n.Write.Editor.link : L10n.Write.Editor.linkEdit)
                .font(AppFonts.heading(19))
                .foregroundStyle(Tokens.text)
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 6) {
                TextField(text: $address, prompt: fieldPrompt(L10n.Write.Editor.linkPlaceholder)) { Text(L10n.Write.Editor.linkPlaceholder) }
                    .font(AppFonts.body(15))
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
                    .frame(minHeight: 15 * 1.6)
                    .padding(.horizontal, Tokens.fieldPadX)
                    .padding(.vertical, Tokens.fieldPadY)
                    .modifier(FieldSurface(seed: 71, focused: fieldFocused))
                if invalid {
                    Text(L10n.Write.Editor.linkInvalid)
                        .font(AppFonts.body(13))
                        .foregroundStyle(Tokens.textMuted)
                        .transition(.opacity)
                        .onAppear { AccessibilityNotification.Announcement(L10n.Write.Editor.linkInvalid).post() }
                }
            }
            if request.offersCard {
                HStack(spacing: 12) {
                    Text(L10n.Write.Editor.linkShowAs)
                        .font(AppFonts.body(14))
                        .foregroundStyle(Tokens.textMuted)
                        .fixedSize()
                    SegmentedActionBar([option(.card, L10n.Write.Editor.linkAsCard, icon: .frame),
                                        option(.text, L10n.Write.Editor.linkAsText, icon: .link)],
                                       fill: Tokens.creamDark)
                }
            }
            HStack(spacing: 10) {
                if request.link != nil {
                    OrganicButton(L10n.Write.Editor.linkRemove, variant: .text, size: .sm) {
                        onRemove()
                        onClose()
                    }
                }
                Spacer(minLength: 0)
                OrganicButton(L10n.Write.Editor.linkApply, variant: .primary, size: .sm) { Task { await apply() } }
                    .loading(applying)
                    .disabled(address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.easeOut(duration: 0.15), value: invalid)
        .onAppear { fieldFocused = true }
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

    /// 完成: what the link rules take goes to the story; anything else says so and stays.
    private func apply() async {
        guard !applying, let href = StoryLinks.linkTarget(address) else {
            invalid = true
            return
        }
        applying = true
        let took = await onApply(href, request.offersCard ? display : .text)
        applying = false
        if took { onClose() } else { invalid = true }
    }
}
