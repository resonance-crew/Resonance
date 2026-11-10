import DesignSystem
import PhotosUI
import ResonanceKit
import SwiftUI

/// What the attach panel shows (round 22 §4.2).
enum AttachTab: String, Equatable {
    case pictures, cards
}

/// The attach panel's paper (round 24, part 3 §C1, the owner: the picker's white under the foot's cream grip band,
/// "這個區塊兩種顏色，看起來就怪怪的"). Under 卡片 the foot's own: the panel lays nothing of its own, and the foot's paper
/// goes on under it. Under 圖片 the system picker's, laid under the grip band and the picker alike — from the grip's pen
/// line down (``AttachPaperShape``), across the whole pane to the rule (``FromPaneRule``), the window's edges and its foot
/// — so the panel is one paper from its top line down. Changed with the tab at once (no fade: no cream shows under the
/// picker as it comes).
enum AttachPaper: Equatable {
    case foot, picker

    static func of(_ tab: AttachTab) -> AttachPaper { tab == .pictures ? .picker : .foot }

    /// What the panel lays under itself: nothing for the foot's paper; for the picker its own — `systemBackground`,
    /// what the inline PhotosPicker draws under its grid, resolved in the panel's traits (the scene's: the app's
    /// appearance overrides them): white by day; by night black on an iPhone or an iPad, and on the Mac rgb(30,30,30),
    /// the very grey its picker fills its rect with there.
    var color: Color? { self == .picker ? Self.pickerPaper : nil }

    static let pickerPaper = Color(uiColor: .systemBackground)
}

/// The attach panel's top pen line (its grip's), where it lies in the panel: ``frameHeight`` tall at the panel's top,
/// stretched across it from the rule or the window's edge to the window's edge — so the picker's paper, laid in the same
/// frame, is cut on the very wave it is stroked on (``AttachPaperShape``).
nonisolated enum AttachPanelLine {
    static let shape = WavyRuleShape(seed: 211, amp: 1.2, steps: 9)
    static let frameHeight: CGFloat = 6
}

/// The picker's paper under 圖片 (round 24, part 3 §C1, review): from the grip's pen line down, its top on the line's own
/// centre — not from the panel's top edge, which left a straight strip of it showing over the hand-drawn line (white on
/// the cream by day, black by night) — the pen hiding the edge where the two meet.
nonisolated struct AttachPaperShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = AttachPanelLine.shape.path(in: CGRect(x: rect.minX, y: rect.minY, width: rect.width,
                                                         height: AttachPanelLine.frameHeight))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

/// The attach panel (round 22 §4.2), in the keyboard's place under the capsule: its top edge one hand-drawn pen
/// line with a short wavy grip in its middle (drag it up to grow the panel to under the header, down to close
/// it; VoiceOver adjusts it), and at its foot the segmented 圖片｜卡片. 圖片 is the system's own photo picker laid
/// inline (out of the app's process: no library access asked for), several pictures chosen in order — they ride
/// in the strip inside the capsule as they are picked (round 23); 卡片 lists the viewer's cards, a tap and the card rides.
/// No card, no shadow: the foot's paper goes on under it — under 圖片 the picker's (``AttachPaper``, laid by its host).
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
    /// The panes' rule beside the panel, in the detail pane (round 24, part 3 §C2): its top pen line runs on across the
    /// gutter from the rule's own line, as the pane's paper does — the grip's mark staying centred over the panel.
    var rule: PaneRuleBox?
    /// How far in the picker stands: not at all in the keyboard's place (it runs edge to edge); clear of a popover's pen
    /// line in one (``ComposerPopoverMetrics/pickerInsets``).
    var pickerInsets = EdgeInsets()

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
                        .padding(pickerInsets)
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

    /// The panel's top edge: a pen line across the pane — from the rule between the panes, in two, and to the window's
    /// edges through a phone's sides on its side, as the picker's paper is laid — the grip's wavy mark in the panel's
    /// middle; dragged, the panel follows.
    private var grip: some View {
        ZStack {
            FromPaneRule(rule: rule) {
                AttachPanelLine.shape
                    .stroke(PaneLines.ink, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
            }
            .frame(height: AttachPanelLine.frameHeight)
            .ignoresSafeArea(.container, edges: .horizontal)
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
