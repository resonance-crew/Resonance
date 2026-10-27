import DesignSystem
import ResonanceKit
import SwiftUI

// What a long-press on a message offers (round 16 §3, LINE's and Instagram's way): the thread dims and
// softens and the message is lifted where it lies — the lift is what says it is the one chosen — with the
// five reactions always directly above it and its actions always directly below: Reply, Copy, the link it
// leads to (Open, Copy — leading the list when the finger was on it), 收回 for one's own plain message of
// the last day, 檢舉這則訊息 for theirs, and Retry / Delete for one that didn't go, over a quiet line with
// the full time. When both don't fit round the message where it is, the message moves, never the menus.
// The twin of Android's ThreadActions.

extension MessageMenu {
    /// A row the list can hold.
    nonisolated enum Row: String, CaseIterable {
        case openLink = "open-link", copyLink = "copy-link", reply, copy, unsend, report, retry, discard

        /// Its glyph: 開啟連結 the arrow out and 複製連結 the link (review S8 — never 複製's twin two rows
        /// away); 收回 the turn back, 檢舉 the flag.
        var icon: IconName {
            switch self {
            case .openLink: .arrowRight
            case .copyLink: .link
            case .reply: .reply
            case .copy: .copy
            case .unsend: .restore
            case .report: .flag
            case .retry: .send
            case .discard: .trash
            }
        }
    }

    /// Which rows the list has, in their order (pure, so it is pinned): Reply, Copy, the link's Open and Copy,
    /// 收回, 檢舉這則訊息, then Retry and Delete for one that didn't go — the link's two first when the finger
    /// was on it (review S8).
    nonisolated static func rows(link: Bool, onLink: Bool, reply: Bool, copy: Bool, unsend: Bool, report: Bool,
                                 failed: Bool) -> [Row] {
        var rows: [Row] = []
        let linkRows: [Row] = link ? [.openLink, .copyLink] : []
        if onLink { rows += linkRows }
        if reply { rows.append(.reply) }
        if copy { rows.append(.copy) }
        if !onLink { rows += linkRows }
        if unsend { rows.append(.unsend) }
        if report { rows.append(.report) }
        if failed { rows += [.retry, .discard] }
        return rows
    }

    /// The list's rows for the message pressed, in their order (``rows(link:onLink:reply:copy:unsend:report:failed:)``).
    /// `copied` is told when something went to the clipboard (the thread says so: nothing else would).
    func items(model: ThreadModel, reply: @escaping () -> Void, openLink: @escaping (URL) -> Void,
               copied: @escaping () -> Void, unsend: @escaping () -> Void, report: @escaping () -> Void) -> [OrganicMenuItem] {
        let message = row.message
        let rows = Self.rows(link: link != nil, onLink: onLink && link != nil, reply: model.canReply(message), copy: !message.text.isEmpty,
                             unsend: model.me.map { message.canUnsend(viewer: $0) } ?? false,
                             report: !model.isMine(message) && message.delivery == .delivered && !message.isUnsent,
                             failed: message.delivery == .failed)
        return rows.map { row in
            switch row {
            case .openLink:
                return OrganicMenuItem(id: row.rawValue, title: L10n.Messages.openLink, icon: row.icon) { if let link { openLink(link) } }
            case .copyLink:
                return OrganicMenuItem(id: row.rawValue, title: L10n.Messages.copyLink, icon: row.icon) {
                    UIPasteboard.general.url = link
                    copied()
                }
            case .reply:
                return OrganicMenuItem(id: row.rawValue, title: L10n.Messages.reply, icon: row.icon, action: reply)
            case .copy:
                return OrganicMenuItem(id: row.rawValue, title: L10n.Native.copy, icon: row.icon) {
                    UIPasteboard.general.string = message.text
                    copied()
                }
            case .unsend:
                // Plain colour: taking one's own words back is no danger (its confirm says what it does).
                return OrganicMenuItem(id: row.rawValue, title: L10n.Messages.unsend, icon: row.icon, action: unsend)
            case .report:
                return OrganicMenuItem(id: row.rawValue, title: L10n.Safety.reportThisMessage, icon: row.icon, action: report)
            case .retry:
                return OrganicMenuItem(id: row.rawValue, title: L10n.Messages.retry, icon: row.icon) { model.retry(message.key) }
            case .discard:
                return OrganicMenuItem(id: row.rawValue, title: L10n.Messages.discardFailed, icon: row.icon, danger: true) {
                    model.discard(message.key)
                }
            }
        }
    }
}

private let menuGap: CGFloat = 10
private let menuMargin: CGFloat = 12

