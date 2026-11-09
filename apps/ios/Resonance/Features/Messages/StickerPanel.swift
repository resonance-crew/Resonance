import DesignSystem
import ResonanceKit
import SwiftUI

/// The sticker panel (round 22 §4.1, round 23 §3), in the keyboard's place under the capsule on the foot's own paper —
/// no card, no divider: a bar of the packs (each character's head; 🕘 the stickers sent last, first, once there are
/// any — held still while the panel is open) over one scroll through every pack, each headed by its character's name.
/// The bar follows the scroll; a tap on a pack goes to it. One tap on a sticker sends it — no preview, no second
/// tap; the cells in view breathe (``StickerBreathing``: each plays, rests on its thumb, plays again; the thumbs
/// alone under Reduce Motion or Low Power Mode). Scrolling the grid only scrolls it: the panel grows from the send
/// segment's ↑ alone (round 22 v3). The grid runs to the screen's foot, under the home indicator, fading out there
/// (`toScreenEdge`). On a Mac it is the popover's content (4 columns across 400).
struct StickerPanel: View {
    let library: StickerLibrary
    let columns: Int
    /// How many cells play at once (``StickerBreathing/capacity(columns:)``).
    var maxPlaying = StickerBreathing.phoneCapacity
    let onTap: (StickerRef) -> Void
    /// The grid scrolls on to the screen's foot (the phone's panel), its last row clearing the home indicator.
    var toScreenEdge = false
    /// Room under the last row (the home indicator's).
    var bottomRoom: CGFloat = 0
    @State private var position = ScrollPosition(idType: String.self)
    @State private var shownSection: String?
    /// A tab tapped holds the bar for its glide: the packs it scrolls past don't flicker through it on the way.
    @State private var heldUntil: Date?
    @State private var breathing: StickerBreathingClock

    init(library: StickerLibrary, columns: Int, maxPlaying: Int = StickerBreathing.phoneCapacity,
         onTap: @escaping (StickerRef) -> Void, toScreenEdge: Bool = false, bottomRoom: CGFloat = 0) {
        self.library = library
        self.columns = columns
        self.maxPlaying = maxPlaying
        self.onTap = onTap
        self.toScreenEdge = toScreenEdge
        self.bottomRoom = bottomRoom
        _breathing = State(initialValue: StickerBreathingClock(capacity: maxPlaying))
    }

    static let recentsId = "recents"
    /// The grid's measures, one rule everywhere (round 23 §3): 8 in from the screen's (or the popover's) edges, 4
    /// between cells, the art 2 inside its cell — a phone's four columns ≈ 93 pt each.
    static let gridInset: CGFloat = 8
    static let gap: CGFloat = 4
    static let cellInset: CGFloat = 2
    /// Four columns on a phone, six from 600 wide (an iPad's pane); the Mac's popover four.
    static func columns(width: CGFloat) -> Int { width >= 600 ? 6 : 4 }
    static let popoverColumns = 4

    private var sections: [(id: String, title: String, stickers: [StickerRef])] {
        var list: [(String, String, [StickerRef])] = []
        let recents = library.shownRecents
        if !recents.isEmpty { list.append((Self.recentsId, L10n.Messages.stickerRecent, recents)) }
        for pack in library.catalog.packs {
            list.append((pack.id, pack.name(Strings.shared.language), pack.stickers.map { StickerRef(pack: pack.id, id: $0.id) }))
        }
        return list
    }

