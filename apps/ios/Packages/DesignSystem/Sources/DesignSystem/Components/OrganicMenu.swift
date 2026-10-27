import SwiftUI
import UIKit

// MARK: - Menu

/// One row of an ``OrganicMenu``.
public struct OrganicMenuItem: Identifiable {
    public let id: String
    public let title: String
    public let icon: IconName
    /// Destructive rows sit on the warning wash.
    public var danger: Bool
    /// Not possible yet (生成圖片 with no story to draw from): dimmed, and it takes no tap.
    public var disabled: Bool
    public let action: () -> Void

    public init(id: String, title: String, icon: IconName, danger: Bool = false, disabled: Bool = false,
                action: @escaping () -> Void) {
        self.id = id
        self.title = title
        self.icon = icon
        self.danger = danger
        self.disabled = disabled
        self.action = action
    }
}

/// How a menu's trigger is drawn. In a bar (the card page's header) it is a
/// `bare` glyph like the back arrow beside it — the bar is the frame. Over
/// content (a card's cover in the card box) it is a `chip`: a wobbly cream
/// squircle with no rim, so it stays legible over a picture without adding a
/// pen line. A `pill` says what it opens in words beside its glyph, on the
/// paper button's face (the writer's 更換封面 on the cover it changes): solid
/// paper reads on any picture.
public enum MenuTrigger: Sendable, Equatable {
    case chip, bare
    case pill(String, IconName)
}

/// The web's organic「⋯」dropdown: a trigger that drops a hand-drawn panel —
/// wavy pen lines between the rows, ink spreading from the finger under the
/// one being pressed (every control's press), and the warning wash under a
/// destructive row. Rides the theme terracotta, or a card's hue.
public struct OrganicMenu: View {
    let items: [OrganicMenuItem]
    let label: String
    var seed: Double
    var hue: Double?
    var triggerSize: CGFloat
    var icon: IconName
    var trigger: MenuTrigger

    public init(items: [OrganicMenuItem], label: String, seed: Double = 7, hue: Double? = nil,
                triggerSize: CGFloat = 38, icon: IconName = .dots, trigger: MenuTrigger = .chip) {
        self.items = items
        self.label = label
        self.seed = seed
        self.hue = hue
        self.triggerSize = triggerSize
        self.icon = icon
        self.trigger = trigger
    }

    /// The open panel and the trigger's frame it hangs from, fixed at the tap — carried by the
    /// presentation itself: a cover built from `isPresented` reads the state as it was before the tap,
    /// and so hung the panel from the frame of a moment before — `.zero` for a trigger just rebuilt.
    @State private var presented: MenuPresentation?
    private var open: Bool { presented != nil }
    /// Where the trigger is, as the layout last reported it (a fallback: a trigger rebuilt a moment ago
    /// — a branch swapped, an `.id` changed, a step sliding in — reports again only after its layout).
    @State private var anchor: CGRect = .zero
    /// The trigger itself, read at the moment of the tap (C3): what the panel hangs from.
    @State private var probe = MenuTriggerProbe()
    /// A pill wearing its card's colours (round 9 §8: 更換封面 on a card's picture).
    var pillPalette: CardPalette?

    /// The pill trigger in a card's colours — the family's fill, its pen line, its deep words — and the
    /// panel it drops in the same hue.
    public func pill(palette: CardPalette?) -> OrganicMenu {
        var copy = self
        copy.pillPalette = palette
        if let palette { copy.hue = palette.hue }
        return copy
    }

    public var body: some View {
        let colors = MenuColors(hue: hue)
        triggerView(colors)
            .accessibilityLabel(label)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { anchor = $0 }
            .background { MenuTriggerProbeView(probe: probe).accessibilityHidden(true) }
            .fullScreenCover(item: $presented) { presentation in
                MenuStage(items: items, seed: presentation.seed, colors: colors, face: face(presentation.trigger)) { item in
                    withTransaction(\.disablesAnimations, true) { presented = nil }
                    // After the cover is gone, so a dialog the row opens can present.
                    if let item {
                        Task { @MainActor in
                            try? await Task.sleep(for: .milliseconds(150))
                            item.action()
                        }
                    }
                }
                .presentationBackground(.clear)
            }
    }

