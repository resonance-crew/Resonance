import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit

// Round 22 §4.5: stickers and albums as the thread draws them. A sticker stands on the page with no bubble,
// aligned like its sender's bubbles, playing its two loops the first time it comes on screen and again on a
// tap; an album's pictures are one grid in one bubble's outline, each opening the viewer and each held for
// its own menu.

/// A sticker's still key pose at `side` points (its thumb file), decoded off the main thread.
struct StickerStill: View {
    let sticker: StickerRef
    let side: CGFloat
    @State private var image: UIImage?

    var body: some View {
        let library = StickerLibrary.shared
        Group {
            if let shown = image ?? library.stillAtHand(sticker, side: side) {
                Image(uiImage: shown).resizable().interpolation(.high).scaledToFit()
            } else {
                Color.clear
            }
        }
        .frame(width: side, height: side)
        .task(id: "\(sticker.pack)/\(sticker.id)|\(side)") {
            if image == nil { image = await library.still(sticker, side: side) }
        }
        .accessibilityHidden(true)
    }
}

/// A sticker drawn by UIKit: at rest its still (`rest`), playing once `play` changes — its two loops,
/// frame by frame — unless motion is quiet. Off screen it stops and lets go of what it read.
struct AnimatedSticker: UIViewRepresentable {
    let sticker: StickerRef
    let rest: UIImage?
    /// Each new value plays it from the start.
    let play: Int
    /// The playback slot it takes while playing (`StickerPlayback`): a message's key, or the preview's.
    let slot: String

    func makeUIView(context: Context) -> StickerPlayerView {
        let view = StickerPlayerView()
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.rest(on: rest)
        return view
    }

    func updateUIView(_ view: StickerPlayerView, context: Context) {
        view.rest(on: rest)
        guard play != context.coordinator.played else { return }
        context.coordinator.played = play
        guard play > 0, !StickerPlayback.still, let file = StickerLibrary.shared.file(sticker) else { return }
        let slot = slot
        StickerPlayback.shared.start(slot) { [weak view] in view?.stop() }
        view.play(file) { StickerPlayback.shared.end(slot) }
    }

    static func dismantleUIView(_ view: StickerPlayerView, coordinator: Coordinator) {
        view.stop()
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var played = 0
    }
}

/// A sticker in the thread (round 22 §4.5): 128 pt on a phone, 144 wider, no bubble; it plays as it first
/// comes on screen (once per message while the app runs) and again on a tap, and rests on its key pose. While
/// a sticker this build doesn't carry is read from the site, its place waits empty.
struct ThreadStickerView: View {
    let message: ChatMessage
    let sticker: StickerRef
    let side: CGFloat
    let interactive: Bool
    @State private var play = 0
    @State private var rest: UIImage?
    @State private var onScreen = false

    var body: some View {
        let library = StickerLibrary.shared
        AnimatedSticker(sticker: sticker, rest: rest ?? library.stillAtHand(sticker, side: side), play: play, slot: message.key)
            .frame(width: side, height: side)
            .messagePartTap(interactive ? { replay() } : nil, washes: false)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(L10n.Messages.stickerLabel(name: library.label(sticker)))
            .accessibilityAddTraits(.isImage)
            .task(id: "\(sticker.pack)/\(sticker.id)|\(side)") {
                rest = await library.still(sticker, side: side)
                if interactive, onScreen, StickerPlayback.shared.autoplays(message.key), library.file(sticker) != nil { play += 1 }
            }
            .onAppear {
                onScreen = true
                // First time on screen: its two loops (a still stays still under Reduce Motion or Low Power).
                if interactive, rest != nil, StickerPlayback.shared.autoplays(message.key) { play += 1 }
            }
            .onDisappear {
                onScreen = false
                StickerPlayback.shared.end(message.key)
            }
    }

    private func replay() {
        play += 1
    }
}

/// An album's pictures as one grid (round 22 §3): two side by side, three as one big over two, four two by two,
/// five to ten in rows of three; the whole in a bubble's outline, the pictures 2 apart, edge to edge. Each picture
/// opens the viewer; a hold is that picture's own menu (react to it, reply to it, unsend it); the one lifted into
/// the press layer leaves its place empty. Its words — the first picture's — follow in a bubble under it.
struct AlbumGridView: View {
    let row: ThreadRow
    let album: [ChatMessage]
    let ctx: ThreadContext
    let mine: Bool

    static let gap: CGFloat = 2
    /// The grid's width: as wide as a bubble may be, at most 300.
    static func width(rowMax: CGFloat) -> CGFloat { min(300, rowMax) }