    var body: some View {
        let sections = sections
        // Each cell's place in the grid, row by row through the sections (a sticker in 🕘 and in its pack is two cells).
        let starts = sections.indices.map { i in sections.prefix(i).reduce(0) { $0 + $1.stickers.count } }
        VStack(spacing: 0) {
            packBar(sections)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(sections.enumerated()), id: \.element.id) { s, section in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(section.title)
                                .font(AppFonts.body(12, weight: .semibold)).foregroundStyle(Tokens.textMuted)
                                .padding(.horizontal, 4)
                                .accessibilityAddTraits(.isHeader)
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Self.gap), count: columns), spacing: Self.gap) {
                                ForEach(Array(section.stickers.enumerated()), id: \.element) { i, sticker in
                                    StickerCell(sticker: sticker, key: "\(section.id)/\(sticker.pack)/\(sticker.id)", order: starts[s] + i,
                                                breathing: breathing) { onTap(sticker) }
                                }
                            }
                        }
                        .padding(.top, 10)
                        .id(section.id)
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, Self.gridInset)
                .padding(.bottom, 12 + bottomRoom)
            }
            .scrollPosition($position, anchor: .top)
            .scrollIndicators(.hidden)
            // Its edges fade where more stickers lie beyond them, as the web's picker does (round 22 v2).
            .scrollEdgeFades()
            .onScrollTargetVisibilityChange(idType: String.self, threshold: 0.2) { visible in
                if let held = heldUntil, held > .now { return }
                if let first = visible.first, first != shownSection { shownSection = first }
            }
            // No new start while the grid moves (round 23 §3).
            .onScrollPhaseChange { _, phase in breathing.scrolling(phase.isScrolling) }
            // Down under the home indicator to the screen's edge (round 22 v3): no band of paper under the grid.
            .ignoresSafeArea(.container, edges: toScreenEdge ? .bottom : [])
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.Messages.stickers)
        // 🕘 holds still while the panel is open: what is sent shows from the next opening.
        .onAppear { library.holdRecents() }
        .onDisappear { library.releaseRecents() }
        .task { await breathing.run() }
    }

/// The packs' bar: 🕘 then each character's head, the one the scroll is in washed; a tap goes to it.
    private func packBar(_ sections: [(id: String, title: String, stickers: [StickerRef])]) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 4) {
                ForEach(sections, id: \.id) { section in
                    let current = (shownSection ?? sections.first?.id) == section.id
                    Button {
                        heldUntil = .now.addingTimeInterval(0.4)
                        withAnimation(.easeInOut(duration: 0.3)) { position.scrollTo(id: section.id, anchor: .top) }
                        shownSection = section.id
                    } label: {
                        Group {
                            if section.id == Self.recentsId {
                                OrganicIcon(.clock, size: 22, color: current ? Tokens.text : Tokens.textMuted, strokeWidth: Tokens.ink)
                            } else if let pack = library.catalog.packs.first(where: { $0.id == section.id }) {
                                PackIcon(pack: pack, library: library)
                            }
                        }
                        .frame(width: 44, height: 40)
                        .background { BareTriggerDisc(open: current, seed: Double(seedFromString(section.id))) }
                        .contentShape(Rectangle())
                    }
                    // The press spreads inside the very disc the tab in view rests on.
                    .buttonStyle(OrganicPressStyle(inset: 0, shape: AnyShape(TabDiscShape(seed: Double(seedFromString(section.id))))))
                    .accessibilityLabel(section.title)
                    .accessibilityAddTraits(current ? .isSelected : [])
                }
            }
            .padding(.horizontal, 10)
        }
        .scrollIndicators(.hidden)
        .frame(height: 44)
    }
}

/// BareTriggerDisc's outline (the tab in view's wash) as a shape, for the press to spread inside.
private nonisolated struct TabDiscShape: Shape {
    let seed: Double

    func path(in rect: CGRect) -> Path {
        let side = min(rect.width, rect.height) * 0.92  // BareTriggerDisc.reach
        let disc = CGRect(x: rect.midX - side / 2, y: rect.midY - side / 2, width: side, height: side)
        return WobCircleShape(seed: seed, options: WobCircleOptions(segments: 8, mag: Double(side) / 2 * 2.2 / 46, cpJitter: 0.4))
            .path(in: disc)
    }
}

/// A pack's tab: its character's head.
private struct PackIcon: View {
    let pack: StickerCatalog.Pack
    let library: StickerLibrary
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().interpolation(.high).scaledToFit()
            } else {
                Color.clear
            }
        }
        .frame(width: 30, height: 30)
        .task(id: pack.id) {
            guard image == nil, let url = library.icon(pack) else { return }
            let pixels = Int(30 * UITraitCollection.current.displayScale)
            image = await Task.detached(priority: .userInitiated) { StickerLibrary.decode(url, maxPixels: pixels) }.value
        }
        .accessibilityHidden(true)
    }
}

