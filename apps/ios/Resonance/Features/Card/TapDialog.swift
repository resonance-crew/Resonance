import DesignSystem
import ResonanceKit
import SwiftUI

/// What the tap lists' dialogs share (round 33): who resonated — a reader's (``ReaderTapList``) and the author's
/// (``AuthorTapList``) —, who picked a sentence (``PickedPeople``) and the passages' dialog (``TapPassages``). Each is
/// a centred ``View/organicModal(isPresented:seed:maxWidth:closeLabel:dismissible:clipsToPaper:paperInset:content:)``
/// clipped to its paper at ``ModalPaper/listInset``; the web's `DialogScroll` family, Android's `OrganicModal(clipToPaper)`.
///
/// - §Q1 (the owner: 「谁共振了弹窗仍有高度闪动」): a press that opens a list asks for its first page and waits for it
///   at most ``firstPageWait`` (``prepare(_:)``); come by then, the dialog's first layout is its last. Slower, it opens
///   with as many loading rows as the faces already known — never a default count.
/// - §Q2 (「高亮区块应延伸到左右边缘」): each row's press ink is a band from the paper's left edge to its right, clipped to
///   the wobble under its pen line (``reach(clipped:inset:)``), the words at the dialog's inset.
/// - §Q3 (「按钮固定浮在滚动区底部渐变之上」): the way out (略過, 關閉) is the tonal small pill floating over the scroll
///   region's bottom fade at the foot's end (``View/floatingExit(_:id:action:)``); the region reaches the paper's
///   bottom and ends in room for the pill (``EnvironmentValues/dialogExitRoom``), so the last row scrolls clear of it.
nonisolated enum TapDialog {
    /// How long a press waits for a list's first page before the dialog opens without it (the web's `PICKED_HOLD_MS`,
    /// Android's `PICKED_OPEN_WAIT_MS`): one for the family.
    static let firstPageWait: Duration = .milliseconds(300)

    /// The pill's bottom from the paper's bottom edge.
    static let exitGap: CGFloat = 16
    /// Under the last row, inside the region: the pill's height and 16 (§Q3), so the last row can scroll clear of it.
    static func exitRoom(button: CGFloat) -> CGFloat { button + exitGap }

    /// How far a row reaches past the dialog's content on each side: in a dialog clipped to its paper, the paper's
    /// inset (`inset`) and the wobble's swing past its frame (``ModalPaper/bleed``) — the band edge to edge. Anywhere
    /// else (a dialog that doesn't clip) 12, its band cut and rounded inside the paper.
    static func reach(clipped: Bool, inset: CGFloat = ModalPaper.listInset) -> CGFloat {
        clipped ? inset + ModalPaper.bleed : 12
    }
    /// What of a row stands past the paper's frame, a side (none when it stays inside): no press is taken there.
    static func overhang(reach: CGFloat, inset: CGFloat = ModalPaper.listInset) -> CGFloat { max(0, reach - inset) }

    /// How many rows stand for the people while they are read: the faces already known (at most three, the faces'
    /// line's), never none and never a default.
    static func loadingRows(knownFaces: Int) -> Int { max(1, min(knownFaces, FaceStack.maxFaces)) }

    /// Starts reading `people` and returns once its first page has come or ``firstPageWait`` has passed, whichever is
    /// first; the read carries on either way (the dialog then shows it).
    @MainActor static func prepare(_ people: TapPeople) async {
        let reading = Task { await people.load() }
        _ = await firstAnswer(within: firstPageWait) { await reading.value }
    }
}

extension EnvironmentValues {
    /// The room the dialog's floating way out needs under its scroll region's last row (``TapDialog/exitRoom(button:)``);
    /// 0 outside such a dialog.
    @Entry var dialogExitRoom: CGFloat = 0
}

extension View {
    /// The family's way out (round 33 §Q3): `label` as the tonal small pill (``OrganicButton`` `.tonal`, `.sm` — its
    /// fill and wobble, no pen line, no shadow, a finger's 44 at the least), floating at the foot's end over the scroll
    /// region's bottom fade, ``TapDialog/exitGap`` above the paper's bottom edge, its right edge on the content's. It
    /// never moves with the rows. The dialog's own content reaches the paper's bottom (the paper's bottom inset taken
    /// back) and reads ``EnvironmentValues/dialogExitRoom`` for the room to end its scroll region with.
    func floatingExit(_ label: String, id: String, action: @escaping () -> Void) -> some View {
        modifier(FloatingExit(label: label, id: id, action: action))
    }

    /// The end of a family dialog's scroll region: room for the floating way out (``EnvironmentValues/dialogExitRoom``).
    func exitRoomBelow() -> some View { modifier(ExitRoomBelow()) }
}

private struct FloatingExit: ViewModifier {
    let label: String
    let id: String
    let action: () -> Void
    @State private var button: CGFloat = ModalMetrics.minButtonHeight

    func body(content: Content) -> some View {
        content
            .environment(\.dialogExitRoom, TapDialog.exitRoom(button: button))
            .overlay(alignment: .bottomTrailing) {
                OrganicButton(label, variant: .tonal, size: .sm, action: action)
                    .environment(\.organicButtonMinHeight, ModalMetrics.minButtonHeight)
                    .fixedSize()
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { button = $0 }
                    .accessibilityIdentifier(id)
                    .padding(.bottom, TapDialog.exitGap)
            }
            // Down to the paper's bottom edge (the paper's bottom inset given back): the scroll region and the pill's
            // place both reach it, the pill standing ``TapDialog/exitGap`` above it.
            .padding(.bottom, -ModalPaper.insetV)
    }
}

private struct ExitRoomBelow: ViewModifier {
    @Environment(\.dialogExitRoom) private var room

    func body(content: Content) -> some View {
        content.padding(.bottom, room)
    }
}
