import DesignSystem
import ResonanceKit
import SwiftUI

// What a long-press on a message offers (round 16 §3, LINE's and Instagram's way): the thread dims and
// the message is lifted where it lies — the lift is what says it is the one chosen — with the five
// reactions always directly above it and its actions always directly below: Reply, Copy, the link it
// leads to (Open, Copy), 收回 for one's own plain message of the last day, 檢舉這則訊息 for theirs,
// and Retry / Delete for one that didn't go, over a quiet line with the full time. When both don't fit
// round the message where it is, the message moves, never the menus. The twin of Android's ThreadActions.

extension MessageMenu {
    /// The list's rows for the message pressed, in their order.
    /// `copied` is told when something went to the clipboard (the thread says so: nothing else would).
    func items(model: ThreadModel, reply: @escaping () -> Void, openLink: @escaping (URL) -> Void,
               copied: @escaping () -> Void, unsend: @escaping () -> Void, report: @escaping () -> Void) -> [OrganicMenuItem] {
        let message = row.message
        var items: [OrganicMenuItem] = []
        if model.canReply(message) {
            items.append(OrganicMenuItem(id: "reply", title: L10n.Messages.reply, icon: .reply, action: reply))
        }
        if !message.text.isEmpty {
            items.append(OrganicMenuItem(id: "copy", title: L10n.Native.copy, icon: .copy) {
                UIPasteboard.general.string = message.text
                copied()
            })
        }
        if let link {
            items.append(OrganicMenuItem(id: "open-link", title: L10n.Messages.openLink, icon: .link) { openLink(link) })
            items.append(OrganicMenuItem(id: "copy-link", title: L10n.Messages.copyLink, icon: .copy) {
                UIPasteboard.general.url = link
                copied()
            })
        }
        if let me = model.me, message.canUnsend(viewer: me) {
            // Plain colour: taking one's own words back is no danger (its confirm says what it does).
            items.append(OrganicMenuItem(id: "unsend", title: L10n.Messages.unsend, icon: .restore, action: unsend))
        }
        if !model.isMine(message), message.delivery == .delivered, !message.isUnsent {
            items.append(OrganicMenuItem(id: "report", title: L10n.Safety.reportThisMessage, icon: .flag, action: report))
        }
        if message.delivery == .failed {
            items.append(OrganicMenuItem(id: "retry", title: L10n.Messages.retry, icon: .send) { model.retry(message.key) })
            items.append(OrganicMenuItem(id: "discard", title: L10n.Messages.discardFailed, icon: .trash, danger: true) {
                model.discard(message.key)
            })
        }
        return items
    }
}

private let menuGap: CGFloat = 10
private let menuMargin: CGFloat = 12

/// Where the press layer puts things (round 16 §3), in the window's space: the tray 8 over the lifted
/// message, the list 10 under it, all 12 inside the safe area (and the keyboard). When both fit round the
/// message where it lies nothing moves; else the message glides by the least distance that fits both —
/// up when the list would run off the foot, down when the tray would run off the top. A message taller
/// than the room left shows its top part only (`shownHeight`, its foot fading). Pure, so it is pinned.
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

    static func of(frame: CGRect, windowHeight: CGFloat, safeTop: CGFloat, safeBottom: CGFloat, tray: Bool,
                   listHeight: CGFloat) -> PressPlacement {
        let top = safeTop + PressMetrics.margin
        let bottom = windowHeight - safeBottom - PressMetrics.margin
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
    /// own: the right edges; theirs: the left), kept `margin` from the window's sides.
    static func x(width: CGFloat, frame: CGRect, mine: Bool, windowWidth: CGFloat) -> CGFloat {
        let wanted = mine ? frame.maxX - width : frame.minX
        return min(max(wanted, PressMetrics.margin), max(PressMetrics.margin, windowWidth - PressMetrics.margin - width))
    }
}

/// The long-press layer over the whole screen: the scrim, the message drawn again where it lies (lifted
/// 1.03 on a spring, moved only if the tray and the list don't fit round it), the reactions' tray over it
/// (when it takes reactions) and the actions' list under it, both on the borderless paper sheet. A tap on
/// the scrim (or the escape gesture) puts it back.
struct MessageMenuOverlay: View {
    let menu: MessageMenu
    let ctx: ThreadContext
    let items: [OrganicMenuItem]
    let footer: String
    /// The screen's safe area (with the keyboard, when it is up): everything stays inside it.
    let safe: EdgeInsets
    /// The reactions it offers (nil: none — a letter, an unsent or undelivered message), and the viewer's.
    let reactions: ReactionChoice?
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
            let listWidth = PressActionList.width(items)
            let place = PressPlacement.of(frame: frame, windowHeight: geo.size.height, safeTop: safe.top, safeBottom: safe.bottom,
                                          tray: reactions != nil, listHeight: PressMetrics.listHeight(rows: items.count, footer: true))
            let shift = placed ? place.shift : 0
            ZStack(alignment: .topLeading) {
                Tokens.scrim.opacity(shown ? 1 : 0)
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
                    .offset(x: PressPlacement.x(width: PressMetrics.trayWidth, frame: frame, mine: mine, windowWidth: geo.size.width),
                            y: place.trayY + (placed ? 0 : -place.shift))
                    .opacity(shown ? 1 : 0)
                }
                PressActionList(items: items, footer: footer, width: listWidth, seed: seedFromId(menu.row.message.key, start: 23)) { item in
                    dismiss()
                    item.action()
                }
                .scaleEffect(shown ? 1 : 0.96, anchor: UnitPoint(x: mine ? 1 : 0, y: 0))
                .opacity(shown ? 1 : 0)
                .offset(x: PressPlacement.x(width: listWidth, frame: frame, mine: mine, windowWidth: geo.size.width),
                        y: place.listY + (placed ? 0 : -place.shift))
            }
        }
        .ignoresSafeArea()
        .accessibilityAction(.escape, dismiss)
        .onEscapeKey(dismiss)
        .onAppear {
            withAnimation(.easeOut(duration: 0.15)) { shown = true }
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
        }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(120))
            onDismiss()
        }
    }
}

