import Nuke
import NukeUI
import SwiftUI

/// OrganicImage: a remote image cover-fitted inside a hand-drawn curve. As on
/// the web, the picture bleeds past its box by the wobble's outward swing so
/// the bulges land on real pixels rather than on nothing.
///
/// While the picture is on its way its place shimmers (a SkeletonBlock in the
/// same clip); the placeholder — a story card's stripes, "no picture" — is for
/// no address, a picture that couldn't be loaded, and under one that has.
public struct OrganicImage<Placeholder: View>: View {
    let url: URL?
    let seed: Double
    let radius: Double
    let grain: Double
    let placeholder: Placeholder
    /// Asked for when `url` fails: a list's smaller cover (`imageThumbUrl`) falls back to the cover itself.
    let fallback: URL?
    @Environment(\.displayScale) private var displayScale
    @Environment(\.coverFraming) private var framing
    @State private var failed: URL?

    /// `grain` is the web's GrainOverlay opacity laid over the picture (the
    /// story cards' paper texture, StoryGrain.cover); 0 draws none.
    public init(url: URL?, fallback: URL? = nil, seed: Double, radius: Double = 18, grain: Double = 0,
                @ViewBuilder placeholder: () -> Placeholder) {
        self.url = url
        self.fallback = fallback
        self.seed = seed
        self.radius = radius
        self.grain = grain
        self.placeholder = placeholder()
    }

    public var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let bleed = organicImageBleed(w, h)
            let shown = failed != nil && failed == url && fallback != url ? fallback : url
            ZStack {
                if let shown {
                    let box = CGSize(width: (w + bleed * 2) * displayScale, height: (h + bleed * 2) * displayScale)
                    LazyImage(request: ImageSizeBuckets.request(shown, box: box, zoom: framing?.zoom ?? 1)) { state in
                        if let image = state.image {
                            ZStack {
                                placeholder
                                // On the cover's frame when it has one (round 25 §G1), centred otherwise.
                                FramedCover(image, pictureSize: state.imageContainer?.image.size)
                            }
                        } else if state.error != nil {
                            if shown == url, let fallback, fallback != url {
                                SkeletonBlock(height: nil, radius: 0).onAppear { failed = url }
                            } else {
                                placeholder
                            }
                        } else {
                            SkeletonBlock(height: nil, radius: 0)
                        }
                    }
                } else {
                    placeholder
                }
                if grain > 0 {
                    // Above the photo too (the web's overlay sits at z 10): ink at 2×.
                    GrainLayer(shape: Rectangle(), mode: .tile, opacity: grain * 2, tile: "grain-overlay")
                }
            }
            .frame(width: w + bleed * 2, height: h + bleed * 2)
            .clipShape(OrganicImageShape(seed: seed, radius: radius, bleed: bleed))
            .offset(x: -bleed, y: -bleed)
        }
    }
}

/// The few longer sides (pixels) a list's pictures are decoded at: the next one up from what is shown.
public nonisolated enum ImageSizeBuckets {
    static let sides: [CGFloat] = [128, 256, 384, 512, 768, 1024, 1280, 1600, 2048, 2560]

    public static func bucket(_ side: CGFloat) -> CGFloat {
        sides.first { $0 >= side } ?? (side / 512).rounded(.up) * 512
    }

    /// The picture at `url` decoded as an ImageIO thumbnail just large enough to fill `box` (pixels; ×
    /// a cover frame's `zoom`, which shows a smaller part of it) — never the whole 2048 px bitmap for a
    /// card a third as wide, nor a cover for a 40 pt thumb (audit I2). The longer side is rounded up to
    /// one of `sides`, so a feed's pictures share a handful of memory-cache keys; the URL, and so the
    /// disk cache the prefetch fills, stays the same. Nothing laid out yet (an empty box): as it is.
    public static func request(_ url: URL, box: CGSize, zoom: Double = 1) -> ImageRequest {
        var request = ImageRequest(url: url)
        guard let size = decodeSize(box: box, zoom: zoom) else { return request }
        request.thumbnail = ImageRequest.ThumbnailOptions(size: size, unit: .pixels, contentMode: .aspectFill)
        return request
    }

    /// The box (pixels) a picture shown in `box` is decoded to fill: its longer side the bucket above
    /// what is shown (× the frame's zoom). Nil for a box not laid out yet.
    public static func decodeSize(box: CGSize, zoom: Double = 1) -> CGSize? {
        let longer = max(box.width, box.height)
        guard box.width > 0, box.height > 0, longer.isFinite else { return nil }
        let factor = bucket(longer * max(1, min(zoom, 2))) / longer
        return CGSize(width: (box.width * factor).rounded(.up), height: (box.height * factor).rounded(.up))
    }

    /// The same for a square `side` points across, at 3× (an avatar, a 40 pt thumb).
    public static func request(_ url: URL, square side: CGFloat) -> ImageRequest {
        request(url, box: CGSize(width: side * 3, height: side * 3))
    }
}

