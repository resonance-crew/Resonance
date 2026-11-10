import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Round 24 (iOS, iPad, the Mac): a reply row answering a second sticker shows that sticker, a sticker in the thread
/// takes the room of its drawing (not of its square), a quoted sticker's pose stands in the middle of its square, and
/// the reply row's mark is the reply glyph.
@MainActor @Suite(.serialized) struct RoundTwentyFourStickerTests {
    private static let haha = StickerRef(pack: "pip", id: "haha")
    private static let thanks = StickerRef(pack: "twine", id: "thanks")

    // MARK: §A — replying to one sticker, then another

    @Test func aReplyRowAnsweringASecondStickerNeverDrawsTheFirstOnesStill() {
        // The row read haha's still for the first reply; the same row (its view kept) now answers thanks.
        let first = UIImage(), second = UIImage()
        let side: CGFloat = 36
        let read = StickerStillRead(key: StickerStillRead.key(Self.haha, side: side), image: first)
        let next = StickerStillRead.key(Self.thanks, side: side)
        #expect(next != read.key)
        // Not read yet: the square waits empty, never on haha.
        #expect(StickerStillRead.shown(read, for: next, atHand: nil) == nil)
        // Decoded already (the library's copy): that one.
        #expect(StickerStillRead.shown(read, for: next, atHand: second) === second)
        // Its own sticker at its own size: what it read.
        #expect(StickerStillRead.shown(read, for: read.key, atHand: nil) === first)
        #expect(StickerStillRead.shown(nil, for: next, atHand: second) === second)
        // The same sticker at another size is another read (a short viewport's row is smaller).
        #expect(StickerStillRead.key(Self.haha, side: 28) != read.key)
    }

    @Test func twoStickerRepliesFromOnePersonAreTwoDifferentQuotes() {
        // The model's reply changes (the row is drawn again) even when both stickers' words are empty and the sender is one.
        let a = ChatMessage(id: "m1", senderId: "bob", text: "〔貼圖：哈哈〕", sentAt: Date(), sticker: Self.haha)
        let b = ChatMessage(id: "m2", senderId: "bob", text: "〔貼圖：哈哈〕", sentAt: Date(), sticker: Self.haha)
        let c = ChatMessage(id: "m3", senderId: "bob", text: "〔貼圖：謝謝〕", sentAt: Date(), sticker: Self.thanks)
        #expect(ReplyQuote.of(a) != ReplyQuote.of(b))
        #expect(ReplyQuote.of(a) != ReplyQuote.of(c))
        // Neither says words under 「回覆…」: its still stands there, and it is what changes.
        #expect(ThreadComposer.replyDetail(ReplyQuote.of(a)) == nil && ThreadComposer.replyDetail(ReplyQuote.of(c)) == nil)
    }

    /// Which sticker a ``StickerStill`` shows: the composer's reply row keeps its view while the reply changes.
    @MainActor @Observable final class Answered {
        var sticker: StickerRef
        /// The sticker the row was last drawn for (set as the update that draws it is made).
        @ObservationIgnored var drawnFor: StickerRef?
        init(_ sticker: StickerRef) { self.sticker = sticker }
    }

    struct AnsweredStill: View {
        let answered: Answered
        let side: CGFloat
        var body: some View {
            ZStack(alignment: .topLeading) {
                Color.white
                StickerStill(sticker: answered.sticker, side: side).padding(10)
            }
            .ignoresSafeArea()
            .onChange(of: answered.sticker, initial: true) { _, now in answered.drawnFor = now }
        }
    }