    @ViewBuilder private func triggerView(_ colors: MenuColors) -> some View {
        switch trigger {
        case let .pill(title, glyph):
            // The paper button itself, with its own ink and haptic: what it opens says so in words — or,
            // over a card's picture, the button in that card's colours.
            Group {
                if let pillPalette {
                    OrganicButton(title, icon: glyph, variant: .paper, size: .sm, action: show)
                        .face(.cardChip(pillPalette), outline: pillPalette.border)
                } else {
                    OrganicButton(title, icon: glyph, variant: .paper, size: .sm, action: show)
                }
            }
            .fixedSize()
            .frame(minHeight: 44)
        case .chip, .bare:
            Button(action: show) {
                Group {
                    if trigger == .bare {
                        OrganicIcon(icon, size: 20, color: open ? Tokens.terracotta : Tokens.text, strokeWidth: OrganicIconButton.restingStroke)
                    } else {
                        OrganicMenuChip(size: triggerSize, seed: seed, icon: icon, colors: colors, active: open)
                    }
                }
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(OrganicPressStyle(inset: trigger == .bare ? 4 : max(0, (44 - triggerSize) / 2)))
        }
    }

    /// The tap: the panel is placed from where the trigger is now — read off the trigger itself, else
    /// from where the layout last put it — and never from a frame that isn't one (C3: a trigger rebuilt
    /// under the finger reported `.zero`, and the panel hung from the screen's top-left corner). With
    /// neither yet, it waits a layout pass or two and reads the trigger again.
    private func show() {
        if present() { return }
        Task { @MainActor in
            for _ in 0..<3 {
                try? await Task.sleep(for: .milliseconds(17))
                if present() { return }
            }
        }
    }

    /// Opens the panel when the trigger's frame is one to hang it from (answered whether it did).
    private func present() -> Bool {
        guard let frame = MenuAnchor.resolve(live: probe.frame(), stored: anchor, screen: probe.screen()) else { return false }
        // A fresh panel each time, like the web's.
        let presentation = MenuPresentation(trigger: frame, seed: Double(Int.random(in: 0..<10_000)))
        withTransaction(\.disablesAnimations, true) { presented = presentation }
        return true
    }

    /// What the panel hangs from: a chip centred in its 44 box, a bare glyph's 36 wash in its box, a
    /// pill's own face.
    private func face(_ anchor: CGRect) -> CGRect {
        switch trigger {
        case .pill: anchor
        case .bare: anchor.insetBy(dx: max(0, (anchor.width - 36) / 2), dy: max(0, (anchor.height - 36) / 2))
        case .chip: anchor.insetBy(dx: max(0, (anchor.width - triggerSize) / 2), dy: max(0, (anchor.height - triggerSize) / 2))
        }
    }
}

/// An open menu: the trigger's frame at the tap, and the panel's seed.
struct MenuPresentation: Identifiable {
    let id = UUID()
    let trigger: CGRect
    let seed: Double
}

/// Where a menu's trigger is, read when it is tapped (C3): the frame the layout last reported can be
/// stale or `.zero` — the trigger rebuilt a moment before (a branch swapped under a GeometryReader, an
/// `.id` changed, the publish step's slide still running) — so the trigger's own view is asked.
public nonisolated enum MenuAnchor {
    /// A frame a panel can hang from: a real size, on the screen — never `.zero` (which pinned the
    /// panel to the top-left corner) nor a frame left behind somewhere off the window.
    public static func usable(_ frame: CGRect, screen: CGRect?) -> Bool {
        guard !frame.isNull, !frame.isInfinite, frame.width >= 1, frame.height >= 1,
              frame.minX.isFinite, frame.minY.isFinite else { return false }
        guard let screen, !screen.isEmpty else { return true }
        return screen.intersects(frame)
    }

    /// The frame to place the panel from at the tap: the trigger's own (`live`), else the layout's last
    /// report (`stored`) — whichever is a frame at all; nil, neither: wait for the layout and ask again.
    public static func resolve(live: CGRect?, stored: CGRect, screen: CGRect?) -> CGRect? {
        if let live, usable(live, screen: screen) { return live }
        if usable(stored, screen: screen) { return stored }
        return nil
    }
}

/// The trigger's own view, kept to ask where it is.
@MainActor final class MenuTriggerProbe {
    weak var view: UIView?

    /// The trigger's frame in its window (SwiftUI's `.global` there), nil while it isn't in one.
    func frame() -> CGRect? {
        guard let view, view.window != nil else { return nil }
        return view.convert(view.bounds, to: nil)
    }

