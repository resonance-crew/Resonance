import CoreGraphics
import SwiftUI

/// Where a cover is looked at (round 25 §G1) — src/lib/images/coverFrame.ts, line for line, pinned by
/// native/fixtures/cover-frame.json (the web's and Android's tests read the same file). The picture stays
/// whole in storage; the card keeps, inside its `media`, the point of the picture that sits at the centre
/// of every frame it is drawn in and how far it is zoomed:
///
///     media.frame = { cx, cy, zoom, ar }      absent = the centre, zoom 1 (as before)
///       cx, cy  0…1    the picture's point at the frame's centre (fractions of its width and height)
///       zoom    1…2    1 = the picture just covers the frame
///       ar      0.2…5  the picture's width ÷ height when it was framed
///
/// Every shape a cover is drawn in — the feed card (0.62), the card page (0.52), the mini card (0.56), the
/// square thumbs, the share picture (0.5), the chat card (1 ÷ 1.91) — cuts its own crop from the same frame
/// with ``coverCrop(ar:frame:boxRatio:)``, so the subject stays put from one shape to the next.
/// (DesignSystem knows nothing about the API: the app maps the contract's `CoverFrame` into this.)
public nonisolated struct CoverFraming: Hashable, Sendable {
    public var cx: Double
    public var cy: Double
    public var zoom: Double
    public var ar: Double

    public init(cx: Double, cy: Double, zoom: Double, ar: Double) {
        self.cx = cx
        self.cy = cy
        self.zoom = zoom
        self.ar = ar
    }

    public static let zoomRange: ClosedRange<Double> = 1...2
    public static let arRange: ClosedRange<Double> = 0.2...5
    /// The frame a cover without one is drawn with: its centre, just covering.
    public static let centred = CoverFraming(cx: 0.5, cy: 0.5, zoom: 1, ar: 1)

    /// Whether the rules would take it: each number finite and in its range.
    public var isValid: Bool {
        [cx, cy, zoom, ar].allSatisfy(\.isFinite) && (0...1).contains(cx) && (0...1).contains(cy)
            && Self.zoomRange.contains(zoom) && Self.arRange.contains(ar)
    }

    /// The crop of the picture (its width ÷ height `ar`) shown in a box whose height ÷ width is `boxRatio`,
    /// for `frame` (nil, or one out of range: the centre at zoom 1) — in fractions of the picture's width
    /// (`x`, `width`) and height (`y`, `height`). At zoom 1 the crop is the largest of the box's shape that
    /// fits in the picture; `zoom` shrinks it about the frame's point; it is then moved, never shrunk, to lie
    /// inside the picture.
    public static func coverCrop(ar: Double, frame: CoverFraming?, boxRatio: Double) -> CGRect {
        let pic = ar.isFinite && ar > 0 ? ar : 1
        let box = boxRatio.isFinite && boxRatio > 0 ? 1 / boxRatio : 1 // the box's width ÷ height
        let f = frame.flatMap { $0.isValid ? $0 : nil } ?? centred
        var w = pic > box ? box / pic : 1
        var h = pic > box ? 1 : pic / box
        w /= f.zoom
        h /= f.zoom
        let x = min(max(f.cx - w / 2, 0), 1 - w)
        let y = min(max(f.cy - h / 2, 0), 1 - h)
        return CGRect(x: x, y: y, width: w, height: h)
    }

    /// The boxes the app draws a cover in (height ÷ width), as the web names them.
    public enum Box {
        public static let feed: Double = 0.62
        public static let page: Double = 0.52
        public static let mini: Double = 0.56
        public static let square: Double = 1
        public static let share: Double = 0.5
        public static let chat: Double = 1 / 1.91
    }
}

extension EnvironmentValues {
    /// The frame the covers under it are drawn with (``OrganicImage`` and ``FramedCover`` read it): nil, the
    /// centre — as every cover was drawn before round 25.
    @Entry public var coverFraming: CoverFraming? = nil
}

extension View {
    /// Draws the covers under it on `frame` (nil: centred).
    public func coverFraming(_ frame: CoverFraming?) -> some View {
        environment(\.coverFraming, frame)
    }
}