/// How far an ``OrganicImage``'s picture reaches past its `w` × `h` box on every side: the wobble's
/// outward swing (its magnitude and corner offset) and 4 more. What must cover the picture as far as it
/// reaches — a veil over it in a story card's cover slot — reaches as far.
public func organicImageBleed(_ w: CGFloat, _ h: CGFloat) -> CGFloat {
    (min(w, h) * 0.05 + 6 + 4).rounded(.up)
}

/// The clip, drawn in the bled frame's coordinates (so offset by `bleed`) from the rect's own origin. Public for the
/// cover's framing stage (round 25 §G3), whose frame is the cover's own outline (`bleed` 0) cut out of the stage's
/// middle — a rect away from the origin, which the hole once ignored and was cut at the stage's top-left.
public nonisolated struct OrganicImageShape: Shape {
    let seed: Double
    let radius: Double
    let bleed: Double

    public init(seed: Double, radius: Double, bleed: Double) {
        self.seed = seed
        self.radius = radius
        self.bleed = bleed
    }

    public func path(in rect: CGRect) -> Path {
        let w = rect.width - bleed * 2, h = rect.height - bleed * 2
        guard w > 0, h > 0 else { return Path() }
        // Kept by the geometry cache: a feed of covers asks for the same few sizes on every layout.
        return GeometryCache.shared.wobRectPath(WobRectKey(w: w, h: h, r: min(radius, min(w, h) / 2), seed: seed, mag: min(w, h) * 0.05,
                                                           options: Self.options, offsetX: rect.minX + bleed, offsetY: rect.minY + bleed))
    }

    private static let options = WobRectOptions(curve: 0.4, cornerJitter: 1.1, cornerOffset: 6, segmentsH: .range(3, 4), segmentsV: .range(2, 3))
}

extension OrganicImage where Placeholder == Color {
    public init(url: URL?, fallback: URL? = nil, seed: Double, radius: Double = 18, grain: Double = 0, fill: Color) {
        self.init(url: url, fallback: fallback, seed: seed, radius: radius, grain: grain) { fill }
    }
}

/// Covers fetched before their cards come on screen: a list asks for the next few as each card
/// appears. Only their bytes, into the image pipeline's HTTP disk cache — nothing decoded, nothing
/// kept in memory — so the cover's own request, the same one (``OrganicImage``'s URL), is a cache hit
/// when its card shows. At low priority, two at a time; what is in memory or on its way is skipped.
public enum CoverPrefetch {
    private static let prefetcher = ImagePrefetcher(destination: .diskCache)

    /// Fetches the covers at `urls` ahead.
    public static func ahead(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        prefetcher.startPrefetching(with: urls)
    }
}

/// A remote picture filling its frame (cover), decoded at the size it's shown
/// at (`pixelSize`, in points × scale) instead of full resolution — for many
/// small pictures at once, like the thought map's card thumbnails.
public struct RemoteImage: View {
    let url: URL
    let pixelSize: CGSize

    public init(url: URL, pixelSize: CGSize) {
        self.url = url
        self.pixelSize = pixelSize
    }

    public var body: some View {
        // An ImageIO thumbnail (audit I2): the whole cover is never decoded first, then shrunk.
        LazyImage(request: ImageSizeBuckets.request(url, box: pixelSize)) { state in
            // On the cover's frame when it has one (round 25 §G1): the decoded thumbnail keeps the picture's proportions.
            if let image = state.image { FramedCover(image, pictureSize: state.imageContainer?.image.size) }
        }
    }
}