    /// The window's bounds, the screen the panel is placed in.
    func screen() -> CGRect? { view?.window?.bounds }
}

/// A view laid out exactly over the trigger (its background), holding nothing.
private struct MenuTriggerProbeView: UIViewRepresentable {
    let probe: MenuTriggerProbe

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        probe.view = view
        return view
    }

    func updateUIView(_ view: UIView, context: Context) { probe.view = view }
}

/// OrganicMenu's trigger as a face of its own, for other header actions that
/// should read as the same control (a ShareLink's label): bare in a bar, a
/// chip over content.
public struct OrganicChipFace: View {
    let icon: IconName
    var size: CGFloat
    var seed: Double
    var hue: Double?
    var trigger: MenuTrigger

    public init(_ icon: IconName, size: CGFloat = 38, seed: Double = 7, hue: Double? = nil, trigger: MenuTrigger = .chip) {
        self.icon = icon
        self.size = size
        self.seed = seed
        self.hue = hue
        self.trigger = trigger
    }

    public var body: some View {
        Group {
            if trigger == .bare {
                OrganicIcon(icon, size: 20, color: Tokens.text, strokeWidth: OrganicIconButton.restingStroke)
            } else {
                OrganicMenuChip(size: size, seed: seed, icon: icon, colors: MenuColors(hue: hue), active: false)
            }
        }
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
    }
}

/// The trigger: a squircle chip (radius 0.42 of its side, one turn a side)
/// in the menu's cream, no rim, the glyph at 0.53 of the side in the pen.
struct OrganicMenuChip: View {
    let size: CGFloat
    let seed: Double
    let icon: IconName
    let colors: MenuColors
    var active: Bool

    var body: some View {
        let shape = WobRectShape(radius: size * 0.42, seed: seed, mag: size * 0.03, options: WobRectOptions(
            curve: 1.4, cornerJitter: 2.4, segmentsH: .count(1), segmentsV: .count(1)))
        OrganicIcon(icon, size: (size * 0.53).rounded(), color: active ? colors.borderHover : colors.border, strokeWidth: Tokens.ink)
            .frame(width: size, height: size)
            .background { shape.fill(colors.cream.opacity(0.94)) }
    }
}

/// The dropped panel, anchored 8 under the trigger's trailing edge — over it instead when the
/// screen has no room for it below (a trigger low on the page); a tap anywhere else closes it.
struct MenuStage: View {
    let items: [OrganicMenuItem]
    let seed: Double
    let colors: MenuColors
    /// The trigger's visible face, in the screen's space.
    let face: CGRect
    let close: (OrganicMenuItem?) -> Void
    @State private var shown = false

    var body: some View {
        GeometryReader { geo in
            let screen = geo.frame(in: .global)
            let place = MenuDrop.place(face: face, screen: screen, panelHeight: MenuSheetMetrics.height(rows: items.count))
            let above = place.above
            ZStack(alignment: above ? .bottomTrailing : .topTrailing) {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { close(nil) }
                    .accessibilityHidden(true)
                panel
                    .scaleEffect(shown ? 1 : 0.94, anchor: above ? .bottomTrailing : .topTrailing)
                    .offset(y: shown ? 0 : (above ? 4 : -4))
                    .opacity(shown ? 1 : 0)
                    .padding(above ? .bottom : .top, place.vertical)
                    .padding(.trailing, place.trailing)
            }
        }
        .ignoresSafeArea()
        .accessibilityAction(.escape) { close(nil) }
        .onEscapeKey { close(nil) }
        .onAppear { withAnimation(.timingCurve(0.2, 0.8, 0.3, 1, duration: 0.18)) { shown = true } }
    }

    private var panel: some View {
        OrganicMenuPanel(items: items, seed: seed, colors: colors) { close($0) }
    }
}

/// Where a dropped panel goes from its trigger: 8 under it, unless that runs past the screen's foot
/// (12 from it) while there is room over it.
public nonisolated enum MenuDrop {
    public static let gap: CGFloat = 8
    public static let margin: CGFloat = 12

    public static func above(face: CGRect, screen: CGRect, panelHeight: CGFloat) -> Bool {
        let fitsBelow = face.maxY + gap + panelHeight <= screen.maxY - margin
        let fitsAbove = face.minY - gap - panelHeight >= screen.minY + margin
        return !fitsBelow && fitsAbove
    }

    /// Where the panel stands in the screen: over or under the trigger, the padding from the screen's
    /// top (under) or bottom (over), and from its trailing edge — the panel's trailing edge on the
    /// trigger's, never closer than `margin` to the screen's.
    public struct Placement: Equatable, Sendable {
        public var above: Bool
        public var vertical: CGFloat
        public var trailing: CGFloat
    }

    public static func place(face: CGRect, screen: CGRect, panelHeight: CGFloat) -> Placement {
        let above = above(face: face, screen: screen, panelHeight: panelHeight)
        return Placement(above: above,
                         vertical: above ? screen.maxY - face.minY + gap : face.maxY + gap - screen.minY,
                         trailing: max(margin, screen.maxX - face.maxX))
    }
}