    /// A window of `size` showing `view` (hidden again when the test ends).
    private func show(_ view: some View, size: CGSize) throws -> UIWindow {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: size)
        window.rootViewController = UIHostingController(rootView: view)
        window.makeKeyAndVisible()
        window.layoutIfNeeded()
        return window
    }

    /// The window as drawn now, one pixel a point, RGBA.
    private func shot(_ window: UIWindow) -> [UInt8] {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        return CardShareTests.pixels(image.cgImage!).data
    }

    /// Pixels that aren't the white paper (ink of a still).
    private func ink(_ pixels: [UInt8]) -> Int {
        stride(from: 0, to: pixels.count, by: 4).count { i in (0..<3).contains { pixels[i + $0] < 215 } }
    }

    /// Pixels two shots of one window draw differently.
    private func differing(_ a: [UInt8], _ b: [UInt8]) -> Int {
        stride(from: 0, to: min(a.count, b.count), by: 4).count { i in (0..<3).contains { abs(Int(a[i + $0]) - Int(b[i + $0])) > 48 } }
    }

    @Test func theRowsStillFollowsTheStickerItAnswersOnceItHasReadTheFirst() async throws {
        // The reply row's ``StickerStill`` read haha's still for itself; the row (its view, its state) stays while the
        // reply moves to thanks. It used to keep drawing what it had read — haha, at thanks' size and place — for good.
        let library = StickerLibrary.shared
        // A side nothing else draws at, so thanks' still isn't at hand before the row reads it (were it, the row would
        // have to draw it at once all the same).
        let side: CGFloat = 53
        let drawn = { (ref: StickerRef) in side * CGFloat(StickerQuoteFit.scale(library.poseBox(ref))) }
        let answered = Answered(Self.haha)
        let window = try show(AnsweredStill(answered: answered, side: side), size: CGSize(width: 80, height: 80))
        defer { window.isHidden = true }
        // haha read and drawn.
        #expect(await eventually { library.stillAtHand(Self.haha, side: drawn(Self.haha)) != nil })
        try await Task.sleep(for: .milliseconds(150))
        let haha = shot(window)
        #expect(ink(haha) > 150)

        answered.sticker = Self.thanks
        // Every shot from the first update drawn for thanks until thanks' still is read.
        var meanwhile: [[UInt8]] = []
        #expect(await eventually {
            guard answered.drawnFor == Self.thanks else { return false }
            meanwhile.append(shot(window))
            return library.stillAtHand(Self.thanks, side: drawn(Self.thanks)) != nil
        })
        try await Task.sleep(for: .milliseconds(150))
        let switched = shot(window)

        // Thanks as a row that only ever answered thanks draws it.
        let fresh = try show(AnsweredStill(answered: Answered(Self.thanks), side: side), size: CGSize(width: 80, height: 80))
        defer { fresh.isHidden = true }
        try await Task.sleep(for: .milliseconds(150))
        let thanks = shot(fresh)
        #expect(ink(thanks) > 150 && differing(thanks, haha) > 100)
        // The row draws just that — not haha's still (at thanks' size and place, as the row used to).
        #expect(differing(switched, thanks) < 20, "the row still draws the sticker it answered first")
        // Meanwhile it waited empty, or showed thanks: never haha's still for thanks. (Thanks' still is often read before
        // the first shot; the decision this rests on — never a still read for another sticker — is pinned above.)
        #expect(!meanwhile.isEmpty)
        #expect(meanwhile.allSatisfy { ink($0) < 20 || differing($0, thanks) < 20 }, "the row drew haha's still for thanks")

        // And back to haha: its own still again, not thanks'.
        answered.sticker = Self.haha
        #expect(await eventually { differing(shot(window), haha) < 20 })
    }

    // MARK: §B / §C — the drawing's box, as the app bundles it

    private static func message(_ sticker: StickerRef) -> ChatMessage {
        ChatMessage(id: "m-\(sticker.id)", senderId: "bob", text: "〔貼圖〕", sentAt: Date(), sticker: sticker)
    }

    @Test func aStickerInTheThreadIsLaidOutByItsDrawing() {
        // The thread's own sticker view, as the thread lays it out: pip/haha at 128 takes 128 × 93.95 (its frames' height
        // and 2 % over and under them), not its 128 square.
        func size(_ ref: StickerRef) -> CGSize {
            UIHostingController(rootView: ThreadStickerView(message: Self.message(ref), sticker: ref, side: 128, interactive: false))
                .sizeThatFits(in: CGSize(width: 1000, height: 1000))
        }
        let haha = size(Self.haha)
        #expect(abs(haha.width - 128) < 0.5 && abs(haha.height - 93.952) < 0.5, "\(haha)")
        // One this build has no numbers for keeps its square.
        let later = size(StickerRef(pack: "later", id: "wave"))
        #expect(abs(later.width - 128) < 0.5 && abs(later.height - 128) < 0.5, "\(later)")
    }

    @Test func aStickerInTheThreadIsDrawnWholeInsideItsBox() async throws {
        // pip/haha at 128 laid out 60 down a white page: its still (the key pose) is drawn 9.5 into its box, as the square
        // moved up by 33 puts it — not 42.5 into a 128 square — and none of it is cut off.
        let library = StickerLibrary.shared
        let box = library.box(Self.haha), pose = library.poseBox(Self.haha)
        let view = ZStack(alignment: .topLeading) {
            Color.white
            ThreadStickerView(message: Self.message(Self.haha), sticker: Self.haha, side: 128, interactive: false)
                .padding(.top, 60).padding(.leading, 10)
        }
        .ignoresSafeArea()
        let window = try show(view, size: CGSize(width: 150, height: 220))
        defer { window.isHidden = true }
        var pixels: [UInt8] = []
        #expect(await eventually {
            pixels = shot(window)
            return ink(pixels) > 1000
        })
        let width = 150
        // Rows with any of the drawing on them, its faintest edge too.
        let rows = (0..<220).filter { y in (0..<width).contains { x in (0..<3).contains { pixels[(y * width + x) * 4 + $0] < 240 } } }
        let top = try #require(rows.first), bottom = try #require(rows.last)
        let trim = StickerTrim.top(box)
        #expect(abs(Double(top) - (60 + 128 * (pose.top - trim))) < 3, "ink from \(top)")
        #expect(abs(Double(bottom + 1) - (60 + 128 * (pose.bottom - trim))) < 3, "ink to \(bottom)")
        // Inside the layout box (60 … 60 + 93.95).
        #expect(Double(bottom) < 60 + 128 * StickerTrim.height(box))
    }

    // MARK: rule 2 — a sticker answering a quote, as the thread lays the two

    /// Where a view was laid out, in the window.
    @MainActor final class Placed {
        var frame: CGRect = .null
    }

    /// The thread's own sticker stack (MessageCore's) answering a quote stand-in about a sticker's quote's size — 70 × 60
    /// of white paper — its frame noted in `quote`.
    private static func stack(_ ref: StickerRef, id: String, quote: Placed) -> ThreadStickerStack<some View, EmptyView> {
        ThreadStickerStack(
            message: ChatMessage(id: id, senderId: "bob", text: "〔貼圖〕", sentAt: Date(), sticker: ref),
            sticker: ref, side: 128, mine: false, interactive: false,
            quote: Color.white.frame(width: 70, height: 60)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { quote.frame = $0 }
        ) { EmptyView() }
    }

    /// `view` 40 down and 10 in on white paper, its frame noted in `placed`.
    private static func onPaper(_ view: some View, placed: Placed) -> some View {
        ZStack(alignment: .topLeading) {
            Color.white
            view
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { placed.frame = $0 }
                .padding(.top, 40).padding(.leading, 10)
        }
        .ignoresSafeArea()
    }

    /// Every value of type `T` in `subject`'s stored tree — a view's body as SwiftUI is handed it: its modifiers (the
    /// content shape among them) and its children.
    private static func found<T>(_ type: T.Type, in subject: Any, depth: Int = 0) -> [T] {
        if let hit = subject as? T { return [hit] }
        guard depth < 80 else { return [] }
        return Mirror(reflecting: subject).children.flatMap { found(type, in: $0.value, depth: depth + 1) }
    }

    /// The area of its box the sticker in `stack` takes a tap or a hold in: the content shape its own body applies.
    private static func tapArea(in stack: ThreadStickerStack<some View, some View>, box: CGRect) throws -> CGRect {
        let sticker = try #require(found(ThreadStickerView.self, in: stack.body).first)
        let shapes = found(StickerTapArea.self, in: sticker.body)
        #expect(shapes.count == 1, "the sticker's content shape")
        return try #require(shapes.first).path(in: box).boundingRect
    }

    @Test func aStickerAnsweringAQuoteOverlapsItByItsDrawingAtRest() async throws {
        // As the thread lays them: pip/haha's box keeps 9.5 of clear paper over its key pose at 128, so laid a flat 18
        // over the quote's foot its drawing would overlap the quote by 8.5. It is laid by its drawing: the pose's top
        // stands 18 over the foot — as on the web and Android. Twine/thanks too.
        for ref in [Self.haha, Self.thanks] {
            let quote = Placed(), whole = Placed()
            let size = CGSize(width: 160, height: 260)
            let window = try show(Self.onPaper(Self.stack(ref, id: "r2-\(ref.id)", quote: quote), placed: whole), size: size)
            defer { window.isHidden = true }
            var pixels: [UInt8] = []
            #expect(await eventually {
                pixels = shot(window)
                return ink(pixels) > 1000
            })
            let width = Int(size.width)
            // Rows with any of the drawing on them, its faintest edge too (the quote's stand-in is white paper).
            let rows = (0..<Int(size.height)).filter { y in
                (0..<width).contains { x in (0..<3).contains { pixels[(y * width + x) * 4 + $0] < 240 } }
            }
            let top = try #require(rows.first)
            let foot = Double(quote.frame.maxY)
            #expect(abs(foot - 100) < 0.5, "the quote's foot at \(foot)")
            #expect(abs(Double(top) - (foot - Double(QuotedReply.stickerOverlap))) < 3, "\(ref.pack)/\(ref.id): ink from \(top)")
        }
    }

    @Test func theBandItLaysOverTheQuoteIsTheQuotesToTapAndHold() async throws {
        // pip/haha answering, as the thread lays the two: the top of its box lies over the quote, in front of it. That band
        // is no part of the sticker's tap or hold — a tap on the quote's lower part reaches the quote (it jumps to the
        // quoted message) instead of replaying the sticker; the sticker's own area starts at the quote's foot.
        let library = StickerLibrary.shared
        let quote = Placed(), whole = Placed()
        let stack = Self.stack(Self.haha, id: "r2-band", quote: quote)
        let window = try show(Self.onPaper(stack, placed: whole), size: CGSize(width: 160, height: 260))
        defer { window.isHidden = true }
        #expect(await eventually { !quote.frame.isNull && !whole.frame.isNull })
        // The sticker's box is the stack's foot (the sticker comes last).
        let boxHeight = 128 * CGFloat(StickerTrim.height(library.box(Self.haha)))
        let boxTop = whole.frame.maxY - boxHeight
        let band = quote.frame.maxY - boxTop
        #expect(band > 25, "the box starts \(band) over the quote's foot")
        let area = try Self.tapArea(in: stack, box: CGRect(x: 0, y: 0, width: 128, height: boxHeight))
        #expect(abs(area.minY - band) < 0.5, "the sticker's taps start \(area.minY) into its box, the quote's foot \(band)")
        #expect(abs(area.maxY - boxHeight) < 1e-6 && area.width == 128)
    }

    @Test func aStickerAnsweringNothingKeepsItsWholeBox() throws {
        // Laid out and tapped as before: no rise, its box its own to the top.
        let alone = ThreadStickerStack<EmptyView, EmptyView>(
            message: Self.message(Self.haha), sticker: Self.haha, side: 128, mine: false, interactive: true, quote: nil
        ) { EmptyView() }
        let size = UIHostingController(rootView: alone).sizeThatFits(in: CGSize(width: 1000, height: 1000))
        #expect(abs(size.width - 128) < 0.5 && abs(size.height - 93.952) < 0.5, "\(size)")
        let box = CGRect(x: 0, y: 0, width: 128, height: size.height)
        #expect(try Self.tapArea(in: alone, box: box) == box)
    }

    @Test func theBundledCatalogSaysWhereEachDrawingLies() throws {
        let library = StickerLibrary(defaults: try #require(UserDefaults(suiteName: "RoundTwentyFour-\(UUID().uuidString)")))
        // pip/haha: no frame draws over the top 27.8 % of its square — at 128 the thread lays it out 94 tall, not 128.
        let box = library.box(Self.haha)
        #expect(abs(box.top - 0.278) < 1e-9 && abs(box.bottom - 0.972) < 1e-9)
        #expect(abs(128 * StickerTrim.height(box) - 93.952) < 1e-6)
        // Its key pose, quoted, is moved up to the middle of its square (點點 no longer stands under the half).
        let pose = library.poseBox(Self.haha)
        #expect(StickerQuoteFit.offset(pose).y < -0.15)
        // Every sticker the app carries says both.
        for ref in library.catalog.all {
            #expect(library.box(ref) != .full && library.poseBox(ref) != .full, "\(ref.pack)/\(ref.id)")
        }
        // One this build doesn't know fills its square: laid out and quoted as before.
        let later = StickerRef(pack: "later", id: "wave")
        #expect(StickerTrim.top(library.box(later)) == 0 && StickerTrim.height(library.box(later)) == 1)
        #expect(StickerQuoteFit.scale(library.poseBox(later)) == 1)
    }

    // MARK: each sticker plays and rests in its own row

    private static let deepThanks = StickerRef(pack: "tuck", id: "deep-thanks")

    /// Pixels of `image` with any alpha (ink of a sticker on clear paper).
    private static func opaque(_ image: CGImage) -> Int {
        let data = CardShareTests.pixels(image).data
        return stride(from: 3, to: data.count, by: 4).count { data[$0] > 16 }
    }

    @Test func aPlayCountsItsLoopsByItsFramesAndEndsOnTheLastFrameOfItsLast() {
        // ImageIO plays on past the file's two loops, so the play counts them itself: 23 frames, two loops.
        var count = StickerPlayCount(frames: 23, loops: 2)
        #expect((0..<23).allSatisfy { count.next($0) == .draw })
        #expect((0..<22).allSatisfy { count.next($0) == .draw })
        // The last frame of the last loop: the hero pose again — the still takes its place there.
        #expect(count.next(22) == .end)
        // That last frame skipped (frames running late): the first of a third loop ends it, undrawn.
        var skipped = StickerPlayCount(frames: 23, loops: 2)
        (0..<23).forEach { _ = skipped.next($0) }
        (0..<21).forEach { _ = skipped.next($0) }
        #expect(skipped.next(0) == .end)
        // One loop: its own last frame.
        var once = StickerPlayCount(frames: 5, loops: 1)
        #expect((0..<4).allSatisfy { once.next($0) == .draw })
        #expect(once.next(4) == .end)
    }

    @Test func aPlayEndsOnItsStillAndNothingOfItIsDrawnAfter() async throws {
        // tuck/deep-thanks: 23 frames, 2.58 s a loop, as the thread plays it. ImageIO hands its frames over a little
        // later than the file's delays and plays on past its two loops; a play used to be ended by a timer racing those
        // frames, and a frame landing after that end stayed over the still for good — an ImageIO frame that later drew
        // blank, or another play's frame (the thread's empty rows, and a sticker showing in another row's place).
        let file = try #require(StickerLibrary.shared.file(Self.deepThanks))
        let player = StickerPlayerView(frame: CGRect(x: 0, y: 0, width: 128, height: 128))
        let still = UIImage(cgImage: try #require(CGContext(data: nil, width: 4, height: 4, bitsPerComponent: 8, bytesPerRow: 0,
                                                             space: CGColorSpaceCreateDeviceRGB(),
                                                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)?.makeImage()))
        player.rest(on: still)
        var ended = false
        let started = ContinuousClock.now
        player.play(file) { ended = true }
        #expect(await eventually(within: .seconds(12)) { player.shownImage !== still })
        #expect(await eventually(within: .seconds(12)) { ended })
        // Ended by its frames (its last frame), not by the backstop for frames that stop coming.
        #expect(ContinuousClock.now - started < .seconds(7.5), "ended after \(ContinuousClock.now - started)")
        #expect(player.shownImage === still && !player.isPlaying)
        // ImageIO is still animating the file: none of its frames lands over the still.
        try await Task.sleep(for: .milliseconds(800))
        #expect(player.shownImage === still, "a frame drawn after the play ended")
    }

    @Test func everyFrameAPlayDrawsStaysThatFrame() async throws {
        // A frame as `CGAnimateImageDataWithBlock` hands it over is decoded lazily from the running animation: drawn
        // later — after its play, or while another play of the same file runs — it comes out blank or as that play's
        // frame. The player draws a bitmap of its own for each frame, so whatever it shows draws as it was.
        let file = try #require(StickerLibrary.shared.file(Self.deepThanks))
        let player = StickerPlayerView(frame: CGRect(x: 0, y: 0, width: 128, height: 128))
        player.play(file) {}
        var taken: [CGImage] = []
        #expect(await eventually(within: .seconds(4)) {
            if let frame = player.shownImage?.cgImage, !taken.contains(where: { $0 === frame }) { taken.append(frame) }
            return taken.count >= 6
        })
        player.stop()
        // Another play of the same file, under way.
        let other = StickerPlayerView(frame: CGRect(x: 0, y: 0, width: 128, height: 128))
        other.play(file) {}
        try await Task.sleep(for: .milliseconds(500))
        let inks = taken.map(Self.opaque)
        #expect(inks.count >= 6 && inks.allSatisfy { $0 > 2000 }, "frames drawn now: \(inks)")
        other.stop()
    }

    @Test func twoOfOneStickerInTheThreadsListEachPlayAndRestInTheirOwnRow() async throws {
        // The thread's list as MessageList lays it — upside down, each row the right way up again — holding the same
        // sticker twice, each playing as it comes on screen. Once both have played, each row's box shows the sticker at
        // rest, the two alike, and nothing is drawn outside the two boxes.
        let ids = ["r24-own-a-\(UUID().uuidString)", "r24-own-b-\(UUID().uuidString)"]
        let placed = [Placed(), Placed()]
        let list = ScrollView {
            LazyVStack(spacing: 24) {
                ForEach(Array(ids.enumerated()), id: \.element) { i, id in
                    ThreadStickerView(message: ChatMessage(id: id, senderId: "bob", text: "〔貼圖〕", sentAt: Date(), sticker: Self.deepThanks),
                                      sticker: Self.deepThanks, side: 128, interactive: true)
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { placed[i].frame = $0 }
                        .upsideDown()
                }
            }
            .padding(.vertical, 20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 20)
        }
        .upsideDown()
        .background(Color.white)
        .ignoresSafeArea()
        let size = CGSize(width: 180, height: 300)
        let window = try show(list, size: size)
        defer { window.isHidden = true }
        #expect(await eventually { placed.allSatisfy { !$0.frame.isNull } })
        let keys = ids.map { "\($0)" }
        if !StickerPlayback.still {
            // Both play as they come on screen (one key each: a message's key), then rest.
            #expect(await eventually(within: .seconds(5)) { keys.allSatisfy { !StickerPlayback.shared.autoplays($0) } })
            #expect(await eventually(within: .seconds(12)) { keys.allSatisfy { !StickerPlayback.shared.limiter.playing.contains($0) } })
            // ImageIO still animating the file: nothing of either play lands after it ended.
            try await Task.sleep(for: .milliseconds(800))
        }
        var pixels: [UInt8] = []
        #expect(await eventually {
            pixels = shot(window)
            return ink(pixels) > 2000
        })
        let width = Int(size.width)
        func crop(_ rect: CGRect) -> [UInt8] {
            let r = rect.integral.intersection(CGRect(origin: .zero, size: size))
            return (Int(r.minY)..<Int(r.maxY)).flatMap { y in pixels[((y * width) + Int(r.minX)) * 4 ..< ((y * width) + Int(r.maxX)) * 4] }
        }
        let boxes = placed.map(\.frame)
        let a = crop(boxes[0]), b = crop(boxes[1])
        #expect(ink(a) > 1000 && ink(b) > 1000, "ink in the rows: \(ink(a)), \(ink(b))")
        #expect(a.count == b.count && differing(a, b) < 40, "the two rows draw the same sticker at rest")
        // Outside the two boxes: white paper.
        let outside = (0..<Int(size.height)).flatMap { y in (0..<width).compactMap { x -> Int? in
            let point = CGPoint(x: Double(x) + 0.5, y: Double(y) + 0.5)
            return boxes.contains { $0.insetBy(dx: -1, dy: -1).contains(point) } ? nil : (y * width + x) * 4
        } }
        let stray = outside.count { i in (0..<3).contains { pixels[i + $0] < 215 } }
        #expect(stray < 10, "\(stray) pixels of ink outside the rows")
    }

    // MARK: §D — the reply row's mark

    @Test func theReplyRowsMarkIsTheReplyGlyph() {
        // 20 in a row of 44, 18 in a short viewport's one line of 36 — as on the web and Android.
        #expect(ComposerMetrics.replyGlyph(short: false) == 20)
        #expect(ComposerMetrics.replyGlyph(short: true) == 18)
    }
}