/// A lifted message taller than the room: its top `height`, the last 24 fading out.
private struct ClippedFoot: ViewModifier {
    let height: CGFloat?

    func body(content: Content) -> some View {
        if let height {
            content
                .frame(height: height, alignment: .top)
                .mask {
                    VStack(spacing: 0) {
                        Color.black
                        LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom).frame(height: 24)
                    }
                }
        } else {
            content
        }
    }
}

/// The five reactions on the paper sheet (round 16 §3): 5 × 44 cells, the stickers 32, the viewer's own on
/// a terracotta-light wobbly disc; they pop in one after another (20 ms apart, 0.6 → 1), a fade under
/// Reduce Motion. For VoiceOver a group named 心情 / Reactions, each sticker a button naming it, the chosen
/// one selected.
private struct ReactionTray: View {
    let current: ReactionId?
    let shown: Bool
    let reduceMotion: Bool
    let onChoose: (ReactionId) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(ReactionId.order.enumerated()), id: \.element) { i, id in
                Button { onChoose(id) } label: {
                    ReactionGlyph(id, size: PressMetrics.traySticker)
                        .scaleEffect(shown || reduceMotion ? 1 : 0.6)
                        .opacity(shown ? 1 : 0)
                        .animation(reduceMotion ? .easeOut(duration: 0.15)
                                   : .spring(response: 0.28, dampingFraction: 0.6).delay(shown ? Double(i) * 0.02 : 0), value: shown)
                        .frame(width: PressMetrics.trayCell, height: PressMetrics.trayCell)
                        .background {
                            if current == id {
                                WobCircleShape(seed: Double(i) * 7 + 3)
                                    .fill(Tokens.terracottaLight)
                                    .padding(2)
                                    .transition(.opacity)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(OrganicPressStyle(inset: 4))
                .accessibilityLabel(ReactionNames.name(id))
                .accessibilityAddTraits(current == id ? .isSelected : [])
            }
        }
        .padding(PressMetrics.trayPad)
        .frame(width: PressMetrics.trayWidth, height: PressMetrics.trayHeight)
        .background { PressSheetBackground(seed: 61) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.Messages.reactionsLabel)
    }
}

/// The message's actions on the paper sheet (round 16 §3): no pen line, no rule between the rows — rows of
/// 44, the glyph then the words, as wide as the longest (216 to 280) — and the full send time as its quiet
/// last line (32, 6 more air above it). A destructive row (delete what didn't go) keeps its warning wash.
struct PressActionList: View {
    let items: [OrganicMenuItem]
    let footer: String
    let width: CGFloat
    let seed: Double
    let onChoose: (OrganicMenuItem) -> Void
    @State private var choosing = false

    /// The list's width: its longest row (glyph 17, 10, words at 15) and its sides, held between 216 and 280.
    @MainActor static func width(_ items: [OrganicMenuItem]) -> CGFloat {
        let font = AppFonts.uiFont(.body, size: 15)
        let words = items.map { ceil(($0.title as NSString).size(withAttributes: [.font: font]).width) }.max() ?? 0
        return min(PressMetrics.listMaxWidth, max(PressMetrics.listMinWidth, PressMetrics.listPadX * 2 + 17 + 10 + words))
    }

    var body: some View {
        let shape = PressSheet(seed: seed)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(items) { item in
                Button { choose(item) } label: {
                    HStack(spacing: 10) {
                        OrganicIcon(item.icon, size: 17, color: Tokens.terracotta, strokeWidth: Tokens.ink)
                        Text(item.title)
                            .font(AppFonts.body(15))
                            .foregroundStyle(Tokens.text)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                    }
                    .opacity(item.disabled ? 0.45 : 1)
                    .padding(.horizontal, PressMetrics.listPadX)
                    .frame(maxWidth: .infinity, minHeight: PressMetrics.listRow, maxHeight: PressMetrics.listRow, alignment: .leading)
                    .background { if item.danger { Palette.mix(.yellow, 0.25, .menuPaper) } }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressRowStyle())
                .disabled(item.disabled)
            }
            Text(footer)
                .font(AppFonts.body(12))
                .foregroundStyle(Tokens.textMuted)
                .lineLimit(1)
                .padding(.horizontal, PressMetrics.listPadX)
                .frame(maxWidth: .infinity, minHeight: PressMetrics.listFooter, maxHeight: PressMetrics.listFooter, alignment: .leading)
                .padding(.top, PressMetrics.listFooterGap)
        }
        .padding(.vertical, PressMetrics.listPadY)
        .frame(width: width)
        .background { PressSheetBackground(seed: seed) }
        .clipShape(shape)
        .accessibilityElement(children: .contain)
    }

    /// A tap shows its wash first: the choice is told once it has.
    private func choose(_ item: OrganicMenuItem) {
        guard !choosing else { return }
        choosing = true
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(120))
            onChoose(item)
        }
    }
}

/// A row's press: the ink's wash across the row, inside the sheet.
private struct PressRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background { Tokens.terracotta.opacity(configuration.isPressed ? 0.12 : 0) }
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

/// The composer's ＋, open (round 7 §4.2): 圖片 · 卡片 on the organic menu's panel, hanging over the ＋
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
