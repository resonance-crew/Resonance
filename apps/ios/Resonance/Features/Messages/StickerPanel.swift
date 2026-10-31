import DesignSystem
import ResonanceKit
import SwiftUI

/// The sticker panel (round 22 §4.1), in the keyboard's place under the capsule on the foot's own paper — no
/// card, no divider: a bar of the packs (each character's head; 🕘 the stickers sent last, first, once there
/// are any) over one scroll through every pack, each headed by its character's name. The bar follows the
/// scroll; a tap on a pack goes to it. A tap on a sticker previews it (the screen draws the preview over the
/// thread's foot), a second tap sends it. Scrolled up while it is short it grows first (`onGrow`); pulled
/// down at its top once grown it comes back (`onShrink`). On a Mac it is the popover's content (5 columns).
struct StickerPanel: View {
    let library: StickerLibrary
    let columns: Int
    /// The sticker previewed (its cell washed): a second tap sends it.
    let previewing: StickerRef?
    let onTap: (StickerRef) -> Void
    var onGrow: (() -> Void)?
    var onShrink: (() -> Void)?
    /// Room under the last row (the home indicator's).
    var bottomRoom: CGFloat = 0
    @State private var position = ScrollPosition(idType: String.self)
    @State private var shownSection: String?
    @State private var growAsked = false
    /// Whether the person's finger is moving the grid (only that grows or shrinks the panel, never a layout).
    @State private var dragging = false

    static let recentsId = "recents"

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
        VStack(spacing: 0) {
            packBar(sections)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(sections, id: \.id) { section in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(section.title)
                                .font(AppFonts.body(12, weight: .semibold)).foregroundStyle(Tokens.textMuted)
                                .padding(.horizontal, 4)
                                .accessibilityAddTraits(.isHeader)
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: columns), spacing: 6) {
                                ForEach(section.stickers, id: \.self) { sticker in
                                    StickerCell(sticker: sticker, selected: previewing == sticker) { onTap(sticker) }
                                }
                            }
                        }
                        .padding(.top, 10)
                        .id(section.id)
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, 12)
                .padding(.bottom, 12 + bottomRoom)
            }
            .scrollPosition($position, anchor: .top)
            .scrollIndicators(.hidden)
            // Its edges fade where more stickers lie beyond them, as the web's picker does (round 22 v2).
            .scrollEdgeFades()
            .onScrollTargetVisibilityChange(idType: String.self, threshold: 0.2) { visible in
                if let first = visible.first, first != shownSection { shownSection = first }
            }
            .onScrollPhaseChange { _, phase in dragging = phase == .interacting }
            .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top } action: { _, offset in
                // Scrolled up by the finger while short: the panel grows first (nested scroll); pulled down at its top
                // once grown: back. A change of the panel's own height moves the offset too, and does nothing.
                if offset <= 0 { growAsked = false }
                guard dragging else { return }
                if offset > 24, !growAsked, let onGrow {
                    growAsked = true
                    onGrow()
                } else if offset < -56, let onShrink {
                    growAsked = true
                    onShrink()
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.Messages.stickers)
    }

    /// The packs' bar: 🕘 then each character's head, the one the scroll is in washed; a tap goes to it.
    private func packBar(_ sections: [(id: String, title: String, stickers: [StickerRef])]) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 4) {
                ForEach(sections, id: \.id) { section in
                    let current = (shownSection ?? sections.first?.id) == section.id
                    Button {
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
                    .buttonStyle(OrganicPressStyle(inset: 2))
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

/// One sticker in the grid: its key pose, square; the one previewed washed behind. VoiceOver reads its name.
private struct StickerCell: View {
    let sticker: StickerRef
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            GeometryReader { geo in
                StickerStill(sticker: sticker, side: min(geo.size.width, geo.size.height) - 8)
                    .frame(width: geo.size.width, height: geo.size.height)
            }
            .aspectRatio(1, contentMode: .fit)
            .background {
                WobRectShape(radius: 16, seed: Double(seedFromString(sticker.id)))
                    .fill(Tokens.terracottaLight.opacity(selected ? 0.55 : 0))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle(inset: 3))
        .accessibilityLabel(StickerLibrary.shared.label(sticker))
        .accessibilityHint(selected ? L10n.Messages.stickerPreviewHint : "")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// The sticker previewed (round 22 §4.1): animated at 144 on a paper sheet over the thread's foot, above the
/// capsule, with 「再點一次傳送」 under it; a tap on it sends it.
struct StickerPreview: View {
    let sticker: StickerRef
    let onSend: () -> Void
    @State private var play = 0
    @State private var rest: UIImage?

    var body: some View {
        Button(action: onSend) {
            VStack(spacing: 4) {
                AnimatedSticker(sticker: sticker, rest: rest, play: play, slot: "preview")
                    .frame(width: 144, height: 144)
                Text(L10n.Messages.stickerPreviewHint)
                    .font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
            }
            .padding(.horizontal, 18)
            .padding(.top, 12)
            .padding(.bottom, 10)
            .background { PaperSheet(seed: 47) }
            .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle(inset: 2))
        .accessibilityLabel(L10n.Messages.stickerPreviewA11y(name: StickerLibrary.shared.label(sticker)))
        .task(id: "\(sticker.pack)/\(sticker.id)") {
            rest = await StickerLibrary.shared.still(sticker, side: 144)
            play += 1
        }
    }
}