/// A sticker cell's outline at any size: radius 16 and its own swing at a phone's ~88 across, kept in proportion —
/// so the preview drawn from it is the cell's wash grown, edge for edge.
nonisolated struct StickerCellShape: Shape {
    let seed: Double

    init(sticker: StickerRef) {
        seed = Double(seedFromString(sticker.id))
    }

    func path(in rect: CGRect) -> Path {
        let s = Double(min(rect.width, rect.height))
        return WobRectShape(radius: s * 0.18, seed: seed, mag: s * 0.036, options: WobRectOptions(
            curve: 1.54, segmentsH: .count(2), segmentsV: .count(2))).path(in: rect)
    }
}

/// One sticker in the grid (round 23 §3): its key pose, square, 2 in from its cell — breathing while at least 60 % of
/// it is in view (``StickerBreathing``); one tap sends it, the press washing its cell in the orange of the old choice.
/// VoiceOver reads its name and that a tap sends it.
private struct StickerCell: View {
    let sticker: StickerRef
    /// The cell's own name (a sticker in 🕘 and in its pack is two cells) and its place in the grid.
    let key: String
    let order: Int
    let breathing: StickerBreathingClock
    let onTap: () -> Void

    private static let wash = Tokens.terracottaLight.opacity(0.55)
    private var shape: StickerCellShape { StickerCellShape(sticker: sticker) }

    var body: some View {
        Button(action: onTap) {
            GeometryReader { geo in
                BreathingSticker(sticker: sticker, side: min(geo.size.width, geo.size.height) - 2 * StickerPanel.cellInset,
                                 playing: breathing.isPlaying(key)) { breathing.ended(key) }
                    .frame(width: geo.size.width, height: geo.size.height)
            }
            .aspectRatio(1, contentMode: .fit)
            .contentShape(Rectangle())
        }
        // The press spreads the old choice's wash inside the cell's outline: the feedback of the tap that sends.
        .buttonStyle(OrganicPressStyle(inset: 0, color: Self.wash, shape: AnyShape(shape)))
        .onScrollVisibilityChange(threshold: 0.6) { visible in
            if visible { breathing.shown(key, order: order) } else { breathing.hidden(key) }
        }
        .onDisappear { breathing.hidden(key) }
        .accessibilityLabel(StickerLibrary.shared.label(sticker))
        .accessibilityHint(L10n.Messages.stickerSendHint)
    }
}

/// A picker cell's sticker: its still at rest (the thumb, the hero pose), the file's two loops while `playing` —
/// frame by frame, the still never under the frames — and the still again after (`ended` said once it stops by
/// itself). A cell scrolled away stops at once.
private struct BreathingSticker: View {
    let sticker: StickerRef
    let side: CGFloat
    let playing: Bool
    let ended: () -> Void
    @State private var rest: UIImage?

    var body: some View {
        let library = StickerLibrary.shared
        PickerStickerPlayer(sticker: sticker, rest: rest ?? library.stillAtHand(sticker, side: side), playing: playing, ended: ended)
            .frame(width: side, height: side)
            .task(id: "\(sticker.pack)/\(sticker.id)|\(side)") { rest = await library.still(sticker, side: side) }
            .accessibilityHidden(true)
    }
}

/// ``StickerPlayerView`` driven by a picker's breathing: plays when `playing` turns on, stops when it turns off.
private struct PickerStickerPlayer: UIViewRepresentable {
    let sticker: StickerRef
    let rest: UIImage?
    let playing: Bool
    let ended: () -> Void

    func makeUIView(context: Context) -> StickerPlayerView {
        let view = StickerPlayerView()
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.rest(on: rest)
        return view
    }

    func updateUIView(_ view: StickerPlayerView, context: Context) {
        view.rest(on: rest)
        context.coordinator.ended = ended
        if playing, !view.isPlaying {
            let coordinator = context.coordinator
            // Its end is said after this update (a stop inside one would change the picker's state mid-draw); a sticker
            // with no file to play gives its slot back at once.
            guard let file = StickerLibrary.shared.file(sticker) else { return DispatchQueue.main.async { coordinator.ended() } }
            view.play(file) { DispatchQueue.main.async { coordinator.ended() } }
        } else if !playing, view.isPlaying {
            view.stop()
        }
    }

    static func dismantleUIView(_ view: StickerPlayerView, coordinator: Coordinator) {
        view.stop()
    }

    func makeCoordinator() -> Coordinator { Coordinator(ended: ended) }

    final class Coordinator {
        var ended: () -> Void
        init(ended: @escaping () -> Void) { self.ended = ended }
    }
}