/// Where the press layer puts things (round 16 §3, round 17 §2), in the window's space: the tray 8 over the
/// lifted message, the list 10 under it, all 12 inside the region the scrim covers — the thread's body under
/// its header, beside the list's rule in two panes — and inside the safe area (and the keyboard) at the foot.
/// When both fit round the message where it lies nothing moves; else the message glides by the least
/// distance that fits both — up when the list would run off the foot, down when the tray would run under
/// the header. A message taller than the room left shows its top part only (`shownHeight`, its foot
/// fading). Pure, so it is pinned.
nonisolated struct PressPlacement: Equatable {
    /// How far the message moves (negative: up).
    var shift: CGFloat
    /// The message's height as shown.
    var shownHeight: CGFloat
    var clipped: Bool { shownHeight < fullHeight }
    var fullHeight: CGFloat
    /// The tray's top and the list's top.
    var trayY: CGFloat
    var listY: CGFloat

    /// - Parameters:
    ///   - top: where the scrim's region starts (the thread header's foot).
    ///   - bottom: where the room ends at the foot (the window's foot less the safe area or the keyboard).
    static func of(frame: CGRect, top regionTop: CGFloat, bottom regionBottom: CGFloat, tray: Bool,
                   listHeight: CGFloat) -> PressPlacement {
        let top = regionTop + PressMetrics.margin
        let bottom = regionBottom - PressMetrics.margin
        let above = tray ? PressMetrics.trayHeight + PressMetrics.trayGap : 0
        let below = PressMetrics.listGap + listHeight
        let room = max(0, bottom - top - above - below)
        let shown = min(frame.height, room)
        var y = frame.minY
        if y + shown + below > bottom { y = bottom - below - shown }
        if y - above < top { y = top + above }
        return PressPlacement(shift: y - frame.minY, shownHeight: shown, fullHeight: frame.height,
                              trayY: y - above, listY: y + shown + PressMetrics.listGap)
    }

    /// How much the message is lifted: 1.03, but never more than 4 at its top and foot.
    static func lift(height: CGFloat) -> CGFloat {
        guard height > 0 else { return 1.03 }
        return min(1.03, 1 + 8 / height)
    }

    /// Where a sheet `width` wide starts across the window: its side's edge flush with the message's (your
    /// own: the right edges; theirs: the left), kept `margin` inside the region's sides (`leading` … `trailing`).
    static func x(width: CGFloat, frame: CGRect, mine: Bool, leading: CGFloat = 0, trailing: CGFloat) -> CGFloat {
        let wanted = mine ? frame.maxX - width : frame.minX
        let low = leading + PressMetrics.margin
        return min(max(wanted, low), max(low, trailing - PressMetrics.margin - width))
    }
}

/// The long-press layer: the message drawn again where it lies (lifted 1.03 on a spring, moved only if the
/// tray and the list don't fit round it), the reactions over it (when it takes reactions) floating on the
/// scrim, and the actions' sheet under it. The scrim itself is the thread's (round 17 §2: it dims and
/// softens the thread's body alone — never its header, the list beside it or the rule between them), told
/// through `dimmed`; this layer only takes the taps beside the menus. A tap there (or the escape gesture)
/// puts it back.
struct MessageMenuOverlay: View {
    let menu: MessageMenu
    let ctx: ThreadContext
    let items: [OrganicMenuItem]
    let footer: String
    /// The screen's safe area (with the keyboard, when it is up): everything stays inside it.
    let safe: EdgeInsets
    /// The region the scrim covers, in the window's space: from the thread header's foot down, from the
    /// pane's rule across. The tray and the list stay 12 inside it.
    let region: CGRect
    /// The reactions it offers (nil: none — a letter, an unsent or undelivered message), and the viewer's.
    let reactions: ReactionChoice?
    /// The thread's scrim and softening, which come and go with this layer.
    @Binding var dimmed: Bool
    let onDismiss: () -> Void
    @State private var shown = false
    @State private var lifted = false
    @State private var placed = false
    @State private var leaving = false
    @State private var chosen: ReactionId??
    @AccessibilityFocusState private var trayFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The tray's choices: the viewer's current reaction and what choosing does.
    struct ReactionChoice {
        let current: ReactionId?
        let react: (ReactionId?) -> Void
    }