/// The menus' one surface (round 17 §1): every menu — a ⋯ dropped from its trigger, the composer's ＋,
/// a message held — is this paper sheet. Borderless paper (``MenuColors/paper``: the menus' paper, a
/// step toward the ink at night) under the paper's grain (0.3) over the whole wobbly outline, no pen
/// and no rule between the rows, lifted off the page by a soft shadow that follows the wobble
/// (``SheetShadow``) instead of an outline. Rows 44: the glyph 17, 12, the words at 15, 20 in from
/// either side, the sheet as wide as its longest row (``MenuSheetMetrics/width(titles:footer:)``, 200 to 300).
/// A press spreads the ink from the finger, clipped to its row's band inside the outline (the bands
/// part on unseen wavy lines, rowMenu.ts); a destructive row keeps its warning wash. With a `footer`,
/// one quiet line closes it, at the trailing end (a message's time, under its long-press menu).
/// ``OrganicMenu`` drops it from its trigger; a screen can hang it anywhere (the thread's long-press,
/// the composer's ＋). `onChoose` comes a moment after the tap, once the ink has been seen; the
/// sheet takes one choice.
public struct OrganicMenuPanel: View {
    let items: [OrganicMenuItem]
    let seed: Double
    let footer: String?
    let colors: MenuColors
    let onChoose: (OrganicMenuItem) -> Void
    @State private var pressed: Int?
    @State private var ink = MenuInk()
    @State private var choosing = false

    public init(items: [OrganicMenuItem], seed: Double, footer: String? = nil, hue: Double? = nil,
                onChoose: @escaping (OrganicMenuItem) -> Void) {
        self.init(items: items, seed: seed, footer: footer, colors: MenuColors(hue: hue), onChoose: onChoose)
    }

    init(items: [OrganicMenuItem], seed: Double, footer: String? = nil, colors: MenuColors, onChoose: @escaping (OrganicMenuItem) -> Void) {
        self.items = items
        self.seed = seed
        self.footer = footer
        self.colors = colors
        self.onChoose = onChoose
    }

    /// The sheet's width for these rows (and footer): its longest line and its sides.
    @MainActor public static func width(_ items: [OrganicMenuItem], footer: String? = nil) -> CGFloat {
        MenuSheetMetrics.width(titles: items.map(\.title), footer: footer)
    }

    public var body: some View {
        let width = Self.width(items, footer: footer)
        let height = MenuSheetMetrics.height(rows: items.count, footer: footer != nil)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                Button { choose(item) } label: {
                    HStack(spacing: MenuSheetMetrics.gap) {
                        OrganicIcon(item.icon, size: MenuSheetMetrics.glyph, color: pressed == i ? colors.borderHover : colors.border,
                                    strokeWidth: Tokens.ink)
                        Text(item.title)
                            .font(AppFonts.body(MenuSheetMetrics.textSize))
                            .foregroundStyle(pressed == i ? colors.borderHover : Tokens.text)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                    // A row not possible yet keeps its place, dimmed as a button that isn't is.
                    .opacity(item.disabled ? 0.45 : 1)
                    .padding(.horizontal, MenuSheetMetrics.padX)
                    .frame(maxWidth: .infinity, minHeight: MenuSheetMetrics.row, maxHeight: MenuSheetMetrics.row, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(MenuRowStyle(index: i, pressed: $pressed, ink: $ink))
                .disabled(item.disabled)
                // Where the finger landed, in the sheet's space: the ink spreads from there.
                .simultaneousGesture(DragGesture(minimumDistance: 0, coordinateSpace: .named(MenuSheetMetrics.space)).onChanged { g in
                    if g.translation == .zero { ink.origin = g.startLocation }
                })
            }
            if let footer {
                // Information, not a fifth action: quiet, at the trailing end, right under the last row.
                Text(footer)
                    .font(AppFonts.body(MenuSheetMetrics.footerSize))
                    .foregroundStyle(Tokens.textMuted)
                    .lineLimit(1)
                    .padding(.horizontal, MenuSheetMetrics.padX)
                    .frame(maxWidth: .infinity, minHeight: MenuSheetMetrics.footer, maxHeight: MenuSheetMetrics.footer, alignment: .trailing)
            }
        }
        .padding(.top, MenuSheetMetrics.padTop)
        .padding(.bottom, footer == nil ? MenuSheetMetrics.padBottom : MenuSheetMetrics.footerPadBottom)
        .frame(width: width, height: height, alignment: .top)
        .background {
            MenuSheetBackground(size: CGSize(width: width, height: height), seed: seed, colors: colors,
                                dangerIndex: items.firstIndex(where: \.danger), ink: ink, rows: items.count,
                                bands: items.count + (footer == nil ? 0 : 1))
        }
        .coordinateSpace(.named(MenuSheetMetrics.space))
        .accessibilityElement(children: .contain)
    }

    /// A tap is shorter than the ink's spread: the choice is told once it has shown.
    private func choose(_ item: OrganicMenuItem) {
        guard !choosing else { return }
        choosing = true
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(150))
            onChoose(item)
        }
    }
}

