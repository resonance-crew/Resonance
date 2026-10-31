import DesignSystem
import PhotosUI
import ResonanceKit
import SwiftUI

/// What the attach panel shows (round 22 §4.2).
enum AttachTab: String, Equatable {
    case pictures, cards
}

/// The attach panel (round 22 §4.2), in the keyboard's place under the capsule: its top edge one hand-drawn pen
/// line with a short wavy grip in its middle (drag it up to grow the panel to under the header, down to close
/// it; VoiceOver adjusts it), and at its foot the segmented 圖片｜卡片. 圖片 is the system's own photo picker laid
/// inline (out of the app's process: no library access asked for), several pictures chosen in order — they ride
/// in the strip over the capsule as they are picked; 卡片 lists the viewer's cards, a tap and the card rides.
/// No card, no shadow: the foot's paper goes on under it.
struct AttachPanel: View {
    @Binding var tab: AttachTab
    @Binding var selection: [PhotosPickerItem]
    /// How many the picker may hold (10 less the pictures riding from elsewhere).
    let maxSelection: Int
    let onCard: (FeedCard) -> Void
    /// The card riding with the next message: ticked in 卡片, as a chosen picture is in 圖片.
    var chosenCard: String?
    /// The grip dragged (points up are positive) and let go (with the drag's last speed, points per second up).
    var onDrag: (CGFloat) -> Void = { _ in }
    var onDragEnd: (CGFloat, CGFloat) -> Void = { _, _ in }
    /// VoiceOver's adjustment: taller (true) or shorter (false).
    var onAdjust: (Bool) -> Void = { _ in }
    /// Room under the bar (the home indicator's).
    var bottomRoom: CGFloat = 0
    /// Drawn without the grip (the Mac's popover).
    var gripped = true
    /// The picker and the cards scroll on to the screen's foot, under the home indicator (the phone's panel, v3);
    /// the floating bar keeps clear of the indicator.
    var toScreenEdge = false

    var body: some View {
        VStack(spacing: 0) {
            if gripped { grip }
            ZStack(alignment: .bottom) {
                Group {
                    switch tab {
                    case .pictures:
                        PhotosPicker(selection: $selection, maxSelectionCount: max(1, maxSelection), selectionBehavior: .continuousAndOrdered,
                                     matching: .images, preferredItemEncoding: .current, photoLibrary: .shared()) {
                            Text(L10n.Messages.attachImage)
                        }
                        .photosPickerStyle(.inline)
                        .photosPickerDisabledCapabilities(.selectionActions)
                        .photosPickerAccessoryVisibility(.hidden, edges: .all)
                    case .cards:
                        AttachCards(chosenCard: chosenCard, onCard: onCard)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(.container, edges: toScreenEdge ? .bottom : [])
                // The bar floats over the pictures or the cards (round 22 v2): no band behind it, and the room round it
                // is theirs — only the bar itself takes a tap.
                SegmentedActionBar([
                    SegmentSpec(id: "pictures", icon: .image, label: L10n.Messages.attachImage,
                                fill: tab == .pictures ? Tokens.buttonFill : nil, ink: tab == .pictures ? Tokens.cream : Tokens.buttonOnTonal,
                                selected: tab == .pictures) { tab = .pictures },
                    SegmentSpec(id: "cards", icon: .cards, label: L10n.Messages.attachCardShort,
                                fill: tab == .cards ? Tokens.buttonFill : nil, ink: tab == .cards ? Tokens.cream : Tokens.buttonOnTonal,
                                selected: tab == .cards) { tab = .cards },
                ], seed: 83, height: 44)
                .frame(maxWidth: 280)
                .padding(.bottom, 10 + bottomRoom)
            }
        }
    }

    /// The panel's top edge: a pen line across, the grip's wavy mark in its middle; dragged, the panel follows.
    private var grip: some View {
        ZStack {
            WavyRuleShape(seed: 211, amp: 1.2, steps: 9)
                .stroke(PaneLines.ink, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                .frame(height: 6)
            WavyRuleShape(seed: 37, amp: 1.6, steps: 3)
                .stroke(Tokens.fieldBorderHover, style: StrokeStyle(lineWidth: Tokens.inkStrong, lineCap: .round))
                .frame(width: 36, height: 6)
                .offset(y: 8)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 28, alignment: .top)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 4, coordinateSpace: .global)
                .onChanged { onDrag(-$0.translation.height) }
                .onEnded { onDragEnd(-$0.translation.height, -$0.velocity.height) }
        )
        .accessibilityElement()
        .accessibilityLabel(L10n.Messages.panelGrip)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: onAdjust(true)
            case .decrement: onAdjust(false)
            @unknown default: break
            }
        }
    }
}

/// The attach panel's 卡片: the viewer's cards a thread can share (public ones, then their 私人卡), as the card
/// picker lists them — on its way, the rows' shapes; unread, the way to ask again.
private struct AttachCards: View {
    let chosenCard: String?
    let onCard: (FeedCard) -> Void
    @Environment(SessionStore.self) private var session
    @State private var cards: [FeedCard]?
    @State private var failed = false

    var body: some View {
        CardPickList(cards: cards ?? [], choosing: true, selectedId: chosenCard, label: L10n.Messages.pickCard,
                     privateLabel: L10n.Messages.privateCard, fills: true, onPick: onCard) {
            EmptyView()
        } empty: {
            if cards != nil {
                Text(L10n.Messages.pickCardEmpty).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted).padding(.vertical, 12)
            } else if failed {
                HStack(spacing: 10) {
                    Text(L10n.Write.Editor.CardModal.failed).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    OrganicButton(L10n.Write.Editor.CardModal.retry, variant: .tonal, size: .sm) { Task { await load() } }.fixedSize()
                }
                .padding(.horizontal, 6).padding(.vertical, 8)
            } else {
                CardPickSkeleton(rows: 4)
            }
        }
        .padding(.horizontal, 16)
        // Its last rows scroll clear of the floating 圖片｜卡片 bar.
        .contentMargins(.bottom, 64, for: .scrollContent)
        .task { if cards == nil { await load() } }
    }

    private func load() async {
        failed = false
        do {
            cards = try await CardPickerContent.threadCards(session)
        } catch {
            failed = true
        }
    }
}