/// A picture laid into a `size` box as its cover frame says: the crop (``CoverFraming/coverCrop(ar:frame:boxRatio:)``)
/// stretched to the box, the rest outside it (the caller clips). `pictureSize` is the picture's own when known —
/// its real proportions — else the frame's `ar` stands for them.
///
/// `bleed` (round 33 §Q4): the box handed over is the visible box grown by this much on every side — an
/// ``OrganicImage``'s, whose wobbly clip swings past its box. The crop is the **visible** box's (the box less the
/// bleed), so what the card shows is exactly what the 調整封面 frame showed; the picture only carries on past it into
/// the bleed, as far as it has pixels. (Until round 33 the crop was the bled box's: the visible part was its middle
/// ~88 %, in another shape, tighter than the frame and drifting further as the zoom grew.)
public nonisolated enum CoverLayout {
    /// The picture's drawn size and its top-left corner within the box (the bled box, when `bleed` > 0).
    public static func placement(box: CGSize, pictureSize: CGSize?, frame: CoverFraming?, bleed: CGFloat = 0) -> CGRect {
        let visible = CGSize(width: box.width - 2 * bleed, height: box.height - 2 * bleed)
        guard visible.width > 0, visible.height > 0 else { return .zero }
        let ar: Double
        if let p = pictureSize, p.width > 0, p.height > 0 { ar = Double(p.width / p.height) } else { ar = frame?.ar ?? 1 }
        let crop = CoverFraming.coverCrop(ar: ar, frame: frame, boxRatio: Double(visible.height / visible.width))
        let w = visible.width / crop.width, h = visible.height / crop.height
        return CGRect(x: bleed - crop.minX * w, y: bleed - crop.minY * h, width: w, height: h)
    }

    /// What of the bled box the picture covers (its placement within the box): where it has no pixels past the
    /// visible box — a crop at the picture's edge — the bleed stays empty rather than showing a picture moved off its
    /// frame.
    public static func coverage(box: CGSize, pictureSize: CGSize?, frame: CoverFraming?, bleed: CGFloat = 0) -> CGRect {
        placement(box: box, pictureSize: pictureSize, frame: frame, bleed: bleed)
            .intersection(CGRect(origin: .zero, size: box))
    }
}

/// `image` filling a box on its cover frame (the environment's ``EnvironmentValues/coverFraming``), or centred
/// and cropped to fill without one — what `resizable().scaledToFill()` drew before round 25. `bleed`: the box is the
/// visible one grown by it on every side, and the frame's crop is the visible box's (``CoverLayout``) — a cover with no
/// frame too, as the centred frame at zoom 1 (round 33 §Q4, the lead: it must match 調整封面 after 重設, which it was
/// ≈1.1× tighter than while it filled the bled box). With no bleed and no frame it fills its box, centred, as always.
public struct FramedCover: View {
    let image: Image
    let pictureSize: CGSize?
    let bleed: CGFloat
    @Environment(\.coverFraming) private var frame

    /// The underlay's blur, under a bled cover's exact crop.
    public static let underlayBlur: CGFloat = 12

    public init(_ image: Image, pictureSize: CGSize? = nil, bleed: CGFloat = 0) {
        self.image = image
        self.pictureSize = pictureSize
        self.bleed = bleed
    }

    public var body: some View {
        if frame != nil || bleed > 0 {
            GeometryReader { geo in
                let place = CoverLayout.placement(box: geo.size, pictureSize: pictureSize, frame: frame, bleed: bleed)
                ZStack(alignment: .topLeading) {
                    // Under it, only where the exact crop leaves the bleed bare (a crop at the picture's edge): the same
                    // picture filling the bled box the old way, blurred, so the wobble's outward swing shows the picture's own
                    // edge — never the placeholder or the paper (round 33 §Q4, the lead). Inside the box the crop covers it.
                    if bleed > 0 {
                        image.resizable().scaledToFill()
                            .frame(width: geo.size.width, height: geo.size.height)
                            .clipped()
                            // Blurred (the lead, after the web's step at the swing): it only fills the swing with the
                            // picture's own colours; opaque, so its edges never fade to what stands behind.
                            .blur(radius: Self.underlayBlur, opaque: true)
                    }
                    image.resizable()
                        .frame(width: place.width, height: place.height)
                        .offset(x: place.minX, y: place.minY)
                }
                .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
            }
            .clipped()
        } else {
            image.resizable().scaledToFill()
        }
    }
}