/// The pressed row's ink: where it started, how far it has spread (0…1 of
/// the way to the panel's far corner) and how much is still on the paper.
struct MenuInk {
    var row: Int?
    var origin: CGPoint?
    var reach: CGFloat = 0
    var opacity: Double = 0
}

/// Reports the pressed row and runs its ink: the spread on press, the lift
/// once the finger is up and the spread has run its course.
struct MenuRowStyle: ButtonStyle {
    let index: Int
    @Binding var pressed: Int?
    @Binding var ink: MenuInk

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, isPressed in
                if isPressed {
                    pressed = index
                    ink.row = index
                    ink.opacity = 1
                    ink.reach = 0
                    withAnimation(InkTiming.spread) { ink.reach = 1 }
                } else {
                    if pressed == index { pressed = nil }
                    // A quick tap still shows the spread before it lifts (unless another row has the ink by then).
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(200))
                        guard ink.row == index, pressed == nil else { return }
                        withAnimation(InkTiming.lift) { ink.opacity = 0 }
                    }
                }
            }
    }
}

/// The sheet's paper, its shadow, the washes and its grain, all of them one outline: the paper's fill
/// casts the shadow; the warning wash and the pressed row's ink are cut to their band inside it; the
/// grain covers exactly the paper — laid wider than the box by ``MenuSheetMetrics/grainOverflow`` and
/// clipped to the same outline, since the wobble swings past the box (round 17 §1: a strip at the top
/// edge had paper and no grain, and the sheet read as two layers).
struct MenuSheetBackground: View {
    let size: CGSize
    let seed: Double
    let colors: MenuColors
    let dangerIndex: Int?
    let ink: MenuInk
    /// The rows, and the bands they and a footer make (the footer's takes no ink).
    let rows: Int
    let bands: Int