    var body: some View {
        let width = Self.width(rowMax: ctx.rowMax)
        let rows = AlbumGrid.rows(count: album.count)
        let head = album[0]
        let caption = album.first { !$0.text.isEmpty }
        let shape = MessageBubbleShape(seed: seedFromId(head.key), mine: mine, tuckTop: row.position.joinsAbove,
                                       tuckBottom: caption != nil || row.position.joinsBelow)
        VStack(alignment: mine ? .trailing : .leading, spacing: 2) {
            VStack(spacing: Self.gap) {
                ForEach(Array(rows.enumerated()), id: \.offset) { r, tiles in
                    let start = rows.prefix(r).reduce(0, +)
                    let height = CGFloat(AlbumGrid.rowHeight(tiles: tiles, width: Double(width), gap: Double(Self.gap)))
                    let tileWidth = (width - Self.gap * CGFloat(tiles - 1)) / CGFloat(tiles)
                    HStack(spacing: Self.gap) {
                        ForEach(start..<(start + tiles), id: \.self) { i in
                            AlbumTile(message: album[i], index: i, count: album.count, row: row, ctx: ctx)
                                .frame(width: tileWidth, height: height)
                        }
                    }
                    .frame(width: width, height: height)
                }
            }
            .frame(width: width)
            .clipShape(shape)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(L10n.Messages.albumShared(count: album.count))
            if let caption {
                AlbumCaption(message: caption, row: row, ctx: ctx, mine: mine)
            }
        }
    }
}

/// One picture of an album's grid: cover-cropped from its thumb (one sent from here at hand at once), a tap
/// opens it, a hold is its message's menu.
private struct AlbumTile: View {
    let message: ChatMessage
    let index: Int
    let count: Int
    let row: ThreadRow
    let ctx: ThreadContext
    @State private var loaded: UIImage?
    @State private var failed = false
    @State private var attempt = 0

    var body: some View {
        let store = ctx.model.pictures
        let image = message.image
        let shown = loaded ?? image.flatMap { store.cached($0.id, .thumb) }
        Tokens.creamDark
            .overlay {
                if let shown {
                    Image(uiImage: shown).resizable().scaledToFill()
                } else if failed {
                    OrganicIcon(.image, size: 20, color: Tokens.textMuted)
                }
            }
            .clipped()
        .contentShape(Rectangle())
        .opacity(ctx.lifted == message.key ? 0 : 1)
        .opacity(message.delivery == .failed ? 0.6 : 1)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { ctx.frames.frames[message.key] = $0 }
        .messagePartTap {
            if let image, shown != nil { ctx.openPicture(image) } else if failed { attempt += 1 }
        }
        .gesture(MessagePress { _ in press() })
        .accessibilityLabel(L10n.Messages.openImage)
        .accessibilityAction(named: L10n.Messages.moreMenu) { press() }
        .task(id: "\(image?.id ?? "")#\(attempt)") {
            guard let image else { return }
            if let kept = store.cached(image.id, .thumb) {
                loaded = kept
                return
            }
            failed = false
            let picture = await store.image(image.id, .thumb)
            loaded = picture
            failed = picture == nil && !Task.isCancelled
        }
    }

    /// Held: this picture's own menu, lifted from where it lies.
    private func press() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        let single = ThreadRow(message: message, position: row.position, dayLabel: false, timeLabel: false)
        ctx.onMenu(MessageMenu(row: single, frame: ctx.frames.frames[message.key] ?? .zero, link: nil))
    }
}

/// The words sent with an album, in a bubble under its grid (tucked to it).
private struct AlbumCaption: View {
    let message: ChatMessage
    let row: ThreadRow
    let ctx: ThreadContext
    let mine: Bool

    var body: some View {
        let found = ctx.model.links(in: message.text)
        MessageBubble(text: message.text, mine: mine, seed: seedFromId(message.key, start: 23), tuckTop: true,
                      tuckBottom: row.position.joinsBelow,
                      links: found.map { MessageLinkRange(range: $0.range, url: $0.url) },
                      highlights: ctx.highlights[message.id] ?? [], highlightStrong: message.id == ctx.currentHit,
                      onLinkTap: { ctx.openLink($0) }) { EmptyView() }
            .frame(maxWidth: ctx.rowMax, alignment: mine ? .trailing : .leading)
    }
}

/// A reply's quote of a sticker (round 22 §3): its key pose small beside its name.
struct StickerQuoteLabel: View {
    let sticker: StickerRef

    var body: some View {
        HStack(spacing: 6) {
            StickerStill(sticker: sticker, side: 28)
            Text(StickerLibrary.shared.label(sticker)).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted).lineLimit(1)
        }
    }
}
