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
/// - §Q3, final in round 34 (the owner: 「不需要滚动时恢复原本最开始的实色底部 footer 样式…需要滚动时用现在的 fixed 浮动样式」,
///   「底部渐变贴齐纸张 border 边缘」, 「两种状态按钮相对纸张右下角位置完全一致」): the way out (略過, 關閉) is the tonal small pill
///   (``View/dialogExit(_:id:action:)``), drawn by the family's region (``TapDialogRegion``). Content that fits its cap
///   ends in the classic footer — the content, 18, the pill, the paper's 24 — with no fade and nothing over it; content
///   past it scrolls in a region running to the paper's bottom edge (and past it by the wobble's swing, clipped there),
///   its bottom fade reaching the border, the pill floating over it, the list's end keeping 24 + 44 + 18 of room. Either
///   way the pill's right edge is the content's (24 in) and its bottom 24 above the paper's. The choice is made in the
///   region's first layout (``TapDialogFoot`` proposing the cap to a `ViewThatFits`), never by a later measure.
nonisolated enum TapDialog {
    /// How long a press waits for a list's first page before the dialog opens without it (the web's `PICKED_HOLD_MS`,
    /// Android's `PICKED_OPEN_WAIT_MS`): one for the family.
    static let firstPageWait: Duration = .milliseconds(300)

    /// The pill's bottom from the paper's bottom edge, and its right edge from the paper's right edge (the content's,
    /// ``ModalPaper/listInset``), in both states (round 34 §3): the family's 24, as its top and sides.
    static let exitInset: CGFloat = 24
    /// Between the content and the pill in the footer, and between the list's last row and the pill once it has
    /// scrolled to its end: the classic footer's 18 (``ModalCloseButton``'s).
    static let exitAbove: CGFloat = 18
    /// The pill's height as the region counts it: a finger's 44 (``ModalMetrics/minButtonHeight``).
    static let exitButton: CGFloat = ModalMetrics.minButtonHeight
    /// The pill's bottom from the content's (the paper's bottom less ``ModalPaper/insetV``): 24 − 32, so it stands
    /// ``exitInset`` above the paper's bottom edge in both states.
    static let exitDrop: CGFloat = exitInset - ModalPaper.insetV
    /// What the footer adds under the content (the paper's bottom inset counted as the content's): 18 + 44 − 8.
    static func footer(button: CGFloat = exitButton) -> CGFloat { exitAbove + button + exitDrop }
    /// The room at the end of a scrolling list, from the paper's bottom edge: 24 + 44 + 18, so its last row scrolls
    /// clear above the pill, 18 over it.
    static func exitRoom(button: CGFloat = exitButton) -> CGFloat { exitInset + button + exitAbove }
    /// What the region proposes its two states (``TapDialogFoot``) for a region capped at `cap` (from its top to the
    /// paper's bottom edge): the cap less the paper's bottom inset, which the layout counts as the paper's — so the
    /// footer is chosen while content + 18 + 44 + 24 ≤ `cap` (the web's rule). With no way out, the cap itself.
    static func budget(cap: CGFloat, exit: Bool) -> CGFloat { exit ? cap - ModalPaper.insetV : cap }
    /// How far a scrolling region runs past the paper's bottom edge: where the paper clips, the wobble's swing
    /// (``ModalPaper/bleed``), so the paper's drawn edge cuts it everywhere and no strip of bare paper is left between
    /// the fade and the border; none where it doesn't clip.
    static func below(clipped: Bool) -> CGFloat { clipped ? ModalPaper.bleed : 0 }
    /// The scrolling region's bottom fade: the house's 16 over the last of the paper and the reach past its edge, so
    /// the rows have faded out where the wobble cuts them. Its top fade the same past the top edge (round 34 §5).
    static func bottomFade(below: CGFloat) -> CGFloat { ScrollEdgeFades.length + below }

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

/// A family dialog's way out: its words, its id and what a press does (``View/dialogExit(_:id:action:)``).
struct TapDialogExit {
    let label: String
    let id: String
    let action: () -> Void
}

extension EnvironmentValues {
    /// The way out the family's region (``TapDialogRegion``) ends in; nil outside such a dialog (the region then is
    /// its content alone, or its scroll).
    @Entry var dialogExit: TapDialogExit? = nil
}

extension View {
    /// The family's way out (round 33 §Q3, round 34): `label` as the tonal small pill (``OrganicButton`` `.tonal`, `.sm`
    /// — its fill and wobble, no pen line, no shadow, a finger's 44 at the least), handed to the dialog's region
    /// (``TapDialogRegion``), which draws it under content that fits and floating over content that scrolls, in the
    /// same place against the paper's bottom-right either way.
    func dialogExit(_ label: String, id: String, action: @escaping () -> Void) -> some View {
        environment(\.dialogExit, TapDialogExit(label: label, id: id, action: action))
    }
}

/// Proposes its one child `budget` of height whatever it is offered (the modal's stage offers none: it scrolls), so a
/// `ViewThatFits(in: .vertical)` inside picks in this same layout pass — the footer when its content fits, else the
/// scrolling region — and never in a later one (round 34 §2: no height flash).
struct TapDialogFoot: Layout {
    let budget: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        subviews.first?.sizeThatFits(ProposedViewSize(width: proposal.width, height: budget)) ?? .zero
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(width: bounds.width, height: budget))
    }
}