    var body: some View {
        let shape = MenuSheetShape(seed: seed)
        let rect = CGRect(origin: .zero, size: size)
        let outer = shape.path(in: rect)
        let w = Double(size.width), h = Double(size.height)
        let boundaries = MenuSheetMetrics.boundaries(bands: bands, width: w, height: h, seed: seed)
        let pad = MenuSheetMetrics.pad(height: h)
        ZStack(alignment: .topLeading) {
            shape.fill(colors.paper).sheetShadow()
            if let dangerIndex, dangerIndex < rows {
                let region = rowRegion(dangerIndex, count: bands, boundaries: boundaries, w: w, h: h, pad: pad).path()
                MenuPathShape(path: region.intersection(outer)).fill(colors.dangerWash(pressed: false))
            }
            if let row = ink.row, row < rows {
                let origin = ink.origin ?? CGPoint(x: size.width / 2, y: MenuSheetMetrics.padTop + (CGFloat(row) + 0.5) * MenuSheetMetrics.row)
                let far = hypot(max(origin.x, size.width - origin.x), max(origin.y, size.height - origin.y)) + 4
                let region = rowRegion(row, count: bands, boundaries: boundaries, w: w, h: h, pad: pad).path()
                Circle()
                    .fill(row == dangerIndex ? colors.dangerWash(pressed: true) : colors.borderHover.opacity(0.15))
                    .frame(width: far * 2 * ink.reach, height: far * 2 * ink.reach)
                    .position(origin)
                    .frame(width: size.width, height: size.height)
                    .clipShape(MenuPathShape(path: region.intersection(outer)))
                    .opacity(ink.opacity)
            }
            GrainLayer(shape: shape, mode: .tile, opacity: 0.3, tile: "grain-card", overflow: MenuSheetMetrics.grainOverflow)
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// A fixed path as a shape (a row's region, for clipping its ink).
private nonisolated struct MenuPathShape: Shape {
    let path: Path
    func path(in rect: CGRect) -> Path { path }
}

/// The sheet's outline: the wobble at radius 26 (no more than half its height), as the press layer's
/// paper has always been.
public nonisolated struct MenuSheetShape: Shape {
    public var seed: Double

    public init(seed: Double) {
        self.seed = seed
    }

    public func path(in rect: CGRect) -> Path {
        WobRectShape(radius: min(MenuSheetMetrics.radius, Double(rect.height) / 2), seed: seed + 100).path(in: rect)
    }
}

/// The sheet's measures (round 17 §1–§2), the same on the web and Android: rows 44; the glyph 17, 12, the
/// words at 15, 20 in from either side; 6 of paper over the first row and under the last — or, with a
/// footer, its 24 line right under the last row and 10 under it.
public nonisolated enum MenuSheetMetrics {
    public static let row: CGFloat = 44
    public static let glyph: CGFloat = 17
    public static let gap: CGFloat = 12
    public static let textSize: CGFloat = 15
    public static let padX: CGFloat = 20
    public static let padTop: CGFloat = 6
    public static let padBottom: CGFloat = 6
    public static let footer: CGFloat = 24
    public static let footerSize: CGFloat = 12
    public static let footerPadBottom: CGFloat = 10
    public static let radius: Double = 26
    /// How far the grain is laid past the box: past the furthest the wobble swings out.
    public static let grainOverflow: CGFloat = 10
    /// At least this wide, so a menu of two short rows still reads as a sheet rather than a blob; never
    /// wider than the most (a longer row's words end in an ellipsis). The web's 200 and 300.
    public static let minWidth: CGFloat = 200
    public static let maxWidth: CGFloat = 300
    /// The sheet's coordinate space, where a row's press is placed.
    static let space = "organicMenuSheet"

    /// The sheet's height: its rows, and the footer's line under them.
    public static func height(rows: Int, footer: Bool = false) -> CGFloat {
        padTop + CGFloat(rows) * row + (footer ? Self.footer + footerPadBottom : padBottom)
    }

    /// Its width: the longest row (glyph, gap, words) — or the footer, if longer — and 20 either side, held
    /// between ``minWidth`` and ``maxWidth``.
    @MainActor public static func width(titles: [String], footer: String?) -> CGFloat {
        let scale = TextScale.factor(relativeTo: .body)
        func measure(_ text: String, size: CGFloat) -> CGFloat {
            let font = AppFonts.uiFont(.body, size: (size * scale).rounded())
            return ceil((text as NSString).size(withAttributes: [.font: font]).width) + 1
        }
        let rows = titles.map { glyph + gap + measure($0, size: textSize) }.max() ?? 0
        let foot = footer.map { measure($0, size: footerSize) } ?? 0
        return min(maxWidth, max(minWidth, max(rows, foot) + 2 * padX))
    }

    /// The paper reaching past the bands' ends (rowMenu.ts' pad).
    static func pad(height: Double) -> Double { max(10, height * 0.04) }

    /// The unseen wavy lines the bands part on (amplitude 2): between the rows, and over the footer.
    static func boundaries(bands: Int, width: Double, height: Double, seed: Double) -> [[Point]] {
        (0..<max(0, bands - 1)).map { i in
            rowBoundary(y: Double(padTop) + Double(i + 1) * Double(row), w: width, seed: seed + Double(i) * 31 + 7, amp: 2,
                        pad: pad(height: height))
        }
    }
}

/// The floating sheets' elevation (round 17 §1), in place of an outline: by day two shadows of a warm
/// ink — `0 8 24` at 16 % and `0 1 3` at 10 % (oklch 30 % 0.04 50) — at night one deep one, `0 10 28` black
/// at 45 %. A CSS blur is twice a layer's shadow radius.
public nonisolated enum SheetShadow {
    public static let far: Color = Palette.made { _, scheme in scheme == .dark ? (0, 0, 0, 0.45) : (0.30, 0.04, 50, 0.16) }
    public static let near: Color = Palette.made { _, scheme in scheme == .dark ? (0, 0, 0, 0) : (0.30, 0.04, 50, 0.10) }

    /// The far shadow's radius and drop, by scheme.
    public static func far(dark: Bool) -> (radius: CGFloat, y: CGFloat) { dark ? (14, 10) : (12, 8) }
    public static let nearRadius: CGFloat = 1.5
    public static let nearY: CGFloat = 1
}

private struct SheetShadowModifier: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let far = SheetShadow.far(dark: scheme == .dark)
        content
            .shadow(color: SheetShadow.near, radius: SheetShadow.nearRadius, x: 0, y: SheetShadow.nearY)
            .background {
                // The far one on a copy under it, so neither shadows the other.
                content.shadow(color: SheetShadow.far, radius: far.radius, x: 0, y: far.y)
            }
    }
}

extension View {
    /// A floating sheet's shadow (``SheetShadow``), following the outline of what it is given — a filled shape.
    public func sheetShadow() -> some View {
        modifier(SheetShadowModifier())
    }
}

/// The --menu-* colors: theme terracotta, or a card's hue (palette HUE_INKS, by scheme).
struct MenuColors {
    /// The glyphs' pen (the trigger's, each row's icon).
    let border: Color
    let borderHover: Color
    /// The trigger chip's paper: the menus' (the page's in light, the card's at night), or the card's.
    let cream: Color
    let hue: Double?