    var body: some View {
        GeometryReader { geo in
            let screen = geo.frame(in: .global)
            let mine = ctx.model.isMine(menu.row.message)
            let frame = menu.frame.offsetBy(dx: -screen.minX, dy: -screen.minY)
            let area = region.offsetBy(dx: -screen.minX, dy: -screen.minY)
            let listWidth = OrganicMenuPanel.width(items, footer: footer, widths: MenuSheetMetrics.pressWidths)
            let place = PressPlacement.of(frame: frame, top: area.minY, bottom: geo.size.height - safe.bottom,
                                          tray: reactions != nil, listHeight: PressMetrics.listHeight(rows: items.count, footer: true))
            let shift = placed ? place.shift : 0
            let x = { (width: CGFloat) in
                PressPlacement.x(width: width, frame: frame, mine: mine, leading: max(0, area.minX), trailing: geo.size.width)
            }
            ZStack(alignment: .topLeading) {
                // Over the whole screen, unseen: a tap beside the menus — the header's too — puts it back.
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture(perform: dismiss)
                    .accessibilityHidden(true)
                MessageCore(row: menu.row, ctx: ctx, interactive: false)
                    .frame(width: frame.width, alignment: mine ? .trailing : .leading)
                    // Too tall for the room: its top part, the foot fading out over 24 (whole otherwise, its
                    // reactions out in the gutter included).
                    .modifier(ClippedFoot(height: place.clipped ? place.shownHeight : nil))
                    // Lifted 1.03 — a tall message no more than 4 at each end, so the tray's 8 and the list's 10 stay.
                    .scaleEffect(lifted ? PressPlacement.lift(height: place.shownHeight) : 1, anchor: mine ? .trailing : .leading)
                    .offset(x: frame.minX, y: frame.minY + shift)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                if let reactions {
                    ReactionTray(current: chosen ?? reactions.current, shown: shown, reduceMotion: reduceMotion) { id in
                        choose(id, reactions: reactions)
                    }
                    .accessibilityFocused($trayFocused)
                    .offset(x: x(PressMetrics.trayWidth), y: place.trayY + (placed ? 0 : -place.shift))
                    .opacity(shown ? 1 : 0)
                }
                OrganicMenuPanel(items: items, seed: seedFromId(menu.row.message.key, start: 23), footer: footer,
                                 widths: MenuSheetMetrics.pressWidths) { item in
                    dismiss()
                    item.action()
                }
                .scaleEffect(shown ? 1 : 0.96, anchor: UnitPoint(x: mine ? 1 : 0, y: 0))
                .opacity(shown ? 1 : 0)
                .offset(x: x(listWidth), y: place.listY + (placed ? 0 : -place.shift))
            }
        }
        .ignoresSafeArea()
        .accessibilityAction(.escape, dismiss)
        .onEscapeKey(dismiss)
        .onAppear {
            withAnimation(.easeOut(duration: Soften.duration)) {
                shown = true
                dimmed = true
            }
            withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.32, dampingFraction: 0.55)) { lifted = true }
            // The message glides to where both fit (220 ms, a spring): the tray and the list come with it.
            withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(duration: 0.22, bounce: 0.12)) { placed = true }
            if reactions != nil { trayFocused = true }
        }
    }

    /// A reaction tapped: its disc shows, a selection tick, and the layer goes 150 ms later as the chip
    /// pops onto the bubble. The one already chosen, tapped again, is taken back.
    private func choose(_ id: ReactionId, reactions: ReactionChoice) {
        guard !leaving else { return }
        let next: ReactionId? = (chosen ?? reactions.current) == id ? nil : id
        chosen = .some(next)
        UISelectionFeedbackGenerator().selectionChanged()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(150))
            dismiss()
            withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.6)) { reactions.react(next) }
        }
    }

    /// The message settles back into its place as the scrim lifts, and the thread's own takes over.
    private func dismiss() {
        guard !leaving else { return }
        leaving = true
        withAnimation(.easeOut(duration: 0.12)) {
            shown = false
            lifted = false
            placed = false
            dimmed = false
        }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(120))
            onDismiss()
        }
    }
}

/// A lifted message taller than the room: its top `height`, the last 24 fading out — cut in height only, so
/// what hangs out at its sides (a reaction chip in the gutter) is never sliced by a straight edge (review F2).
private struct ClippedFoot: ViewModifier {
    let height: CGFloat?
    /// How far past the message's sides the mask reaches: past any chip in its gutter.
    private let sides: CGFloat = 80

    func body(content: Content) -> some View {
        if let height {
            content
                .frame(height: height, alignment: .top)
                .mask {
                    VStack(spacing: 0) {
                        Color.black
                        LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom).frame(height: 24)
                    }
                    .padding(.horizontal, -sides)
                }
        } else {
            content
        }
    }
}