/// The family's region (round 34): `content` — the rows, or the passages' title and rows — reaching the paper's sides
/// (its rows' bands edge to edge, ``TapDialog/reach(clipped:inset:)``), then the way out (``EnvironmentValues/dialogExit``).
/// It is the dialog's first child (round 34 §5: a title heads it, never stands above it), so scrolling it reaches the
/// paper's top border too.
/// `cap`: the region's height at most, from its top to the paper's bottom edge (the web's: the content and the foot,
/// 18 + 44 + 24). While the content and that foot fit it, the classic footer — the content, 18, the pill, the paper's
/// 24; past it, the content scrolls in a region `cap` tall down to the paper's bottom edge (and past it by
/// ``TapDialog/below(clipped:)``), its bottom fade reaching the border, ending in ``TapDialog/exitRoom(button:)``, the
/// pill floating over it — so neither state is taller than the cap, and at the switch both are as tall. The pill:
/// right edge on the content's, bottom ``TapDialog/exitInset`` above the paper's, in both.
struct TapDialogRegion<Content: View>: View {
    let cap: CGFloat
    let content: Content
    @Environment(\.dialogExit) private var exit
    @Environment(\.modalPaperClips) private var clips
    @Environment(\.modalPaperInset) private var inset

    init(cap: CGFloat, @ViewBuilder content: () -> Content) {
        self.cap = cap
        self.content = content()
    }

    var body: some View {
        let reach = TapDialog.reach(clipped: clips, inset: inset)
        // The footer fits when the content + 18 + 44 + 24 ≤ the cap: the content and the footer's 54 within the cap
        // less the paper's bottom inset (the 32 the footer's −8 counts in).
        TapDialogFoot(budget: TapDialog.budget(cap: cap, exit: exit != nil)) {
            ViewThatFits(in: .vertical) {
                footer(reach: reach)
                floating(reach: reach, below: TapDialog.below(clipped: clips))
            }
        }
    }

    /// The content fits: the content, then 18, then the pill at the foot's end; no fade, nothing over the content.
    private func footer(reach: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            content.padding(.horizontal, -reach)
            if let exit {
                ExitPill(exit: exit, id: exit.id)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.top, TapDialog.exitAbove)
            }
        }
        .padding(.bottom, exit == nil ? 0 : TapDialog.exitDrop)
    }

    /// The content scrolls: the region runs under the paper's bottom inset to its edge (and past it, clipped by the
    /// wobble), the pill floating over its bottom fade, the list's end keeping the pill's room.
    @ViewBuilder private func floating(reach: CGFloat, below: CGFloat) -> some View {
        let down = exit == nil ? 0 : below
        // Round 34 §5 (「顶部渐变也贴齐纸张 border」): the region reaches the paper's top edge too, and the wobble's swing
        // past it; the paper's top inset (24) is the content's own top padding inside it, so the content opens exactly
        // where it did and slides under the top fade into the border.
        let top = ModalPaper.top(inset: inset), up = below
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content.padding(.top, top + up)
                if let exit {
                    // The room: the pill itself, unseen (so it is the pill's at every text size), 18 over it and the
                    // paper's 24 and the reach past its edge under it.
                    ExitPill(exit: exit, id: nil)
                        .hidden()
                        .accessibilityHidden(true)
                        .padding(.top, TapDialog.exitAbove)
                        .padding(.bottom, TapDialog.exitInset + down)
                }
            }
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize)
        .scrollEdgeFades(ScrollEdgeFades.length + up, bottom: TapDialog.bottomFade(below: down))
        .frame(maxHeight: cap + down + top + up)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, -reach)
        .padding(.top, -(top + up))
        // Down to the paper's bottom edge and past it (the paper's bottom inset given back): what the layout keeps is
        // the content's frame, so the pill's place below is the footer's.
        .padding(.bottom, exit == nil ? 0 : -(ModalPaper.insetV + down))
        .overlay(alignment: .bottomTrailing) {
            if let exit {
                ExitPill(exit: exit, id: exit.id).padding(.bottom, TapDialog.exitDrop)
            }
        }
    }
}

private struct ExitPill: View {
    let exit: TapDialogExit
    let id: String?

    var body: some View {
        let pill = OrganicButton(exit.label, variant: .tonal, size: .sm, action: exit.action)
            .environment(\.organicButtonMinHeight, ModalMetrics.minButtonHeight)
            .fixedSize()
        if let id { pill.accessibilityIdentifier(id) } else { pill }
    }
}