    init(hue: Double?) {
        self.hue = hue
        if let hue {
            border = Palette.hue(.pen, hue)
            borderHover = Palette.hue(.penDeep, hue)
            cream = Palette.hue(.menu, hue)
        } else {
            border = Tokens.terracotta
            borderHover = Tokens.terracottaDeep
            cream = Tokens.menuPaper
        }
    }

    /// The sheet's paper (round 17 §1, the press layer's): the menus' cream — or the card's — by day; at
    /// night 94 % of it toward the ink, so the sheet stands off the page it floats over.
    var paper: Color {
        guard let hue else { return MenuColors.raisedPaper }
        return Palette.made { _, scheme in
            let c = Self.paperOKLCH(hue: hue, scheme)
            return (c.L, c.C, c.H, 1)
        }
    }

    /// The menus' own paper, raised at night (``PressSheet/paper``).
    static let raisedPaper: Color = Palette.made { accent, scheme in paperOKLCH(hue: nil, scheme, accent: accent) }

    /// The paper as oklch: the card's hue's menu cream or the theme's, raised 94 % toward the ink at night.
    static func paperOKLCH(hue: Double?, _ scheme: PaletteScheme, accent: Accent = .terracotta)
        -> (L: Double, C: Double, H: Double, alpha: Double) {
        func token(_ t: PaletteToken) -> (L: Double, C: Double, H: Double, alpha: Double) {
            OKLCHColor.components(Palette.oklch(t, accent: accent, scheme: scheme)) ?? (0.95, 0.01, 80, 1)
        }
        let base: (L: Double, C: Double, H: Double, alpha: Double)
        if let hue {
            let c = Palette.hueOKLCH(.menu, hue, scheme)
            base = (c.L, c.C, c.H, 1)
        } else {
            base = token(.menuPaper)
        }
        guard scheme == .dark else { return base }
        return Palette.mixOKLCH(base, 0.94, token(.towardInk))
    }

    /// color-mix(in oklch, yellow 25% — 45% while pressed —, the sheet's paper).
    func dangerWash(pressed: Bool) -> Color {
        guard let hue else { return pressed ? Self.dangerPressed : Self.dangerRest }
        return Self.wash(hue: hue, share: pressed ? 0.45 : 0.25)
    }

    private static let dangerRest = wash(hue: nil, share: 0.25)
    private static let dangerPressed = wash(hue: nil, share: 0.45)

    private static func wash(hue: Double?, share: Double) -> Color {
        Palette.made { accent, scheme in
            let paper = paperOKLCH(hue: hue, scheme, accent: accent)
            let yellow = OKLCHColor.components(Palette.oklch(.yellow, accent: accent, scheme: scheme)) ?? (0.88, 0.1, 90, 1)
            return Palette.mixOKLCH(yellow, share, paper)
        }
    }
}