/// The five reactions floating over the scrim (round 16 §3, round 17 §2: no paper of their own — the thread
/// under them is dimmed and softened already): 5 × 44 cells, the stickers 32, the viewer's own on its opaque
/// wobbly disc (``PressSheet/chosenDisc``); they pop in one after another (20 ms apart, 0.6 → 1), a fade
/// under Reduce Motion. The sticker under the finger grows and rises over its neighbours, Instagram's way
/// (``PressMetrics/stickerPressScale``): the finger is followed along the tray, so sliding it across presses
/// each sticker it comes over, lifting it chooses the one under it, and sliding it off the tray chooses none.
/// For VoiceOver a group named 心情 / Reactions, each sticker a button naming it, the chosen one selected.
private struct ReactionTray: View {
    let current: ReactionId?
    let shown: Bool
    let reduceMotion: Bool
    let onChoose: (ReactionId) -> Void
    /// The sticker under the finger while it is down on the tray (nil: up, or slid off it).
    @GestureState private var pressed: Int?

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(ReactionId.order.enumerated()), id: \.element) { i, id in
                let held = pressed == i
                ReactionGlyph(id, size: PressMetrics.traySticker)
                    // Pressed: the sticker alone grows and rises (on its own spring, apart from the pop-in);
                    // under Reduce Motion it only fades a little.
                    .animation(reduceMotion ? .easeOut(duration: 0.1)
                               : .spring(response: PressMetrics.stickerPressResponse, dampingFraction: PressMetrics.stickerPressDamping)) {
                        $0.scaleEffect(held && !reduceMotion ? PressMetrics.stickerPressScale : 1)
                            .offset(y: held && !reduceMotion ? -PressMetrics.stickerPressRise : 0)
                            .opacity(held && reduceMotion ? PressMetrics.stickerPressFade : 1)
                    }
                    .scaleEffect(shown || reduceMotion ? 1 : 0.6)
                    .opacity(shown ? 1 : 0)
                    .animation(reduceMotion ? .easeOut(duration: 0.15)
                               : .spring(response: 0.28, dampingFraction: 0.6).delay(shown ? Double(i) * 0.02 : 0), value: shown)
                    .frame(width: PressMetrics.trayCell, height: PressMetrics.trayCell)
                    .background {
                        if current == id {
                            WobCircleShape(seed: Double(i) * 7 + 3)
                                .fill(PressSheet.chosenDisc)
                                .padding(2)
                                .transition(.opacity)
                        }
                    }
                    // Grown, it is drawn over the stickers beside it.
                    .zIndex(held ? 1 : 0)
                    .accessibilityElement()
                    .accessibilityLabel(ReactionNames.name(id))
                    .accessibilityAddTraits(current == id ? [.isButton, .isSelected] : .isButton)
                    .accessibilityAction { onChoose(id) }
            }
        }
        .frame(width: PressMetrics.trayWidth, height: PressMetrics.trayHeight)
        .contentShape(Rectangle())
        // One finger on the whole tray, followed (``PressMetrics/trayIndex(at:)``): no sticker is a button of its
        // own for touch, so a slide from one to the next hands the press over rather than keeping the first.
        .gesture(
            DragGesture(minimumDistance: 0)
                .updating($pressed) { value, state, _ in state = PressMetrics.trayIndex(at: value.location) }
                .onEnded { value in
                    if let i = PressMetrics.trayIndex(at: value.location) { onChoose(ReactionId.order[i]) }
                }
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.Messages.reactionsLabel)
    }
}

/// The composer's ＋, open (round 7 §4.2): 圖片 · 卡片 on the menus' sheet (round 17 §1), hanging over the ＋
/// from its leading edge. It is the screen's own layer, never a presented one, so the field keeps its
/// keyboard. A tap beside it, or the escape gesture, closes it; a row closes it and does its part.
struct AttachMenuOverlay: View {
    /// The ＋, on the screen.
    let anchor: CGRect
    let items: [OrganicMenuItem]
    let onDismiss: () -> Void
    @State private var shown = false
    @State private var leaving = false

    var body: some View {
        GeometryReader { geo in
            let screen = geo.frame(in: .global)
            let plus = anchor.offsetBy(dx: -screen.minX, dy: -screen.minY)
            ZStack(alignment: .bottomLeading) {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture(perform: dismiss)
                    .accessibilityHidden(true)
                OrganicMenuPanel(items: items, seed: 29) { item in
                    dismiss()
                    item.action()
                }
                .scaleEffect(shown ? 1 : 0.94, anchor: .bottomLeading)
                .offset(y: shown ? 0 : 4)
                .opacity(shown ? 1 : 0)
                .padding(.leading, max(menuMargin, plus.minX))
                .padding(.bottom, max(menuMargin, geo.size.height - plus.minY + menuGap))
            }
        }
        .ignoresSafeArea()
        .accessibilityAction(.escape, dismiss)
        .onEscapeKey(dismiss)
        .onAppear { withAnimation(.timingCurve(0.2, 0.8, 0.3, 1, duration: 0.18)) { shown = true } }
    }

    private func dismiss() {
        guard !leaving else { return }
        leaving = true
        withAnimation(.easeOut(duration: 0.12)) { shown = false }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(120))
            onDismiss()
        }
    }
}
