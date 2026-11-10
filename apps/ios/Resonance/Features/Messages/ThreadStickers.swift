import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit

// Round 22 §4.5: stickers and albums as the thread draws them. A sticker stands on the page with no bubble,
// aligned like its sender's bubbles, playing its two loops the first time it comes on screen and again on a
// tap; an album's pictures are one grid in one bubble's outline, each opening the viewer and each held for
// its own menu.

/// A sticker's still standing for a message in a `side` square — a reply's quote, the composer's reply row (round 24
/// §C): its thumb (the art's hero pose) drawn so the pose is centred and as large as fits with 4 % round it
/// (``StickerQuoteFit``), decoded at the size it is drawn, off the main thread. The view outlives the sticker it shows
/// (the reply row answering a second sticker keeps it, as it does for a picture), so what it read is kept with the
/// sticker and size it was read for: an earlier sticker's still is never drawn for the next one.
struct StickerStill: View {
    let sticker: StickerRef
    let side: CGFloat
    @State private var loaded: StickerStillRead?

    var body: some View {
        let library = StickerLibrary.shared
        let pose = library.poseBox(sticker)
        let drawn = side * CGFloat(StickerQuoteFit.scale(pose))
        let offset = StickerQuoteFit.offset(pose)
        let key = StickerStillRead.key(sticker, side: drawn)
        Group {
            if let shown = StickerStillRead.shown(loaded, for: key, atHand: library.stillAtHand(sticker, side: drawn)) {
                Image(uiImage: shown).resizable().interpolation(.high).scaledToFit()
                    .frame(width: drawn, height: drawn)
                    .offset(x: side * CGFloat(offset.x), y: side * CGFloat(offset.y))
            } else {
                Color.clear
            }
        }
        .frame(width: side, height: side)
        // The pose lies inside the square; only clear paper of the larger thumb is cut.
        .clipped()
        .task(id: key) {
            guard loaded?.key != key else { return }
            let image = await library.still(sticker, side: drawn)
            // Another sticker came meanwhile: its own task reads its own still.
            guard !Task.isCancelled, let image else { return }
            loaded = StickerStillRead(key: key, image: image)
        }
        .accessibilityHidden(true)
    }
}

/// A still a ``StickerStill`` read for itself, with the sticker and size it was read for (round 24 §A).
struct StickerStillRead {
    let key: String
    let image: UIImage

    static func key(_ sticker: StickerRef, side: CGFloat) -> String { "\(sticker.pack)/\(sticker.id)|\(side)" }

    /// What the view draws for `key`: what it read, when it read that sticker at that size — else the library's copy at
    /// hand (nil until it is decoded: the square waits empty, never on the sticker answered before).
    static func shown(_ loaded: StickerStillRead?, for key: String, atHand: UIImage?) -> UIImage? {
        if let loaded, loaded.key == key { return loaded.image }
        return atHand
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
        // Its taps are the SwiftUI box's round it (``ThreadStickerView``): the square's clear paper outside that box
        // takes none.
        view.isUserInteractionEnabled = false
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
        // A replay over a play still running: end that one first, so its ending lets go of the old turn, not the new.
        view.stop()
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
/// comes on screen (once per message while the app runs) and again on a tap, and rests on its still (the
/// thumb's hero pose — never drawn under the frames while it plays). While
/// a sticker this build doesn't carry is read from the site, its place waits empty.
///
/// It takes the room of its drawing, not of its square (round 24 §B, ``StickerTrim``): as wide as the square, as tall
/// as the drawing over all its frames with 2 % over and under it, the square drawn whole and moved up so the drawing
/// lies in that box — the clear paper above and below takes no room (and no tap: a tap or a hold is the box's, but for
/// the band it lays over a quote it answers, which is the quote's). The reactions' chip, the sender's face, a quote it
/// rises over all go by the box.
struct ThreadStickerView: View {
    let message: ChatMessage
    let sticker: StickerRef
    let side: CGFloat
    let interactive: Bool
    /// The band at the top of its box laid over the quote it answers (``ThreadStickerStack``, round 24): drawn as
    /// ever, but a tap or a hold there is the quote's — the sticker's own start under it (``StickerTapArea``).
    var overQuote: CGFloat = 0
    @State private var play = 0
    @State private var rest: UIImage?
    @State private var onScreen = false

    var body: some View {
        let library = StickerLibrary.shared
        let box = library.box(sticker)
        AnimatedSticker(sticker: sticker, rest: rest ?? library.stillAtHand(sticker, side: side), play: play, slot: message.key)
            .frame(width: side, height: side)
            // Drawn past the box only where it is clear: every frame lies inside the drawing's box.
            .offset(y: -side * CGFloat(StickerTrim.top(box)))
            .allowsHitTesting(false)
            .frame(width: side, height: side * CGFloat(StickerTrim.height(box)), alignment: .top)
            .contentShape(StickerTapArea(overQuote: overQuote))
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
                // Scrolled away: it stops (and its slot is free), so no more than three ever play.
                StickerPlayback.shared.stop(message.key)
            }
    }

    private func replay() {
        play += 1
    }
}

/// Where a sticker in the thread takes a tap or a hold (round 24): its whole box but the band at its top laid over the
/// quote it answers (`overQuote` points), which is the quote's — a tap on the quote's lower part goes to the quoted
/// message instead of replaying the sticker. A sticker answering nothing takes its whole box.
nonisolated struct StickerTapArea: Shape {
    let overQuote: CGFloat

    func path(in rect: CGRect) -> Path {
        let cut = min(max(0, overQuote), rect.height)
        return Path(CGRect(x: rect.minX, y: rect.minY + cut, width: rect.width, height: rect.height - cut))
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

    /// Whose line the grid wears under it: the first picture that failed to send (a tap retries it — and the ones
    /// before it that failed with it), else the last still on its way, else the last (delivered: no line).
    nonisolated static func deliveryMessage(_ album: [ChatMessage]) -> ChatMessage? {
        album.first { $0.delivery == .failed } ?? album.last { $0.delivery == .sending } ?? album.last
    }
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
