import SwiftUI
import UIKit

/// The note to a card's author, written in place under the story (round 26, SETTLED "the note, in place"; the
/// owner: 「這個寄小紙條的界面應該不要做成 pop ups，因為它會擋住這個畫面上其他東西」): the chat composer's input capsule
/// (``ComposerCapsule``'s face — the field's wobble, the cream paper, its pen darkening while written in, never a
/// halo) with the text (`field`) starting ``wordsStart`` in — no envelope before it since round 30 (§S4; the owner:
/// 「这个输入框左边要不要显示这个 envelope 的 icon 呢」; the thread's composer keeps its ＋ column) — and 寄出 as its 52 end segment behind the wavy seam — tonal at rest, solid once there is something to send. One
/// line is exactly 48; more lines grow it, the send segment then a 52 × 48 block at its foot (`block`).
public struct NoteFieldCapsule<Field: View>: View {
    let focused: Bool
    let canSend: Bool
    /// More than one line: the send segment is a block on the last row.
    let block: Bool
    let sendLabel: String
    let seed: Double
    let onSend: () -> Void
    @ViewBuilder let field: Field
    @State private var sendPressed = false

    /// Where the words (and the placeholder) start from the capsule's start: the envelope's 44 column is gone.
    public nonisolated static var wordsStart: CGFloat { 16 }

    public init(focused: Bool, canSend: Bool, block: Bool = false, sendLabel: String, seed: Double = 17,
                onSend: @escaping () -> Void, @ViewBuilder field: () -> Field) {
        self.focused = focused
        self.canSend = canSend
        self.block = block
        self.sendLabel = sendLabel
        self.seed = seed
        self.onSend = onSend
        self.field = field()
    }

    public var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            field
                .frame(maxWidth: .infinity, minHeight: ComposerMetrics.height, alignment: .leading)
                .padding(.leading, Self.wordsStart)
                .padding(.trailing, ComposerMetrics.textTrailing)
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                onSend()
            } label: {
                OrganicIcon(.send, size: ComposerMetrics.sendGlyph, color: canSend ? Tokens.cream : Tokens.terracotta, strokeWidth: Tokens.ink)
                    .animation(ComposerCapsuleFace.faceChange, value: canSend)
                    .frame(width: ComposerMetrics.sendWidth, height: ComposerMetrics.height)
                    .contentShape(Rectangle())
            }
            .buttonStyle(NotePressReport(pressed: $sendPressed))
            .disabled(!canSend)
            .accessibilityLabel(sendLabel)
            // The flow tag the interaction flows send by (maestro/flows/leave-note.yaml).
            .accessibilityIdentifier("note-send")
        }
        .fixedSize(horizontal: false, vertical: true)
        .background {
            // The chat composer's steady outline: a line coming or going moves only its top, never its foot or 寄出's corner.
            ComposerCapsuleFace(seed: seed, focused: focused, canSend: canSend, pressed: sendPressed, block: block, steady: true)
        }
    }
}

/// The segment reports its press to the face drawn behind the whole capsule (its wash).
private struct NotePressReport: ButtonStyle {
    @Binding var pressed: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, now in pressed = now }
    }
}
